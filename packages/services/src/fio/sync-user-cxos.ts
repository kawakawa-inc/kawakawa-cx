// Sync user CX sell orders from FIO API to database as storage
// CX sell orders represent materials that are "locked" at a station but can be
// recovered at any time by cancelling the order.

import { eq, and } from 'drizzle-orm'
import { db, fioInventory, fioUserStorage, fioLocations, fioCommodities } from '@kawakawa/db'
import { FioClient } from './client.js'
import { classifyFioError } from './fio-error.js'
import type { FioCxOrder } from './types.js'
import { EXCHANGE_TO_STATION } from './types.js'
import type { SyncResult } from './sync-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'fio-sync', entity: 'user-cxos' })

/** Storage type constant for CX sell orders */
export const CX_SELL_ORDER_STORAGE_TYPE = 'CX_SELL_ORDER'

export interface UserCxosSyncResult extends SyncResult {
  sellOrdersProcessed: number
  buyOrdersSkipped: number
  skippedUnknownExchanges: number
  skippedUnknownCommodities: number
  storageLocationsCreated: number
}

/**
 * Sync a user's CX sell orders from FIO API
 *
 * Fetches the user's CXOS data and creates storage entries for sell orders.
 * Buy orders are skipped since they don't "lock" any materials.
 *
 * Each exchange station gets a single storage entry with type 'CX_SELL_ORDER',
 * and all sell orders at that station are aggregated into inventory items.
 *
 * @param userId - The internal user ID
 * @param fioApiKey - User's FIO API key
 * @param fioUsername - User's FIO username
 */
export async function syncUserCxos(
  userId: number,
  fioApiKey: string,
  fioUsername: string
): Promise<UserCxosSyncResult> {
  const result: UserCxosSyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
    sellOrdersProcessed: 0,
    buyOrdersSkipped: 0,
    skippedUnknownExchanges: 0,
    skippedUnknownCommodities: 0,
    storageLocationsCreated: 0,
  }

  try {
    const client = new FioClient()

    // Fetch CXOS data from FIO
    log.info({ userId, fioUsername }, 'Fetching CXOS data from FIO API')
    const cxosData = await client.getUserCxos<FioCxOrder[]>(fioApiKey, fioUsername)

    if (!cxosData || !Array.isArray(cxosData)) {
      log.info({ userId }, 'No CXOS data returned from FIO')
      result.success = true
      return result
    }

    log.info({ userId, orderCount: cxosData.length }, 'Received CXOS data')

    // Filter to sell orders only
    const sellOrders = cxosData.filter(order => order.OrderType === 'SELLING')
    result.buyOrdersSkipped = cxosData.length - sellOrders.length

    if (sellOrders.length === 0) {
      log.info({ userId }, 'No sell orders found')
      result.success = true
      return result
    }

    // Build lookup maps for validation
    const existingLocations = await db
      .select({ naturalId: fioLocations.naturalId })
      .from(fioLocations)
    const locationIds = new Set(existingLocations.map(l => l.naturalId))

    const existingCommodities = await db
      .select({ ticker: fioCommodities.ticker })
      .from(fioCommodities)
    const commodityTickers = new Set(existingCommodities.map(c => c.ticker))

    // Track unknown exchanges and commodities
    const unknownExchanges = new Set<string>()
    const unknownCommodities = new Set<string>()

    // Clear existing CX_SELL_ORDER storage for this user
    // (we'll recreate it fresh from current orders)
    await db
      .delete(fioUserStorage)
      .where(
        and(eq(fioUserStorage.userId, userId), eq(fioUserStorage.type, CX_SELL_ORDER_STORAGE_TYPE))
      )

    const now = new Date()

    // Group sell orders by exchange (station)
    const ordersByExchange = new Map<string, FioCxOrder[]>()
    for (const order of sellOrders) {
      const stationId = EXCHANGE_TO_STATION[order.ExchangeCode]
      if (!stationId) {
        if (!unknownExchanges.has(order.ExchangeCode)) {
          unknownExchanges.add(order.ExchangeCode)
          log.warn({ exchangeCode: order.ExchangeCode }, 'Unknown exchange code')
        }
        result.skippedUnknownExchanges++
        continue
      }

      if (!locationIds.has(stationId)) {
        if (!unknownExchanges.has(stationId)) {
          unknownExchanges.add(stationId)
          log.warn({ stationId, exchangeCode: order.ExchangeCode }, 'Station not in database')
        }
        result.skippedUnknownExchanges++
        continue
      }

      if (!ordersByExchange.has(stationId)) {
        ordersByExchange.set(stationId, [])
      }
      ordersByExchange.get(stationId)!.push(order)
    }

    // Process each exchange station
    for (const [stationId, orders] of ordersByExchange) {
      // Create storage record for this station
      let storageRecord: { id: number }
      try {
        const [inserted] = await db
          .insert(fioUserStorage)
          .values({
            userId,
            storageId: `cxos-${stationId}`,
            locationId: stationId,
            type: CX_SELL_ORDER_STORAGE_TYPE,
            fioUploadedAt: now, // Use current time since CXOS doesn't have a separate "last updated" timestamp
            lastSyncedAt: now,
          })
          .returning({ id: fioUserStorage.id })

        storageRecord = inserted
        result.storageLocationsCreated++
      } catch (error) {
        const errorMsg = `Failed to insert CX storage at ${stationId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        log.error({ stationId, err: error }, 'Failed to insert CX storage')
        continue
      }

      // Aggregate quantities by commodity ticker
      // (a user might have multiple sell orders for the same material at the same exchange)
      const quantityByTicker = new Map<string, number>()
      for (const order of orders) {
        if (!order.MaterialTicker || order.Amount <= 0) {
          continue
        }

        if (!commodityTickers.has(order.MaterialTicker)) {
          if (!unknownCommodities.has(order.MaterialTicker)) {
            unknownCommodities.add(order.MaterialTicker)
            log.warn({ ticker: order.MaterialTicker }, 'Unknown commodity')
          }
          result.skippedUnknownCommodities++
          continue
        }

        const currentQty = quantityByTicker.get(order.MaterialTicker) || 0
        quantityByTicker.set(order.MaterialTicker, currentQty + order.Amount)
        result.sellOrdersProcessed++
      }

      // Insert aggregated inventory items
      for (const [ticker, quantity] of quantityByTicker) {
        try {
          await db.insert(fioInventory).values({
            userStorageId: storageRecord.id,
            commodityTicker: ticker,
            quantity,
          })
          result.inserted++
        } catch (error) {
          const errorMsg = `Failed to insert ${ticker} CX inventory at ${stationId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          result.errors.push(errorMsg)
          log.error({ ticker, stationId, err: error }, 'Failed to insert CX inventory item')
        }
      }
    }

    result.success = result.errors.length === 0
    log.info(
      {
        userId,
        sellOrdersProcessed: result.sellOrdersProcessed,
        buyOrdersSkipped: result.buyOrdersSkipped,
        storageLocations: result.storageLocationsCreated,
        inventoryEntries: result.inserted,
      },
      'Synced user CX sell orders'
    )

    if (result.skippedUnknownExchanges > 0) {
      log.warn(
        { skipped: result.skippedUnknownExchanges, exchanges: Array.from(unknownExchanges) },
        'Skipped unknown exchanges'
      )
    }
    if (result.skippedUnknownCommodities > 0) {
      log.warn(
        { skipped: result.skippedUnknownCommodities, commodities: Array.from(unknownCommodities) },
        'Skipped unknown commodities'
      )
    }

    return result
  } catch (error) {
    const errorMsg = `Failed to sync CXOS for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    result.errorCode = classifyFioError(error)
    log.error({ userId, err: error }, 'Failed to sync user CXOS')
    return result
  }
}
