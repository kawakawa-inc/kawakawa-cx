/**
 * Query Helper Service
 *
 * Shared logic for querying and displaying market orders.
 * Used by both /query and /buy commands.
 */
import { EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import { db, sellOrders, buyOrders } from '@kawakawa/db'
import { eq, and, desc, inArray, or, isNull } from 'drizzle-orm'
import { enrichSellOrdersWithQuantities } from '@kawakawa/services/market'
import {
  formatGroupedOrdersMulti,
  buildFilterDescription,
  type MultiResolvedFilters,
} from './orderFormatter.js'
import {
  formatCommodity,
  formatCommodityWithMode,
  formatLocation,
} from './display.js'
import type { LocationDisplayMode, CommodityDisplayMode, Currency } from '@kawakawa/types'
import {
  sendPaginatedResponseWithExtraButtons,
  type ExtraButton,
} from '../components/pagination.js'
import type { ChannelSettings } from './channelConfig.js'

const ORDERS_PER_PAGE = 10

/**
 * Query options for fetching orders
 */
export interface QueryOptions {
  /** Filter by commodity tickers */
  commodities: { ticker: string; name: string }[]
  /** Filter by location IDs */
  locations: { naturalId: string; name: string; type: string }[]
  /** Filter by user IDs */
  userIds: number[]
  /** Display names for user filters */
  displayNames: string[]
  /** Order type filter: 'all', 'sell', 'buy' */
  orderType: 'all' | 'sell' | 'buy'
  /** Visibility filter */
  visibility: 'all' | 'internal' | 'partner'
  /** Channel settings for price list filtering */
  channelSettings: ChannelSettings | null
  /** Display settings */
  locationDisplayMode: LocationDisplayMode
  commodityDisplayMode: CommodityDisplayMode
  /** Whether the response should be ephemeral */
  isEphemeral: boolean
  /** Requested quantities per commodity (for availability indicators) */
  requestedQuantities?: Record<string, number>
  /** Name for XIT mode display */
  xitName?: string
  /** Current user ID (to exclude own orders from invoice creation) */
  currentUserId?: number | null
}

/**
 * Query result with formatted data
 */
export interface QueryResult {
  /** Whether orders were found */
  hasOrders: boolean
  /** Formatted items for pagination */
  items: import('../components/pagination.js').PaginatedItem[]
  /** The base embed */
  embed: EmbedBuilder
  /** Filter description text */
  filterDescription: string
  /** Missing commodities (when using XIT mode) */
  missingCommodities?: string[]
  /** Sell orders data (for invoice creation) */
  sellOrdersData?: Array<{
    id: number
    userId: number
    commodityTicker: string
    locationId: string
    price: string
    currency: Currency
    priceListCode: string | null
    user: { id?: number; displayName: string | null; username: string }
    location: { naturalId: string; name: string }
    commodity: { ticker: string; name: string }
  }>
  /** Sell order quantities map */
  sellQuantities?: Map<number, { availableQuantity: number }>
}

/**
 * Emoji indicators for availability when quantity is specified
 */
export function getAvailabilityEmoji(requested: number, available: number): string {
  if (available >= requested) return '✅'
  if (available > 0) return '⚠️'
  return '❌'
}

/**
 * Execute a market order query and return formatted results.
 * This is the shared logic used by both /query and /buy commands.
 */
export async function executeQuery(options: QueryOptions): Promise<QueryResult> {
  const {
    commodities,
    locations,
    userIds,
    displayNames,
    orderType,
    visibility,
    channelSettings,
    locationDisplayMode,
    commodityDisplayMode,
    requestedQuantities,
    xitName,
    currentUserId: _currentUserId, // Reserved for future filtering of own orders
  } = options

  // Build price list filter condition
  const channelPriceList = channelSettings?.priceList
  const priceListEnforced = channelSettings?.priceListEnforced ?? false

  // Build price list filter for sell orders
  const sellPriceListFilter = channelPriceList
    ? priceListEnforced
      ? eq(sellOrders.priceListCode, channelPriceList)
      : or(eq(sellOrders.priceListCode, channelPriceList), isNull(sellOrders.priceListCode))
    : undefined

  // Build price list filter for buy orders
  const buyPriceListFilter = channelPriceList
    ? priceListEnforced
      ? eq(buyOrders.priceListCode, channelPriceList)
      : or(eq(buyOrders.priceListCode, channelPriceList), isNull(buyOrders.priceListCode))
    : undefined

  // Fetch sell orders (no limit - we paginate client-side)
  const sellOrdersData =
    orderType === 'buy'
      ? []
      : await db.query.sellOrders.findMany({
          where: and(
            commodities.length > 0
              ? inArray(
                  sellOrders.commodityTicker,
                  commodities.map(c => c.ticker)
                )
              : undefined,
            locations.length > 0
              ? inArray(
                  sellOrders.locationId,
                  locations.map(l => l.naturalId)
                )
              : undefined,
            userIds.length > 0 ? inArray(sellOrders.userId, userIds) : undefined,
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

  // Fetch buy orders
  const buyOrdersData =
    orderType === 'sell'
      ? []
      : await db.query.buyOrders.findMany({
          where: and(
            commodities.length > 0
              ? inArray(
                  buyOrders.commodityTicker,
                  commodities.map(c => c.ticker)
                )
              : undefined,
            locations.length > 0
              ? inArray(
                  buyOrders.locationId,
                  locations.map(l => l.naturalId)
                )
              : undefined,
            userIds.length > 0 ? inArray(buyOrders.userId, userIds) : undefined,
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

  const hasOrders = sellOrdersData.length > 0 || buyOrdersData.length > 0

  if (!hasOrders) {
    // Build filter description for empty state
    const locationDisplayStrings = await Promise.all(
      locations.map(l => formatLocation(l.naturalId, locationDisplayMode))
    )
    const filterDesc = buildFilterDescription(
      commodities.map(c => formatCommodity(c.ticker)),
      locationDisplayStrings,
      displayNames.filter(Boolean),
      orderType,
      visibility,
      { visibilityEnforced: channelSettings?.visibilityEnforced ?? false }
    )

    return {
      hasOrders: false,
      items: [],
      embed: new EmbedBuilder()
        .setTitle('📦 Market Orders')
        .setDescription(`📭 No orders found matching your filters.\n\n*${filterDesc}*`)
        .setColor(0x5865f2)
        .setTimestamp(),
      filterDescription: filterDesc,
    }
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
    commodities,
    locations,
    userIds,
    displayNames,
  }

  // Build filter description for embed
  const locationDisplayStrings = await Promise.all(
    locations.map(l => formatLocation(l.naturalId, locationDisplayMode))
  )
  let filterDesc = buildFilterDescription(
    commodities.map(c => formatCommodity(c.ticker)),
    locationDisplayStrings,
    displayNames.filter(Boolean),
    orderType,
    visibility,
    { visibilityEnforced: channelSettings?.visibilityEnforced ?? false }
  )

  // Add XIT indicator to description if active
  if (requestedQuantities && Object.keys(requestedQuantities).length > 0) {
    const xitLabel = xitName ? `XIT: ${xitName}` : 'Quantities specified'
    filterDesc = `🧊 ${xitLabel}\n${filterDesc}`
  }

  // Format orders as grouped paginated items
  const { items: allItems, missingXitMaterials } = await formatGroupedOrdersMulti(
    sellOrdersData,
    buyOrdersData,
    sellQuantities,
    resolvedFilters,
    locationDisplayMode,
    orderType,
    visibility,
    requestedQuantities
  )

  // Add missing materials notice to description
  let fullDescription = filterDesc
  if (missingXitMaterials && missingXitMaterials.length > 0) {
    const missingFormatted = await Promise.all(
      missingXitMaterials.map(t => formatCommodityWithMode(t, commodityDisplayMode))
    )
    fullDescription += `\n\n⚠️ **Not found:** ${missingFormatted.join(', ')}`
  }

  // Build base embed
  const embed = new EmbedBuilder()
    .setTitle('📦 Market Orders')
    .setColor(0x5865f2)
    .setDescription(fullDescription)
    .setTimestamp()

  return {
    hasOrders: true,
    items: allItems,
    embed,
    filterDescription: filterDesc,
    missingCommodities: missingXitMaterials,
    sellOrdersData: sellOrdersData.map(o => ({
      id: o.id,
      userId: o.userId,
      commodityTicker: o.commodityTicker,
      locationId: o.locationId,
      price: o.price,
      currency: o.currency,
      priceListCode: o.priceListCode,
      user: {
        id: o.userId,
        displayName: o.user.displayName,
        username: o.user.username,
      },
      location: {
        naturalId: o.location.naturalId,
        name: o.location.name,
      },
      commodity: {
        ticker: o.commodity.ticker,
        name: o.commodity.name,
      },
    })),
    sellQuantities,
  }
}

/**
 * Send a paginated query response to the user.
 */
export async function sendQueryResponse(
  interaction: ChatInputCommandInteraction,
  result: QueryResult,
  options: {
    isEphemeral: boolean
    extraButtons?: ExtraButton[]
  }
): Promise<void> {
  const { isEphemeral, extraButtons } = options

  if (!result.hasOrders) {
    await interaction.reply({
      content: `📭 No orders found matching your filters.\n\n*${result.filterDescription}*`,
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    })
    return
  }

  await sendPaginatedResponseWithExtraButtons(interaction, result.embed, result.items, {
    pageSize: ORDERS_PER_PAGE,
    allowShare: true,
    footerText: isEphemeral ? 'Use 📢 Share to post publicly' : undefined,
    ephemeral: isEphemeral,
    extraButtons: extraButtons && extraButtons.length > 0 ? extraButtons : undefined,
  })
}
