import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getFilteredStock,
  calculateLineDemand,
  calculateOutputSupply,
  recalculateDemandOrders,
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
    lineSource: 'lineSource',
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
        { commodityTicker: 'DW', destinationPlanetId: 'UV-351a', lineSource: null, demand: 500 },
        1,
        30
      )
      expect(demand).toBe(500)
    })

    it('should return 0 when no lineSource and no demand', async () => {
      const demand = await calculateLineDemand(
        { commodityTicker: 'DW', destinationPlanetId: 'UV-351a', lineSource: null, demand: null },
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
          lineSource: 'consumables',
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
          lineSource: 'repair',
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
          lineSource: 'consumables',
          demand: null,
        },
        1,
        30
      )
      expect(demand).toBe(0)
    })

    it('should calculate production output surplus', async () => {
      // Planet lookup
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      // Production data: produces 10 FE per order, consumes 3 FE per order, 1 day cycle
      mockSelectWhere.mockResolvedValueOnce([
        {
          capacity: 1,
          condition: '1.0',
          orders: [
            {
              Recurring: true,
              StartedEpochMs: null,
              DurationMs: 86_400_000, // 1 day
              Inputs: [{ MaterialTicker: 'FE', MaterialAmount: 3 }],
              Outputs: [{ MaterialTicker: 'FE', MaterialAmount: 10 }],
            },
          ],
        },
      ])

      const supply = await calculateLineDemand(
        {
          commodityTicker: 'FE',
          destinationPlanetId: 'UV-351a',
          lineSource: 'production_output',
          demand: null,
        },
        1,
        10
      )
      // net = 10 - 3 = 7 per day, ceil(7 * 10) = 70
      expect(supply).toBe(70)
    })

    it('should return 0 for production output when planet is net consumer', async () => {
      // Planet lookup
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      // Production data: consumes more FE than it produces
      mockSelectWhere.mockResolvedValueOnce([
        {
          capacity: 1,
          condition: '1.0',
          orders: [
            {
              Recurring: true,
              StartedEpochMs: null,
              DurationMs: 86_400_000,
              Inputs: [{ MaterialTicker: 'FE', MaterialAmount: 10 }],
              Outputs: [{ MaterialTicker: 'FE', MaterialAmount: 3 }],
            },
          ],
        },
      ])

      const supply = await calculateLineDemand(
        {
          commodityTicker: 'FE',
          destinationPlanetId: 'UV-351a',
          lineSource: 'production_output',
          demand: null,
        },
        1,
        10
      )
      expect(supply).toBe(0)
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

  describe('calculateOutputSupply', () => {
    const prodOrders = (dailyOutput: number) => [
      {
        capacity: 1,
        condition: '1.0',
        orders: [
          {
            Recurring: true,
            StartedEpochMs: null,
            DurationMs: 86_400_000,
            Inputs: [],
            Outputs: [{ MaterialTicker: 'CAF', MaterialAmount: dailyOutput }],
          },
        ],
      },
    ]

    it('should return fixed demand when set', async () => {
      const supply = await calculateOutputSupply(
        {
          commodityTicker: 'CAF',
          sourceLocationId: 'EW',
          destinationPlanetId: 'BEN',
          demand: 200,
        },
        1,
        10
      )
      expect(supply).toBe(200)
    })

    // Helper: mock the per-destination demand lookup sequence
    // Each dest needs: planet lookup, workforce, production rates
    function mockDestDemand(planetDbId: number | null, burnRate: number, inputRate = 0) {
      if (planetDbId === null) {
        mockSelectWhere.mockResolvedValueOnce([]) // planet not found (e.g. station)
        return
      }
      mockSelectWhere.mockResolvedValueOnce([{ id: planetDbId }]) // planet lookup
      // Workforce burn for this material
      mockSelectWhere.mockResolvedValueOnce(
        burnRate > 0 ? [{ needs: [{ MaterialTicker: 'CAF', UnitsPerInterval: burnRate }] }] : []
      )
      // Production rates at destination (input consumption)
      mockSelectWhere.mockResolvedValueOnce(
        inputRate > 0
          ? [
              {
                capacity: 1,
                condition: '1.0',
                orders: [
                  {
                    Recurring: true,
                    StartedEpochMs: null,
                    DurationMs: 86_400_000,
                    Inputs: [{ MaterialTicker: 'CAF', MaterialAmount: inputRate }],
                    Outputs: [],
                  },
                ],
              },
            ]
          : []
      )
    }

    it('should return full production for a single output with no demand', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // source planet
      mockSelectWhere.mockResolvedValueOnce(prodOrders(10)) // 100 over 10 days
      mockSelectWhere.mockResolvedValueOnce([]) // local burn rates (none)
      // Output lines: just this one to BEN
      mockSelectWhere.mockResolvedValueOnce([
        { id: 1, lineSource: 'production_output', destinationPlanetId: 'BEN', demand: null },
      ])
      // BEN is a station — no planet found, so demand = 0
      mockDestDemand(null, 0)

      const supply = await calculateOutputSupply(
        {
          commodityTicker: 'CAF',
          sourceLocationId: 'EW',
          destinationPlanetId: 'BEN',
          demand: null,
        },
        1,
        10
      )
      expect(supply).toBe(100)
    })

    it('should fill demand destinations first, surplus goes to no-demand dest', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // source planet
      mockSelectWhere.mockResolvedValueOnce(prodOrders(10)) // 100 over 10 days
      mockSelectWhere.mockResolvedValueOnce([]) // local burn rates (none)
      // 3 output lines
      mockSelectWhere.mockResolvedValueOnce([
        { id: 1, lineSource: 'production_output', destinationPlanetId: 'P1', demand: null },
        { id: 2, lineSource: 'production_output', destinationPlanetId: 'P2', demand: null },
        { id: 3, lineSource: 'production_output', destinationPlanetId: 'BEN', demand: null },
      ])
      mockDestDemand(20, 0, 2) // P1: 2 CAF/day input = 20 over 10 days
      mockDestDemand(30, 0, 3) // P2: 3 CAF/day input = 30 over 10 days
      mockDestDemand(null, 0) // BEN: station, 0 demand

      // production=100, fairShare=100/2=50, P1 gets min(20,50)=20, P2 gets min(30,50)=30
      // remaining=50, BEN gets 50
      const supply = await calculateOutputSupply(
        {
          commodityTicker: 'CAF',
          sourceLocationId: 'EW',
          destinationPlanetId: 'BEN',
          demand: null,
        },
        1,
        10
      )
      expect(supply).toBe(50)
    })

    it('should use fair-share allocation capped at demand', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // source planet
      mockSelectWhere.mockResolvedValueOnce(prodOrders(5)) // 50 over 10 days
      mockSelectWhere.mockResolvedValueOnce([]) // local burn rates (none)
      // 2 output lines to planets
      mockSelectWhere.mockResolvedValueOnce([
        { id: 1, lineSource: 'production_output', destinationPlanetId: 'P1', demand: null },
        { id: 2, lineSource: 'production_output', destinationPlanetId: 'P2', demand: null },
      ])
      mockDestDemand(20, 0, 2) // P1: 20 demand (smaller)
      mockDestDemand(30, 0, 4) // P2: 40 demand (larger)

      // fairShare=50/2=25, P1 needs 20 gets 20, leftover 5 goes to P2
      // P2 gets 25+5=30 (capped at 40, so 30)
      const supplyP1 = await calculateOutputSupply(
        {
          commodityTicker: 'CAF',
          sourceLocationId: 'EW',
          destinationPlanetId: 'P1',
          demand: null,
        },
        1,
        10
      )
      expect(supplyP1).toBe(20)
    })

    it('should return 0 when production is exhausted', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // source planet
      mockSelectWhere.mockResolvedValueOnce(prodOrders(2)) // 20 over 10 days
      mockSelectWhere.mockResolvedValueOnce([]) // local burn rates (none)
      // 2 output lines
      mockSelectWhere.mockResolvedValueOnce([
        { id: 1, lineSource: 'production_output', destinationPlanetId: 'P1', demand: null },
        { id: 2, lineSource: 'production_output', destinationPlanetId: 'BEN', demand: null },
      ])
      mockDestDemand(20, 0, 3) // P1: 30 demand (exceeds production)
      mockDestDemand(null, 0) // BEN: 0 demand

      // P1 gets min(30, 20) = 20, nothing left for BEN
      const supply = await calculateOutputSupply(
        {
          commodityTicker: 'CAF',
          sourceLocationId: 'EW',
          destinationPlanetId: 'BEN',
          demand: null,
        },
        1,
        10
      )
      expect(supply).toBe(0)
    })
  })
})
