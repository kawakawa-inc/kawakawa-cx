/**
 * Corp-wide on-hand stock: sum of FIO-reported inventory per ticker across the
 * set of active corp members.
 *
 * "On-hand" means physically present in any of a user's storages — bases,
 * warehouses, ships. This is the right input for runway questions
 * ("how many days until we run out at current burn?") because it counts
 * material that's already in-corp regardless of whether anyone has listed it
 * for sale.
 *
 * Note: this is NOT the "available to buy" number. A sell order can list
 * 1,000 RAT even if the seller only has 200 in storage. The market views use
 * `enrichSellOrdersWithQuantities` for that question. Keep these two ideas
 * separate — corp burn/repair runway should reflect what's physically on hand,
 * not what someone has promised to sell.
 *
 * Two entry points:
 * - `computeCorpStock(userIds)`: pure calculation, used by the live corp
 *   endpoint and the snapshot cron.
 * - `captureCorpStockSnapshot()`: cron wrapper that resolves active members,
 *   computes stock, and upserts today's row into `corp_snapshot_ticker_stock`.
 */

import { corpSnapshotTickerStock, db, fioInventory, fioUserStorage, sellOrders } from '@kawakawa/db'
import { eq, inArray, sql } from 'drizzle-orm'
import { enrichSellOrdersWithQuantities } from '../market/index.js'
import { resolveActiveMembers } from './corp-members.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'corp-stock' })

export async function computeCorpStock(userIds: number[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {}

  // SUM(quantity) GROUPed by ticker, joining inventory rows back to their
  // owning user via the storage table. Filtered to active corp members only
  // so excluded users (FIO-stale or manually removed) don't pad the totals.
  const rows = await db
    .select({
      commodityTicker: fioInventory.commodityTicker,
      total: sql<string>`SUM(${fioInventory.quantity})`,
    })
    .from(fioInventory)
    .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
    .where(inArray(fioUserStorage.userId, userIds))
    .groupBy(fioInventory.commodityTicker)

  const totals: Record<string, number> = {}
  for (const r of rows) {
    const n = Number(r.total)
    if (n > 0) totals[r.commodityTicker] = n
  }
  return totals
}

/**
 * Corp-wide *listed* stock: sum of remaining sell-order quantities per ticker
 * across the active corp members. Answers "what could I buy from the corp's
 * exchange right now?" — a different question from on-hand inventory because
 * a sell order can list more than the seller has produced (FIO-aware
 * enrichment caps it at what's actually fulfillable).
 *
 * Companion to `computeCorpStock` (on-hand). Kept on the burn/repair response
 * as a sibling field so the materials table can render both columns.
 */
export async function computeCorpListedStock(userIds: number[]): Promise<Record<string, number>> {
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
 * Resolve active members (via admin-default roles), compute corp-wide on-hand
 * stock, and upsert today's row per ticker into `corp_snapshot_ticker_stock`.
 *
 * Dedupe key: `(ticker, snapshotAt)`. Running multiple times in the same UTC
 * day just overwrites.
 *
 * History note: rows captured before 2026-04-27 contain for-sale (sell-order
 * remaining) totals, not on-hand. There's no clean way to backfill on-hand
 * historically — FIO inventory snapshots aren't retained — so trend graphs
 * that span the cutover will show a discontinuity. New data going forward is
 * on-hand, which matches the live `availableSurplus` field.
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
    log.info({ activeUserIds: activeUserIds.length }, 'Stock snapshot: no on-hand inventory')
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

  log.info({ tickers: rows.length, snapshotAt }, 'Corp on-hand stock snapshot captured')
}
