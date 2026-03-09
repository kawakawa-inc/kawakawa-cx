/**
 * Batch process: Fix reservation counterparty IDs.
 *
 * Finds reservations linked to invoices where the reservation's counterpartyUserId
 * doesn't match the invoice sender (invoice.userId). This was caused by a bug in the
 * Discord bot's submitInvoice that set counterpartyUserId to the invoice recipient
 * instead of the sender.
 *
 * Idempotent: only updates mismatched records.
 */
import { db, orderReservations, invoices, invoiceLineItems } from '../../db/index.js'
import { eq, and, isNotNull, sql } from 'drizzle-orm'
import { createLogger } from '../../utils/logger.js'
import type { BatchProcess, BatchResult } from './types.js'

const logger = createLogger({ module: 'fix-reservation-counterparty' })

export const fixReservationCounterparty: BatchProcess = {
  id: 'fix-reservation-counterparty',
  description: 'Fix reservation counterpartyUserId to match invoice sender',

  async shouldRun(): Promise<boolean> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
      .innerJoin(orderReservations, eq(invoiceLineItems.reservationId, orderReservations.id))
      .where(
        and(
          isNotNull(invoiceLineItems.reservationId),
          sql`${orderReservations.counterpartyUserId} != ${invoices.userId}`
        )
      )

    return (result?.count ?? 0) > 0
  },

  async execute(): Promise<BatchResult> {
    const result: BatchResult = { processed: 0, skipped: 0, errors: [] }

    // Find all mismatched reservations
    const mismatched = await db
      .select({
        reservationId: orderReservations.id,
        currentCounterparty: orderReservations.counterpartyUserId,
        invoiceSender: invoices.userId,
        invoiceId: invoices.id,
      })
      .from(invoiceLineItems)
      .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
      .innerJoin(orderReservations, eq(invoiceLineItems.reservationId, orderReservations.id))
      .where(
        and(
          isNotNull(invoiceLineItems.reservationId),
          sql`${orderReservations.counterpartyUserId} != ${invoices.userId}`
        )
      )

    if (mismatched.length === 0) {
      return result
    }

    logger.info({ count: mismatched.length }, 'Fixing mismatched reservation counterparty IDs')

    for (const row of mismatched) {
      try {
        await db
          .update(orderReservations)
          .set({
            counterpartyUserId: row.invoiceSender,
            updatedAt: new Date(),
          })
          .where(eq(orderReservations.id, row.reservationId))

        result.processed++

        logger.info(
          {
            reservationId: row.reservationId,
            invoiceId: row.invoiceId,
            from: row.currentCounterparty,
            to: row.invoiceSender,
          },
          'Fixed reservation counterparty'
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        result.errors.push(`Reservation ${row.reservationId}: ${message}`)
        logger.error({ error, reservationId: row.reservationId }, 'Failed to fix reservation')
      }
    }

    return result
  },
}
