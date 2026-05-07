// Computes "incoming" inventory deltas from the user's pending + recently-
// fulfilled BUY invoices. The Plan tab uses this to net out contract amounts:
// if a contract row says "Etherwind needs 25k H2O" and the user already has a
// pending invoice delivering 10k H2O to Etherwind, only 15k still needs a
// contract.
//
// Mirrors the market view's FIO-aware logic for fulfilled reservations: once
// FIO has synced AFTER the reservation was fulfilled, the goods are already
// reflected in inventory and we stop double-counting them here.

import { db } from '../db/index.js'
import { invoices, invoiceLineItems, orderReservations, fioUserStorage } from '@kawakawa/db'
import { eq, and, inArray, or, max } from 'drizzle-orm'

export interface ContractCoverageRow {
  locationId: string
  commodityTicker: string
  /** Quantity already covered by buy invoices (still incoming or recently-
   *  fulfilled-but-not-yet-in-FIO). Subtract from contract amounts. */
  incomingQuantity: number
}

const ACTIVE_INVOICE_STATUSES = [
  'pending',
  'confirmed',
  'partially_fulfilled',
  'fulfilled',
] as const

/** Invoice line item with joined reservation data. Exported for testing. */
export interface CoverageCandidate {
  ownerUserId: number
  counterpartyUserId: number
  sellOrderId: number | null
  buyOrderId: number | null
  locationId: string
  commodityTicker: string
  quantity: number
  reservationStatus: string | null
  reservationUpdatedAt: Date | null
}

/**
 * Determines if the user is the BUYER for a given invoice line item.
 * The user is buying when:
 *   - They own the invoice AND the line item references a `sellOrderId`
 *     (filling somebody else's sell offer), OR
 *   - They're the counterparty AND the line item references a `buyOrderId`
 *     (the other party owns a buy order they're filling for the user).
 * Exported for unit testing.
 */
export function isUserBuying(
  userId: number,
  ownerUserId: number,
  counterpartyUserId: number,
  sellOrderId: number | null,
  buyOrderId: number | null
): boolean {
  const userIsOwner = ownerUserId === userId
  const userIsCounterparty = counterpartyUserId === userId
  return (userIsOwner && sellOrderId !== null) || (userIsCounterparty && buyOrderId !== null)
}

/**
 * Checks if a reservation is in a terminal dead state (no longer incoming).
 * Exported for unit testing.
 */
export function isReservationDead(status: string | null): boolean {
  return status === 'cancelled' || status === 'rejected' || status === 'expired'
}

/**
 * Checks if a fulfilled reservation has already been synced by FIO.
 * Returns true if the goods are already in inventory (should not be double-counted).
 * Exported for unit testing.
 */
export function isFulfilledAndSynced(
  reservationStatus: string | null,
  reservationUpdatedAt: Date | null,
  fioUploadedAt: Date | null
): boolean {
  if (reservationStatus !== 'fulfilled' || !reservationUpdatedAt) {
    return false
  }
  return fioUploadedAt !== null && fioUploadedAt > reservationUpdatedAt
}

/**
 * Sum incoming quantities per (location, ticker) for the given user.
 *
 * "Incoming" = a buy commitment whose goods aren't yet reflected in FIO
 * inventory. Includes:
 *   - Active reservations on the user's BUY-side line items
 *   - Fulfilled reservations whose `updatedAt` is more recent than the
 *     destination location's `fio_uploaded_at` (FIO hasn't seen them yet)
 *
 * The user is BUYING when:
 *   - They own the invoice AND the line item references a `sellOrderId`
 *     (filling somebody else's sell offer), OR
 *   - They're the counterparty AND the line item references a `buyOrderId`
 *     (the other party owns a buy order they're filling for the user).
 */
export async function getContractCoverage(userId: number): Promise<ContractCoverageRow[]> {
  // One query: line items on active invoices where the user is on either side.
  // Reservation-side fields come via leftJoin (reservation may be null on
  // very old line items, though normally fulfillment links them).
  const rows = (await db
    .select({
      ownerUserId: invoices.userId,
      counterpartyUserId: invoices.counterpartyUserId,
      sellOrderId: invoiceLineItems.sellOrderId,
      buyOrderId: invoiceLineItems.buyOrderId,
      locationId: invoiceLineItems.locationId,
      commodityTicker: invoiceLineItems.commodityTicker,
      quantity: invoiceLineItems.quantity,
      reservationStatus: orderReservations.status,
      reservationUpdatedAt: orderReservations.updatedAt,
    })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .leftJoin(orderReservations, eq(invoiceLineItems.reservationId, orderReservations.id))
    .where(
      and(
        inArray(invoices.status, [...ACTIVE_INVOICE_STATUSES]),
        or(eq(invoices.userId, userId), eq(invoices.counterpartyUserId, userId))
      )
    )) as CoverageCandidate[]

  // First pass: filter to lines where the user is BUYING + reservation is
  // alive (not cancelled/rejected/expired).
  const candidates: CoverageCandidate[] = []
  for (const r of rows) {
    if (!isUserBuying(userId, r.ownerUserId, r.counterpartyUserId, r.sellOrderId, r.buyOrderId)) {
      continue
    }
    if (isReservationDead(r.reservationStatus)) {
      continue
    }
    candidates.push(r)
  }

  // Look up the latest FIO upload per location for the user. Per-location is
  // most precise; per-user max is the fallback for locations where the user
  // currently holds no stock (so no row exists) but has refreshed FIO since.
  const userMaxRow = await db
    .select({ maxUploadedAt: max(fioUserStorage.fioUploadedAt) })
    .from(fioUserStorage)
    .where(eq(fioUserStorage.userId, userId))
  const userMaxUploadedAt: Date | null = userMaxRow[0]?.maxUploadedAt ?? null

  const distinctLocations = [...new Set(candidates.map(r => r.locationId).filter(Boolean))]
  const perLocationMax = new Map<string, Date | null>()
  if (distinctLocations.length > 0) {
    const locRows = await db
      .select({
        locationId: fioUserStorage.locationId,
        maxUploadedAt: max(fioUserStorage.fioUploadedAt),
      })
      .from(fioUserStorage)
      .where(
        and(
          eq(fioUserStorage.userId, userId),
          inArray(fioUserStorage.locationId, distinctLocations)
        )
      )
      .groupBy(fioUserStorage.locationId)
    for (const r of locRows) {
      if (r.locationId) perLocationMax.set(r.locationId, r.maxUploadedAt)
    }
  }

  // Second pass: drop fulfilled rows that FIO has already reflected; sum.
  const sums = new Map<string, number>()
  for (const r of candidates) {
    const locUploadedAt = perLocationMax.get(r.locationId) ?? userMaxUploadedAt
    if (isFulfilledAndSynced(r.reservationStatus, r.reservationUpdatedAt, locUploadedAt)) {
      // FIO already saw this fulfillment — its goods are already in inventory.
      continue
    }
    const key = `${r.locationId}|${r.commodityTicker}`
    sums.set(key, (sums.get(key) ?? 0) + r.quantity)
  }

  const result: ContractCoverageRow[] = []
  for (const [key, qty] of sums) {
    const [locationId, commodityTicker] = key.split('|')
    if (locationId && commodityTicker && qty > 0) {
      result.push({ locationId, commodityTicker, incomingQuantity: qty })
    }
  }
  return result
}
