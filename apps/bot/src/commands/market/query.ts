import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction, ButtonInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import type { MessageVisibility } from '@kawakawa/types'
import { parseXitJson } from '@kawakawa/parser/xit'
import { parseTokens } from '@kawakawa/parser'
import { db, sellOrders, buyOrders, shoppingLists, userDiscordProfiles } from '@kawakawa/db'
import { eq, and, desc, inArray, or, isNull } from 'drizzle-orm'
import { isUserActive } from '@kawakawa/services/activity'
import { botResolvers } from '../../utils/resolvers.js'
import {
  resolveCommodity,
  formatCommodity,
  formatCommodityWithMode,
  formatLocation,
} from '../../services/display.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import { UNLINKED_ACCOUNT_MESSAGE } from '../../utils/auth.js'
import {
  getChannelConfig,
  resolveEffectiveValue,
  resolveMessageVisibility,
} from '../../services/channelConfig.js'
import {
  sendPaginatedResponseWithExtraButtons,
  type ExtraButton,
} from '../../components/pagination.js'
import { enrichSellOrdersWithQuantities } from '@kawakawa/services/market'
import {
  formatGroupedOrdersMulti,
  buildFilterDescription,
  type MultiResolvedFilters,
} from '../../services/orderFormatter.js'
import { createSingleInputModal } from '../../utils/modals.js'
import { startInvoiceCreationFlow, type OrderForInvoice } from '../../services/invoiceBuilder.js'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

const ORDERS_PER_PAGE = 10

/**
 * Parse XIT origin string to find a matching location.
 * Strips common suffixes like " Warehouse" and matches against known locations.
 */
async function parseXitOrigin(origin: string): Promise<{
  naturalId: string
  name: string
  type: string
} | null> {
  if (!origin) return null

  const allLocations = await db.query.fioLocations.findMany()

  // Try exact match first
  const exactMatch = allLocations.find(
    (l: { name: string }) => l.name.toLowerCase() === origin.toLowerCase()
  )
  if (exactMatch) {
    return { naturalId: exactMatch.naturalId, name: exactMatch.name, type: exactMatch.type }
  }

  // Strip common suffixes and try again
  const suffixes = [' Warehouse', ' Storage', ' Base']
  for (const suffix of suffixes) {
    if (origin.toLowerCase().endsWith(suffix.toLowerCase())) {
      const stripped = origin.slice(0, -suffix.length)
      const match = allLocations.find(
        (l: { name: string }) => l.name.toLowerCase() === stripped.toLowerCase()
      )
      if (match) {
        return { naturalId: match.naturalId, name: match.name, type: match.type }
      }
    }
  }

  // Try partial match (location name is prefix of origin)
  const partialMatch = allLocations.find((l: { name: string }) =>
    origin.toLowerCase().startsWith(l.name.toLowerCase())
  )
  if (partialMatch) {
    return { naturalId: partialMatch.naturalId, name: partialMatch.name, type: partialMatch.type }
  }

  return null
}

/**
 * Extract origin location from XIT JSON actions array.
 * Returns the first valid origin found.
 */
async function extractXitOrigin(
  jsonString: string
): Promise<{ naturalId: string; name: string; type: string } | null> {
  try {
    const parsed = JSON.parse(jsonString)
    if (parsed.actions && Array.isArray(parsed.actions)) {
      for (const action of parsed.actions) {
        if (action.origin && typeof action.origin === 'string') {
          const location = await parseXitOrigin(action.origin)
          if (location) {
            return location
          }
        }
      }
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null
}

export const query: Command = {
  data: new SlashCommandBuilder()
    .setName('query')
    .setDescription('Flexible search by commodity, location, or user (supports multiple filters)')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('Search terms (e.g., "COF BEN" or "commodity:COF location:BEN")')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Filter by order type (default sell)')
        .addChoices(
          { name: 'All Orders', value: 'all' },
          { name: 'Sell Orders', value: 'sell' },
          { name: 'Buy Orders', value: 'buy' }
        )
    )
    .addStringOption(option =>
      option
        .setName('visibility')
        .setDescription('Filter by visibility (default internal)')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Internal (members)', value: 'internal' },
          { name: 'Partner (trade partners)', value: 'partner' }
        )
    )
    .addStringOption(option =>
      option
        .setName('reply')
        .setDescription('Reply visibility (default: your preference)')
        .addChoices(
          { name: 'Private (only you)', value: 'ephemeral' },
          { name: 'Public (everyone)', value: 'public' }
        )
    )
    .addBooleanOption(option =>
      option
        .setName('include-inactive')
        .setDescription('Include orders from inactive users (default: false)')
    ) as SlashCommandBuilder,

  helpInfo: {
    category: 'trading',
    details: 'Flexible market search. Accepts commodity tickers, locations, or XIT JSON.',
    examples: ['query COF BEN', 'query 100 COF'],
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prefix = getCommandPrefix(interaction)

    // Get current user's ID (if linked) for filtering own orders from invoices
    const currentUserProfile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, interaction.user.id),
    })
    const currentUserId = currentUserProfile?.userId ?? null

    const queryInput = interaction.options.getString('query')
    let orderType: 'all' | 'sell' | 'buy' =
      (interaction.options.getString('type') as 'all' | 'sell' | 'buy' | null) || 'sell'
    const includeInactive = interaction.options.getBoolean('include-inactive') ?? false

    // Check for XIT JSON input
    // XitMaterials is Record<string, number> for compatibility
    let xitQuantities: Record<string, number> | undefined
    let xitName: string | undefined
    let xitCommodities: string[] = []
    let xitOriginLocation: { naturalId: string; name: string; type: string } | null = null

    if (queryInput?.trim().startsWith('{')) {
      const xitResult = parseXitJson(queryInput)
      if (xitResult.valid) {
        // Convert array of XitMaterial to Record<string, number>
        xitQuantities = {}
        for (const mat of xitResult.materials) {
          xitQuantities[mat.ticker] = (xitQuantities[mat.ticker] ?? 0) + mat.amount
        }
        xitCommodities = Object.keys(xitQuantities)
        // Get name from global if available
        xitName = xitResult.data?.groups?.[0]?.name
        // Force sell orders when using XIT (XIT is always a buying context)
        orderType = 'sell'
        // Extract origin location from actions
        xitOriginLocation = await extractXitOrigin(queryInput)
      }
    }
    const visibilityOption = interaction.options.getString('visibility') as
      | 'all'
      | 'internal'
      | 'partner'
      | null
    const replyOption = interaction.options.getString('reply') as MessageVisibility | null

    // Get user's display preferences
    const displaySettings = await getDisplaySettings(interaction.user.id)

    // Get channel defaults (if configured)
    const channelId = interaction.channelId
    const channelSettings = await getChannelConfig(channelId)

    // Resolve message visibility (command > channel > user > system default)
    const { isEphemeral } = resolveMessageVisibility(
      replyOption,
      channelSettings,
      displaySettings.messageVisibility
    )

    // Determine visibility using channel defaults
    // For query, 'internal' is the system default
    const visibility: 'all' | 'internal' | 'partner' = resolveEffectiveValue(
      visibilityOption,
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false,
      'internal' as const,
      'internal' as const
    )

    // Build price list filter condition
    // When enforced: only show orders with that price list
    // When not enforced: show orders with that price list OR custom prices (null)
    const channelPriceList = channelSettings?.priceList
    const priceListEnforced = channelSettings?.priceListEnforced ?? false

    // Parse all tokens from query input - collect multiple values for each type
    const resolvedCommodities: { ticker: string; name: string }[] = []
    const resolvedLocations: { naturalId: string; name: string; type: string }[] = []
    const resolvedUserIds: number[] = []
    const resolvedDisplayNames: string[] = []

    // Track quantities from parsed input (for non-XIT parsing with quantities like "100 COF 200 RAT")
    let parsedQuantities: Record<string, number> | undefined

    // If XIT JSON was parsed, resolve XIT commodities and origin location
    if (xitCommodities.length > 0) {
      for (const ticker of xitCommodities) {
        const commodity = await resolveCommodity(ticker)
        if (commodity) {
          resolvedCommodities.push(commodity)
        }
      }
      // Add origin location from XIT actions if found
      if (xitOriginLocation) {
        resolvedLocations.push(xitOriginLocation)
      }
    } else if (queryInput) {
      // Use the unified parser to parse quantities and resolve tokens
      const parsed = await parseTokens(queryInput, botResolvers)

      // Extract order type from action keywords (unless already forced by XIT)
      if (parsed.actions.has('buy')) {
        orderType = 'buy'
      } else if (parsed.actions.has('sell')) {
        orderType = 'sell'
      }

      // Collect commodities with quantities
      for (const item of parsed.items) {
        // Only add if not already present (by ticker)
        if (!resolvedCommodities.some(c => c.ticker === item.commodity.ticker)) {
          resolvedCommodities.push(item.commodity)
        }

        // Track quantities (default to 0 if not specified)
        if (!parsedQuantities) {
          parsedQuantities = {}
        }
        // Add or accumulate quantity (default 0)
        parsedQuantities[item.commodity.ticker] =
          (parsedQuantities[item.commodity.ticker] ?? 0) + (item.quantity ?? 0)
      }

      // Collect location
      if (parsed.location) {
        resolvedLocations.push({
          naturalId: parsed.location.naturalId,
          name: parsed.location.name,
          type: parsed.location.type,
        })
      }

      // Collect user
      if (parsed.user) {
        resolvedUserIds.push(parsed.user.userId)
        resolvedDisplayNames.push(parsed.user.displayName || parsed.user.username || '')
      }

      // If we have unresolved tokens and nothing was resolved, show error
      if (
        parsed.unresolved.length > 0 &&
        resolvedCommodities.length === 0 &&
        resolvedLocations.length === 0 &&
        resolvedUserIds.length === 0
      ) {
        await interaction.reply({
          content:
            `❌ Could not resolve: ${parsed.unresolved.map(t => `"${t}"`).join(', ')}\n\n` +
            'Use the autocomplete suggestions to find valid commodities, locations, or users.',
          flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
        })
        return
      }
    }

    // Merge parsed quantities into xitQuantities for unified handling
    // (xitQuantities is used later for display and list creation)
    if (parsedQuantities && Object.keys(parsedQuantities).length > 0) {
      // Check if any quantities are non-zero (user specified actual quantities)
      const hasNonZeroQuantities = Object.values(parsedQuantities).some(q => q > 0)
      if (hasNonZeroQuantities) {
        xitQuantities = parsedQuantities
      }
    }

    // Build filter description for embed
    const locationDisplayStrings = await Promise.all(
      resolvedLocations.map(l => formatLocation(l.naturalId, displaySettings.locationDisplayMode))
    )
    let filterDesc = buildFilterDescription(
      resolvedCommodities.map(c => formatCommodity(c.ticker)),
      locationDisplayStrings,
      resolvedDisplayNames.filter(Boolean),
      orderType,
      visibility,
      { visibilityEnforced: channelSettings?.visibilityEnforced ?? false }
    )

    // Add XIT indicator to description if active
    if (xitQuantities) {
      const xitLabel = xitName ? `XIT: ${xitName}` : 'XIT Mode'
      filterDesc = `🧊 ${xitLabel}\n${filterDesc}`
    }

    // Build price list filter for sell orders
    // When enforced: only show orders with that price list
    // When not enforced: show orders with that price list OR custom prices (null)
    const sellPriceListFilter = channelPriceList
      ? priceListEnforced
        ? eq(sellOrders.priceListCode, channelPriceList)
        : or(eq(sellOrders.priceListCode, channelPriceList), isNull(sellOrders.priceListCode))
      : undefined

    // Fetch sell orders (no limit - we paginate client-side)
    const sellOrdersRaw =
      orderType === 'buy'
        ? []
        : await db.query.sellOrders.findMany({
            where: and(
              resolvedCommodities.length > 0
                ? inArray(
                    sellOrders.commodityTicker,
                    resolvedCommodities.map(c => c.ticker)
                  )
                : undefined,
              resolvedLocations.length > 0
                ? inArray(
                    sellOrders.locationId,
                    resolvedLocations.map(l => l.naturalId)
                  )
                : undefined,
              resolvedUserIds.length > 0 ? inArray(sellOrders.userId, resolvedUserIds) : undefined,
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

    // Filter out inactive users unless opted in
    const sellOrdersData = includeInactive
      ? sellOrdersRaw
      : await (async () => {
          const filtered: typeof sellOrdersRaw = []
          for (const order of sellOrdersRaw) {
            const status = await isUserActive({
              inactiveUntil: order.user.inactiveUntil ?? null,
              lastActiveAt: order.user.lastActiveAt ?? null,
            })
            if (status.active) filtered.push(order)
          }
          return filtered
        })()

    // Build price list filter for buy orders
    const buyPriceListFilter = channelPriceList
      ? priceListEnforced
        ? eq(buyOrders.priceListCode, channelPriceList)
        : or(eq(buyOrders.priceListCode, channelPriceList), isNull(buyOrders.priceListCode))
      : undefined

    // Fetch buy orders
    const buyOrdersRaw =
      orderType === 'sell'
        ? []
        : await db.query.buyOrders.findMany({
            where: and(
              resolvedCommodities.length > 0
                ? inArray(
                    buyOrders.commodityTicker,
                    resolvedCommodities.map(c => c.ticker)
                  )
                : undefined,
              resolvedLocations.length > 0
                ? inArray(
                    buyOrders.locationId,
                    resolvedLocations.map(l => l.naturalId)
                  )
                : undefined,
              resolvedUserIds.length > 0 ? inArray(buyOrders.userId, resolvedUserIds) : undefined,
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

    // Filter out inactive users unless opted in
    const buyOrdersData = includeInactive
      ? buyOrdersRaw
      : await (async () => {
          const filtered: typeof buyOrdersRaw = []
          for (const order of buyOrdersRaw) {
            const status = await isUserActive({
              inactiveUntil: order.user.inactiveUntil ?? null,
              lastActiveAt: order.user.lastActiveAt ?? null,
            })
            if (status.active) filtered.push(order)
          }
          return filtered
        })()

    // Check if any orders found
    const hasOrders = sellOrdersData.length > 0 || buyOrdersData.length > 0

    if (!hasOrders) {
      await interaction.reply({
        content: `📭 No orders found matching your filters.\n\n*${filterDesc}*`,
        flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
      })
      return
    }

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

    // Build resolved filters for grouping logic
    const resolvedFilters: MultiResolvedFilters = {
      commodities: resolvedCommodities,
      locations: resolvedLocations,
      userIds: resolvedUserIds,
      displayNames: resolvedDisplayNames,
    }

    // Format orders as grouped paginated items
    const { items: allItems, missingXitMaterials } = await formatGroupedOrdersMulti(
      sellOrdersData,
      buyOrdersData,
      sellQuantities,
      resolvedFilters,
      displaySettings.locationDisplayMode,
      orderType,
      visibility,
      xitQuantities
    )

    // Add missing XIT materials notice to description
    let fullDescription = filterDesc
    if (missingXitMaterials && missingXitMaterials.length > 0) {
      const missingFormatted = await Promise.all(
        missingXitMaterials.map(t =>
          formatCommodityWithMode(t, displaySettings.commodityDisplayMode)
        )
      )
      fullDescription += `\n\n⚠️ **Not found:** ${missingFormatted.join(', ')}`
    }

    // Build base embed
    const embed = new EmbedBuilder()
      .setTitle('📦 Market Orders')
      .setColor(0x5865f2)
      .setDescription(fullDescription)
      .setTimestamp()

    // Send announcement to configured channel if enabled
    // Pick the announce channel based on effective visibility
    const announceChannelId =
      visibility === 'internal'
        ? channelSettings?.announceInternal
        : visibility === 'partner'
          ? channelSettings?.announcePartner
          : null // 'all' visibility doesn't trigger announcements

    if (announceChannelId && (resolvedCommodities.length > 0 || resolvedLocations.length > 0)) {
      const parts: string[] = []

      if (resolvedCommodities.length > 0) {
        const commodityList = resolvedCommodities.map(c => `**${formatCommodity(c.ticker)}**`)
        parts.push(commodityList.join(', '))
      }

      if (resolvedLocations.length > 0) {
        const locationList = await Promise.all(
          resolvedLocations.map(l =>
            formatLocation(l.naturalId, displaySettings.locationDisplayMode)
          )
        )
        parts.push(`at ${locationList.map(l => `**${l}**`).join(', ')}`)
      }

      // Get the member's server display name (nickname or fallback to username)
      const member = interaction.member
      const memberName =
        member && 'displayName' in member ? member.displayName : interaction.user.displayName

      const announcement = `👀 **${memberName}** is interested in ${parts.join(' ')}`

      // Send to the configured announce channel (different from current channel)
      try {
        const announceChannel = await interaction.client.channels.fetch(announceChannelId)
        if (announceChannel && 'send' in announceChannel) {
          await announceChannel.send(announcement)
        }
      } catch {
        // Silently ignore if announce channel is inaccessible
      }
    }

    // Build extra buttons if quantities are present
    const extraButtons: ExtraButton[] = []

    if (xitQuantities && Object.keys(xitQuantities).length > 0) {
      // Store materials data for button handler
      const materialsForList = { ...xitQuantities }

      extraButtons.push({
        id: 'create-list',
        label: 'Save as List',
        emoji: '📋',
        onClick: async (buttonInteraction: ButtonInteraction) => {
          // Show modal to get list name
          const modal = createSingleInputModal({
            modalId: `create-list-modal:${Date.now()}`,
            title: 'Save as Shopping List',
            inputId: 'list-name',
            label: 'List Name',
            placeholder: xitName || 'My Shopping List',
            required: true,
            maxLength: 100,
            value: xitName,
          })

          await buttonInteraction.showModal(modal)

          // Wait for modal submission
          try {
            const modalInteraction = await buttonInteraction.awaitModalSubmit({
              filter: i =>
                i.customId.startsWith('create-list-modal:') &&
                i.user.id === buttonInteraction.user.id,
              time: 60_000, // 1 minute timeout
            })

            const listName = modalInteraction.fields.getTextInputValue('list-name').trim()

            if (!listName) {
              await modalInteraction.reply({
                content: '❌ List name cannot be empty.',
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            // Check if user is linked
            const profile = await db.query.userDiscordProfiles.findFirst({
              where: eq(userDiscordProfiles.discordId, modalInteraction.user.id),
              with: { user: true },
            })

            if (!profile) {
              await modalInteraction.reply({
                content: UNLINKED_ACCOUNT_MESSAGE,
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            // Save the list to database
            try {
              const [newList] = await db
                .insert(shoppingLists)
                .values({
                  userId: profile.user.id,
                  name: listName,
                  materials: materialsForList,
                })
                .returning()

              const itemCount = Object.keys(materialsForList).length
              const totalQty = Object.values(materialsForList).reduce((sum, qty) => sum + qty, 0)

              await modalInteraction.reply({
                content:
                  `✅ List **${listName}** saved!\n\n` +
                  `• ${itemCount} item${itemCount !== 1 ? 's' : ''}\n` +
                  `• ${totalQty.toLocaleString()} total units\n\n` +
                  `Use \`${prefix}lists\` to view and manage your lists.`,
                flags: MessageFlags.Ephemeral,
              })

              logger.info(
                {
                  userId: profile.user.id,
                  listId: newList.id,
                  listName,
                  itemCount,
                  totalQuantity: totalQty,
                },
                'Shopping list created from query'
              )
            } catch (error) {
              logger.error({ error, userId: profile.user.id, listName }, 'Failed to create list')
              await modalInteraction.reply({
                content: '❌ Failed to save list. Please try again.',
                flags: MessageFlags.Ephemeral,
              })
            }
          } catch {
            // Modal timed out or was cancelled - silently ignore
          }
        },
      })
    }

    // Add "Create Invoice" button if there are sell orders AND quantities specified
    // (quantities are required to know how much to invoice for)
    // Filter out current user's own orders - you can't create an invoice for your own orders
    if (sellOrdersData.length > 0 && xitQuantities && Object.keys(xitQuantities).length > 0) {
      // Prepare orders for invoice builder with requested quantities, excluding own orders
      const ordersForInvoice: OrderForInvoice[] = sellOrdersData
        .filter(order => !currentUserId || order.userId !== currentUserId)
        .map(order => ({
          id: order.id,
          userId: order.userId,
          commodityTicker: order.commodityTicker,
          locationId: order.locationId, // naturalId like "BEN"
          price: parseFloat(order.price),
          currency: order.currency,
          priceListCode: order.priceListCode,
          user: {
            id: order.userId,
            displayName: order.user.displayName,
            username: order.user.username,
          },
          location: {
            naturalId: order.location.naturalId,
            name: order.location.name,
          },
          commodity: {
            ticker: order.commodity.ticker,
            name: order.commodity.name,
          },
          // Use requested quantity from xitQuantities, fallback to available
          availableQuantity:
            xitQuantities![order.commodityTicker] ??
            sellQuantities.get(order.id)?.availableQuantity,
        }))

      // Only show "Create Invoice" button if there are orders from other users
      if (ordersForInvoice.length > 0) {
        extraButtons.push({
          id: 'create-invoice',
          label: 'Create Invoice',
          emoji: '🧾',
          onClick: async (buttonInteraction: ButtonInteraction) => {
            // Check if user is linked
            const profile = await db.query.userDiscordProfiles.findFirst({
              where: eq(userDiscordProfiles.discordId, buttonInteraction.user.id),
              with: { user: true },
            })

            if (!profile) {
              await buttonInteraction.reply({
                content: UNLINKED_ACCOUNT_MESSAGE,
                flags: MessageFlags.Ephemeral,
              })
              return
            }

            // Start the invoice creation flow
            await startInvoiceCreationFlow(
              buttonInteraction,
              ordersForInvoice,
              profile.user.id,
              displaySettings.locationDisplayMode
            )
          },
        })
      }
    }

    // Send paginated response after announcement is delivered
    await sendPaginatedResponseWithExtraButtons(interaction, embed, allItems, {
      pageSize: ORDERS_PER_PAGE,
      allowShare: true,
      footerText: isEphemeral ? 'Use 📢 Share to post publicly' : undefined,
      ephemeral: isEphemeral,
      extraButtons: extraButtons.length > 0 ? extraButtons : undefined,
    })
  },
}
