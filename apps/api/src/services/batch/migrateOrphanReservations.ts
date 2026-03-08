/**
 * Batch process: Migrate orphan reservations to invoices.
 *
 * Finds all orderReservations NOT linked to any invoiceLineItem,
 * groups them by (counterpartyUserId, orderOwnerId) pair,
 * and creates an invoice with line items for each group.
 *
 * Idempotent: only processes reservations with no existing line item link.
 */
import {
  db,
  orderReservations,
  invoices,
  invoiceLineItems,
  sellOrders,
  buyOrders,
} from '../../db/index.js'
import { eq, isNotNull, notInArray, sql } from 'drizzle-orm'
import { createLogger } from '../../utils/logger.js'
import type { BatchProcess, BatchResult } from './types.js'

type Currency = 'ICA' | 'CIS' | 'AIC' | 'NCC'

const logger = createLogger({ module: 'migrate-orphan-reservations' })

interface OrphanReservation {
  id: number
  sellOrderId: number | null
  buyOrderId: number | null
  counterpartyUserId: number
  quantity: number
  status: 'pending' | 'confirmed' | 'rejected' | 'fulfilled' | 'expired' | 'cancelled'
  notes: string | null
  createdAt: Date
  // Joined order data
  orderOwnerId: number
  commodityTicker: string
  locationId: string
  price: string
  currency: Currency
  priceListCode: string | null
}

/**
 * Map a reservation status to an appropriate invoice status.
 */
function reservationStatusToInvoiceStatus(
  statuses: string[]
): 'pending' | 'confirmed' | 'fulfilled' | 'partially_fulfilled' | 'cancelled' {
  const active = statuses.filter(s => s !== 'cancelled' && s !== 'rejected' && s !== 'expired')

  // All cancelled/rejected/expired → cancelled
  if (active.length === 0) return 'cancelled'

  // All fulfilled → fulfilled
  if (active.every(s => s === 'fulfilled')) return 'fulfilled'

  // Some fulfilled → partially_fulfilled
  if (active.some(s => s === 'fulfilled')) return 'partially_fulfilled'

  // All confirmed → confirmed
  if (active.every(s => s === 'confirmed')) return 'confirmed'

  // Otherwise pending
  return 'pending'
}

export const migrateOrphanReservations: BatchProcess = {
  id: 'migrate-orphan-reservations',
  description: 'Convert standalone reservations (not linked to invoices) into invoice records',

  async shouldRun(): Promise<boolean> {
    // Find reservation IDs that ARE linked to a line item
    const linkedIds = db
      .select({ id: invoiceLineItems.reservationId })
      .from(invoiceLineItems)
      .where(isNotNull(invoiceLineItems.reservationId))

    // Count reservations NOT in that set
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orderReservations)
      .where(notInArray(orderReservations.id, linkedIds))

    return (result?.count ?? 0) > 0
  },

  async execute(): Promise<BatchResult> {
    const result: BatchResult = { processed: 0, skipped: 0, errors: [] }

    // Get IDs already linked to invoice line items
    const linkedIds = db
      .select({ id: invoiceLineItems.reservationId })
      .from(invoiceLineItems)
      .where(isNotNull(invoiceLineItems.reservationId))

    // Fetch orphan reservations with sell order data
    const sellReservations = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        createdAt: orderReservations.createdAt,
        orderOwnerId: sellOrders.userId,
        commodityTicker: sellOrders.commodityTicker,
        locationId: sellOrders.locationId,
        price: sellOrders.price,
        currency: sellOrders.currency,
        priceListCode: sellOrders.priceListCode,
      })
      .from(orderReservations)
      .innerJoin(sellOrders, eq(orderReservations.sellOrderId, sellOrders.id))
      .where(notInArray(orderReservations.id, linkedIds))

    // Fetch orphan reservations with buy order data
    const buyReservations = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        createdAt: orderReservations.createdAt,
        orderOwnerId: buyOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        price: buyOrders.price,
        currency: buyOrders.currency,
        priceListCode: buyOrders.priceListCode,
      })
      .from(orderReservations)
      .innerJoin(buyOrders, eq(orderReservations.buyOrderId, buyOrders.id))
      .where(notInArray(orderReservations.id, linkedIds))

    const allOrphans: OrphanReservation[] = [
      ...(sellReservations as OrphanReservation[]),
      ...(buyReservations as OrphanReservation[]),
    ]

    if (allOrphans.length === 0) {
      return result
    }

    // Group by (counterpartyUserId, orderOwnerId) — one invoice per pair
    const groups = new Map<string, OrphanReservation[]>()
    for (const orphan of allOrphans) {
      const key = `${orphan.counterpartyUserId}:${orphan.orderOwnerId}`
      const group = groups.get(key) ?? []
      group.push(orphan)
      groups.set(key, group)
    }

    logger.info(
      { orphanCount: allOrphans.length, groupCount: groups.size },
      'Migrating orphan reservations to invoices'
    )

    for (const [key, reservations] of groups) {
      const [counterpartyUserId, orderOwnerId] = key.split(':').map(Number)

      try {
        // Determine invoice status from reservation statuses
        const invoiceStatus = reservationStatusToInvoiceStatus(reservations.map(r => r.status))

        // Wrap in transaction so invoice + line items are atomic per group
        const newInvoiceId = await db.transaction(async tx => {
          // Create invoice — counterparty placed the reservation, so they're the invoice creator
          const [newInvoice] = await tx
            .insert(invoices)
            .values({
              userId: counterpartyUserId,
              counterpartyUserId: orderOwnerId,
              status: invoiceStatus,
              notes: 'Migrated from standalone reservations',
              submittedAt: reservations[0].createdAt,
            })
            .returning({ id: invoices.id })

          // Create line items and link to existing reservations
          for (const res of reservations) {
            await tx.insert(invoiceLineItems).values({
              invoiceId: newInvoice.id,
              sellOrderId: res.sellOrderId,
              buyOrderId: res.buyOrderId,
              reservationId: res.id,
              commodityTicker: res.commodityTicker,
              locationId: res.locationId,
              quantity: res.quantity,
              unitPrice: res.price,
              currency: res.currency,
              priceListCode: res.priceListCode,
              notes: res.notes,
            })
          }

          return newInvoice.id
        })

        result.processed += reservations.length

        logger.info(
          {
            invoiceId: newInvoiceId,
            counterpartyUserId,
            orderOwnerId,
            reservationCount: reservations.length,
            status: invoiceStatus,
          },
          'Created invoice from orphan reservations'
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        result.errors.push(`Group ${key}: ${message}`)
        logger.error({ error, key }, 'Failed to migrate reservation group')
      }
    }

    return result
  },
}
