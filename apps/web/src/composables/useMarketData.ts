import { ref } from 'vue'
import type { Currency, OrderType, PricingMode } from '@kawakawa/types'
import { api } from '../services/api'

/**
 * Type of market item: sell listing or buy request
 */
export type MarketItemType = 'sell' | 'buy'

/**
 * Unified market item interface that normalizes sell listings and buy requests
 * into a common format for display in the market view.
 */
export interface MarketItem {
  id: number
  itemType: MarketItemType
  userId: number // seller or buyer's user ID
  commodityTicker: string
  locationId: string
  storageType: string | null // null = all storage types, specific = only that storage (sell orders only)
  userName: string // sellerName or buyerName
  price: number
  currency: Currency
  orderType: OrderType
  quantity: number // availableQuantity or quantity
  remainingQuantity: number
  reservedQuantity: number
  activeReservationCount: number
  isOwn: boolean
  isStanding: boolean // standing order = unlimited quantity (buy orders only)
  fioUploadedAt: string | null // When seller's FIO inventory was last synced
  pricingMode: PricingMode
  effectivePrice: number | null
  priceListCode: string | null
  // Aggregated quantities across all storage types at this location (sell orders only)
  // For buy orders, these equal the regular quantity/remainingQuantity
  aggregateQuantity: number // total available quantity across all storage types at this location
  aggregateRemainingQuantity: number // total remaining quantity across all storage types at this location
  hasMultipleStorageTypes: boolean // true if this location has sell orders with multiple storage types
  // Collapsed group info: when multiple sell orders differ only by fioUploadedAt,
  // they are collapsed into a single row with combined quantities
  groupedOrderIds: number[] // IDs of all orders in this collapsed group (length 1 = not collapsed)
  groupedFioTimes: (string | null)[] // FIO upload times for each order in the group
  isCollapsed: boolean // true if this row represents multiple collapsed orders
}

/**
 * Get display price for an item.
 * Returns the effective price for dynamic pricing, or the regular price for fixed pricing.
 */
export function getDisplayPrice(item: MarketItem): number | null {
  if (item.pricingMode === 'dynamic') {
    return item.effectivePrice
  }
  return item.price
}

/**
 * Build a grouping key for sell items. All fields that must match for rows to collapse.
 * fioUploadedAt and storageType are intentionally excluded — they are allowed to differ
 * across collapsed rows (storageType is already handled by aggregate quantity logic).
 */
function getSellGroupKey(item: MarketItem): string {
  return [
    item.userId,
    item.commodityTicker,
    item.locationId,
    item.price,
    item.currency,
    item.orderType,
    item.pricingMode,
    item.effectivePrice ?? '__null__',
    item.priceListCode ?? '__null__',
    item.isOwn,
  ].join('|')
}

/**
 * Collapse sell items that differ only by fioUploadedAt into grouped rows.
 * The resulting grouped row sums quantities and tracks all constituent order IDs/FIO times.
 */
function collapseSellItems(items: MarketItem[]): MarketItem[] {
  const groups = new Map<string, MarketItem[]>()

  for (const item of items) {
    const key = getSellGroupKey(item)
    const group = groups.get(key)
    if (group) {
      group.push(item)
    } else {
      groups.set(key, [item])
    }
  }

  const result: MarketItem[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      // No collapsing needed
      result.push(group[0])
    } else {
      // Collapse: use the first item as the base, sum quantities, collect IDs/FIO times
      // Sort group by fioUploadedAt descending (most recent first) for display
      group.sort((a, b) => {
        if (!a.fioUploadedAt && !b.fioUploadedAt) return 0
        if (!a.fioUploadedAt) return 1
        if (!b.fioUploadedAt) return -1
        return new Date(b.fioUploadedAt).getTime() - new Date(a.fioUploadedAt).getTime()
      })

      const base = { ...group[0] }
      base.quantity = group.reduce((sum, item) => sum + item.quantity, 0)
      base.remainingQuantity = group.reduce((sum, item) => sum + item.remainingQuantity, 0)
      base.reservedQuantity = group.reduce((sum, item) => sum + item.reservedQuantity, 0)
      base.activeReservationCount = group.reduce(
        (sum, item) => sum + item.activeReservationCount,
        0
      )
      // Use the most recent fioUploadedAt as the representative value
      base.fioUploadedAt = group[0].fioUploadedAt
      base.groupedOrderIds = group.map(item => item.id)
      base.groupedFioTimes = group.map(item => item.fioUploadedAt)
      base.isCollapsed = true
      result.push(base)
    }
  }

  return result
}

/**
 * Composable for loading and managing market data (sell listings and buy requests).
 *
 * @param options.onError - Optional callback for handling errors
 */
export function useMarketData(options?: { onError?: (error: unknown) => void }) {
  const marketItems = ref<MarketItem[]>([])
  const loading = ref(false)

  /**
   * Load market items from the API.
   * Fetches both sell listings and buy requests in parallel,
   * transforms them to a unified format, and sorts by commodity, location, then price.
   */
  const loadMarketItems = async () => {
    try {
      loading.value = true
      // Fetch both sell listings and buy requests in parallel
      const [sellListings, buyRequests] = await Promise.all([
        api.market.getListings(),
        api.market.getBuyRequests(),
      ])

      // Build aggregate quantities map for sell listings
      // Key: "userId:commodityTicker:locationId" -> { totalQuantity, totalRemainingQuantity, storageTypeCount }
      const aggregateMap = new Map<
        string,
        {
          totalQuantity: number
          totalRemainingQuantity: number
          storageTypes: Set<string | null>
        }
      >()

      for (const listing of sellListings) {
        const key = `${listing.userId}:${listing.commodityTicker}:${listing.locationId}`
        const existing = aggregateMap.get(key)
        if (existing) {
          existing.totalQuantity += listing.availableQuantity
          existing.totalRemainingQuantity += listing.remainingQuantity
          existing.storageTypes.add(listing.storageType)
        } else {
          aggregateMap.set(key, {
            totalQuantity: listing.availableQuantity,
            totalRemainingQuantity: listing.remainingQuantity,
            storageTypes: new Set([listing.storageType]),
          })
        }
      }

      // Transform sell listings to unified format with aggregate quantities
      const sellItemsUngrouped: MarketItem[] = sellListings.map(listing => {
        const key = `${listing.userId}:${listing.commodityTicker}:${listing.locationId}`
        const aggregate = aggregateMap.get(key)!

        return {
          id: listing.id,
          itemType: 'sell' as MarketItemType,
          userId: listing.userId,
          commodityTicker: listing.commodityTicker,
          locationId: listing.locationId,
          storageType: listing.storageType,
          userName: listing.sellerName,
          price: listing.price,
          currency: listing.currency,
          orderType: listing.orderType,
          quantity: listing.availableQuantity,
          remainingQuantity: listing.remainingQuantity,
          reservedQuantity: listing.reservedQuantity,
          activeReservationCount: listing.activeReservationCount,
          isOwn: listing.isOwn,
          isStanding: false, // sell orders are never standing
          fioUploadedAt: listing.fioUploadedAt,
          pricingMode: listing.pricingMode,
          effectivePrice: listing.effectivePrice,
          priceListCode: listing.priceListCode,
          aggregateQuantity: aggregate.totalQuantity,
          aggregateRemainingQuantity: aggregate.totalRemainingQuantity,
          hasMultipleStorageTypes: aggregate.storageTypes.size > 1,
          groupedOrderIds: [listing.id],
          groupedFioTimes: [listing.fioUploadedAt],
          isCollapsed: false,
        }
      })

      // Collapse sell items that differ only by fioUploadedAt into grouped rows
      const sellItems = collapseSellItems(sellItemsUngrouped)

      // Transform buy requests to unified format
      // Buy orders don't have storage type restrictions, so aggregate values equal regular values
      const buyItems: MarketItem[] = buyRequests.map(request => ({
        id: request.id,
        itemType: 'buy' as MarketItemType,
        userId: request.userId,
        commodityTicker: request.commodityTicker,
        locationId: request.locationId,
        storageType: null, // buy orders don't have storage type restriction
        userName: request.buyerName,
        price: request.price,
        currency: request.currency,
        orderType: request.orderType,
        quantity: request.quantity,
        remainingQuantity: request.remainingQuantity,
        reservedQuantity: request.reservedQuantity,
        activeReservationCount: request.activeReservationCount,
        isOwn: request.isOwn,
        isStanding: request.isStanding,
        fioUploadedAt: request.fioUploadedAt,
        pricingMode: request.pricingMode,
        effectivePrice: request.effectivePrice,
        priceListCode: request.priceListCode,
        aggregateQuantity: request.quantity,
        aggregateRemainingQuantity: request.remainingQuantity,
        hasMultipleStorageTypes: false,
        groupedOrderIds: [request.id],
        groupedFioTimes: [request.fioUploadedAt],
        isCollapsed: false,
      }))

      // Combine and sort by commodity, then location, then price (using effective price for dynamic)
      marketItems.value = [...sellItems, ...buyItems].sort((a, b) => {
        if (a.commodityTicker !== b.commodityTicker) {
          return a.commodityTicker.localeCompare(b.commodityTicker)
        }
        if (a.locationId !== b.locationId) {
          return a.locationId.localeCompare(b.locationId)
        }
        // Use display price for sorting (effective for dynamic, regular for fixed)
        const priceA = getDisplayPrice(a) ?? Infinity
        const priceB = getDisplayPrice(b) ?? Infinity
        return priceA - priceB
      })
    } catch (error) {
      console.error('Failed to load market items', error)
      options?.onError?.(error)
    } finally {
      loading.value = false
    }
  }

  return {
    marketItems,
    loading,
    loadMarketItems,
  }
}
