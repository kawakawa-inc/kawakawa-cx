/**
 * /sell command - Create sell orders or invoice line items
 *
 * Invoice mode (flexible token order):
 * - /sell 100 COF 200 RAT Katoa bob send
 * - /sell bob katoa COF 100 RAT 200 send
 *
 * Order mode (no counterparty):
 * - /sell COF,CAF,H2O Katoa
 * - /sell H Stella 1500
 * - /sell DW Katoa reserve:1000
 */
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, sellOrders, priceLists } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
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
import { parseTokens } from '@kawakawa/parser'
import { botResolvers } from '../../utils/resolvers.js'
import { handleInvoiceCommand } from '../../services/invoiceCommandHandler.js'

/** Limit mode for sell orders (includes 'none' when no limit is set) */
type LimitMode = 'none' | 'max_sell' | 'reserve'

/**
 * Format limit mode for display
 */
function formatLimitMode(mode: LimitMode, quantity: number | null): string {
  if (mode === 'none' || quantity === null) {
    return ''
  }

  if (mode === 'reserve') {
    return `reserve ${quantity.toLocaleString()}`
  }

  if (mode === 'max_sell') {
    return `max ${quantity.toLocaleString()}`
  }

  return ''
}
import { calculateEffectivePriceWithFallback } from '@kawakawa/services/market'
import logger from '../../utils/logger.js'

export const sell: Command = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Create sell order(s)')
    .addStringOption(option =>
      option
        .setName('input')
        .setDescription('Ticker(s) and location (e.g., "COF,CAF Katoa reserve:1000")')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('location')
        .setDescription('Override location')
        .setRequired(false)
        .setAutocomplete(true)
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
    const priceOverride = interaction.options.getNumber('price')
    const currencyOption = interaction.options.getString('currency') as ValidCurrency | null
    const visibilityOption = interaction.options.getString('visibility') as
      | 'internal'
      | 'partner'
      | null

    // Parse input with unified parser
    const parsed = await parseTokens(input, botResolvers)

    // Check for invoice mode (counterparty user in input)
    if (parsed.user) {
      // INVOICE MODE: Sell to counterparty's buy orders
      const result = await handleInvoiceCommand({
        interaction,
        userId,
        input,
        direction: 'sell',
        locationDisplayMode: displaySettings.locationDisplayMode,
      })

      if (!result.success && result.errors) {
        await interaction.reply({
          content: `❌ ${result.errors.join('\n')}\n\nExample: \`/sell 100 COF 200 RAT Katoa bob send\``,
          flags: MessageFlags.Ephemeral,
        })
      }
      return
    }

    // ORDER MODE: Create sell orders (no counterparty)
    const unresolvedTokens = parsed.unresolved

    // For sell orders, we need at least one ticker (quantity optional for comma-separated)
    // Comma-separated format: "COF,CAF Katoa reserve:1000" - no individual quantities needed
    // Standard format: "COF 100 RAT 200 Katoa" - quantities from items
    const hasTickers = parsed.items.length > 0

    if (!hasTickers) {
      const errorMsg =
        unresolvedTokens.length > 0
          ? `Could not find commodities: ${unresolvedTokens.map(t => `"${t}"`).join(', ')}`
          : 'Please specify at least one commodity ticker.'

      await interaction.reply({
        content: `❌ ${errorMsg}\n\nExample: \`/sell COF,CAF Katoa reserve:1000\` or \`/sell DW 1000 RAT 500 BEN\``,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Determine location (override takes precedence)
    let locationId = locationOverride || parsed.location?.naturalId

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
          'Example: `/sell COF Katoa` or use the `location` option.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // ORDER MODE: Create sell orders (no counterparty detected)
    // For sell orders, limit mode is shared across all items from the parsed input
    const sharedLimitMode: LimitMode = parsed.limit?.mode ?? 'none'
    const sharedLimitQuantity: number | null = parsed.limit?.quantity ?? null
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
      price: number | null
      currency: string
      priceSource: 'fixed' | 'auto' | 'pending'
      limitMode: LimitMode
      limitQuantity: number | null
    }> = []
    const errors: string[] = []

    // Build order items from parsed items
    // For standard format with quantities: use quantity as reserve
    // For comma-separated format: use shared limit mode/quantity
    const orderItems = parsed.items.map(item => ({
      ticker: item.commodity.ticker,
      // If item has its own quantity, use it as reserve; otherwise use shared limit
      limitMode: item.quantity && item.quantity > 0 ? ('reserve' as LimitMode) : sharedLimitMode,
      limitQuantity: item.quantity && item.quantity > 0 ? item.quantity : sharedLimitQuantity,
    }))

    for (const item of orderItems) {
      const { ticker, limitMode, limitQuantity } = item
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

        // Upsert the sell order
        await db
          .insert(sellOrders)
          .values({
            userId,
            commodityTicker: ticker,
            locationId,
            price: price.toFixed(2),
            currency,
            priceListCode: orderPriceListCode,
            orderType,
            limitMode,
            limitQuantity,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              sellOrders.userId,
              sellOrders.commodityTicker,
              sellOrders.locationId,
              sellOrders.orderType,
              sellOrders.currency,
            ],
            set: {
              price: price.toFixed(2),
              priceListCode: orderPriceListCode,
              limitMode,
              limitQuantity,
              updatedAt: new Date(),
            },
          })

        createdOrders.push({
          ticker,
          price: price > 0 ? price : null,
          currency,
          priceSource:
            priceOverride !== null && priceOverride !== undefined
              ? 'fixed'
              : price > 0
                ? 'auto'
                : 'pending',
          limitMode,
          limitQuantity,
        })

        logger.info(
          {
            userId,
            commodityTicker: ticker,
            locationId,
            price,
            currency,
            orderType,
            limitMode,
            limitQuantity,
            priceListCode: orderPriceListCode,
          },
          'Sell order created/updated'
        )
      } catch (error) {
        logger.error({ error, userId, ticker, locationId }, 'Failed to create sell order')
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
      const limitDisplay = formatLimitMode(order.limitMode, order.limitQuantity)

      response = `✅ Sell order created/updated!\n\n`
      response += `**${commodityDisplay}** @ **${locationDisplay}**\n`
      response += `Price: **${priceDisplay}**`

      if (order.priceSource === 'pending') {
        response += ` ⚠️ *no price in list*`
      }

      response += '\n'

      if (limitDisplay) {
        response += `Limit: **${limitDisplay}**\n`
      }

      response += `Visibility: **${orderType}**`
    } else {
      // Multiple orders response
      response = `✅ Created ${createdOrders.length} sell order(s) at **${locationDisplay}**:\n\n`

      for (const order of createdOrders) {
        const commodityDisplay = formatCommodity(order.ticker)
        const priceDisplay =
          order.price !== null
            ? `${order.price.toFixed(2)} ${order.currency}`
            : `-- ${order.currency}`
        const orderLimitDisplay = formatLimitMode(order.limitMode, order.limitQuantity)

        response += `• ${commodityDisplay} - ${priceDisplay}`

        if (orderLimitDisplay) {
          response += ` (${orderLimitDisplay})`
        }

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
