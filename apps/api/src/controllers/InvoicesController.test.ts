import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InvoicesController } from './InvoicesController.js'
import { db } from '../db/index.js'
import { notificationService } from '../services/notificationService.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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
  },
  sellOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    price: 'price',
    currency: 'currency',
    priceListCode: 'priceListCode',
  },
  buyOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    price: 'price',
    currency: 'currency',
    priceListCode: 'priceListCode',
  },
  users: {
    id: 'id',
    displayName: 'displayName',
  },
}))

vi.mock('../services/notificationService.js', () => ({
  notificationService: {
    create: vi.fn(),
  },
}))

vi.mock('../services/price-calculator.js', () => ({
  calculateEffectivePriceWithFallback: vi.fn().mockResolvedValue({ finalPrice: 100 }),
}))

describe('InvoicesController', () => {
  let controller: InvoicesController
  let mockSelect: any
  let mockInsert: any
  let mockUpdate: any
  let mockDelete: any
  const mockUserRequest = { user: { userId: 1, username: 'user1', roles: ['member'] } }
  const _mockOtherUserRequest = { user: { userId: 2, username: 'user2', roles: ['member'] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new InvoicesController()

    // Create mock object first, then assign methods that return it for chaining
    // Each method returns the mock object to allow chaining in any order
    mockSelect = {} as any
    mockSelect.from = vi.fn().mockReturnValue(mockSelect)
    mockSelect.innerJoin = vi.fn().mockReturnValue(mockSelect)
    mockSelect.leftJoin = vi.fn().mockReturnValue(mockSelect)
    mockSelect.where = vi.fn().mockReturnValue(mockSelect)
    mockSelect.orderBy = vi.fn().mockReturnValue(mockSelect)
    mockSelect.groupBy = vi.fn().mockReturnValue(mockSelect)
    mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
    }
    mockUpdate = {} as any
    mockUpdate.set = vi.fn().mockReturnValue(mockUpdate)
    mockUpdate.where = vi.fn().mockReturnValue(mockUpdate)
    mockUpdate.returning = vi.fn().mockReturnValue(mockUpdate)
    mockDelete = {
      where: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(db.select).mockReturnValue(mockSelect)
    vi.mocked(db.insert).mockReturnValue(mockInsert)
    vi.mocked(db.update).mockReturnValue(mockUpdate)
    vi.mocked(db.delete).mockReturnValue(mockDelete)
  })

  const mockInvoice = {
    id: 1,
    userId: 1,
    counterpartyUserId: 2,
    status: 'draft' as const,
    name: null,
    notes: null,
    submittedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  const mockSellOrder = {
    id: 10,
    userId: 2,
    commodityTicker: 'H2O',
    locationId: 'BEN',
    price: '100.00',
    currency: 'CIS' as const,
    priceListCode: null,
  }

  const mockBuyOrder = {
    id: 20,
    userId: 2,
    commodityTicker: 'DW',
    locationId: 'BEN',
    price: '50.00',
    currency: 'CIS' as const,
    priceListCode: null,
  }

  const mockLineItem = {
    id: 100,
    invoiceId: 1,
    sellOrderId: 10,
    buyOrderId: null,
    reservationId: null,
    commodityTicker: 'H2O',
    locationId: 'BEN',
    quantity: 500,
    unitPrice: '100.00',
    currency: 'CIS' as const,
    priceListCode: null,
    notes: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  describe('getInvoices', () => {
    it('should return empty array when user has no invoices', async () => {
      mockSelect.orderBy.mockResolvedValueOnce([])

      const result = await controller.getInvoices(mockUserRequest)

      expect(result).toEqual([])
    })

    it('should return invoices with counterparty names and totals', async () => {
      // Track which query we're on based on terminal method
      // Query 1: .from(invoices).where().orderBy() -> invoices
      // Query 2: .from(users).where() -> counterparty names
      // Query 3: .from(lineItems).where().groupBy() -> stats
      // Query 4: .from(lineItems).leftJoin().where() -> reservation statuses
      mockSelect.orderBy.mockResolvedValueOnce([mockInvoice])
      mockSelect.groupBy.mockResolvedValueOnce([
        { invoiceId: 1, count: 2, currency: 'CIS', total: '500.00', orderType: 'sell' },
      ])
      // where() is called in query 1 and 3 as intermediate, and in query 2 and 4 as terminal
      // So we need: return mockSelect (query 1), resolve [counterparties] (query 2), return mockSelect (query 3), resolve [statuses] (query 4)
      let whereCallCount = 0
      mockSelect.where.mockImplementation(() => {
        whereCallCount++
        if (whereCallCount === 2) {
          // Query 2 - terminal where for users, return promise
          return Promise.resolve([{ id: 2, displayName: 'Partner' }])
        }
        if (whereCallCount === 4) {
          // Query 4 - terminal where for reservation statuses, return promise
          return Promise.resolve([{ invoiceId: 1, reservationStatus: null }])
        }
        // Other calls - continue chain
        return mockSelect
      })

      const result = await controller.getInvoices(mockUserRequest)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
      expect(result[0].counterpartyName).toBe('Partner')
      expect(result[0].itemCount).toBe(2)
      expect(result[0].totalsByCurrency).toEqual([{ currency: 'CIS', total: 500 }])
    })

    it('should filter by status when provided', async () => {
      mockSelect.orderBy.mockResolvedValueOnce([])

      await controller.getInvoices(mockUserRequest, 'draft')

      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getInvoice', () => {
    it('should return invoice with line items', async () => {
      // Get invoice
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // Get counterparty
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Partner' }])
      // Get line items
      mockSelect.orderBy.mockResolvedValueOnce([mockLineItem])

      const result = await controller.getInvoice(1, mockUserRequest)

      expect(result.id).toBe(1)
      expect(result.counterpartyName).toBe('Partner')
      expect(result.lineItems).toHaveLength(1)
      expect(result.lineItems[0].commodityTicker).toBe('H2O')
      expect(result.lineItems[0].orderType).toBe('sell')
      expect(result.lineItems[0].totalValue).toBe(50000)
    })

    it('should throw NotFound if invoice does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.getInvoice(999, mockUserRequest)).rejects.toThrow('Invoice not found')
    })

    it('should throw Forbidden if user is not the owner', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, userId: 99 }])

      await expect(controller.getInvoice(1, mockUserRequest)).rejects.toThrow(
        'You do not have access to this invoice'
      )
    })
  })

  describe('getOrCreateForPartner', () => {
    it('should return existing draft invoice if one exists', async () => {
      // Check counterparty exists
      mockSelect.where.mockResolvedValueOnce([{ id: 2, displayName: 'Partner' }])
      // Find existing draft
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // getInvoice flow: get invoice
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // getInvoice: get counterparty
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Partner' }])
      // getInvoice: get line items
      mockSelect.orderBy.mockResolvedValueOnce([])

      const result = await controller.getOrCreateForPartner(2, mockUserRequest)

      expect(result.id).toBe(1)
      expect(result.counterpartyUserId).toBe(2)
    })

    it('should create new invoice if no draft exists', async () => {
      // Check counterparty exists
      mockSelect.where.mockResolvedValueOnce([{ id: 2, displayName: 'Partner' }])
      // No existing draft
      mockSelect.where.mockResolvedValueOnce([])
      // Insert new invoice
      mockInsert.returning.mockResolvedValueOnce([mockInvoice])

      const result = await controller.getOrCreateForPartner(2, mockUserRequest)

      expect(result.id).toBe(1)
      expect(result.lineItems).toEqual([])
      expect(db.insert).toHaveBeenCalled()
    })

    it('should throw BadRequest if trying to create invoice with yourself', async () => {
      await expect(controller.getOrCreateForPartner(1, mockUserRequest)).rejects.toThrow(
        'Cannot create an invoice with yourself'
      )
    })

    it('should throw NotFound if counterparty does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.getOrCreateForPartner(999, mockUserRequest)).rejects.toThrow(
        'User not found'
      )
    })
  })

  describe('createInvoice', () => {
    it('should create a new invoice', async () => {
      // Check counterparty exists
      mockSelect.where.mockResolvedValueOnce([{ id: 2, displayName: 'Partner' }])
      // Insert invoice
      mockInsert.returning.mockResolvedValueOnce([mockInvoice])

      const result = await controller.createInvoice(
        { counterpartyUserId: 2, name: 'Test Invoice' },
        mockUserRequest
      )

      expect(result.id).toBe(1)
      expect(result.status).toBe('draft')
      expect(result.counterpartyUserId).toBe(2)
    })

    it('should throw BadRequest if creating invoice with yourself', async () => {
      await expect(
        controller.createInvoice({ counterpartyUserId: 1 }, mockUserRequest)
      ).rejects.toThrow('Cannot create an invoice with yourself')
    })

    it('should throw NotFound if counterparty does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(
        controller.createInvoice({ counterpartyUserId: 999 }, mockUserRequest)
      ).rejects.toThrow('Counterparty user not found')
    })
  })

  describe('updateInvoice', () => {
    it('should update invoice name and notes', async () => {
      // Get invoice
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // Update
      mockUpdate.where.mockResolvedValueOnce(undefined)
      // getInvoice flow
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Partner' }])
      mockSelect.orderBy.mockResolvedValueOnce([])

      const result = await controller.updateInvoice(
        1,
        { name: 'Updated Name', notes: 'New notes' },
        mockUserRequest
      )

      expect(result.id).toBe(1)
      expect(db.update).toHaveBeenCalled()
    })

    it('should throw NotFound if invoice does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(
        controller.updateInvoice(999, { name: 'Test' }, mockUserRequest)
      ).rejects.toThrow('Invoice not found')
    })

    it('should throw Forbidden if user is not owner', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, userId: 99 }])

      await expect(controller.updateInvoice(1, { name: 'Test' }, mockUserRequest)).rejects.toThrow(
        'You do not have access to this invoice'
      )
    })

    it('should throw BadRequest if invoice is not draft', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, status: 'submitted' }])

      await expect(controller.updateInvoice(1, { name: 'Test' }, mockUserRequest)).rejects.toThrow(
        'Only draft invoices can be updated'
      )
    })
  })

  describe('deleteInvoice', () => {
    it('should delete a draft invoice', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      mockDelete.where.mockResolvedValueOnce(undefined)

      await controller.deleteInvoice(1, mockUserRequest)

      expect(db.delete).toHaveBeenCalled()
    })

    it('should throw NotFound if invoice does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.deleteInvoice(999, mockUserRequest)).rejects.toThrow(
        'Invoice not found'
      )
    })

    it('should throw Forbidden if user is not owner', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, userId: 99 }])

      await expect(controller.deleteInvoice(1, mockUserRequest)).rejects.toThrow(
        'You do not have access to this invoice'
      )
    })

    it('should throw BadRequest if invoice is not draft', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, status: 'submitted' }])

      await expect(controller.deleteInvoice(1, mockUserRequest)).rejects.toThrow(
        'Only draft invoices can be deleted'
      )
    })
  })

  describe('addLineItem', () => {
    it('should add a line item from a sell order', async () => {
      // Get invoice
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // Check for existing line item (none found)
      mockSelect.where.mockResolvedValueOnce([])
      // Get sell order
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      // Insert line item
      mockInsert.returning.mockResolvedValueOnce([mockLineItem])
      // Update invoice timestamp
      mockUpdate.where.mockResolvedValueOnce(undefined)

      const result = await controller.addLineItem(
        1,
        { sellOrderId: 10, quantity: 500 },
        mockUserRequest
      )

      expect(result.id).toBe(100)
      expect(result.commodityTicker).toBe('H2O')
      expect(result.quantity).toBe(500)
      expect(result.orderType).toBe('sell')
    })

    it('should update existing line item quantity when order already in invoice', async () => {
      const existingLineItem = { ...mockLineItem, quantity: 200 }
      const updatedLineItem = { ...mockLineItem, quantity: 500 }
      // Get invoice
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // Check for existing line item (found!)
      mockSelect.where.mockResolvedValueOnce([existingLineItem])
      // Update line item - need proper chain mock for .update().set().where().returning()
      let updateCallCount = 0
      mockUpdate.returning.mockImplementation(() => {
        return Promise.resolve([updatedLineItem])
      })
      mockUpdate.where.mockImplementation(() => {
        updateCallCount++
        if (updateCallCount === 1) {
          // First where is part of the returning chain
          return mockUpdate
        }
        // Second where is the timestamp update (no returning)
        return Promise.resolve(undefined)
      })

      const result = await controller.addLineItem(
        1,
        { sellOrderId: 10, quantity: 500 },
        mockUserRequest
      )

      expect(result.quantity).toBe(500)
      expect(result.orderType).toBe('sell')
    })

    it('should add a line item from a buy order', async () => {
      const buyLineItem = {
        ...mockLineItem,
        sellOrderId: null,
        buyOrderId: 20,
        commodityTicker: 'DW',
        unitPrice: '50.00',
      }
      // Get invoice
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // Check for existing line item (none found)
      mockSelect.where.mockResolvedValueOnce([])
      // Get buy order
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      // Insert line item
      mockInsert.returning.mockResolvedValueOnce([buyLineItem])
      // Update invoice timestamp
      mockUpdate.where.mockResolvedValueOnce(undefined)

      const result = await controller.addLineItem(
        1,
        { buyOrderId: 20, quantity: 100 },
        mockUserRequest
      )

      expect(result.commodityTicker).toBe('DW')
      expect(result.orderType).toBe('buy')
    })

    it('should throw NotFound if invoice does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(
        controller.addLineItem(999, { sellOrderId: 10, quantity: 100 }, mockUserRequest)
      ).rejects.toThrow('Invoice not found')
    })

    it('should throw Forbidden if user is not owner', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, userId: 99 }])

      await expect(
        controller.addLineItem(1, { sellOrderId: 10, quantity: 100 }, mockUserRequest)
      ).rejects.toThrow('You do not have access to this invoice')
    })

    it('should throw BadRequest if invoice is not draft', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, status: 'submitted' }])

      await expect(
        controller.addLineItem(1, { sellOrderId: 10, quantity: 100 }, mockUserRequest)
      ).rejects.toThrow('Can only add items to draft invoices')
    })

    it('should throw BadRequest if quantity is zero', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])

      await expect(
        controller.addLineItem(1, { sellOrderId: 10, quantity: 0 }, mockUserRequest)
      ).rejects.toThrow('Quantity must be greater than 0')
    })

    it('should throw BadRequest if no order specified', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])

      await expect(controller.addLineItem(1, { quantity: 100 }, mockUserRequest)).rejects.toThrow(
        'Must specify sellOrderId, buyOrderId, or reservationId'
      )
    })

    it('should throw BadRequest if sell order owner does not match counterparty', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // Check for existing line item (none found)
      mockSelect.where.mockResolvedValueOnce([])
      mockSelect.where.mockResolvedValueOnce([{ ...mockSellOrder, userId: 999 }])

      await expect(
        controller.addLineItem(1, { sellOrderId: 10, quantity: 100 }, mockUserRequest)
      ).rejects.toThrow('Sell order owner must match invoice counterparty')
    })
  })

  describe('updateLineItem', () => {
    it('should update line item quantity', async () => {
      const updatedLineItem = { ...mockLineItem, quantity: 1000 }
      // Get invoice
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // Get line item
      mockSelect.where.mockResolvedValueOnce([mockLineItem])
      // Update line item - returning() is called first, then update timestamp where() is second
      let updateCallCount = 0
      mockUpdate.returning.mockImplementation(() => {
        return Promise.resolve([updatedLineItem])
      })
      mockUpdate.where.mockImplementation(() => {
        updateCallCount++
        if (updateCallCount === 1) {
          // First where is part of the returning chain
          return mockUpdate
        }
        // Second where is the timestamp update (no returning)
        return Promise.resolve(undefined)
      })

      const result = await controller.updateLineItem(1, 100, { quantity: 1000 }, mockUserRequest)

      expect(result.quantity).toBe(1000)
    })

    it('should throw NotFound if line item does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      mockSelect.where.mockResolvedValueOnce([])

      await expect(
        controller.updateLineItem(1, 999, { quantity: 100 }, mockUserRequest)
      ).rejects.toThrow('Line item not found')
    })

    it('should throw BadRequest if quantity is zero', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      mockSelect.where.mockResolvedValueOnce([mockLineItem])

      await expect(
        controller.updateLineItem(1, 100, { quantity: 0 }, mockUserRequest)
      ).rejects.toThrow('Quantity must be greater than 0')
    })
  })

  describe('removeLineItem', () => {
    it('should remove a line item', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      mockSelect.where.mockResolvedValueOnce([mockLineItem])
      mockDelete.where.mockResolvedValueOnce(undefined)
      mockUpdate.where.mockResolvedValueOnce(undefined)

      await controller.removeLineItem(1, 100, mockUserRequest)

      expect(db.delete).toHaveBeenCalled()
    })

    it('should throw NotFound if line item does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.removeLineItem(1, 999, mockUserRequest)).rejects.toThrow(
        'Line item not found'
      )
    })
  })

  describe('submitInvoice', () => {
    it('should create reservations for all line items and update status', async () => {
      // Get invoice
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      // Get line items
      mockSelect.where.mockResolvedValueOnce([mockLineItem])
      // Create reservation
      mockInsert.returning.mockResolvedValueOnce([{ id: 200 }])
      // Update line item with reservation ID
      mockUpdate.where.mockResolvedValueOnce(undefined)
      // Update invoice status
      mockUpdate.where.mockResolvedValueOnce(undefined)
      // Get user name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'User One' }])
      // Notification
      vi.mocked(notificationService.create).mockResolvedValue({} as any)
      // getInvoice flow for return
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, status: 'submitted' }])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Partner' }])
      mockSelect.orderBy.mockResolvedValueOnce([{ ...mockLineItem, reservationId: 200 }])

      const result = await controller.submitInvoice(1, mockUserRequest)

      expect(result.reservationsCreated).toBe(1)
      expect(result.errors).toEqual([])
      expect(notificationService.create).toHaveBeenCalledWith(
        2,
        'invoice_submitted',
        'Invoice Submitted',
        expect.stringContaining('User One'),
        expect.objectContaining({ invoiceId: 1 })
      )
    })

    it('should throw BadRequest if invoice is empty', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.submitInvoice(1, mockUserRequest)).rejects.toThrow(
        'Cannot submit an empty invoice'
      )
    })

    it('should throw BadRequest if invoice is not draft', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, status: 'submitted' }])

      await expect(controller.submitInvoice(1, mockUserRequest)).rejects.toThrow(
        'Only draft invoices can be submitted'
      )
    })

    it('should skip line items that already have reservations', async () => {
      const lineItemWithReservation = { ...mockLineItem, reservationId: 150 }
      mockSelect.where.mockResolvedValueOnce([mockInvoice])
      mockSelect.where.mockResolvedValueOnce([lineItemWithReservation])
      // Update invoice status (no reservation created since it already exists)
      mockUpdate.where.mockResolvedValueOnce(undefined)
      // Get user name
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'User One' }])
      vi.mocked(notificationService.create).mockResolvedValue({} as any)
      // getInvoice flow
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, status: 'submitted' }])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Partner' }])
      mockSelect.orderBy.mockResolvedValueOnce([lineItemWithReservation])

      const result = await controller.submitInvoice(1, mockUserRequest)

      expect(result.reservationsCreated).toBe(0)
    })
  })

  describe('cancelInvoice', () => {
    it('should cancel pending reservations and update status', async () => {
      const submittedInvoice = { ...mockInvoice, status: 'submitted' as const }
      const lineItemWithReservation = { ...mockLineItem, reservationId: 200 }
      // After cancellation, line item should have cancelled reservation status
      const cancelledLineItem = { ...lineItemWithReservation, reservationStatus: 'cancelled' }

      // Get invoice
      mockSelect.where.mockResolvedValueOnce([submittedInvoice])
      // Get line items
      mockSelect.where.mockResolvedValueOnce([lineItemWithReservation])
      // Cancel reservation
      mockUpdate.where.mockResolvedValueOnce(undefined)
      // Update invoice status
      mockUpdate.where.mockResolvedValueOnce(undefined)
      // Get user name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'User One' }])
      vi.mocked(notificationService.create).mockResolvedValue({} as any)
      // getInvoice flow - now includes leftJoin for reservation status
      mockSelect.where.mockResolvedValueOnce([{ ...submittedInvoice, status: 'cancelled' }])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Partner' }])
      // getInvoice uses orderBy as terminal for line items with reservation status joined
      mockSelect.orderBy.mockResolvedValueOnce([cancelledLineItem])

      const result = await controller.cancelInvoice(1, mockUserRequest)

      expect(result.status).toBe('cancelled')
      expect(notificationService.create).toHaveBeenCalledWith(
        2,
        'invoice_cancelled',
        'Invoice Cancelled',
        expect.any(String),
        expect.objectContaining({ invoiceId: 1 })
      )
    })

    it('should throw BadRequest if invoice is not submitted', async () => {
      mockSelect.where.mockResolvedValueOnce([mockInvoice])

      await expect(controller.cancelInvoice(1, mockUserRequest)).rejects.toThrow(
        'Only submitted invoices can be cancelled'
      )
    })

    it('should throw Forbidden if user is not owner', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockInvoice, status: 'submitted', userId: 99 }])

      await expect(controller.cancelInvoice(1, mockUserRequest)).rejects.toThrow(
        'You do not have access to this invoice'
      )
    })
  })
})
