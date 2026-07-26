/**
 * Batch process: Set expiration on reservations with null expiresAt.
 *
 * Reservations should always expire after 3 days (or when FIO data is more recent).
 * This fixes existing reservations that were created before the default expiry was added.
 *
 * Sets expiresAt to 3 days from createdAt for pending/accepted reservations.
 * Old reservations will have an expiresAt in the past and be immediately expired.
 * Does NOT update updatedAt (preserves FIO sync comparison logic).
 *
 * Idempotent: only updates records with null expiresAt.
 */
import { db, orderReservations } from '../../db/index.js'
import { isNull, sql } from 'drizzle-orm'
import { createLogger } from '../../utils/logger.js'
import type { BatchProcess, BatchResult } from './types.js'

const logger = createLogger({ module: 'set-reservation-expiry' })

/** Default reservation expiration: 3 days */
const DEFAULT_EXPIRY_DAYS = 3

export const setReservationExpiry: BatchProcess = {
  id: 'set-reservation-expiry',
  description: 'Set expiresAt on reservations with null expiration',

  async shouldRun(): Promise<boolean> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orderReservations)
      .where(isNull(orderReservations.expiresAt))

    return (result?.count ?? 0) > 0
  },

  async execute(): Promise<BatchResult> {
    const result: BatchResult = { processed: 0, skipped: 0, errors: [] }

    // Find all reservations with null expiresAt
    const nullExpiry = await db
      .select({
        id: orderReservations.id,
        status: orderReservations.status,
        createdAt: orderReservations.createdAt,
      })
      .from(orderReservations)
      .where(isNull(orderReservations.expiresAt))

    if (nullExpiry.length === 0) {
      return result
    }

    logger.info(
      { count: nullExpiry.length },
      'Setting expiration on reservations with null expiresAt'
    )

    // Only set expiry on active reservations (pending, accepted)
    // Fulfilled/cancelled/rejected don't need expiry
    const activeStatuses = ['pending', 'accepted']

    for (const row of nullExpiry) {
      try {
        // Skip non-active reservations
        if (!activeStatuses.includes(row.status)) {
          result.skipped++
          continue
        }

        // Calculate expiry: 3 days from creation (may already be expired)
        const expiresAt = new Date(
          row.createdAt.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
        )

        // Only set expiresAt, don't touch updatedAt (used for FIO sync comparison)
        await db
          .update(orderReservations)
          .set({ expiresAt })
          .where(sql`${orderReservations.id} = ${row.id}`)

        result.processed++

        logger.info(
          {
            reservationId: row.id,
            status: row.status,
            createdAt: row.createdAt,
            expiresAt,
          },
          'Set reservation expiry'
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        result.errors.push(`Reservation ${row.id}: ${message}`)
        logger.error({ error, reservationId: row.id }, 'Failed to set reservation expiry')
      }
    }

    return result
  },
}
