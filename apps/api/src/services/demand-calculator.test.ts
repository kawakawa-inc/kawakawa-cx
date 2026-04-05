import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getStockAtLocation,
  calculateBurnNeed,
  calculateRepairNeed,
  recalculateSingleDemandOrder,
  recalculateDemandOrders,
} from './demand-calculator.js'

// Mock DB
const mockSelectFrom = vi.fn()
const mockSelectInnerJoin = vi.fn()
const mockSelectWhere = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: mockSelectFrom.mockReturnValue({
        innerJoin: mockSelectInnerJoin.mockReturnValue({
          where: mockSelectWhere,
        }),
        where: mockSelectWhere,
      }),
    })),
    update: vi.fn(() => ({
      set: mockUpdateSet.mockReturnValue({
        where: mockUpdateWhere,
      }),
    })),
  },
  buyOrders: { id: 'id', userId: 'userId', sourceMode: 'sourceMode', quantity: 'quantity' },
  buyOrderPlanets: { buyOrderId: 'buyOrderId', userPlanetId: 'userPlanetId' },
  fioPlanetWorkforce: { userPlanetId: 'userPlanetId', needs: 'needs' },
  fioPlanetBuildings: { userPlanetId: 'userPlanetId', repairMaterials: 'repairMaterials' },
  fioInventory: {
    userStorageId: 'userStorageId',
    commodityTicker: 'commodityTicker',
    quantity: 'quantity',
  },
  fioUserStorage: { id: 'id', userId: 'userId', locationId: 'locationId' },
}))

describe('demand-calculator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectFrom.mockReturnValue({
      innerJoin: mockSelectInnerJoin.mockReturnValue({
        where: mockSelectWhere,
      }),
      where: mockSelectWhere,
    })
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockUpdateWhere.mockResolvedValue(undefined)
  })

  describe('getStockAtLocation', () => {
    it('should sum inventory across storage types', async () => {
      mockSelectWhere.mockResolvedValue([{ quantity: 100 }, { quantity: 50 }])

      const stock = await getStockAtLocation(1, 'CAF', 'BEN')
      expect(stock).toBe(150)
    })

    it('should return 0 when no inventory', async () => {
      mockSelectWhere.mockResolvedValue([])

      const stock = await getStockAtLocation(1, 'CAF', 'BEN')
      expect(stock).toBe(0)
    })
  })

  describe('calculateBurnNeed', () => {
    it('should sum burn rates across planets and multiply by days', async () => {
      // Two workforce entries across linked planets
      mockSelectWhere.mockResolvedValue([
        {
          needs: [
            { MaterialTicker: 'CAF', UnitsPerInterval: 72.15, Essential: false },
            { MaterialTicker: 'RAT', UnitsPerInterval: 30.0, Essential: true },
          ],
        },
        {
          needs: [{ MaterialTicker: 'CAF', UnitsPerInterval: 72.15, Essential: false }],
        },
      ])

      const need = await calculateBurnNeed('CAF', [1, 2], 30)
      // ceil((72.15 + 72.15) * 30) = ceil(4329) = 4329
      expect(need).toBe(4329)
    })

    it('should return 0 for empty planet list', async () => {
      const need = await calculateBurnNeed('CAF', [], 30)
      expect(need).toBe(0)
    })

    it('should return 0 for 0 target days', async () => {
      const need = await calculateBurnNeed('CAF', [1], 0)
      expect(need).toBe(0)
    })

    it('should return 0 when commodity not in burn data', async () => {
      mockSelectWhere.mockResolvedValue([
        {
          needs: [{ MaterialTicker: 'RAT', UnitsPerInterval: 30.0, Essential: true }],
        },
      ])

      const need = await calculateBurnNeed('CAF', [1], 30)
      expect(need).toBe(0)
    })

    it('should ceil fractional results', async () => {
      mockSelectWhere.mockResolvedValue([
        {
          needs: [{ MaterialTicker: 'CAF', UnitsPerInterval: 0.1, Essential: false }],
        },
      ])

      const need = await calculateBurnNeed('CAF', [1], 7)
      // ceil(0.1 * 7) = ceil(0.7) = 1
      expect(need).toBe(1)
    })
  })

  describe('calculateRepairNeed', () => {
    it('should sum repair materials across linked planets', async () => {
      mockSelectWhere.mockResolvedValue([
        {
          repairMaterials: [
            { MaterialTicker: 'BBH', MaterialAmount: 50 },
            { MaterialTicker: 'INS', MaterialAmount: 100 },
          ],
        },
        {
          repairMaterials: [{ MaterialTicker: 'BBH', MaterialAmount: 100 }],
        },
      ])

      const need = await calculateRepairNeed('BBH', [1, 2])
      expect(need).toBe(150)
    })

    it('should return 0 for empty planet list', async () => {
      const need = await calculateRepairNeed('BBH', [])
      expect(need).toBe(0)
    })

    it('should return 0 when commodity not in repair data', async () => {
      mockSelectWhere.mockResolvedValue([
        {
          repairMaterials: [{ MaterialTicker: 'INS', MaterialAmount: 100 }],
        },
      ])

      const need = await calculateRepairNeed('BBH', [1])
      expect(need).toBe(0)
    })
  })

  describe('recalculateSingleDemandOrder', () => {
    it('should return null for manual orders', async () => {
      mockSelectWhere.mockResolvedValueOnce([
        { id: 1, sourceMode: 'manual', commodityTicker: 'CAF', locationId: 'BEN', userId: 1 },
      ])

      const result = await recalculateSingleDemandOrder(1)
      expect(result).toBeNull()
    })

    it('should return null for non-existent orders', async () => {
      mockSelectWhere.mockResolvedValueOnce([])

      const result = await recalculateSingleDemandOrder(999)
      expect(result).toBeNull()
    })

    it('should calculate burn demand and subtract stock', async () => {
      // Order lookup
      mockSelectWhere.mockResolvedValueOnce([
        {
          id: 1,
          sourceMode: 'demand',
          demandSource: 'burn',
          targetDays: 30,
          commodityTicker: 'CAF',
          locationId: 'BEN',
          userId: 1,
          quantity: 0,
        },
      ])

      // Linked planets
      mockSelectWhere.mockResolvedValueOnce([{ userPlanetId: 10 }, { userPlanetId: 11 }])

      // Burn data (from calculateBurnNeed)
      mockSelectWhere.mockResolvedValueOnce([
        {
          needs: [{ MaterialTicker: 'CAF', UnitsPerInterval: 72.15, Essential: false }],
        },
        {
          needs: [{ MaterialTicker: 'CAF', UnitsPerInterval: 72.15, Essential: false }],
        },
      ])

      // Stock at location (from getStockAtLocation)
      mockSelectWhere.mockResolvedValueOnce([{ quantity: 2000 }])

      const result = await recalculateSingleDemandOrder(1)

      // ceil((72.15 + 72.15) * 30) - 2000 = 4329 - 2000 = 2329
      expect(result).toBe(2329)
    })

    it('should return 0 when stock exceeds need', async () => {
      mockSelectWhere.mockResolvedValueOnce([
        {
          id: 1,
          sourceMode: 'demand',
          demandSource: 'burn',
          targetDays: 7,
          commodityTicker: 'CAF',
          locationId: 'BEN',
          userId: 1,
          quantity: 100,
        },
      ])

      mockSelectWhere.mockResolvedValueOnce([{ userPlanetId: 10 }])

      // Small burn
      mockSelectWhere.mockResolvedValueOnce([
        { needs: [{ MaterialTicker: 'CAF', UnitsPerInterval: 1.0, Essential: false }] },
      ])

      // Lots of stock
      mockSelectWhere.mockResolvedValueOnce([{ quantity: 500 }])

      const result = await recalculateSingleDemandOrder(1)

      // ceil(1.0 * 7) - 500 = 7 - 500 = -493 → max(0, -493) = 0
      expect(result).toBe(0)
    })
  })

  describe('recalculateDemandOrders', () => {
    it('should return empty result when user has no demand orders', async () => {
      mockSelectWhere.mockResolvedValueOnce([]) // no demand orders

      const result = await recalculateDemandOrders(1)

      expect(result.ordersProcessed).toBe(0)
      expect(result.ordersUpdated).toBe(0)
      expect(result.errors).toHaveLength(0)
    })
  })
})
