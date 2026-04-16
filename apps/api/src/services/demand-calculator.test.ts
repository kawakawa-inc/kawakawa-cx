import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFilteredStock } from './demand-calculator.js'

// Mock DB
const mockSelectFrom = vi.fn()
const mockSelectInnerJoin = vi.fn()
const mockSelectWhere = vi.fn()

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
  },
  fioUserPlanets: { id: 'id', userId: 'userId', planetNaturalId: 'planetNaturalId' },
  fioPlanetWorkforce: { userPlanetId: 'userPlanetId', needs: 'needs' },
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
})
