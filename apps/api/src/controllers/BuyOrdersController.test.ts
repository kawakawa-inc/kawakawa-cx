import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuyOrdersController } from './BuyOrdersController.js'

// Mock db
const mockSelectFrom = vi.fn()
const mockSelectLeftJoin = vi.fn()
const mockSelectWhere = vi.fn()
const mockInsertValues = vi.fn()
const mockInsertReturning = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()
const mockDeleteWhere = vi.fn()
const mockSelectInnerJoin = vi.fn()

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({ from: mockSelectFrom })),
    insert: vi.fn(() => ({ values: mockInsertValues })),
    update: vi.fn(() => ({ set: mockUpdateSet })),
    delete: vi.fn(() => ({ where: mockDeleteWhere })),
  },
  buyOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    quantity: 'quantity',
    price: 'price',
    currency: 'currency',
    priceListCode: 'priceListCode',
    orderType: 'orderType',
    sourceMode: 'sourceMode',
    demandSource: 'demandSource',
    targetDays: 'targetDays',
  },
  fioCommodities: { ticker: 'ticker' },
  fioLocations: { naturalId: 'naturalId' },
  orderReservations: {
    buyOrderId: 'buyOrderId',
    status: 'status',
    quantity: 'quantity',
    expiresAt: 'expiresAt',
  },
}))

vi.mock('../utils/permissionService.js', () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}))

vi.mock('../services/price-calculator.js', () => ({
  calculateEffectivePriceWithFallback: vi.fn().mockResolvedValue(null),
  calculateEffectivePriceBatch: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('../services/demand-calculator.js', () => ({
  recalculateSingleDemandOrder: vi.fn().mockResolvedValue(100),
}))

describe('BuyOrdersController', () => {
  let controller: BuyOrdersController
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: ['member'] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new BuyOrdersController()

    // innerJoin returns a thenable (for await without .where()) that also has .where()
    mockSelectInnerJoin.mockImplementation(() => {
      const result: any = Promise.resolve([])
      result.where = mockSelectWhere
      return result
    })

    mockSelectFrom.mockImplementation(() => ({
      leftJoin: mockSelectLeftJoin.mockReturnValue({ where: mockSelectWhere }),
      innerJoin: mockSelectInnerJoin,
      where: mockSelectWhere,
      as: vi.fn(), // for subqueries
      groupBy: vi.fn().mockReturnValue({ as: vi.fn() }),
    }))

    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockUpdateWhere.mockResolvedValue(undefined)
    mockDeleteWhere.mockResolvedValue(undefined)
  })

  describe('createBuyOrder', () => {
    it('should create a manual buy order (backward compatible)', async () => {
      // All select().from()...where() calls return appropriate mocks in sequence
      mockSelectWhere
        .mockResolvedValueOnce([{ ticker: 'CAF' }]) // commodity exists
        .mockResolvedValueOnce([{ naturalId: 'BEN' }]) // location exists
        .mockResolvedValueOnce([]) // no duplicate
        .mockResolvedValue([]) // linked planets query (empty for manual)

      mockInsertReturning.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'CAF',
          locationId: 'BEN',
          quantity: 100,
          price: '50.00',
          currency: 'ICA',
          priceListCode: null,
          orderType: 'internal',
          sourceMode: 'manual',
          demandSource: null,
          targetDays: null,
        },
      ])

      const result = await controller.createBuyOrder(
        {
          commodityTicker: 'CAF',
          locationId: 'BEN',
          quantity: 100,
          price: 50,
          currency: 'ICA',
        },
        mockRequest
      )

      expect(result.id).toBe(1)
      expect(result.sourceMode).toBe('manual')
      expect(result.demandSource).toBeNull()
      expect(result.quantity).toBe(100)
    })

    it('should reject demand order without demandSource', async () => {
      await expect(
        controller.createBuyOrder(
          {
            commodityTicker: 'CAF',
            locationId: 'BEN',
            quantity: 0,
            price: 50,
            currency: 'ICA',
            sourceMode: 'demand',
          },
          mockRequest
        )
      ).rejects.toThrow('demandSource is required')
    })

    it('should reject burn demand order without targetDays', async () => {
      await expect(
        controller.createBuyOrder(
          {
            commodityTicker: 'CAF',
            locationId: 'BEN',
            quantity: 0,
            price: 50,
            currency: 'ICA',
            sourceMode: 'demand',
            demandSource: 'burn',
          },
          mockRequest
        )
      ).rejects.toThrow('targetDays must be > 0')
    })
  })

  describe('recalculateOrder', () => {
    it('should recalculate a demand order', async () => {
      // The select chain: select().from().where() — need both the from().where() path
      // recalculateOrder queries with and(eq(id), eq(userId))
      mockSelectWhere.mockResolvedValueOnce([{ id: 1, sourceMode: 'demand' }])

      const result = await controller.recalculateOrder(1, mockRequest)

      expect(result.quantity).toBe(100)
    })

    it('should reject recalculating a manual order', async () => {
      mockSelectWhere.mockReset()
      mockSelectWhere.mockResolvedValueOnce([{ id: 1, sourceMode: 'manual' }])

      await expect(controller.recalculateOrder(1, mockRequest)).rejects.toThrow(
        'Only demand orders can be recalculated'
      )
    })

    it('should throw NotFound for non-existent order', async () => {
      mockSelectWhere.mockReset()
      mockSelectWhere.mockResolvedValueOnce([])

      await expect(controller.recalculateOrder(999, mockRequest)).rejects.toThrow(
        'Buy order not found'
      )
    })
  })
})
