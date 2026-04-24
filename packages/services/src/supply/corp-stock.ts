/**
 * Corp-wide available stock: sum of remaining sell-order quantities per ticker
 * across the set of active corp members.
 *
 * The same enrichment pipeline as `/sell-orders` is used (reservations and
 * FIO-aware fulfilment are respected); we just collapse to ticker totals.
 *
 * Two entry points:
 * - `computeCorpStock(userIds)`: pure calculation, used by the live corp
 *   endpoint and the snapshot cron.
 * - `captureCorpStockSnapshot()`: cron wrapper that resolves active members,
 *   computes stock, and upserts today's row into `corp_snapshot_ticker_stock`.
 */

import { corpSnapshotTickerStock, db, sellOrders } from '@kawakawa/db'
import { inArray, sql } from 'drizzle-orm'
import { enrichSellOrdersWithQuantities } from '../market/index.js'
import { resolveActiveMembers } from './corp-members.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'corp-stock' })

export async function computeCorpStock(userIds: number[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {}

  const orders = await db
    .select({
      id: sellOrders.id,
      userId: sellOrders.userId,
      commodityTicker: sellOrders.commodityTicker,
      locationId: sellOrders.locationId,
      limitMode: sellOrders.limitMode,
      limitQuantity: sellOrders.limitQuantity,
    })
    .from(sellOrders)
    .where(inArray(sellOrders.userId, userIds))

  if (orders.length === 0) return {}

  const quantityMap = await enrichSellOrdersWithQuantities(orders)

  const totals: Record<string, number> = {}
  for (const o of orders) {
    const q = quantityMap.get(o.id)?.remainingQuantity ?? 0
    if (q <= 0) continue
    totals[o.commodityTicker] = (totals[o.commodityTicker] ?? 0) + q
  }
  return totals
}

/** Format a Date as `YYYY-MM-DD` in UTC — matches Postgres `date` column storage. */
function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Resolve active members (via admin-default roles), compute corp-wide stock,
 * and upsert today's row per ticker into `corp_snapshot_ticker_stock`.
 *
 * Dedupe key: `(ticker, snapshotAt)`. Running multiple times in the same UTC
 * day just overwrites.
 */
export async function captureCorpStockSnapshot(): Promise<void> {
  const { activeUserIds } = await resolveActiveMembers()
  if (activeUserIds.length === 0) {
    log.info('Skipping stock snapshot: no active corp members')
    return
  }

  const totals = await computeCorpStock(activeUserIds)
  const entries = Object.entries(totals)
  if (entries.length === 0) {
    log.info({ activeUserIds: activeUserIds.length }, 'Stock snapshot: no remaining quantities')
    return
  }

  const snapshotAt = todayIsoDate()
  const rows = entries.map(([commodityTicker, stock]) => ({
    snapshotAt,
    commodityTicker,
    stock,
  }))

  await db
    .insert(corpSnapshotTickerStock)
    .values(rows)
    .onConflictDoUpdate({
      target: [corpSnapshotTickerStock.commodityTicker, corpSnapshotTickerStock.snapshotAt],
      set: {
        stock: sql`excluded.stock`,
      },
    })

  log.info({ tickers: rows.length, snapshotAt }, 'Corp stock snapshot captured')
}
