import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getFilteredStock,
  calculateLineDemand,
  calculateDeficit,
  recalculateSingleDemandOrder,
  recalculateDemandOrders,
  recalculateSingleDemandReserve,
  recalculateDemandReserves,
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
  sellOrders: {
    id: 'id',
    userId: 'userId',
    reserveSource: 'reserveSource',
    limitQuantity: 'limitQuantity',
  },
  supplyChainLines: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    sourceLocationId: 'sourceLocationId',
    mode: 'mode',
    demandSource: 'demandSource',
    demand: 'demand',
    destinationPlanetId: 'destinationPlanetId',
    sourceStorageTypes: 'sourceStorageTypes',
    destinationStorageTypes: 'destinationStorageTypes',
  },
  fioUserPlanets: { id: 'id', userId: 'userId', planetNaturalId: 'planetNaturalId' },
  fioPlanetWorkforce: { userPlanetId: 'userPlanetId', needs: 'needs' },
  fioPlanetBuildings: { userPlanetId: 'userPlanetId', repairMaterials: 'repairMaterials' },
  fioPlanetProduction: { userPlanetId: 'userPlanetId', condition: 'condition', orders: 'orders' },
  fioInventory: {
    userStorageId: 'userStorageId',
    commodityTicker: 'commodityTicker',
    quantity: 'quantity',
  },
  fioUserStorage: { id: 'id', userId: 'userId', locationId: 'locationId', type: 'type' },
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

  describe('getFilteredStock', () => {
    it('should sum inventory filtered by storage types', async () => {
      mockSelectWhere.mockResolvedValue([
        { quantity: 100, storageType: 'STORE' },
        { quantity: 50, storageType: 'WAREHOUSE_STORE' },
        { quantity: 200, storageType: 'STORE' },
      ])

      const stock = await getFilteredStock(1, 'CAF', 'BEN', ['STORE'])
      expect(stock).toBe(300) // Only STORE types
    })

    it('should include all specified storage types', async () => {
      mockSelectWhere.mockResolvedValue([
        { quantity: 100, storageType: 'STORE' },
        { quantity: 50, storageType: 'WAREHOUSE_STORE' },
      ])

      const stock = await getFilteredStock(1, 'CAF', 'BEN', ['STORE', 'WAREHOUSE_STORE'])
      expect(stock).toBe(150)
    })

    it('should return 0 when no inventory', async () => {
      mockSelectWhere.mockResolvedValue([])

      const stock = await getFilteredStock(1, 'CAF', 'BEN', ['STORE'])
      expect(stock).toBe(0)
    })
  })

  describe('calculateLineDemand', () => {
    it('should return fixed demand when set', async () => {
      const demand = await calculateLineDemand(
        { commodityTicker: 'DW', destinationPlanetId: 'UV-351a', demandSource: null, demand: 500 },
        1,
        30
      )
      expect(demand).toBe(500)
    })

    it('should return 0 when no demandSource and no demand', async () => {
      const demand = await calculateLineDemand(
        { commodityTicker: 'DW', destinationPlanetId: 'UV-351a', demandSource: null, demand: null },
        1,
        30
      )
      expect(demand).toBe(0)
    })

    it('should calculate consumables burn', async () => {
      // Planet lookup
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      // Workforce data
      mockSelectWhere.mockResolvedValueOnce([
        {
          needs: [
            { MaterialTicker: 'CAF', UnitsPerInterval: 72.15, Essential: false },
            { MaterialTicker: 'RAT', UnitsPerInterval: 30.0, Essential: true },
          ],
        },
      ])

      const demand = await calculateLineDemand(
        {
          commodityTicker: 'CAF',
          destinationPlanetId: 'UV-351a',
          demandSource: 'consumables',
          demand: null,
        },
        1,
        30
      )
      // ceil(72.15 * 30) = ceil(2164.5) = 2165
      expect(demand).toBe(2165)
    })

    it('should calculate repair need', async () => {
      // Planet lookup
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      // Building data
      mockSelectWhere.mockResolvedValueOnce([
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

      const demand = await calculateLineDemand(
        {
          commodityTicker: 'BBH',
          destinationPlanetId: 'UV-351a',
          demandSource: 'repair',
          demand: null,
        },
        1,
        0
      )
      expect(demand).toBe(150)
    })

    it('should return 0 when planet not found', async () => {
      mockSelectWhere.mockResolvedValueOnce([]) // planet not found

      const demand = await calculateLineDemand(
        {
          commodityTicker: 'CAF',
          destinationPlanetId: 'UNKNOWN',
          demandSource: 'consumables',
          demand: null,
        },
        1,
        30
      )
      expect(demand).toBe(0)
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

  describe('recalculateDemandReserves', () => {
    it('should return empty result when user has no demand reserves', async () => {
      mockSelectWhere.mockResolvedValueOnce([]) // no demand reserves

      const result = await recalculateDemandReserves(1)

      expect(result.ordersProcessed).toBe(0)
      expect(result.ordersUpdated).toBe(0)
      expect(result.errors).toHaveLength(0)
    })
  })
})
