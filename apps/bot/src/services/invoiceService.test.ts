/**
 * Tests for Invoice Service
 *
 * Covers: getOrCreateInvoice, getDraftInvoices, getInboxInvoices, getSentInvoices,
 * getInvoiceWithDetails, submitInvoice, confirmInvoice, rejectInvoice, cancelInvoice,
 * addLineItems, findExistingLineItems, updateLineItemQuantity,
 * getInvoiceStatusEmoji, getInvoiceStatusLabel
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockInvoicesFindFirst,
  mockInvoicesFindMany,
  mockLineItemsFindMany,
  mockReservationsFindMany,
  mockUsersFindFirst,
  mockUsersFindMany,
  mockDbInsert,
  mockDbUpdate,
  mockDbSelect,
  mockGetFioUsernames,
  chainable,
} = vi.hoisted(() => {
  const _chainable = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  }
  return {
    mockInvoicesFindFirst: vi.fn(),
    mockInvoicesFindMany: vi.fn(),
    mockLineItemsFindMany: vi.fn(),
    mockReservationsFindMany: vi.fn(),
    mockUsersFindFirst: vi.fn(),
    mockUsersFindMany: vi.fn(),
    mockDbInsert: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbSelect: vi.fn(),
    mockGetFioUsernames: vi.fn(),
    chainable: _chainable,
  }
})

vi.mock('@kawakawa/db', () => {
  mockDbInsert.mockReturnValue({ ...chainable, values: vi.fn().mockReturnValue(chainable) })
  mockDbUpdate.mockReturnValue({ ...chainable, set: vi.fn().mockReturnValue(chainable) })
  mockDbSelect.mockReturnValue(chainable)

  return {
    db: {
      query: {
        invoices: { findFirst: mockInvoicesFindFirst, findMany: mockInvoicesFindMany },
        invoiceLineItems: { findMany: mockLineItemsFindMany },
        orderReservations: { findMany: mockReservationsFindMany },
        users: { findFirst: mockUsersFindFirst, findMany: mockUsersFindMany },
        userDiscordProfiles: { findFirst: vi.fn() },
      },
      insert: mockDbInsert,
      update: mockDbUpdate,
      select: mockDbSelect,
    },
    invoices: {
      id: 'id',
      userId: 'userId',
      counterpartyUserId: 'counterpartyUserId',
      status: 'status',
      name: 'name',
      notes: 'notes',
      submittedAt: 'submittedAt',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    invoiceLineItems: {
      id: 'id',
      invoiceId: 'invoiceId',
      sellOrderId: 'sellOrderId',
      buyOrderId: 'buyOrderId',
      reservationId: 'reservationId',
      commodityTicker: 'commodityTicker',
      locationId: 'locationId',
      quantity: 'quantity',
      unitPrice: 'unitPrice',
      currency: 'currency',
      priceListCode: 'priceListCode',
      notes: 'notes',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    orderReservations: {
      id: 'id',
      sellOrderId: 'sellOrderId',
      buyOrderId: 'buyOrderId',
      counterpartyUserId: 'counterpartyUserId',
      quantity: 'quantity',
      status: 'status',
      notes: 'notes',
      expiresAt: 'expiresAt',
      updatedAt: 'updatedAt',
    },
    users: { id: 'id', username: 'username', displayName: 'displayName' },
    userDiscordProfiles: { discordId: 'discordId' },
  }
})

vi.mock('./userSettings.js', () => ({
  getFioUsernames: mockGetFioUsernames,
}))

vi.mock('./locationService.js', () => ({
  formatLocation: vi.fn().mockResolvedValue('Moria Station'),
}))

import {
  getOrCreateInvoice,
  getDraftInvoices,
  getInboxInvoices,
  getSentInvoices,
  getInvoiceWithDetails,
  submitInvoice,
  confirmInvoice,
  rejectInvoice,
  cancelInvoice,
  addLineItems,
  findExistingLineItems,
  updateLineItemQuantity,
  getInvoiceStatusEmoji,
  getInvoiceStatusLabel,
} from './invoiceService.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetFioUsernames.mockResolvedValue(new Map())
})

// ==================== getOrCreateInvoice ====================

describe('getOrCreateInvoice', () => {
  it('returns existing draft invoice', async () => {
    mockInvoicesFindFirst.mockResolvedValue({ id: 42 })

    const result = await getOrCreateInvoice(1, 2)

    expect(result).toEqual({ id: 42, isNew: false })
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('creates new invoice when no draft exists', async () => {
    mockInvoicesFindFirst.mockResolvedValue(null)
    const insertChain = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 99 }]),
      }),
    }
    mockDbInsert.mockReturnValue(insertChain)

    const result = await getOrCreateInvoice(1, 2)

    expect(result).toEqual({ id: 99, isNew: true })
    expect(mockDbInsert).toHaveBeenCalled()
  })
})

// ==================== getDraftInvoices ====================

describe('getDraftInvoices', () => {
  it('returns empty array when no drafts', async () => {
    mockInvoicesFindMany.mockResolvedValue([])

    const result = await getDraftInvoices(1)

    expect(result).toEqual([])
  })

  it('returns summaries with counterparty info', async () => {
    mockInvoicesFindMany.mockResolvedValue([
      {
        id: 1,
        userId: 10,
        counterpartyUserId: 20,
        status: 'draft',
        name: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      },
    ])
    mockUsersFindMany.mockResolvedValue([{ id: 20, username: 'bob', displayName: 'Bob' }])
    mockGetFioUsernames.mockResolvedValue(new Map())
    // Line item stats and commodity stats return empty via select chain
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([]),
    }
    mockDbSelect.mockReturnValue(selectChain)

    const result = await getDraftInvoices(10)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(result[0].counterpartyName).toBe('Bob')
    expect(result[0].direction).toBe('sent')
    expect(result[0].status).toBe('draft')
  })
})

// ==================== getInboxInvoices ====================

describe('getInboxInvoices', () => {
  it('returns empty array when no inbox invoices', async () => {
    mockInvoicesFindMany.mockResolvedValue([])

    const result = await getInboxInvoices(1)

    expect(result).toEqual([])
  })

  it('returns received invoices with creator info', async () => {
    mockInvoicesFindMany.mockResolvedValue([
      {
        id: 5,
        userId: 10,
        counterpartyUserId: 20,
        status: 'pending',
        name: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      },
    ])
    mockUsersFindMany.mockResolvedValue([{ id: 10, username: 'alice', displayName: 'Alice' }])
    mockGetFioUsernames.mockResolvedValue(new Map())
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([]),
    }
    mockDbSelect.mockReturnValue(selectChain)

    const result = await getInboxInvoices(20)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(5)
    // For received invoices, counterpartyName is the creator
    expect(result[0].counterpartyName).toBe('Alice')
    expect(result[0].direction).toBe('received')
  })
})

// ==================== getSentInvoices ====================

describe('getSentInvoices', () => {
  it('returns empty array when no sent invoices', async () => {
    mockInvoicesFindMany.mockResolvedValue([])

    const result = await getSentInvoices(1)

    expect(result).toEqual([])
  })

  it('returns non-draft invoices sent by user', async () => {
    mockInvoicesFindMany.mockResolvedValue([
      {
        id: 3,
        userId: 10,
        counterpartyUserId: 20,
        status: 'pending',
        name: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      },
    ])
    mockUsersFindMany.mockResolvedValue([{ id: 20, username: 'bob', displayName: 'Bob' }])
    mockGetFioUsernames.mockResolvedValue(new Map())
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue([]),
    }
    mockDbSelect.mockReturnValue(selectChain)

    const result = await getSentInvoices(10)

    expect(result).toHaveLength(1)
    expect(result[0].direction).toBe('sent')
    expect(result[0].status).toBe('pending')
  })
})

// ==================== getInvoiceWithDetails ====================

describe('getInvoiceWithDetails', () => {
  it('returns null when invoice not found', async () => {
    mockInvoicesFindFirst.mockResolvedValue(null)

    const result = await getInvoiceWithDetails(999, 1)

    expect(result).toBeNull()
  })

  it('returns details when user is the creator', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'draft',
      name: null,
      notes: null,
      submittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mockUsersFindFirst.mockResolvedValue({ id: 20, username: 'bob', displayName: 'Bob' })
    mockGetFioUsernames.mockResolvedValue(new Map())
    mockLineItemsFindMany.mockResolvedValue([])

    const result = await getInvoiceWithDetails(1, 10)

    expect(result).not.toBeNull()
    expect(result!.userId).toBe(10)
    expect(result!.counterpartyName).toBe('Bob')
  })

  it('returns details when user is the counterparty', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'pending',
      name: null,
      notes: null,
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    // The "other party" is the creator (userId=10)
    mockUsersFindFirst.mockResolvedValue({ id: 10, username: 'alice', displayName: 'Alice' })
    mockGetFioUsernames.mockResolvedValue(new Map())
    mockLineItemsFindMany.mockResolvedValue([])

    const result = await getInvoiceWithDetails(1, 20)

    expect(result).not.toBeNull()
    expect(result!.counterpartyName).toBe('Alice')
  })

  it('includes line item details and totals', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'draft',
      name: null,
      notes: null,
      submittedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    mockUsersFindFirst.mockResolvedValue({ id: 20, username: 'bob', displayName: 'Bob' })
    mockGetFioUsernames.mockResolvedValue(new Map())
    mockLineItemsFindMany.mockResolvedValue([
      {
        id: 1,
        commodityTicker: 'FE',
        locationId: 'MOR',
        quantity: 100,
        unitPrice: '50.00',
        currency: 'CIS',
        sellOrderId: 5,
        buyOrderId: null,
        priceListCode: null,
        notes: null,
        createdAt: new Date(),
      },
      {
        id: 2,
        commodityTicker: 'AL',
        locationId: 'MOR',
        quantity: 200,
        unitPrice: '30.00',
        currency: 'CIS',
        sellOrderId: 6,
        buyOrderId: null,
        priceListCode: null,
        notes: null,
        createdAt: new Date(),
      },
    ])

    const result = await getInvoiceWithDetails(1, 10)

    expect(result!.itemCount).toBe(2)
    expect(result!.lineItems).toHaveLength(2)
    expect(result!.totalsByCurrency).toEqual([
      { currency: 'CIS', total: 11000 }, // 100*50 + 200*30
    ])
  })
})

// ==================== submitInvoice ====================

describe('submitInvoice', () => {
  it('fails when invoice not found', async () => {
    mockInvoicesFindFirst.mockResolvedValue(null)

    const result = await submitInvoice(999, 1)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('fails when invoice has no line items', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'draft',
    })
    mockLineItemsFindMany.mockResolvedValue([])

    const result = await submitInvoice(1, 10)

    expect(result.success).toBe(false)
    expect(result.error).toContain('no line items')
  })

  it('creates reservations and updates status on success', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'draft',
    })
    mockLineItemsFindMany.mockResolvedValue([
      { id: 1, sellOrderId: 5, buyOrderId: null, quantity: 100, notes: null },
      { id: 2, sellOrderId: 6, buyOrderId: null, quantity: 200, notes: null },
    ])

    const insertChain = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 100 }]),
      }),
    }
    mockDbInsert.mockReturnValue(insertChain)

    const updateChain = {
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }
    mockDbUpdate.mockReturnValue(updateChain)

    const result = await submitInvoice(1, 10)

    expect(result.success).toBe(true)
    expect(result.reservationCount).toBe(2)
    // 2 reservations created + 2 line item updates + 1 invoice status update = 5 calls
    expect(mockDbInsert).toHaveBeenCalledTimes(2)
  })
})

// ==================== confirmInvoice ====================

describe('confirmInvoice', () => {
  it('fails when invoice not found or not pending', async () => {
    mockInvoicesFindFirst.mockResolvedValue(null)

    const result = await confirmInvoice(1, 20)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('confirms invoice and updates reservations', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'pending',
    })
    mockLineItemsFindMany.mockResolvedValue([
      { id: 1, reservationId: 100 },
      { id: 2, reservationId: 101 },
    ])

    const updateChain = {
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }
    mockDbUpdate.mockReturnValue(updateChain)

    const result = await confirmInvoice(1, 20)

    expect(result.success).toBe(true)
    // 2 reservation updates + 1 invoice status update = 3 update calls
    expect(mockDbUpdate).toHaveBeenCalledTimes(3)
  })

  it('skips line items without reservations', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'pending',
    })
    mockLineItemsFindMany.mockResolvedValue([
      { id: 1, reservationId: 100 },
      { id: 2, reservationId: null }, // No reservation
    ])

    const updateChain = {
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }
    mockDbUpdate.mockReturnValue(updateChain)

    const result = await confirmInvoice(1, 20)

    expect(result.success).toBe(true)
    // 1 reservation update + 1 invoice status update = 2
    expect(mockDbUpdate).toHaveBeenCalledTimes(2)
  })
})

// ==================== rejectInvoice ====================

describe('rejectInvoice', () => {
  it('fails when invoice not found or not pending', async () => {
    mockInvoicesFindFirst.mockResolvedValue(null)

    const result = await rejectInvoice(1, 20)

    expect(result.success).toBe(false)
  })

  it('rejects invoice and rejects reservations', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'pending',
    })
    mockLineItemsFindMany.mockResolvedValue([{ id: 1, reservationId: 100 }])

    const updateChain = {
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }
    mockDbUpdate.mockReturnValue(updateChain)

    const result = await rejectInvoice(1, 20)

    expect(result.success).toBe(true)
    // 1 reservation update (rejected) + 1 invoice update (cancelled) = 2
    expect(mockDbUpdate).toHaveBeenCalledTimes(2)
  })
})

// ==================== cancelInvoice ====================

describe('cancelInvoice', () => {
  it('fails when invoice not found', async () => {
    mockInvoicesFindFirst.mockResolvedValue(null)

    const result = await cancelInvoice(1, 10)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('fails for fulfilled invoices', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'fulfilled',
    })

    const result = await cancelInvoice(1, 10)

    expect(result.success).toBe(false)
    expect(result.error).toContain('fulfilled')
  })

  it('fails for already cancelled invoices', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'cancelled',
    })

    const result = await cancelInvoice(1, 10)

    expect(result.success).toBe(false)
    expect(result.error).toContain('cancelled')
  })

  it('cancels draft invoice (no reservations to cancel)', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'draft',
    })
    mockLineItemsFindMany.mockResolvedValue([{ id: 1, reservationId: null }])

    const updateChain = {
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }
    mockDbUpdate.mockReturnValue(updateChain)

    const result = await cancelInvoice(1, 10)

    expect(result.success).toBe(true)
    // Only 1 invoice update (no reservations to cancel)
    expect(mockDbUpdate).toHaveBeenCalledTimes(1)
  })

  it('cancels pending invoice with reservations', async () => {
    mockInvoicesFindFirst.mockResolvedValue({
      id: 1,
      userId: 10,
      counterpartyUserId: 20,
      status: 'pending',
    })
    mockLineItemsFindMany.mockResolvedValue([
      { id: 1, reservationId: 100 },
      { id: 2, reservationId: 101 },
    ])

    const updateChain = {
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }
    mockDbUpdate.mockReturnValue(updateChain)

    const result = await cancelInvoice(1, 10)

    expect(result.success).toBe(true)
    // 2 reservation cancellations + 1 invoice cancellation = 3
    expect(mockDbUpdate).toHaveBeenCalledTimes(3)
  })
})

// ==================== addLineItems ====================

describe('addLineItems', () => {
  it('returns empty array for empty input', async () => {
    const result = await addLineItems(1, [])

    expect(result).toEqual([])
    expect(mockDbInsert).not.toHaveBeenCalled()
  })

  it('inserts items and returns mapped results', async () => {
    const insertChain = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 1,
            invoiceId: 1,
            sellOrderId: 5,
            buyOrderId: null,
            reservationId: null,
            commodityTicker: 'FE',
            locationId: 'MOR',
            quantity: 100,
            unitPrice: '50.00',
            currency: 'CIS',
            priceListCode: null,
            notes: null,
          },
        ]),
      }),
    }
    mockDbInsert.mockReturnValue(insertChain)

    const result = await addLineItems(1, [
      {
        sellOrderId: 5,
        commodityTicker: 'FE',
        locationId: 'MOR',
        quantity: 100,
        unitPrice: 50,
        currency: 'CIS',
        priceListCode: null,
      },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].commodityTicker).toBe('FE')
    expect(result[0].unitPrice).toBe(50)
    expect(result[0].totalValue).toBe(5000)
    expect(result[0].orderType).toBe('sell')
  })
})

// ==================== findExistingLineItems ====================

describe('findExistingLineItems', () => {
  it('returns matching line items', async () => {
    mockLineItemsFindMany.mockResolvedValue([
      { id: 1, quantity: 100, unitPrice: '50.00', currency: 'CIS' },
    ])

    const result = await findExistingLineItems(1, 'FE', 'MOR')

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 1, quantity: 100, unitPrice: '50.00', currency: 'CIS' })
  })
})

// ==================== updateLineItemQuantity ====================

describe('updateLineItemQuantity', () => {
  it('calls db update with correct params', async () => {
    const updateChain = {
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }
    mockDbUpdate.mockReturnValue(updateChain)

    await updateLineItemQuantity(1, 500)

    expect(mockDbUpdate).toHaveBeenCalled()
  })
})

// ==================== Status helpers ====================

describe('getInvoiceStatusEmoji', () => {
  it('returns correct emoji for each status', () => {
    expect(getInvoiceStatusEmoji('draft')).toBe('📝')
    expect(getInvoiceStatusEmoji('pending')).toBe('📤')
    expect(getInvoiceStatusEmoji('confirmed')).toBe('✅')
    expect(getInvoiceStatusEmoji('fulfilled')).toBe('🎉')
    expect(getInvoiceStatusEmoji('partially_fulfilled')).toBe('⚠️')
    expect(getInvoiceStatusEmoji('cancelled')).toBe('❌')
  })
})

describe('getInvoiceStatusLabel', () => {
  it('returns correct label for each status', () => {
    expect(getInvoiceStatusLabel('draft')).toBe('Draft')
    expect(getInvoiceStatusLabel('pending')).toBe('Pending')
    expect(getInvoiceStatusLabel('confirmed')).toBe('Confirmed')
    expect(getInvoiceStatusLabel('fulfilled')).toBe('Fulfilled')
    expect(getInvoiceStatusLabel('partially_fulfilled')).toBe('Partially Fulfilled')
    expect(getInvoiceStatusLabel('cancelled')).toBe('Cancelled')
  })
})
