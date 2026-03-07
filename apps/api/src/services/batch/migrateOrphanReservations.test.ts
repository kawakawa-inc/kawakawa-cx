/**
 * Tests for migrateOrphanReservations batch process
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockDbSelect, mockDbInsert, mockSelectFrom, mockSelectInnerJoin, mockSelectWhere } =
  vi.hoisted(() => ({
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn(),
    mockSelectFrom: vi.fn(),
    mockSelectInnerJoin: vi.fn(),
    mockSelectWhere: vi.fn(),
  }))

vi.mock('../../db/index.js', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
  orderReservations: { id: 'orderReservations.id' },
  invoices: { id: 'invoices.id' },
  invoiceLineItems: { reservationId: 'invoiceLineItems.reservationId' },
  sellOrders: {
    id: 'sellOrders.id',
    userId: 'sellOrders.userId',
    commodityTicker: 'sellOrders.commodityTicker',
    locationId: 'sellOrders.locationId',
    price: 'sellOrders.price',
    currency: 'sellOrders.currency',
    priceListCode: 'sellOrders.priceListCode',
  },
  buyOrders: {
    id: 'buyOrders.id',
    userId: 'buyOrders.userId',
    commodityTicker: 'buyOrders.commodityTicker',
    locationId: 'buyOrders.locationId',
    price: 'buyOrders.price',
    currency: 'buyOrders.currency',
    priceListCode: 'buyOrders.priceListCode',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  isNotNull: vi.fn((col: unknown) => ({ type: 'isNotNull', col })),
  notInArray: vi.fn((...args: unknown[]) => ({ type: 'notInArray', args })),
  sql: vi.fn(),
}))

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { migrateOrphanReservations } from './migrateOrphanReservations.js'

describe('migrateOrphanReservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default chain: db.select().from().where() → count result
    mockSelectWhere.mockResolvedValue([{ count: 0 }])
    mockSelectInnerJoin.mockReturnValue({ where: mockSelectWhere })
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere,
      innerJoin: mockSelectInnerJoin,
    })
    mockDbSelect.mockReturnValue({ from: mockSelectFrom })

    // Default chain: db.insert().values().returning()
    mockDbInsert.mockReturnValue({
      values: () => ({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    })
  })

  it('has correct id and description', () => {
    expect(migrateOrphanReservations.id).toBe('migrate-orphan-reservations')
    expect(migrateOrphanReservations.description).toBeTruthy()
  })

  it('shouldRun returns false when no orphan reservations exist', async () => {
    mockSelectWhere.mockResolvedValue([{ count: 0 }])

    const result = await migrateOrphanReservations.shouldRun()

    expect(result).toBe(false)
  })

  it('shouldRun returns true when orphan reservations exist', async () => {
    mockSelectWhere.mockResolvedValue([{ count: 3 }])

    const result = await migrateOrphanReservations.shouldRun()

    expect(result).toBe(true)
  })

  it('execute returns zero processed when no orphans found', async () => {
    // Both sell and buy reservation queries return empty
    mockSelectInnerJoin.mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    })

    const result = await migrateOrphanReservations.execute()

    expect(result.processed).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('execute creates invoices grouped by counterparty-owner pair', async () => {
    const orphanSell = {
      id: 1,
      sellOrderId: 10,
      buyOrderId: null,
      counterpartyUserId: 100,
      quantity: 50,
      status: 'pending',
      notes: null,
      createdAt: new Date(),
      orderOwnerId: 200,
      commodityTicker: 'COF',
      locationId: 'BEN',
      price: '100.00',
      currency: 'CIS',
      priceListCode: null,
    }

    const orphanSell2 = {
      ...orphanSell,
      id: 2,
      commodityTicker: 'RAT',
    }

    // First innerJoin call (sell) returns orphans, second (buy) returns empty
    let innerJoinCallCount = 0
    mockSelectInnerJoin.mockImplementation(() => {
      innerJoinCallCount++
      return {
        where: vi.fn().mockResolvedValue(innerJoinCallCount === 1 ? [orphanSell, orphanSell2] : []),
      }
    })

    mockDbInsert.mockImplementation(() => ({
      values: () => ({
        returning: vi.fn().mockResolvedValue([{ id: 42 }]),
      }),
    }))

    const result = await migrateOrphanReservations.execute()

    expect(result.processed).toBe(2)
    expect(result.errors).toHaveLength(0)
    // One invoice for the group, plus 2 line items = 3 insert calls
    expect(mockDbInsert).toHaveBeenCalledTimes(3)
  })

  it('execute handles errors per group without stopping', async () => {
    const orphan1 = {
      id: 1,
      sellOrderId: 10,
      buyOrderId: null,
      counterpartyUserId: 100,
      quantity: 50,
      status: 'confirmed',
      notes: null,
      createdAt: new Date(),
      orderOwnerId: 200,
      commodityTicker: 'COF',
      locationId: 'BEN',
      price: '100.00',
      currency: 'CIS',
      priceListCode: null,
    }

    const orphan2 = {
      ...orphan1,
      id: 2,
      counterpartyUserId: 300,
      orderOwnerId: 400,
    }

    let innerJoinCallCount = 0
    mockSelectInnerJoin.mockImplementation(() => {
      innerJoinCallCount++
      return {
        where: vi.fn().mockResolvedValue(innerJoinCallCount === 1 ? [orphan1, orphan2] : []),
      }
    })

    // First insert (invoice for group 1) fails, second group succeeds
    let insertCallCount = 0
    mockDbInsert.mockImplementation(() => ({
      values: () => {
        insertCallCount++
        if (insertCallCount === 1) {
          return {
            returning: vi.fn().mockRejectedValue(new Error('DB constraint error')),
          }
        }
        return {
          returning: vi.fn().mockResolvedValue([{ id: 99 }]),
        }
      },
    }))

    const result = await migrateOrphanReservations.execute()

    // Group 1 failed, group 2 succeeded with 1 reservation
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('DB constraint error')
    expect(result.processed).toBe(1)
  })

  it('maps reservation statuses to invoice status correctly', async () => {
    // All fulfilled → fulfilled invoice
    const fulfilledOrphan = {
      id: 1,
      sellOrderId: 10,
      buyOrderId: null,
      counterpartyUserId: 100,
      quantity: 50,
      status: 'fulfilled',
      notes: null,
      createdAt: new Date(),
      orderOwnerId: 200,
      commodityTicker: 'COF',
      locationId: 'BEN',
      price: '100.00',
      currency: 'CIS',
      priceListCode: null,
    }

    let innerJoinCallCount = 0
    mockSelectInnerJoin.mockImplementation(() => {
      innerJoinCallCount++
      return {
        where: vi.fn().mockResolvedValue(innerJoinCallCount === 1 ? [fulfilledOrphan] : []),
      }
    })

    const invoiceValues: Record<string, unknown>[] = []
    mockDbInsert.mockImplementation(() => ({
      values: (data: Record<string, unknown>) => {
        invoiceValues.push(data)
        return {
          returning: vi.fn().mockResolvedValue([{ id: 50 }]),
        }
      },
    }))

    await migrateOrphanReservations.execute()

    // First insert call is for the invoice — check its status
    expect(invoiceValues[0]).toEqual(expect.objectContaining({ status: 'fulfilled' }))
  })
})
