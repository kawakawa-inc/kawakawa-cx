/**
 * /buy command - Create buy orders with flexible input
 *
 * Supports:
 * - Comma-separated tickers: /buy COF,CAF,H2O Katoa 500
 * - Space-separated input: /buy H Stella 1500
 * - Auto-pricing from user's default price list
 * - Invoice mode (with user detection): /buy COF 100 @bob BEN
 */
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, buyOrders, priceLists, sellOrders } from '@kawakawa/db'
import { eq, and } from 'drizzle-orm'
import { searchLocations } from '../../autocomplete/index.js'
import { formatCommodity, formatLocation, resolveLocation } from '../../services/display.js'
import { getMarketSettings, getDisplaySettings } from '../../services/userSettings.js'
import {
  getChannelConfig,
  resolveEffectiveValue,
  wasOverriddenByChannel,
} from '../../services/channelConfig.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { isValidCurrency, VALID_CURRENCIES, type ValidCurrency } from '../../utils/validation.js'
import { parseSmartOrderInput, type ResolvedUser } from '../../utils/orderInputParser.js'
import { calculateEffectivePriceWithFallback } from '@kawakawa/services/market'
import { getOrderDisplayPrice } from '@kawakawa/services/market'
import type { LocationDisplayMode } from '@kawakawa/types'
import {
  getOrCreateInvoice,
  addLineItems,
  type InvoiceLineItemInput,
} from '../../services/invoiceService.js'
import logger from '../../utils/logger.js'

export const buy: Command = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Create buy order(s)')
    .addStringOption(option =>
      option
        .setName('input')
        .setDescription('Ticker(s), location, and quantity (e.g., "COF,CAF Katoa 500")')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('location')
        .setDescription('Override location')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option
        .setName('quantity')
        .setDescription('Override quantity')
        .setRequired(false)
        .setMinValue(1)
    )
    .addNumberOption(option =>
      option
        .setName('price')
        .setDescription('Override price (uses auto-pricing if not set)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('currency')
        .setDescription('Currency (default: your preferred currency)')
        .setRequired(false)
        .addChoices(
          { name: 'CIS', value: 'CIS' },
          { name: 'ICA', value: 'ICA' },
          { name: 'AIC', value: 'AIC' },
          { name: 'NCC', value: 'NCC' }
        )
    )
    .addStringOption(option =>
      option
        .setName('visibility')
        .setDescription('Order visibility (default: internal)')
        .setRequired(false)
        .addChoices(
          { name: 'Internal (members)', value: 'internal' },
          { name: 'Partner (trade partners)', value: 'partner' }
        )
    ) as SlashCommandBuilder,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true)

    if (focusedOption.name === 'location') {
      const query = focusedOption.value
      const discordId = interaction.user.id
      const locations = await searchLocations(query, 25, discordId)
      const choices = locations.map(l => ({
        name: `${l.naturalId} - ${l.name}`,
        value: l.naturalId,
      }))
      await interaction.respond(choices)
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Get user settings for defaults
    const marketSettings = await getMarketSettings(userId)
    const displaySettings = await getDisplaySettings(interaction.user.id)

    // Get channel defaults (if configured)
    const channelId = interaction.channelId
    const channelSettings = await getChannelConfig(channelId)

    // Get options
    const input = interaction.options.getString('input', true)
    const locationOverride = interaction.options.getString('location')
    const quantityOverride = interaction.options.getInteger('quantity')
    const priceOverride = interaction.options.getNumber('price')
    const currencyOption = interaction.options.getString('currency') as ValidCurrency | null
    const visibilityOption = interaction.options.getString('visibility') as
      | 'internal'
      | 'partner'
      | null

    // Parse flexible input (supports both multi-format and single-format)
    const parsed = await parseSmartOrderInput(input, { forBuy: true })

    // Extract tickers and check for errors based on format
    const isMultiFormat = parsed.isMultiFormat
    const unresolvedTokens = isMultiFormat
      ? parsed.multi!.unresolvedTokens
      : parsed.single!.unresolvedTokens
    const tickers = isMultiFormat ? parsed.multi!.orders.map(o => o.ticker) : parsed.single!.tickers

    // Validate we have at least one ticker
    if (tickers.length === 0) {
      const errorMsg =
        unresolvedTokens.length > 0
          ? `Could not find commodities: ${unresolvedTokens.map(t => `"${t}"`).join(', ')}`
          : 'Please specify at least one commodity ticker.'

      await interaction.reply({
        content: `❌ ${errorMsg}\n\nExample: \`/buy COF,CAF Katoa 500\` or \`/buy DW 1000 RAT 500 BEN\``,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Determine location (override takes precedence)
    let locationId =
      locationOverride || (isMultiFormat ? parsed.multi!.location : parsed.single!.location)

    // If location override provided, validate it
    if (locationOverride) {
      const resolved = await resolveLocation(locationOverride)
      if (!resolved) {
        await interaction.reply({
          content: `❌ Location "${locationOverride}" not found.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
      locationId = resolved.naturalId
    }

    if (!locationId) {
      await interaction.reply({
        content:
          '❌ Please specify a location.\n\n' +
          'Example: `/buy COF Katoa 500` or use the `location` option.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Check for invoice mode (counterparty user detected)
    const counterpartyUser: ResolvedUser | null = isMultiFormat
      ? parsed.multi!.counterpartyUser
      : parsed.single!.counterpartyUser

    if (counterpartyUser) {
      // INVOICE MODE: Buy from counterparty's sell orders
      await handleInvoiceMode(
        interaction,
        userId,
        counterpartyUser,
        tickers,
        isMultiFormat ? parsed.multi!.orders : null,
        isMultiFormat ? null : quantityOverride || parsed.single!.quantity,
        locationId,
        displaySettings
      )
      return
    }

    // ORDER MODE: Create buy orders (original behavior)
    // For multi-format, quantities are per-ticker, not shared
    // For single-format, determine shared quantity (override takes precedence)
    const sharedQuantity = isMultiFormat ? null : quantityOverride || parsed.single!.quantity

    if (!isMultiFormat && (!sharedQuantity || sharedQuantity <= 0)) {
      await interaction.reply({
        content:
          '❌ Please specify a quantity.\n\n' +
          'Example: `/buy COF Katoa 500` or use the `quantity` option.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Determine currency using channel defaults resolution
    const currency: ValidCurrency = resolveEffectiveValue(
      currencyOption,
      channelSettings?.currency,
      channelSettings?.currencyEnforced ?? false,
      marketSettings.preferredCurrency as ValidCurrency,
      'CIS' as ValidCurrency
    )

    if (!isValidCurrency(currency)) {
      await interaction.reply({
        content: `❌ Invalid currency. Valid options: ${VALID_CURRENCIES.join(', ')}`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Track if currency was overridden by channel
    const currencyOverridden = wasOverriddenByChannel(
      currencyOption,
      channelSettings?.currency,
      channelSettings?.currencyEnforced ?? false
    )

    // Determine visibility using channel defaults resolution
    const orderType: 'internal' | 'partner' = resolveEffectiveValue(
      visibilityOption,
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false,
      'internal' as const,
      'internal' as const
    )

    // Track if visibility was overridden by channel
    const visibilityOverridden = wasOverriddenByChannel(
      visibilityOption,
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false
    )

    // Determine price list using channel defaults resolution
    const effectivePriceList: string | null = resolveEffectiveValue(
      null, // No command-level price list option yet
      channelSettings?.priceList,
      channelSettings?.priceListEnforced ?? false,
      marketSettings.defaultPriceList,
      null
    )

    // Determine pricing approach
    let useAutoPricing = false
    let priceListCode: string | null = null

    if (priceOverride !== null && priceOverride !== undefined) {
      // User explicitly provided a price - use fixed pricing
      useAutoPricing = false
    } else if (effectivePriceList) {
      // Have a price list (from channel or user settings)
      useAutoPricing = true
      priceListCode = effectivePriceList

      // Verify the price list exists
      const priceList = await db.query.priceLists.findFirst({
        where: eq(priceLists.code, priceListCode),
      })

      if (!priceList) {
        const source = channelSettings?.priceListEnforced
          ? 'Channel default'
          : channelSettings?.priceList === priceListCode
            ? 'Channel default'
            : 'Your default'
        await interaction.reply({
          content:
            `❌ ${source} price list "${priceListCode}" was not found.\n\n` +
            'Please contact an admin or provide a price explicitly.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    } else {
      // No price provided and no price list configured
      await interaction.reply({
        content:
          '❌ Please provide a price or configure auto-pricing.\n\n' +
          'You can:\n' +
          '1. Add `price:` option to this command\n' +
          '2. Configure a default price list in `/settings market`\n' +
          '3. Enable automatic pricing in your settings',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Create orders for each ticker
    const createdOrders: Array<{
      ticker: string
      quantity: number
      price: number | null
      currency: string
      priceSource: 'fixed' | 'auto' | 'pending'
    }> = []
    const errors: string[] = []

    // Build order items based on format
    const orderItems = isMultiFormat
      ? parsed.multi!.orders.map(o => ({ ticker: o.ticker, quantity: o.quantity }))
      : tickers.map(ticker => ({ ticker, quantity: sharedQuantity! }))

    for (const item of orderItems) {
      const { ticker, quantity } = item
      try {
        let price: number
        let orderPriceListCode: string | null = null

        if (priceOverride !== null && priceOverride !== undefined) {
          // Fixed price from option
          price = priceOverride
        } else if (useAutoPricing && priceListCode) {
          // Try to get price from price list
          const effectivePrice = await calculateEffectivePriceWithFallback(
            priceListCode,
            ticker,
            locationId,
            currency
          )

          if (effectivePrice) {
            // Found price in list
            price = effectivePrice.finalPrice
            orderPriceListCode = priceListCode
          } else {
            // No price in list - set price=0 and mark as dynamic (will show --)
            price = 0
            orderPriceListCode = priceListCode
          }
        } else {
          // This shouldn't happen, but fallback to 0
          price = 0
        }

        // Upsert the buy order
        await db
          .insert(buyOrders)
          .values({
            userId,
            commodityTicker: ticker,
            locationId,
            quantity,
            price: price.toFixed(2),
            currency,
            priceListCode: orderPriceListCode,
            orderType,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              buyOrders.userId,
              buyOrders.commodityTicker,
              buyOrders.locationId,
              buyOrders.orderType,
              buyOrders.currency,
            ],
            set: {
              quantity,
              price: price.toFixed(2),
              priceListCode: orderPriceListCode,
              updatedAt: new Date(),
            },
          })

        createdOrders.push({
          ticker,
          quantity,
          price: price > 0 ? price : null,
          currency,
          priceSource:
            priceOverride !== null && priceOverride !== undefined
              ? 'fixed'
              : price > 0
                ? 'auto'
                : 'pending',
        })

        logger.info(
          {
            userId,
            commodityTicker: ticker,
            locationId,
            quantity,
            price,
            currency,
            orderType,
            priceListCode: orderPriceListCode,
          },
          'Buy order created/updated'
        )
      } catch (error) {
        logger.error({ error, userId, ticker, locationId }, 'Failed to create buy order')
        errors.push(`${ticker}: failed to create`)
      }
    }

    // Build response
    const locationDisplay = await formatLocation(locationId, displaySettings.locationDisplayMode)

    let response = ''

    if (createdOrders.length === 1) {
      // Single order response
      const order = createdOrders[0]
      const commodityDisplay = formatCommodity(order.ticker)
      const priceDisplay =
        order.price !== null
          ? `${order.price.toFixed(2)} ${order.currency}`
          : `-- ${order.currency}`

      response = `✅ Buy order created/updated!\n\n`
      response += `**${commodityDisplay}** @ **${locationDisplay}**\n`
      response += `Quantity: **${order.quantity.toLocaleString()}**\n`
      response += `Price: **${priceDisplay}**`

      if (order.priceSource === 'pending') {
        response += ` ⚠️ *no price in list*`
      }

      response += `\nVisibility: **${orderType}**`
    } else {
      // Multiple orders response
      response = `✅ Created ${createdOrders.length} buy order(s) at **${locationDisplay}**:\n\n`

      for (const order of createdOrders) {
        const commodityDisplay = formatCommodity(order.ticker)
        const priceDisplay =
          order.price !== null
            ? `${order.price.toFixed(2)} ${order.currency}`
            : `-- ${order.currency}`

        response += `• ${commodityDisplay} - ${order.quantity.toLocaleString()}x @ ${priceDisplay}`

        if (order.priceSource === 'pending') {
          response += ` ⚠️ *no price*`
        }

        response += '\n'
      }

      response += `\nVisibility: **${orderType}**`
    }

    // Add errors if any
    if (errors.length > 0) {
      response += `\n\n⚠️ Some orders failed:\n${errors.map(e => `• ${e}`).join('\n')}`
    }

    // Add warnings about unresolved tokens
    if (unresolvedTokens.length > 0) {
      response += `\n\n⚠️ Could not resolve: ${unresolvedTokens.map(t => `"${t}"`).join(', ')}`
    }

    // Add warnings about channel-enforced overrides
    const overrideWarnings: string[] = []
    if (currencyOverridden) {
      overrideWarnings.push(`currency → ${currency}`)
    }
    if (visibilityOverridden) {
      overrideWarnings.push(`visibility → ${orderType}`)
    }
    if (overrideWarnings.length > 0) {
      response += `\n\n🔒 Channel enforced: ${overrideWarnings.join(', ')}`
    }

    await interaction.reply({
      content: response,
      flags: MessageFlags.Ephemeral,
    })
  },
}

/**
 * Handle invoice mode for /buy command
 * Buys FROM the counterparty's sell orders and adds to invoice
 */
async function handleInvoiceMode(
  interaction: ChatInputCommandInteraction,
  userId: number,
  counterpartyUser: ResolvedUser,
  tickers: string[],
  multiOrders: Array<{ ticker: string; quantity: number; commodityName: string }> | null,
  sharedQuantity: number | null,
  locationId: string,
  displaySettings: { locationDisplayMode: LocationDisplayMode }
): Promise<void> {
  // Get or create invoice with this counterparty
  const { id: invoiceId, isNew } = await getOrCreateInvoice(userId, counterpartyUser.userId)

  // Find counterparty's sell orders that match our criteria
  const matchingSellOrders = await db.query.sellOrders.findMany({
    where: and(
      eq(sellOrders.userId, counterpartyUser.userId),
      eq(sellOrders.locationId, locationId)
    ),
  })

  // Build line items for each ticker
  const lineItems: InvoiceLineItemInput[] = []
  const addedItems: Array<{ ticker: string; quantity: number; price: number; currency: string }> =
    []
  const notFound: string[] = []

  for (const ticker of tickers) {
    // Determine quantity for this ticker
    const quantity = multiOrders
      ? (multiOrders.find(o => o.ticker === ticker)?.quantity ?? 0)
      : (sharedQuantity ?? 0)

    if (quantity <= 0) {
      notFound.push(`${ticker}: no quantity specified`)
      continue
    }

    // Find matching sell order from counterparty
    const sellOrder = matchingSellOrders.find(o => o.commodityTicker === ticker)

    if (!sellOrder) {
      notFound.push(
        `${ticker}: ${counterpartyUser.fioUsername ?? counterpartyUser.username} has no sell order`
      )
      continue
    }

    // Get the display price (handles dynamic pricing)
    const priceInfo = await getOrderDisplayPrice(sellOrder)
    const price = priceInfo?.price ?? 0

    lineItems.push({
      sellOrderId: sellOrder.id,
      commodityTicker: ticker,
      locationId,
      quantity,
      unitPrice: price,
      currency: sellOrder.currency as 'CIS' | 'ICA' | 'AIC' | 'NCC',
      priceListCode: sellOrder.priceListCode,
    })

    addedItems.push({
      ticker,
      quantity,
      price,
      currency: sellOrder.currency,
    })
  }

  // Add line items to invoice
  if (lineItems.length > 0) {
    await addLineItems(invoiceId, lineItems)
  }

  // Build response
  const locationDisplay = await formatLocation(locationId, displaySettings.locationDisplayMode)
  const counterpartyName =
    counterpartyUser.fioUsername ?? counterpartyUser.displayName ?? counterpartyUser.username

  let response = ''

  if (isNew) {
    response = `📋 **Invoice #${invoiceId}** created with **${counterpartyName}**\n\n`
  } else {
    response = `✅ Added to **Invoice #${invoiceId}** (${counterpartyName})\n\n`
  }

  if (addedItems.length > 0) {
    response += `Buying from ${counterpartyName} @ **${locationDisplay}**:\n`
    for (const item of addedItems) {
      const commodityDisplay = formatCommodity(item.ticker)
      const priceDisplay =
        item.price > 0 ? `${item.price.toFixed(2)} ${item.currency}` : `-- ${item.currency}`
      response += `• ${commodityDisplay} x${item.quantity.toLocaleString()} @ ${priceDisplay}\n`
    }
  }

  if (notFound.length > 0) {
    response += `\n⚠️ Could not add:\n${notFound.map(n => `• ${n}`).join('\n')}`
  }

  // Calculate totals
  const totals = new Map<string, number>()
  for (const item of addedItems) {
    const current = totals.get(item.currency) ?? 0
    totals.set(item.currency, current + item.quantity * item.price)
  }

  if (totals.size > 0) {
    const totalStr = Array.from(totals.entries())
      .map(([currency, total]) => `${total.toFixed(2)} ${currency}`)
      .join(', ')
    response += `\n**Total added**: ${totalStr}`
  }

  await interaction.reply({
    content: response,
    flags: MessageFlags.Ephemeral,
  })

  logger.info(
    {
      userId,
      counterpartyUserId: counterpartyUser.userId,
      invoiceId,
      itemsAdded: addedItems.length,
    },
    'Invoice mode: items added to invoice via /buy'
  )
}
