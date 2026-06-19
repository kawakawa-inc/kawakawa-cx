/**
 * /order command - Create buy or sell orders (your demand or supply)
 *
 * Subcommands:
 * - /order buy COF Katoa 500 - Create a buy order (your demand)
 * - /order sell COF Katoa 500 - Create a sell order (your supply)
 *
 * This command replaces the old order-creation functionality from /buy and /sell.
 * The /buy and /sell commands are now focused on browsing and invoice creation.
 */
import { SlashCommandBuilder, MessageFlags, ComponentType } from 'discord.js'
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, buyOrders, sellOrders, priceLists } from '@kawakawa/db'
import { eq, and, isNull } from 'drizzle-orm'
import { searchLocations } from '../../autocomplete/index.js'
import { resolveLocation } from '../../services/display.js'
import { getMarketSettings, getDisplaySettings } from '../../services/userSettings.js'
import { getChannelConfig, resolveEffectiveValue } from '../../services/channelConfig.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { isValidCurrency, VALID_CURRENCIES, type ValidCurrency } from '../../utils/validation.js'
import { parseTokens } from '@kawakawa/parser'
import { botResolvers } from '../../utils/resolvers.js'
import { calculateEffectivePriceWithFallback } from '@kawakawa/services/market'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'
import {
  buildOrderConfirmationEmbed,
  buildOrderConfirmationButtons,
  buildOrderCreatedTips,
  buildIncompleteInputEmbed,
  buildUseDialogButtons,
  type OrderConfirmationData,
} from '../../utils/orderConfirmation.js'
import { COMPONENT_TIMEOUT, MODAL_TIMEOUT } from '../../utils/interactions.js'
import { createOrderEditModal, createNewOrderModal } from '../../utils/modals.js'

export const order: Command = {
  data: new SlashCommandBuilder()
    .setName('order')
    .setDescription('Create buy or sell orders')
    .addSubcommand(subcommand =>
      subcommand
        .setName('buy')
        .setDescription('Create a buy order (your demand)')
        .addStringOption(option =>
          option
            .setName('input')
            .setDescription('Ticker(s), location, and quantity (e.g., "COF Katoa 500")')
            .setRequired(false)
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
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sell')
        .setDescription('Create a sell order (your supply)')
        .addStringOption(option =>
          option
            .setName('input')
            .setDescription('Ticker(s), location, and quantity (e.g., "COF Katoa 500")')
            .setRequired(false)
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
            .setDescription('Override quantity (for limited mode)')
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
        )
        .addStringOption(option =>
          option
            .setName('limit_mode')
            .setDescription('How quantity is determined (default: unlimited)')
            .setRequired(false)
            .addChoices(
              { name: 'Unlimited (auto-sync from FIO)', value: 'unlimited' },
              { name: 'Limited (fixed quantity)', value: 'limited' }
            )
        )
    ) as SlashCommandBuilder,

  helpInfo: {
    category: 'orders',
    details: 'Create or update buy/sell orders with auto-pricing from your price list.',
    examples: ['order sell COF BEN', 'order buy RAT BEN 100 150'],
  },

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
    const subcommand = interaction.options.getSubcommand()
    const direction = subcommand as 'buy' | 'sell'

    // Get command prefix (/ or ! or custom)
    const prefix = getCommandPrefix(interaction)

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
    const input = interaction.options.getString('input')
    const locationOverride = interaction.options.getString('location')
    const quantityOverride = interaction.options.getInteger('quantity')
    const priceOverride = interaction.options.getNumber('price')
    const currencyOption = interaction.options.getString('currency') as ValidCurrency | null
    const visibilityOption = interaction.options.getString('visibility') as
      | 'internal'
      | 'partner'
      | null
    const limitModeRaw =
      direction === 'sell'
        ? (interaction.options.getString('limit_mode') as 'unlimited' | 'limited' | null)
        : null
    const limitModeOption =
      limitModeRaw === 'limited'
        ? ('max_sell' as const)
        : limitModeRaw === 'unlimited'
          ? ('none' as const)
          : null

    // Handle empty input - show incomplete input dialog
    if (!input || input.trim() === '') {
      await handleEmptyInput(
        interaction,
        userId,
        direction,
        prefix,
        displaySettings.locationDisplayMode
      )
      return
    }

    // Parse input with unified parser
    const parsed = await parseTokens(input, botResolvers)

    // Check if items share the same quantity (indicates comma-separated format with shared qty)
    const uniqueQuantities = new Set(parsed.items.map(i => i.quantity).filter(q => q !== null))
    const isCommaSeparated = parsed.items.length > 1 && uniqueQuantities.size === 1

    // Collect missing fields for incomplete input handling
    const missingFields: string[] = []

    // Validate we have at least one commodity
    if (parsed.items.length === 0) {
      missingFields.push('Commodity ticker (e.g., COF, DW, RAT)')
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
      missingFields.push('Location (e.g., Katoa, Montem, ANT)')
    }

    // Build line items with resolved quantities (if we have items)
    const lineItems =
      parsed.items.length > 0
        ? parsed.items.map(item => ({
            ticker: item.commodity.ticker,
            commodityName: item.commodity.name,
            quantity:
              isCommaSeparated && quantityOverride ? quantityOverride : (item.quantity ?? 0),
          }))
        : []

    // For buy orders, quantity is always required
    // For sell orders, quantity is optional (unlimited mode uses FIO sync)
    const limitMode = limitModeOption ?? 'none'
    const requiresQuantity = direction === 'buy' || limitMode !== 'none'

    // Check that all items have quantities (when required)
    const itemsWithoutQty = lineItems.filter(item => !item.quantity || item.quantity <= 0)
    if (itemsWithoutQty.length > 0 && parsed.items.length > 0 && requiresQuantity) {
      missingFields.push('Quantity (e.g., 500, 1000)')
    }

    // If we have missing fields, show incomplete input embed with dialog option
    if (missingFields.length > 0) {
      const incompleteEmbed = buildIncompleteInputEmbed({
        direction,
        missingFields,
        parsedValues: {
          commodities:
            parsed.items.length > 0 ? parsed.items.map(i => i.commodity.ticker) : undefined,
          location: locationId ?? undefined,
          quantity:
            lineItems.length > 0 && lineItems[0].quantity > 0 ? lineItems[0].quantity : undefined,
        },
        examples: [
          `${prefix}order ${direction} COF Katoa 500`,
          `${prefix}order ${direction} COF,CAF,H2O Katoa 500`,
          `${prefix}order ${direction} DW 1000 RAT 500 BEN`,
        ],
      })

      const dialogButtons = buildUseDialogButtons(`order_${direction}_dialog`)

      const dialogMessage = await interaction.reply({
        embeds: [incompleteEmbed],
        components: [dialogButtons],
        flags: MessageFlags.Ephemeral,
      })

      // Handle dialog button
      try {
        const collector = dialogMessage.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: COMPONENT_TIMEOUT,
          filter: i =>
            i.customId.startsWith(`order_${direction}_dialog`) && i.user.id === interaction.user.id,
        })

        collector.on('collect', async buttonInteraction => {
          const action = buttonInteraction.customId.split(':')[1]

          if (action === 'cancel') {
            await buttonInteraction.update({
              content: '❌ Cancelled.',
              embeds: [],
              components: [],
            })
            collector.stop()
            return
          }

          if (action === 'dialog') {
            // Show the order edit modal
            const modal = createOrderEditModal({
              modalId: `order_${direction}_edit:${Date.now()}`,
              title: `Create ${direction === 'buy' ? 'Buy' : 'Sell'} Order`,
              direction,
              quantity:
                lineItems.length > 0 && lineItems[0].quantity > 0
                  ? lineItems[0].quantity.toString()
                  : undefined,
              price: priceOverride?.toString(),
            })

            await buttonInteraction.showModal(modal)

            // Wait for modal submission
            try {
              const modalInteraction = await buttonInteraction.awaitModalSubmit({
                filter: i =>
                  i.customId.startsWith(`order_${direction}_edit:`) &&
                  i.user.id === buttonInteraction.user.id,
                time: MODAL_TIMEOUT,
              })

              const newQuantity = parseInt(
                modalInteraction.fields.getTextInputValue('quantity'),
                10
              )

              if (isNaN(newQuantity) || newQuantity <= 0) {
                await modalInteraction.reply({
                  content: '❌ Invalid quantity. Please enter a positive number.',
                  flags: MessageFlags.Ephemeral,
                })
                return
              }

              // We still need a location and commodity - inform user
              if (!locationId || parsed.items.length === 0) {
                await modalInteraction.reply({
                  content: `❌ Please specify ${!locationId ? 'a location' : ''}${!locationId && parsed.items.length === 0 ? ' and ' : ''}${parsed.items.length === 0 ? 'a commodity ticker' : ''} in the command.\n\nExample: \`${prefix}order ${direction} COF Katoa ${newQuantity}\``,
                  flags: MessageFlags.Ephemeral,
                })
                return
              }

              // Update line items with new quantity and continue to confirmation
              for (const item of lineItems) {
                item.quantity = newQuantity
              }

              // Dismiss the modal and continue
              await modalInteraction.deferUpdate()
              collector.stop('modal_submitted')
            } catch {
              // Modal timed out or was dismissed
              collector.stop()
            }
          }
        })

        collector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            try {
              await interaction.editReply({
                content: '⏱️ Timed out. Please try again.',
                embeds: [],
                components: [],
              })
            } catch {
              // Interaction may have been deleted
            }
          }
        })
      } catch (error) {
        logger.error({ error }, `Error in order ${direction} dialog collector`)
      }
      return
    }

    // Continue with order creation
    await createOrder(
      interaction,
      userId,
      direction,
      locationId!,
      lineItems,
      priceOverride,
      currencyOption,
      visibilityOption,
      limitMode,
      marketSettings,
      channelSettings,
      displaySettings.locationDisplayMode,
      prefix
    )
  },
}

/**
 * Handle empty input - show incomplete input dialog
 */
async function handleEmptyInput(
  interaction: ChatInputCommandInteraction,
  userId: number,
  direction: 'buy' | 'sell',
  prefix: string,
  locationDisplayMode: 'names-only' | 'natural-ids-only' | 'both'
): Promise<void> {
  const incompleteEmbed = buildIncompleteInputEmbed({
    direction,
    missingFields: [
      'Commodity ticker (e.g., COF, DW, RAT)',
      'Location (e.g., Katoa, Montem, ANT)',
      direction === 'buy' ? 'Quantity (e.g., 500, 1000)' : 'Quantity (optional for unlimited)',
    ],
    parsedValues: {},
    examples: [
      `${prefix}order ${direction} COF Katoa 500`,
      `${prefix}order ${direction} COF,CAF,H2O Katoa 500`,
      `${prefix}order ${direction} DW 1000 RAT 500 BEN`,
    ],
  })

  const dialogButtons = buildUseDialogButtons(`order_${direction}_empty_dialog`)

  const dialogMessage = await interaction.reply({
    embeds: [incompleteEmbed],
    components: [dialogButtons],
    flags: MessageFlags.Ephemeral,
  })

  // Handle dialog button
  try {
    const collector = dialogMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COMPONENT_TIMEOUT,
      filter: i =>
        i.customId.startsWith(`order_${direction}_empty_dialog`) &&
        i.user.id === interaction.user.id,
    })

    collector.on('collect', async buttonInteraction => {
      const action = buttonInteraction.customId.split(':')[1]

      if (action === 'cancel') {
        await buttonInteraction.update({
          content: '❌ Cancelled.',
          embeds: [],
          components: [],
        })
        collector.stop()
        return
      }

      if (action === 'dialog') {
        // Show the multi-field modal for entering order details
        const modal = createNewOrderModal({
          modalId: `order_${direction}_new:${Date.now()}`,
          title: `Create ${direction === 'buy' ? 'Buy' : 'Sell'} Order`,
          direction,
        })

        await buttonInteraction.showModal(modal)

        try {
          const modalInteraction = await buttonInteraction.awaitModalSubmit({
            filter: i =>
              i.customId.startsWith(`order_${direction}_new:`) &&
              i.user.id === buttonInteraction.user.id,
            time: MODAL_TIMEOUT,
          })

          // Parse modal fields
          const commodityInput = modalInteraction.fields.getTextInputValue('commodity').trim()
          const locationInput = modalInteraction.fields.getTextInputValue('location').trim()
          const quantityInput = modalInteraction.fields.getTextInputValue('quantity').trim()
          const priceInput = modalInteraction.fields.getTextInputValue('price').trim()

          if (!commodityInput || !locationInput) {
            await modalInteraction.reply({
              content: '❌ Commodity and location are required.',
              flags: MessageFlags.Ephemeral,
            })
            collector.stop()
            return
          }

          // Parse quantity (required for buy, optional for sell)
          const quantity = quantityInput ? parseInt(quantityInput, 10) : 0
          if (direction === 'buy' && (isNaN(quantity) || quantity <= 0)) {
            await modalInteraction.reply({
              content: '❌ Invalid quantity. Please enter a positive number.',
              flags: MessageFlags.Ephemeral,
            })
            collector.stop()
            return
          }

          // Parse price (optional)
          const priceOverride = priceInput ? parseFloat(priceInput) : null
          if (priceInput && (isNaN(priceOverride!) || priceOverride! < 0)) {
            await modalInteraction.reply({
              content: '❌ Invalid price. Please enter a valid number.',
              flags: MessageFlags.Ephemeral,
            })
            collector.stop()
            return
          }

          // Resolve commodities (comma-separated)
          const commodityTickers = commodityInput.split(',').map(s => s.trim().toUpperCase())
          const resolvedCommodities: Array<{ ticker: string; name: string }> = []

          for (const ticker of commodityTickers) {
            const commodity = await botResolvers.resolveCommodity(ticker)
            if (!commodity) {
              await modalInteraction.reply({
                content: `❌ Commodity "${ticker}" not found.`,
                flags: MessageFlags.Ephemeral,
              })
              collector.stop()
              return
            }
            resolvedCommodities.push({ ticker: commodity.ticker, name: commodity.name })
          }

          // Resolve location
          const resolvedLocation = await resolveLocation(locationInput)
          if (!resolvedLocation) {
            await modalInteraction.reply({
              content: `❌ Location "${locationInput}" not found.`,
              flags: MessageFlags.Ephemeral,
            })
            collector.stop()
            return
          }

          // Build line items
          const lineItems = resolvedCommodities.map(c => ({
            ticker: c.ticker,
            commodityName: c.name,
            quantity,
          }))

          // Get user settings
          const marketSettings = await getMarketSettings(userId)
          const channelId = buttonInteraction.channelId
          const channelSettings = await getChannelConfig(channelId)

          // Dismiss the modal and continue to order creation
          await modalInteraction.deferUpdate()

          // Create the order
          await createOrderFromModal(
            modalInteraction,
            buttonInteraction,
            userId,
            direction,
            resolvedLocation.naturalId,
            lineItems,
            priceOverride,
            null, // currencyOption
            null, // visibilityOption
            direction === 'sell' && quantity === 0 ? 'none' : 'max_sell',
            marketSettings,
            channelSettings,
            locationDisplayMode,
            prefix
          )

          collector.stop()
        } catch {
          // Modal timed out or was dismissed
          collector.stop()
        }
      }
    })

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.editReply({
            content: '⏱️ Timed out. Please try again.',
            embeds: [],
            components: [],
          })
        } catch {
          // Interaction may have been deleted
        }
      }
    })
  } catch (error) {
    logger.error({ error }, `Error in order ${direction} empty dialog collector`)
  }
}

/**
 * Create an order with the given parameters
 */
async function createOrder(
  interaction: ChatInputCommandInteraction,
  userId: number,
  direction: 'buy' | 'sell',
  locationId: string,
  lineItems: Array<{ ticker: string; commodityName: string; quantity: number }>,
  priceOverride: number | null,
  currencyOption: ValidCurrency | null,
  visibilityOption: 'internal' | 'partner' | null,
  limitMode: 'none' | 'max_sell' | 'reserve',
  marketSettings: Awaited<ReturnType<typeof getMarketSettings>>,
  channelSettings: Awaited<ReturnType<typeof getChannelConfig>>,
  locationDisplayMode: 'names-only' | 'natural-ids-only' | 'both',
  prefix: string
): Promise<void> {
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

  // Determine visibility using channel defaults resolution
  const orderType: 'internal' | 'partner' = resolveEffectiveValue(
    visibilityOption,
    channelSettings?.visibility,
    channelSettings?.visibilityEnforced ?? false,
    'internal' as const,
    'internal' as const
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
        `1. Add \`price:\` option to this command\n` +
        `2. Configure a default price list in \`${prefix}settings market\`\n` +
        '3. Enable automatic pricing in your settings',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Calculate prices for all items before showing confirmation
  const plannedOrders: Array<{
    ticker: string
    commodityName: string
    quantity: number
    price: number
    currency: string
    priceSource: string
    priceListCode: string | null
  }> = []

  for (const item of lineItems) {
    const { ticker, commodityName, quantity } = item
    let price: number
    let orderPriceListCode: string | null = null
    let priceSource: string

    if (priceOverride !== null && priceOverride !== undefined) {
      // Fixed price from option
      price = priceOverride
      priceSource = 'fixed price'
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
        priceSource = `auto-priced from ${priceListCode}`
      } else {
        // No price in list - set price=0 and mark as dynamic (will show --)
        price = 0
        orderPriceListCode = priceListCode
        priceSource = `${priceListCode} (no price)`
      }
    } else {
      // This shouldn't happen, but fallback to 0
      price = 0
      priceSource = 'pending'
    }

    plannedOrders.push({
      ticker,
      commodityName,
      quantity,
      price,
      currency,
      priceSource,
      priceListCode: orderPriceListCode,
    })
  }

  // Check for existing orders that will be updated
  const existingOrdersList =
    direction === 'buy'
      ? await db.query.buyOrders.findMany({
          where: and(
            isNull(buyOrders.deletedAt),
            eq(buyOrders.userId, userId),
            eq(buyOrders.locationId, locationId),
            eq(buyOrders.orderType, orderType),
            eq(buyOrders.currency, currency)
          ),
        })
      : await db.query.sellOrders.findMany({
          where: and(
            isNull(sellOrders.deletedAt),
            eq(sellOrders.userId, userId),
            eq(sellOrders.locationId, locationId),
            eq(sellOrders.orderType, orderType),
            eq(sellOrders.currency, currency)
          ),
        })

  const existingOrdersMap = new Map(
    existingOrdersList
      .filter(o => plannedOrders.some(p => p.ticker === o.commodityTicker))
      .map(o => [
        o.commodityTicker,
        {
          ticker: o.commodityTicker,
          quantity: 'quantity' in o ? o.quantity : (o.limitQuantity ?? 0),
          price: o.price,
          currency: o.currency,
        },
      ])
  )

  // Get location name for display
  const resolvedLocation = await resolveLocation(locationId)
  const locationName = resolvedLocation?.name ?? locationId

  // Build confirmation data
  const confirmationData: OrderConfirmationData = {
    direction,
    locationId,
    locationName,
    items: plannedOrders.map(o => ({
      ticker: o.ticker,
      commodityName: o.commodityName,
      quantity: o.quantity,
      price: o.price > 0 ? o.price.toFixed(2) : '--',
      currency: o.currency,
      priceSource: o.priceSource,
    })),
    orderType: orderType === 'internal' ? 'market' : 'limit',
    existingOrders: Array.from(existingOrdersMap.values()),
  }

  // Show confirmation embed with Edit button
  const confirmEmbed = await buildOrderConfirmationEmbed(confirmationData, locationDisplayMode)
  const confirmButtons = buildOrderConfirmationButtons(`order_${direction}_confirm`, {
    showEdit: true,
  })

  const confirmMessage = await interaction.reply({
    embeds: [confirmEmbed],
    components: [confirmButtons],
    flags: MessageFlags.Ephemeral,
  })

  // Wait for confirmation
  try {
    // Store current state for Edit functionality
    let currentQuantity = lineItems[0]?.quantity ?? 0
    let currentPrice = priceOverride

    const collector = confirmMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COMPONENT_TIMEOUT,
      filter: i =>
        i.customId.startsWith(`order_${direction}_confirm`) && i.user.id === interaction.user.id,
    })

    collector.on('collect', async buttonInteraction => {
      const action = buttonInteraction.customId.split(':')[1]

      if (action === 'cancel') {
        await buttonInteraction.update({
          content: '❌ Order cancelled.',
          embeds: [],
          components: [],
        })
        collector.stop()
        return
      }

      if (action === 'edit') {
        // Show the order edit modal with current values
        const modal = createOrderEditModal({
          modalId: `order_${direction}_edit:${Date.now()}`,
          title: `Edit ${direction === 'buy' ? 'Buy' : 'Sell'} Order`,
          direction,
          quantity: currentQuantity.toString(),
          price: currentPrice?.toString(),
        })

        await buttonInteraction.showModal(modal)

        // Wait for modal submission
        try {
          const modalInteraction = await buttonInteraction.awaitModalSubmit({
            filter: i =>
              i.customId.startsWith(`order_${direction}_edit:`) &&
              i.user.id === buttonInteraction.user.id,
            time: MODAL_TIMEOUT,
          })

          const newQuantity = parseInt(modalInteraction.fields.getTextInputValue('quantity'), 10)
          const newPriceStr = modalInteraction.fields.getTextInputValue('price')
          const newPrice = newPriceStr ? parseFloat(newPriceStr) : null

          if (isNaN(newQuantity) || newQuantity <= 0) {
            await modalInteraction.reply({
              content: '❌ Invalid quantity. Please enter a positive number.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          // Update state
          currentQuantity = newQuantity
          currentPrice = newPrice

          // Recalculate prices with new values
          for (const planned of plannedOrders) {
            planned.quantity = newQuantity

            if (newPrice !== null) {
              planned.price = newPrice
              planned.priceSource = 'fixed price'
            }
          }

          // Update confirmation data
          confirmationData.items = plannedOrders.map(o => ({
            ticker: o.ticker,
            commodityName: o.commodityName,
            quantity: o.quantity,
            price: o.price > 0 ? o.price.toFixed(2) : '--',
            currency: o.currency,
            priceSource: o.priceSource,
          }))

          // Rebuild and update confirmation embed
          const updatedEmbed = await buildOrderConfirmationEmbed(
            confirmationData,
            locationDisplayMode
          )

          // Acknowledge modal and update the message via button interaction
          await modalInteraction.deferUpdate()
          await buttonInteraction.editReply({
            embeds: [updatedEmbed],
            components: [confirmButtons],
          })
        } catch {
          // Modal timed out or was dismissed - do nothing, keep collector active
        }
        return
      }

      if (action === 'confirm') {
        // Disable buttons
        await buttonInteraction.update({
          embeds: [confirmEmbed],
          components: [],
        })

        // Execute orders
        const createdOrders: Array<{
          ticker: string
          quantity: number
          price: number | null
          currency: string
          priceSource: 'fixed' | 'auto' | 'pending'
        }> = []
        const errors: string[] = []

        for (const planned of plannedOrders) {
          const { ticker, quantity, price, priceListCode } = planned
          try {
            if (direction === 'buy') {
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
                  priceListCode: priceListCode ?? null,
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
                    priceListCode: priceListCode ?? null,
                    updatedAt: new Date(),
                  },
                })
            } else {
              // Upsert the sell order
              await db
                .insert(sellOrders)
                .values({
                  userId,
                  commodityTicker: ticker,
                  locationId,
                  price: price.toFixed(2),
                  currency,
                  priceListCode: priceListCode ?? null,
                  orderType,
                  limitMode,
                  limitQuantity: limitMode !== 'none' ? quantity : null,
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
                    priceListCode: priceListCode ?? null,
                    limitMode,
                    limitQuantity: limitMode !== 'none' ? quantity : null,
                    updatedAt: new Date(),
                  },
                })
            }

            createdOrders.push({
              ticker,
              quantity,
              price: price > 0 ? price : null,
              currency,
              priceSource: currentPrice !== null ? 'fixed' : price > 0 ? 'auto' : 'pending',
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
                priceListCode: priceListCode ?? null,
                direction,
              },
              `${direction === 'buy' ? 'Buy' : 'Sell'} order created/updated via /order`
            )
          } catch (error) {
            logger.error(
              { error, userId, ticker, locationId },
              `Failed to create ${direction} order`
            )
            errors.push(`${ticker}: failed to create`)
          }
        }

        // Build success message with tips
        const tickers = createdOrders.map(o => o.ticker)
        const wasUpdate = existingOrdersMap.size > 0
        const tips = buildOrderCreatedTips(direction, tickers, locationId, prefix, wasUpdate)

        await buttonInteraction.followUp({
          content: tips,
          flags: MessageFlags.Ephemeral,
        })

        collector.stop()
      }
    })

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.editReply({
            content: '⏱️ Confirmation timed out. Please try again.',
            embeds: [],
            components: [],
          })
        } catch {
          // Interaction may have been deleted
        }
      }
    })
  } catch (error) {
    logger.error({ error }, `Error in order ${direction} confirmation collector`)
  }
}

/**
 * Create an order from modal submission (used in empty input flow)
 */
async function createOrderFromModal(
  modalInteraction: import('discord.js').ModalSubmitInteraction,
  buttonInteraction: import('discord.js').ButtonInteraction,
  userId: number,
  direction: 'buy' | 'sell',
  locationId: string,
  lineItems: Array<{ ticker: string; commodityName: string; quantity: number }>,
  priceOverride: number | null,
  currencyOption: ValidCurrency | null,
  visibilityOption: 'internal' | 'partner' | null,
  limitMode: 'none' | 'max_sell' | 'reserve',
  marketSettings: Awaited<ReturnType<typeof getMarketSettings>>,
  channelSettings: Awaited<ReturnType<typeof getChannelConfig>>,
  locationDisplayMode: 'names-only' | 'natural-ids-only' | 'both',
  prefix: string
): Promise<void> {
  // Determine currency using channel defaults resolution
  const currency: ValidCurrency = resolveEffectiveValue(
    currencyOption,
    channelSettings?.currency,
    channelSettings?.currencyEnforced ?? false,
    marketSettings.preferredCurrency as ValidCurrency,
    'CIS' as ValidCurrency
  )

  // Determine visibility using channel defaults resolution
  const orderType: 'internal' | 'partner' = resolveEffectiveValue(
    visibilityOption,
    channelSettings?.visibility,
    channelSettings?.visibilityEnforced ?? false,
    'internal' as const,
    'internal' as const
  )

  // Determine price list using channel defaults resolution
  const effectivePriceList: string | null = resolveEffectiveValue(
    null,
    channelSettings?.priceList,
    channelSettings?.priceListEnforced ?? false,
    marketSettings.defaultPriceList,
    null
  )

  // Validate pricing
  if (priceOverride === null && !effectivePriceList) {
    await buttonInteraction.editReply({
      content:
        '❌ Please provide a price or configure auto-pricing.\n\n' +
        `Configure a default price list in \`${prefix}settings market\``,
      embeds: [],
      components: [],
    })
    return
  }

  // Calculate prices for all items
  const plannedOrders: Array<{
    ticker: string
    commodityName: string
    quantity: number
    price: number
    currency: ValidCurrency
    priceSource: string
    priceListCode: string | null
  }> = []

  for (const { ticker, commodityName, quantity } of lineItems) {
    let price: number
    let orderPriceListCode: string | null = null
    let priceSource: string

    if (priceOverride !== null) {
      price = priceOverride
      priceSource = 'fixed price'
    } else if (effectivePriceList) {
      const effectivePrice = await calculateEffectivePriceWithFallback(
        effectivePriceList,
        ticker,
        locationId,
        currency
      )

      if (effectivePrice) {
        price = effectivePrice.finalPrice
        orderPriceListCode = effectivePriceList
        priceSource = `auto-priced from ${effectivePriceList}`
      } else {
        price = 0
        orderPriceListCode = effectivePriceList
        priceSource = `${effectivePriceList} (no price)`
      }
    } else {
      price = 0
      priceSource = 'pending'
    }

    plannedOrders.push({
      ticker,
      commodityName,
      quantity,
      price,
      currency,
      priceSource,
      priceListCode: orderPriceListCode,
    })
  }

  // Check for existing orders
  const existingOrdersList =
    direction === 'buy'
      ? await db.query.buyOrders.findMany({
          where: and(
            isNull(buyOrders.deletedAt),
            eq(buyOrders.userId, userId),
            eq(buyOrders.locationId, locationId),
            eq(buyOrders.orderType, orderType),
            eq(buyOrders.currency, currency)
          ),
        })
      : await db.query.sellOrders.findMany({
          where: and(
            isNull(sellOrders.deletedAt),
            eq(sellOrders.userId, userId),
            eq(sellOrders.locationId, locationId),
            eq(sellOrders.orderType, orderType),
            eq(sellOrders.currency, currency)
          ),
        })

  const existingOrdersMap = new Map(
    existingOrdersList
      .filter(o => plannedOrders.some(p => p.ticker === o.commodityTicker))
      .map(o => [
        o.commodityTicker,
        {
          ticker: o.commodityTicker,
          quantity: 'quantity' in o ? o.quantity : (o.limitQuantity ?? 0),
          price: o.price,
          currency: o.currency,
        },
      ])
  )

  // Get location name for display
  const resolvedLocation = await resolveLocation(locationId)
  const locationName = resolvedLocation?.name ?? locationId

  // Build confirmation data
  const confirmationData: OrderConfirmationData = {
    direction,
    locationId,
    locationName,
    items: plannedOrders.map(o => ({
      ticker: o.ticker,
      commodityName: o.commodityName,
      quantity: o.quantity,
      price: o.price > 0 ? o.price.toFixed(2) : '--',
      currency: o.currency,
      priceSource: o.priceSource,
    })),
    orderType: orderType === 'internal' ? 'market' : 'limit',
    existingOrders: Array.from(existingOrdersMap.values()),
  }

  // Show confirmation embed
  const confirmEmbed = await buildOrderConfirmationEmbed(confirmationData, locationDisplayMode)
  const confirmButtons = buildOrderConfirmationButtons(`order_${direction}_modal_confirm`, {
    showEdit: true,
  })

  await buttonInteraction.editReply({
    embeds: [confirmEmbed],
    components: [confirmButtons],
  })

  // Handle confirmation buttons
  let currentQuantity = lineItems[0]?.quantity ?? 0
  let currentPrice = priceOverride

  const confirmCollector = buttonInteraction.message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COMPONENT_TIMEOUT,
    filter: i =>
      i.customId.startsWith(`order_${direction}_modal_confirm`) &&
      i.user.id === buttonInteraction.user.id,
  })

  confirmCollector.on('collect', async confirmButtonInteraction => {
    const confirmAction = confirmButtonInteraction.customId.split(':')[1]

    if (confirmAction === 'cancel') {
      await confirmButtonInteraction.update({
        content: '❌ Order cancelled.',
        embeds: [],
        components: [],
      })
      confirmCollector.stop()
      return
    }

    if (confirmAction === 'edit') {
      const editModal = createOrderEditModal({
        modalId: `order_${direction}_modal_edit:${Date.now()}`,
        title: `Edit ${direction === 'buy' ? 'Buy' : 'Sell'} Order`,
        direction,
        quantity: currentQuantity.toString(),
        price: currentPrice?.toString(),
      })

      await confirmButtonInteraction.showModal(editModal)

      try {
        const editModalInteraction = await confirmButtonInteraction.awaitModalSubmit({
          filter: i =>
            i.customId.startsWith(`order_${direction}_modal_edit:`) &&
            i.user.id === confirmButtonInteraction.user.id,
          time: MODAL_TIMEOUT,
        })

        const newQuantity = parseInt(editModalInteraction.fields.getTextInputValue('quantity'), 10)
        const newPriceStr = editModalInteraction.fields.getTextInputValue('price')
        const newPrice = newPriceStr ? parseFloat(newPriceStr) : null

        if (isNaN(newQuantity) || newQuantity <= 0) {
          await editModalInteraction.reply({
            content: '❌ Invalid quantity. Please enter a positive number.',
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        currentQuantity = newQuantity
        currentPrice = newPrice

        // Update planned orders
        for (const planned of plannedOrders) {
          planned.quantity = newQuantity
          if (newPrice !== null) {
            planned.price = newPrice
            planned.priceSource = 'fixed price'
          }
        }

        // Update confirmation data
        confirmationData.items = plannedOrders.map(o => ({
          ticker: o.ticker,
          commodityName: o.commodityName,
          quantity: o.quantity,
          price: o.price > 0 ? o.price.toFixed(2) : '--',
          currency: o.currency,
          priceSource: o.priceSource,
        }))

        const updatedEmbed = await buildOrderConfirmationEmbed(
          confirmationData,
          locationDisplayMode
        )

        // Acknowledge modal and update the message
        await editModalInteraction.deferUpdate()
        await confirmButtonInteraction.editReply({
          embeds: [updatedEmbed],
          components: [confirmButtons],
        })
      } catch {
        // Modal timed out - keep collector active
      }
      return
    }

    if (confirmAction === 'confirm') {
      await confirmButtonInteraction.update({
        embeds: [confirmEmbed],
        components: [],
      })

      // Execute orders
      const createdOrders: Array<{ ticker: string }> = []
      const errors: string[] = []

      for (const planned of plannedOrders) {
        try {
          if (direction === 'buy') {
            await db
              .insert(buyOrders)
              .values({
                userId,
                commodityTicker: planned.ticker,
                locationId,
                quantity: planned.quantity,
                price: planned.price.toFixed(2),
                currency: planned.currency,
                priceListCode: planned.priceListCode ?? null,
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
                  quantity: planned.quantity,
                  price: planned.price.toFixed(2),
                  priceListCode: planned.priceListCode ?? null,
                  updatedAt: new Date(),
                },
              })
          } else {
            await db
              .insert(sellOrders)
              .values({
                userId,
                commodityTicker: planned.ticker,
                locationId,
                price: planned.price.toFixed(2),
                currency: planned.currency,
                priceListCode: planned.priceListCode ?? null,
                orderType,
                limitMode,
                limitQuantity: limitMode !== 'none' ? planned.quantity : null,
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
                  price: planned.price.toFixed(2),
                  priceListCode: planned.priceListCode ?? null,
                  limitMode,
                  limitQuantity: limitMode !== 'none' ? planned.quantity : null,
                  updatedAt: new Date(),
                },
              })
          }

          createdOrders.push({ ticker: planned.ticker })

          logger.info(
            {
              userId,
              commodityTicker: planned.ticker,
              locationId,
              quantity: planned.quantity,
              price: planned.price,
              currency: planned.currency,
              orderType,
              direction,
            },
            `${direction === 'buy' ? 'Buy' : 'Sell'} order created via /order dialog`
          )
        } catch (error) {
          logger.error(
            { error, userId, ticker: planned.ticker },
            `Failed to create ${direction} order via dialog`
          )
          errors.push(`${planned.ticker}: failed to create`)
        }
      }

      // Build success message
      const tickers = createdOrders.map(o => o.ticker)
      const wasUpdate = existingOrdersMap.size > 0
      const tips = buildOrderCreatedTips(direction, tickers, locationId, prefix, wasUpdate)

      await confirmButtonInteraction.followUp({
        content: tips,
        flags: MessageFlags.Ephemeral,
      })

      confirmCollector.stop()
    }
  })

  confirmCollector.on('end', async (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      try {
        await buttonInteraction.editReply({
          content: '⏱️ Confirmation timed out. Please try again.',
          embeds: [],
          components: [],
        })
      } catch {
        // Interaction may have been deleted
      }
    }
  })
}
