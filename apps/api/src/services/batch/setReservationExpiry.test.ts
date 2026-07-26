/**
 * Tests for setReservationExpiry batch process
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockDbSelect,
  mockDbUpdate,
  mockSelectFrom,
  mockSelectWhere,
  mockUpdateSet,
  mockUpdateWhere,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockSelectFrom: vi.fn(),
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
    status: 'orderReservations.status',
    createdAt: 'orderReservations.createdAt',
    expiresAt: 'orderReservations.expiresAt',
    updatedAt: 'orderReservations.updatedAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  sql: vi.fn((...args: unknown[]) => ({ type: 'sql', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}))

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { setReservationExpiry } from './setReservationExpiry.js'

describe('setReservationExpiry', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default chain: db.select().from().where()
    mockSelectWhere.mockResolvedValue([{ count: 0 }])
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockDbSelect.mockReturnValue({ from: mockSelectFrom })

    // Default update chain: db.update().set().where()
    mockUpdateWhere.mockResolvedValue(undefined)
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockDbUpdate.mockReturnValue({ set: mockUpdateSet })
  })

  it('has correct id and description', () => {
    expect(setReservationExpiry.id).toBe('set-reservation-expiry')
    expect(setReservationExpiry.description).toBeTruthy()
  })

  it('shouldRun returns false when no null-expiry reservations exist', async () => {
    mockSelectWhere.mockResolvedValue([{ count: 0 }])

    const result = await setReservationExpiry.shouldRun()

    expect(result).toBe(false)
  })

  it('shouldRun returns true when null-expiry reservations exist', async () => {
    mockSelectWhere.mockResolvedValue([{ count: 5 }])

    const result = await setReservationExpiry.shouldRun()

    expect(result).toBe(true)
  })

  it('execute returns zero processed when no null-expiry found', async () => {
    mockSelectWhere.mockResolvedValue([])

    const result = await setReservationExpiry.execute()

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('execute sets expiry on pending reservations', async () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const nullExpiry = [
      { id: 1, status: 'pending', createdAt: oneHourAgo },
      { id: 2, status: 'pending', createdAt: oneHourAgo },
    ]

    mockSelectWhere.mockResolvedValue(nullExpiry)

    const result = await setReservationExpiry.execute()

    expect(result.processed).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(mockDbUpdate).toHaveBeenCalledTimes(2)
  })

  it('execute sets expiry on accepted reservations', async () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const nullExpiry = [{ id: 1, status: 'accepted', createdAt: oneHourAgo }]

    mockSelectWhere.mockResolvedValue(nullExpiry)

    const result = await setReservationExpiry.execute()

    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it('execute skips fulfilled reservations', async () => {
    const now = new Date()
    const nullExpiry = [{ id: 1, status: 'fulfilled', createdAt: now }]

    mockSelectWhere.mockResolvedValue(nullExpiry)

    const result = await setReservationExpiry.execute()

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('execute skips cancelled reservations', async () => {
    const now = new Date()
    const nullExpiry = [{ id: 1, status: 'cancelled', createdAt: now }]

    mockSelectWhere.mockResolvedValue(nullExpiry)

    const result = await setReservationExpiry.execute()

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('execute skips rejected reservations', async () => {
    const now = new Date()
    const nullExpiry = [{ id: 1, status: 'rejected', createdAt: now }]

    mockSelectWhere.mockResolvedValue(nullExpiry)

    const result = await setReservationExpiry.execute()

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  it('execute handles mixed statuses', async () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const nullExpiry = [
      { id: 1, status: 'pending', createdAt: oneHourAgo },
      { id: 2, status: 'fulfilled', createdAt: oneHourAgo },
      { id: 3, status: 'accepted', createdAt: oneHourAgo },
      { id: 4, status: 'cancelled', createdAt: oneHourAgo },
    ]

    mockSelectWhere.mockResolvedValue(nullExpiry)

    const result = await setReservationExpiry.execute()

    expect(result.processed).toBe(2) // pending and accepted
    expect(result.skipped).toBe(2) // fulfilled and cancelled
    expect(mockDbUpdate).toHaveBeenCalledTimes(2)
  })

  it('execute handles errors per reservation without stopping', async () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const nullExpiry = [
      { id: 1, status: 'pending', createdAt: oneHourAgo },
      { id: 2, status: 'pending', createdAt: oneHourAgo },
    ]

    mockSelectWhere.mockResolvedValue(nullExpiry)

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

    const result = await setReservationExpiry.execute()

    expect(result.processed).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Reservation 1')
    expect(result.errors[0]).toContain('DB constraint error')
  })
})
