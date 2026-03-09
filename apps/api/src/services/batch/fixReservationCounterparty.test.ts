/**
 * Tests for fixReservationCounterparty batch process
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockDbSelect,
  mockDbUpdate,
  mockSelectFrom,
  mockSelectInnerJoin,
  mockSelectWhere,
  mockUpdateSet,
  mockUpdateWhere,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectInnerJoin: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
}))

vi.mock('../../db/index.js', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
  orderReservations: {
    id: 'orderReservations.id',
    counterpartyUserId: 'orderReservations.counterpartyUserId',
  },
  invoices: { id: 'invoices.id', userId: 'invoices.userId' },
  invoiceLineItems: {
    invoiceId: 'invoiceLineItems.invoiceId',
    reservationId: 'invoiceLineItems.reservationId',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNotNull: vi.fn((col: unknown) => ({ type: 'isNotNull', col })),
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

import { fixReservationCounterparty } from './fixReservationCounterparty.js'

describe('fixReservationCounterparty', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default chain: db.select().from().innerJoin().innerJoin().where()
    mockSelectWhere.mockResolvedValue([{ count: 0 }])
    mockSelectInnerJoin.mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({ where: mockSelectWhere }),
    })
    mockSelectFrom.mockReturnValue({ innerJoin: mockSelectInnerJoin })
    mockDbSelect.mockReturnValue({ from: mockSelectFrom })

    // Default update chain: db.update().set().where()
    mockUpdateWhere.mockResolvedValue(undefined)
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockDbUpdate.mockReturnValue({ set: mockUpdateSet })
  })

  it('has correct id and description', () => {
    expect(fixReservationCounterparty.id).toBe('fix-reservation-counterparty')
    expect(fixReservationCounterparty.description).toBeTruthy()
  })

  it('shouldRun returns false when no mismatched reservations exist', async () => {
    mockSelectWhere.mockResolvedValue([{ count: 0 }])

    const result = await fixReservationCounterparty.shouldRun()

    expect(result).toBe(false)
  })

  it('shouldRun returns true when mismatched reservations exist', async () => {
    mockSelectWhere.mockResolvedValue([{ count: 3 }])

    const result = await fixReservationCounterparty.shouldRun()

    expect(result).toBe(true)
  })

  it('execute returns zero processed when no mismatched found', async () => {
    // The execute method uses the same chain pattern
    mockSelectWhere.mockResolvedValue([])

    const result = await fixReservationCounterparty.execute()

    expect(result.processed).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('execute updates mismatched reservations', async () => {
    const mismatched = [
      { reservationId: 1, currentCounterparty: 20, invoiceSender: 10, invoiceId: 100 },
      { reservationId: 2, currentCounterparty: 20, invoiceSender: 10, invoiceId: 101 },
    ]

    // First call is shouldRun (count), second call is execute (mismatched rows)
    // But execute has its own select call
    mockSelectWhere.mockResolvedValue(mismatched)

    const result = await fixReservationCounterparty.execute()

    expect(result.processed).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(mockDbUpdate).toHaveBeenCalledTimes(2)
  })

  it('execute handles errors per reservation without stopping', async () => {
    const mismatched = [
      { reservationId: 1, currentCounterparty: 20, invoiceSender: 10, invoiceId: 100 },
      { reservationId: 2, currentCounterparty: 30, invoiceSender: 10, invoiceId: 101 },
    ]

    mockSelectWhere.mockResolvedValue(mismatched)

    // First update fails, second succeeds
    let updateCallCount = 0
    mockDbUpdate.mockImplementation(() => ({
      set: () => ({
        where: () => {
          updateCallCount++
          if (updateCallCount === 1) {
            throw new Error('DB constraint error')
          }
          return Promise.resolve(undefined)
        },
      }),
    }))

    const result = await fixReservationCounterparty.execute()

    expect(result.processed).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Reservation 1')
    expect(result.errors[0]).toContain('DB constraint error')
  })
})
