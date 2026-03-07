import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
} from 'discord.js'
import type { Command } from '../../client.js'
import { parseTokens } from '@kawakawa/parser'
import { db, sellOrders, buyOrders, userDiscordProfiles, priceLists } from '@kawakawa/db'
import { eq, and, desc, or, isNull } from 'drizzle-orm'
import { searchCommodities, searchLocations } from '../../autocomplete/index.js'
import { botResolvers } from '../../utils/resolvers.js'
import {
  resolveCommodity,
  resolveLocation,
  formatCommodity,
  formatLocation,
} from '../../services/display.js'
import { getDisplaySettings, getFioUsernames } from '../../services/userSettings.js'
import { getChannelConfig, resolveEffectiveValue } from '../../services/channelConfig.js'
import { enrichSellOrdersWithQuantities, getOrderDisplayPrice } from '@kawakawa/services/market'
import {
  formatGroupedOrdersMulti,
  buildFilterDescription,
  type MultiResolvedFilters,
} from '../../services/orderFormatter.js'
import { isValidCurrency, type ValidCurrency } from '../../utils/validation.js'
import { replyError } from '../../utils/replies.js'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

const ORDERS_PER_PAGE = 10
const COMPONENT_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export const orders: Command = {
  data: new SlashCommandBuilder()
    .setName('orders')
    .setDescription('View your own orders with optional filters')
    .addStringOption(option =>
      option.setName('commodity').setDescription('Filter by commodity ticker').setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('location').setDescription('Filter by location').setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Filter by order type (default all)')
        .addChoices(
          { name: 'All Orders', value: 'all' },
          { name: 'Sell Orders', value: 'sell' },
          { name: 'Buy Orders', value: 'buy' }
        )
    )
    .addStringOption(option =>
      option
        .setName('visibility')
        .setDescription('Filter by visibility (default all)')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Internal (members)', value: 'internal' },
          { name: 'Partner (trade partners)', value: 'partner' }
        )
    ) as SlashCommandBuilder,

  helpInfo: {
    category: 'orders',
    details:
      'Shows your orders by default. Add filters to search the market.\nUse the Manage button to edit or delete your orders.',
    examples: ['orders', 'orders COF'],
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true)
    const query = focusedOption.value
    const discordId = interaction.user.id

    if (!query.trim()) {
      await interaction.respond([])
      return
    }

    let choices: { name: string; value: string }[] = []

    if (focusedOption.name === 'commodity') {
      const commodities = await searchCommodities(query, 25, discordId)
      choices = commodities.map(c => ({
        name: `${c.ticker} - ${c.name}`,
        value: c.ticker,
      }))
    } else if (focusedOption.name === 'location') {
      const locations = await searchLocations(query, 25, discordId)
      choices = locations.map(l => ({
        name: `${l.naturalId} - ${l.name}`,
        value: l.naturalId,
      }))
    }

    await interaction.respond(choices.slice(0, 25))
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prefix = getCommandPrefix(interaction)

    // Check if user has a linked account (required for this command)
    const discordProfile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, interaction.user.id),
    })

    if (!discordProfile) {
      await interaction.reply({
        content: `❌ You need to link your account first. Use \`${prefix}register\` to create an account or \`${prefix}link\` to connect an existing one.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const currentUserId = discordProfile.userId

    // Get named options (from slash commands)
    const commodityInput = interaction.options.getString('commodity')
    const locationInput = interaction.options.getString('location')
    let orderType: 'all' | 'sell' | 'buy' =
      (interaction.options.getString('type') as 'all' | 'sell' | 'buy' | null) || 'all'
    const visibilityOption = interaction.options.getString('visibility') as
      | 'all'
      | 'internal'
      | 'partner'
      | null

    // Check for prefix command input (e.g., "!orders COF BEN" or "!orders buy COF")
    // The message command handler sets 'input' with the full text after the command
    const prefixInput = interaction.options.getString('input')

    // Get user's display preferences
    const displaySettings = await getDisplaySettings(interaction.user.id)

    // Get channel defaults (if configured)
    const channelId = interaction.channelId
    const channelSettings = await getChannelConfig(channelId)

    // Determine visibility using channel defaults
    // For viewing your own orders, 'all' means no filter
    const visibility: 'all' | 'internal' | 'partner' = resolveEffectiveValue(
      visibilityOption,
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false,
      'all' as const,
      'all' as const
    )

    // Build price list filter condition
    // When enforced: only show orders with that price list
    // When not enforced: show orders with that price list OR custom prices (null)
    const channelPriceList = channelSettings?.priceList
    const priceListEnforced = channelSettings?.priceListEnforced ?? false

    // Resolve filter inputs
    let resolvedCommodity: { ticker: string; name: string } | null = null
    let resolvedLocation: { naturalId: string; name: string; type: string } | null = null

    // If prefix input is provided, parse it with the unified parser
    if (prefixInput && !commodityInput && !locationInput) {
      const parsed = await parseTokens(prefixInput, botResolvers)

      // Extract order type from action keywords
      if (parsed.actions.has('buy')) {
        orderType = 'buy'
      } else if (parsed.actions.has('sell')) {
        orderType = 'sell'
      }

      // Extract the first resolved commodity
      if (parsed.items.length > 0) {
        resolvedCommodity = parsed.items[0].commodity
      }

      // Extract location
      if (parsed.location) {
        resolvedLocation = {
          naturalId: parsed.location.naturalId,
          name: parsed.location.name,
          type: parsed.location.type,
        }
      }

      // If nothing was resolved and there were unresolved tokens, show error
      if (parsed.unresolved.length > 0 && !resolvedCommodity && !resolvedLocation) {
        await interaction.reply({
          content:
            `❌ Could not resolve: ${parsed.unresolved.map(t => `"${t}"`).join(', ')}\n\n` +
            `Use \`${prefix}orders\` with autocomplete for commodities or locations.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    } else {
      // Standard slash command flow with named options
      if (commodityInput) {
        resolvedCommodity = await resolveCommodity(commodityInput)
        if (!resolvedCommodity) {
          await interaction.reply({
            content: `❌ Commodity "${commodityInput}" not found.`,
            flags: MessageFlags.Ephemeral,
          })
          return
        }
      }

      if (locationInput) {
        resolvedLocation = await resolveLocation(locationInput)
        if (!resolvedLocation) {
          await interaction.reply({
            content: `❌ Location "${locationInput}" not found.`,
            flags: MessageFlags.Ephemeral,
          })
          return
        }
      }
    }

    // Build filter description for embed
    const filterDesc = buildFilterDescription(
      resolvedCommodity ? [formatCommodity(resolvedCommodity.ticker)] : [],
      resolvedLocation
        ? [await formatLocation(resolvedLocation.naturalId, displaySettings.locationDisplayMode)]
        : [],
      [], // No user filter - always showing own orders
      orderType,
      visibility,
      { visibilityEnforced: channelSettings?.visibilityEnforced ?? false }
    )

    // Build price list filter for sell orders
    const sellPriceListFilter = channelPriceList
      ? priceListEnforced
        ? eq(sellOrders.priceListCode, channelPriceList)
        : or(eq(sellOrders.priceListCode, channelPriceList), isNull(sellOrders.priceListCode))
      : undefined

    // Fetch sell orders (only for current user)
    const sellOrdersData =
      orderType === 'buy'
        ? []
        : await db.query.sellOrders.findMany({
            where: and(
              eq(sellOrders.userId, currentUserId), // Always filter by current user
              resolvedCommodity
                ? eq(sellOrders.commodityTicker, resolvedCommodity.ticker)
                : undefined,
              resolvedLocation ? eq(sellOrders.locationId, resolvedLocation.naturalId) : undefined,
              visibility && visibility !== 'all' ? eq(sellOrders.orderType, visibility) : undefined,
              sellPriceListFilter
            ),
            with: {
              user: true,
              commodity: true,
              location: true,
            },
            orderBy: [desc(sellOrders.updatedAt)],
          })

    // Build price list filter for buy orders
    const buyPriceListFilter = channelPriceList
      ? priceListEnforced
        ? eq(buyOrders.priceListCode, channelPriceList)
        : or(eq(buyOrders.priceListCode, channelPriceList), isNull(buyOrders.priceListCode))
      : undefined

    // Fetch buy orders (only for current user)
    const buyOrdersData =
      orderType === 'sell'
        ? []
        : await db.query.buyOrders.findMany({
            where: and(
              eq(buyOrders.userId, currentUserId), // Always filter by current user
              resolvedCommodity
                ? eq(buyOrders.commodityTicker, resolvedCommodity.ticker)
                : undefined,
              resolvedLocation ? eq(buyOrders.locationId, resolvedLocation.naturalId) : undefined,
              visibility && visibility !== 'all' ? eq(buyOrders.orderType, visibility) : undefined,
              buyPriceListFilter
            ),
            with: {
              user: true,
              commodity: true,
              location: true,
            },
            orderBy: [desc(buyOrders.updatedAt)],
          })

    // Check if any orders found
    const hasOrders = sellOrdersData.length > 0 || buyOrdersData.length > 0

    if (!hasOrders) {
      await interaction.reply({
        content: `📭 No orders found matching your filters.\n\n*${filterDesc}*`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Collect all user IDs and fetch FIO usernames
    const allUserIds = [...sellOrdersData.map(o => o.userId), ...buyOrdersData.map(o => o.userId)]
    const fioUsernameMap = await getFioUsernames(allUserIds)

    // Merge FIO usernames into order data
    const enrichedSellOrders = sellOrdersData.map(o => ({
      ...o,
      user: {
        ...o.user,
        fioUsername: fioUsernameMap.get(o.userId),
      },
    }))
    const enrichedBuyOrders = buyOrdersData.map(o => ({
      ...o,
      user: {
        ...o.user,
        fioUsername: fioUsernameMap.get(o.userId),
      },
    }))

    // Enrich sell orders with inventory and reservation quantities
    const sellQuantities = await enrichSellOrdersWithQuantities(
      sellOrdersData.map(o => ({
        id: o.id,
        userId: o.userId,
        commodityTicker: o.commodityTicker,
        locationId: o.locationId,
        limitMode: o.limitMode,
        limitQuantity: o.limitQuantity,
      }))
    )

    // Build resolved filters for grouping logic (wrap single values in arrays for multi formatter)
    const resolvedFilters: MultiResolvedFilters = {
      commodities: resolvedCommodity ? [resolvedCommodity] : [],
      locations: resolvedLocation ? [resolvedLocation] : [],
      userIds: [], // No user filter - always showing own orders
      displayNames: [], // No user filter - always showing own orders
    }

    // Format orders as grouped paginated items
    const { items: allItems } = await formatGroupedOrdersMulti(
      enrichedSellOrders,
      enrichedBuyOrders,
      sellQuantities,
      resolvedFilters,
      displaySettings.locationDisplayMode,
      orderType,
      visibility
    )

    // Build base embed (always "Your Orders" since this is a self-only command)
    const baseEmbed = new EmbedBuilder()
      .setTitle('📦 Your Orders')
      .setColor(0x5865f2)
      .setDescription(filterDesc)
      .setTimestamp()

    // Custom pagination with Manage button (always ephemeral)
    await sendOrdersWithManage(interaction, baseEmbed, allItems, currentUserId)
  },
}

/**
 * Send orders with pagination and manage functionality.
 * Always ephemeral with share button (shared messages don't have Manage button).
 */
async function sendOrdersWithManage(
  interaction: ChatInputCommandInteraction,
  baseEmbed: EmbedBuilder,
  allItems: { name: string; value: string; inline?: boolean }[],
  currentUserId: number | null
): Promise<void> {
  const idPrefix = `orders:${Date.now()}`

  // Calculate pages
  const pages = calculateOrderPages(allItems, ORDERS_PER_PAGE)
  const totalPages = pages.length
  let currentPage = 0

  const buildEmbed = (page: number, includeFooterHints = true): EmbedBuilder => {
    const embed = EmbedBuilder.from(baseEmbed)
    const pageItems = pages[page] || []
    embed.setFields(...pageItems.map(item => ({ ...item, inline: item.inline ?? true })))

    const footerLines: string[] = []
    if (includeFooterHints) {
      footerLines.push('📢 Share to post publicly')
      if (currentUserId) {
        footerLines.push('🗑️ Manage to edit or delete your orders')
      }
    }
    footerLines.push(`Page ${page + 1}/${totalPages}`)
    embed.setFooter({ text: footerLines.join('\n') })

    return embed
  }

  const buildButtons = (page: number): ActionRowBuilder<ButtonBuilder> => {
    const row = new ActionRowBuilder<ButtonBuilder>()

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:prev`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:info`)
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:next`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:share`)
        .setLabel('📢 Share')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:manage`)
        .setLabel('🗑️ Manage')
        .setStyle(ButtonStyle.Danger)
    )

    return row
  }

  const response = await interaction.reply({
    embeds: [buildEmbed(0)],
    components: [buildButtons(0)],
    flags: MessageFlags.Ephemeral,
  })

  const collector = response.createMessageComponentCollector({
    time: COMPONENT_TIMEOUT,
    filter: i => i.customId.startsWith(idPrefix) && i.user.id === interaction.user.id,
  })

  collector.on(
    'collect',
    async (btnInteraction: ButtonInteraction | StringSelectMenuInteraction) => {
      if (btnInteraction.isButton()) {
        const action = btnInteraction.customId.split(':')[2]

        switch (action) {
          case 'prev':
            if (currentPage > 0) currentPage--
            await btnInteraction.update({
              embeds: [buildEmbed(currentPage)],
              components: [buildButtons(currentPage)],
            })
            break

          case 'next':
            if (currentPage < totalPages - 1) currentPage++
            await btnInteraction.update({
              embeds: [buildEmbed(currentPage)],
              components: [buildButtons(currentPage)],
            })
            break

          case 'share': {
            const member = interaction.member
            const sharedByName =
              member && 'displayName' in member ? member.displayName : interaction.user.displayName
            const shareEmbed = buildEmbed(currentPage, false) // Don't include footer hints
            shareEmbed.setFooter({
              text: `Shared by ${sharedByName}\nPage ${currentPage + 1}/${totalPages}`,
            })
            await btnInteraction.reply({ embeds: [shareEmbed] })
            break
          }

          case 'manage': {
            if (!currentUserId) {
              await btnInteraction.reply({
                content: '❌ You need a linked account to manage orders.',
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            // Fetch user's own orders
            const userSellOrders = await db.query.sellOrders.findMany({
              where: eq(sellOrders.userId, currentUserId),
              with: { commodity: true, location: true },
              orderBy: [desc(sellOrders.updatedAt)],
            })
            const userBuyOrders = await db.query.buyOrders.findMany({
              where: eq(buyOrders.userId, currentUserId),
              with: { commodity: true, location: true },
              orderBy: [desc(buyOrders.updatedAt)],
            })

            if (userSellOrders.length === 0 && userBuyOrders.length === 0) {
              await btnInteraction.reply({
                content: '📭 You have no orders to manage.',
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            // Build select menu options (single select for edit/delete)
            // Resolve prices from price lists
            const sellOrderOptions = await Promise.all(
              userSellOrders.slice(0, 12).map(async order => {
                const priceInfo = await getOrderDisplayPrice({
                  price: order.price,
                  currency: order.currency,
                  priceListCode: order.priceListCode,
                  commodityTicker: order.commodityTicker,
                  locationId: order.locationId,
                })
                const displayPrice = priceInfo ? priceInfo.price.toFixed(2) : order.price
                const displayCurrency = priceInfo ? priceInfo.currency : order.currency
                return {
                  label: `📤 SELL ${order.commodityTicker} @ ${order.locationId}`,
                  value: `sell:${order.id}`,
                  description: `${displayPrice} ${displayCurrency} (${order.orderType})`,
                }
              })
            )

            const buyOrderOptions = await Promise.all(
              userBuyOrders.slice(0, 12).map(async order => {
                const priceInfo = await getOrderDisplayPrice({
                  price: order.price,
                  currency: order.currency,
                  priceListCode: order.priceListCode,
                  commodityTicker: order.commodityTicker,
                  locationId: order.locationId,
                })
                const displayPrice = priceInfo ? priceInfo.price.toFixed(2) : order.price
                const displayCurrency = priceInfo ? priceInfo.currency : order.currency
                return {
                  label: `📥 BUY ${order.commodityTicker} @ ${order.locationId}`,
                  value: `buy:${order.id}`,
                  description: `${order.quantity}x @ ${displayPrice} ${displayCurrency}`,
                }
              })
            )

            const options = [...sellOrderOptions, ...buyOrderOptions]

            if (options.length === 0) {
              await btnInteraction.reply({
                content: '📭 You have no orders to manage.',
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            const selectMenuId = `${idPrefix}:order-select`
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(selectMenuId)
              .setPlaceholder('Select an order to edit or delete')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(options.slice(0, 25))

            const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              selectMenu
            )

            const manageReply = await btnInteraction.reply({
              content: '**Select an order to manage:**',
              components: [selectRow],
              flags: MessageFlags.Ephemeral,
              withResponse: true,
            })

            // Wait for order selection on this reply message
            try {
              const selectInteraction = await manageReply.resource?.message?.awaitMessageComponent({
                filter: i => i.customId === selectMenuId && i.user.id === interaction.user.id,
                time: 60000,
              })

              if (selectInteraction?.isStringSelectMenu()) {
                const selected = selectInteraction.values[0]
                const [selectedOrderType, selectedOrderId] = selected.split(':')
                const selectedId = parseInt(selectedOrderId, 10)

                // Build order summary for the selected message
                const summary = await buildOrderSummary(
                  selectedOrderType,
                  selectedId,
                  selectedOrderType === 'sell' ? userSellOrders : userBuyOrders
                )

                // Show edit/delete buttons for the selected order
                const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`action:edit:${selectedOrderType}:${selectedOrderId}`)
                    .setLabel('✏️ Edit')
                    .setStyle(ButtonStyle.Primary),
                  new ButtonBuilder()
                    .setCustomId(`action:delete:${selectedOrderType}:${selectedOrderId}`)
                    .setLabel('🗑️ Delete')
                    .setStyle(ButtonStyle.Danger)
                )

                const actionReply = await selectInteraction.update({
                  content: `**Selected:** ${selectedOrderType === 'sell' ? '📤 Sell' : '📥 Buy'} order #${selectedOrderId}\n${summary}\n\nWhat would you like to do?`,
                  components: [buttonRow],
                })

                // Wait for edit/delete action
                const actionInteraction = await actionReply.awaitMessageComponent({
                  filter: i =>
                    i.customId.startsWith('action:') && i.user.id === interaction.user.id,
                  time: 60000,
                })

                if (actionInteraction?.isButton()) {
                  const actionParts = actionInteraction.customId.split(':')
                  const actionType = actionParts[1]
                  const orderType = actionParts[2]
                  const orderId = parseInt(actionParts[3], 10)

                  await handleOrderAction(
                    actionInteraction,
                    interaction,
                    actionType,
                    orderType,
                    orderId,
                    currentUserId
                  )
                }
              }
            } catch {
              // Selection timed out
            }
            break
          }
        }
      }
    }
  )

  collector.on('end', async () => {
    try {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:expired`)
          .setLabel('Session expired - run /orders again')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
      await interaction.editReply({ components: [disabledRow] })
    } catch {
      // Interaction may have been deleted
    }
  })
}

/**
 * Calculate pages for orders display.
 */
function calculateOrderPages(
  items: { name: string; value: string; inline?: boolean }[],
  pageSize: number
): { name: string; value: string; inline?: boolean }[][] {
  const pages: { name: string; value: string; inline?: boolean }[][] = []

  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize))
  }

  if (pages.length === 0) {
    pages.push([])
  }

  return pages
}

/**
 * Handle order edit or delete action.
 */
async function handleOrderAction(
  btnInteraction: ButtonInteraction,
  originalInteraction: ChatInputCommandInteraction,
  actionType: string,
  orderType: string,
  orderId: number,
  userId: number
): Promise<void> {
  if (actionType === 'delete') {
    // Delete the order
    if (orderType === 'sell') {
      await db
        .delete(sellOrders)
        .where(and(eq(sellOrders.id, orderId), eq(sellOrders.userId, userId)))
    } else {
      await db.delete(buyOrders).where(and(eq(buyOrders.id, orderId), eq(buyOrders.userId, userId)))
    }

    logger.info({ orderId, orderType, userId }, 'Order deleted')

    await btnInteraction.update({
      content: '✅ Order deleted.',
      components: [],
    })
    return
  }

  // Edit action - show modal
  if (orderType === 'sell') {
    const order = await db.query.sellOrders.findFirst({
      where: and(eq(sellOrders.id, orderId), eq(sellOrders.userId, userId)),
    })
    if (!order) {
      await btnInteraction.reply({
        content: '❌ Order not found or you do not own it.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const modalId = `edit-modal:sell:${orderId}:${Date.now()}`
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Edit Sell Order: ${order.commodityTicker}`)

    // Mode: All (sell everything), Max (sell up to N), Reserve (keep N, sell rest)
    const modeDefault =
      order.limitMode === 'none' ? 'All' : order.limitMode === 'max_sell' ? 'Max' : 'Reserve'

    const modeInput = new TextInputBuilder()
      .setCustomId('mode')
      .setLabel('Mode (All, Max, or Reserve)')
      .setStyle(TextInputStyle.Short)
      .setValue(modeDefault)
      .setRequired(true)

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Quantity (ignored for All mode)')
      .setStyle(TextInputStyle.Short)
      .setValue(order.limitQuantity?.toString() ?? '0')
      .setRequired(true)

    // Price: "100 CIS" for custom or "KAWA" for price list
    const priceDefault = order.priceListCode ?? `${order.price} ${order.currency}`

    const priceInput = new TextInputBuilder()
      .setCustomId('price')
      .setLabel('Price (e.g. "100 CIS" or "KAWA")')
      .setStyle(TextInputStyle.Short)
      .setValue(priceDefault)
      .setRequired(true)

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(modeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput)
    )

    await btnInteraction.showModal(modal)

    try {
      const modalSubmit = await btnInteraction.awaitModalSubmit({
        filter: i => i.customId === modalId && i.user.id === originalInteraction.user.id,
        time: 60000,
      })

      // Parse mode
      const modeValue = modalSubmit.fields.getTextInputValue('mode').trim().toLowerCase()
      const limitMode = parseLimitMode(modeValue)
      if (!limitMode) {
        await replyError(modalSubmit, 'Invalid mode. Use "All", "Max", or "Reserve".')
        return
      }

      // Parse quantity
      const quantityValue = modalSubmit.fields.getTextInputValue('quantity').trim()
      const quantity = parseInt(quantityValue, 10)
      if (limitMode !== 'none' && (isNaN(quantity) || quantity <= 0)) {
        await replyError(modalSubmit, 'Quantity must be a positive number for Max/Reserve mode.')
        return
      }

      // Parse price
      const priceValue = modalSubmit.fields.getTextInputValue('price').trim()
      const parsed = await parsePriceInput(priceValue)
      if (!parsed) {
        await replyError(
          modalSubmit,
          'Invalid price. Use a number with currency (e.g. "100 CIS") or a price list code (e.g. "KAWA").'
        )
        return
      }

      await db
        .update(sellOrders)
        .set({
          price: parsed.price.toString(),
          priceListCode: parsed.priceListCode,
          currency: parsed.currency,
          limitMode,
          limitQuantity: limitMode !== 'none' ? quantity : null,
          updatedAt: new Date(),
        })
        .where(and(eq(sellOrders.id, orderId), eq(sellOrders.userId, userId)))

      const displayMode =
        limitMode === 'none' ? 'All' : limitMode === 'max_sell' ? 'Max' : 'Reserve'
      const displayQty = limitMode !== 'none' ? ` ${quantity}x` : ''
      const displayPrice = parsed.priceListCode ?? `${parsed.price} ${parsed.currency}`
      logger.info(
        { orderId, orderType: 'sell', userId, limitMode, quantity, ...parsed },
        'Order updated'
      )

      await modalSubmit.reply({
        content: `✅ Sell order updated: ${displayMode}${displayQty} @ ${displayPrice}`,
        flags: MessageFlags.Ephemeral,
      })
    } catch {
      // Modal timed out or was dismissed
    }
  } else {
    const order = await db.query.buyOrders.findFirst({
      where: and(eq(buyOrders.id, orderId), eq(buyOrders.userId, userId)),
    })
    if (!order) {
      await btnInteraction.reply({
        content: '❌ Order not found or you do not own it.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const modalId = `edit-modal:buy:${orderId}:${Date.now()}`
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Edit Buy Order: ${order.commodityTicker}`)

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Quantity')
      .setStyle(TextInputStyle.Short)
      .setValue(order.quantity.toString())
      .setRequired(true)

    // Price: "100 CIS" for custom or "KAWA" for price list
    const priceDefault = order.priceListCode ?? `${order.price} ${order.currency}`

    const priceInput = new TextInputBuilder()
      .setCustomId('price')
      .setLabel('Price (e.g. "100 CIS" or "KAWA")')
      .setStyle(TextInputStyle.Short)
      .setValue(priceDefault)
      .setRequired(true)

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput)
    )

    await btnInteraction.showModal(modal)

    try {
      const modalSubmit = await btnInteraction.awaitModalSubmit({
        filter: i => i.customId === modalId && i.user.id === originalInteraction.user.id,
        time: 60000,
      })

      const newQuantity = parseInt(modalSubmit.fields.getTextInputValue('quantity'), 10)
      const priceValue = modalSubmit.fields.getTextInputValue('price').trim()

      if (isNaN(newQuantity) || newQuantity <= 0) {
        await replyError(modalSubmit, 'Quantity must be a positive number.')
        return
      }

      // Parse price
      const parsed = await parsePriceInput(priceValue)
      if (!parsed) {
        await replyError(
          modalSubmit,
          'Invalid price. Use a number with currency (e.g. "100 CIS") or a price list code (e.g. "KAWA").'
        )
        return
      }

      await db
        .update(buyOrders)
        .set({
          quantity: newQuantity,
          price: parsed.price.toString(),
          priceListCode: parsed.priceListCode,
          currency: parsed.currency,
          updatedAt: new Date(),
        })
        .where(and(eq(buyOrders.id, orderId), eq(buyOrders.userId, userId)))

      const displayPrice = parsed.priceListCode ?? `${parsed.price} ${parsed.currency}`
      logger.info({ orderId, orderType: 'buy', userId, newQuantity, ...parsed }, 'Order updated')

      await modalSubmit.reply({
        content: `✅ Buy order updated: ${newQuantity}x @ ${displayPrice}`,
        flags: MessageFlags.Ephemeral,
      })
    } catch {
      // Modal timed out or was dismissed
    }
  }
}

/**
 * Build a summary string for a selected order.
 */
async function buildOrderSummary(
  orderType: string,
  orderId: number,
  orders: {
    id: number
    commodityTicker: string
    locationId: string
    price: string
    currency: ValidCurrency
    priceListCode: string | null
    quantity?: number
    limitMode?: string
    limitQuantity?: number | null
    orderType: string
  }[]
): Promise<string> {
  const order = orders.find(o => o.id === orderId)
  if (!order) return ''

  const priceInfo = await getOrderDisplayPrice({
    price: order.price,
    currency: order.currency,
    priceListCode: order.priceListCode,
    commodityTicker: order.commodityTicker,
    locationId: order.locationId,
  })

  const priceDisplay = order.priceListCode
    ? `${order.priceListCode}${priceInfo ? ` (${priceInfo.price.toFixed(2)} ${priceInfo.currency})` : ''}`
    : priceInfo
      ? `${priceInfo.price.toFixed(2)} ${priceInfo.currency}`
      : `${order.price} ${order.currency}`

  const lines: string[] = [
    `> **${order.commodityTicker}** @ ${order.locationId}`,
    `> Price: ${priceDisplay} · Visibility: ${order.orderType}`,
  ]

  if (orderType === 'sell' && order.limitMode) {
    const mode =
      order.limitMode === 'none' ? 'All' : order.limitMode === 'max_sell' ? 'Max' : 'Reserve'
    const qty = order.limitMode !== 'none' && order.limitQuantity ? ` (${order.limitQuantity})` : ''
    lines.push(`> Mode: ${mode}${qty}`)
  }

  if (orderType === 'buy' && order.quantity != null) {
    lines.push(`> Quantity: ${order.quantity}`)
  }

  return lines.join('\n')
}

/**
 * Parse a limit mode string into the DB enum value.
 */
function parseLimitMode(value: string): 'none' | 'max_sell' | 'reserve' | null {
  switch (value) {
    case 'all':
    case 'none':
      return 'none'
    case 'max':
    case 'max_sell':
      return 'max_sell'
    case 'reserve':
      return 'reserve'
    default:
      return null
  }
}

interface ParsedPrice {
  price: number
  priceListCode: string | null
  currency: ValidCurrency
}

/**
 * Parse a price input that can be:
 * - "100 CIS" -> custom price with currency
 * - "KAWA" -> price list code (dynamic pricing)
 */
async function parsePriceInput(value: string): Promise<ParsedPrice | null> {
  const parts = value.split(/\s+/)

  // Try "100 CIS" format: number + currency
  if (parts.length === 2) {
    const num = parseFloat(parts[0])
    const cur = parts[1].toUpperCase()
    if (!isNaN(num) && num > 0 && isValidCurrency(cur)) {
      return { price: num, priceListCode: null, currency: cur }
    }
  }

  // Try single token as price list code
  if (parts.length === 1) {
    const code = parts[0].toUpperCase()
    const priceList = await db.query.priceLists.findFirst({
      where: eq(priceLists.code, code),
    })
    if (priceList) {
      return { price: 0, priceListCode: code, currency: priceList.currency }
    }
  }

  return null
}
