import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncUserAll } from './sync-user-all.js'

const mockSyncUserInventory = vi.fn()
const mockSyncUserPlanets = vi.fn()
const mockRecalculateDemandOrders = vi.fn()
const mockRecalculateDemandReserves = vi.fn()

vi.mock('./sync-user-inventory.js', () => ({
  syncUserInventory: (...args: unknown[]) => mockSyncUserInventory(...args),
}))

vi.mock('./sync-user-planets.js', () => ({
  syncUserPlanets: (...args: unknown[]) => mockSyncUserPlanets(...args),
}))

vi.mock('../demand-calculator.js', () => ({
  recalculateDemandOrders: (...args: unknown[]) => mockRecalculateDemandOrders(...args),
  recalculateDemandReserves: (...args: unknown[]) => mockRecalculateDemandReserves(...args),
}))

describe('syncUserAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock for reserves (overridden in specific tests as needed)
    mockRecalculateDemandReserves.mockResolvedValue({
      ordersProcessed: 0,
      ordersUpdated: 0,
      errors: [],
    })
  })

  it('should run all three sync steps in order', async () => {
    mockSyncUserInventory.mockResolvedValue({
      success: true,
      inserted: 50,
      updated: 0,
      errors: [],
      storageLocations: 3,
      skippedUnknownLocations: 0,
      skippedUnknownCommodities: 0,
      skippedExcludedLocations: 0,
      fioLastSync: '2026-04-01T00:00:00Z',
    })

    mockSyncUserPlanets.mockResolvedValue({
      success: true,
      inserted: 10,
      updated: 0,
      errors: [],
      planetsFound: 2,
      planetsSynced: 2,
      skippedExcludedPlanets: 0,
      buildingsSynced: 5,
      workforceTypesSynced: 4,
      productionLinesSynced: 3,
    })

    mockRecalculateDemandOrders.mockResolvedValue({
      ordersProcessed: 3,
      ordersUpdated: 2,
      errors: [],
    })

    mockRecalculateDemandReserves.mockResolvedValue({
      ordersProcessed: 1,
      ordersUpdated: 1,
      errors: [],
    })

    const result = await syncUserAll(1, 'api-key', 'TestUser')

    expect(result.success).toBe(true)
    expect(result.inventory.inserted).toBe(50)
    expect(result.planets.planetsSynced).toBe(2)
    expect(result.demandOrders.ordersUpdated).toBe(2)
    expect(result.demandReserves).toBeDefined()
    expect(result.errors).toHaveLength(0)

    // Verify all four steps were called
    expect(mockSyncUserInventory).toHaveBeenCalledWith(1, 'api-key', 'TestUser', {
      excludedLocations: [],
    })
    expect(mockSyncUserPlanets).toHaveBeenCalledWith(1, 'api-key', 'TestUser', {
      excludedPlanets: [],
    })
    expect(mockRecalculateDemandOrders).toHaveBeenCalledWith(1)
  })

  it('should pass exclusion options through', async () => {
    mockSyncUserInventory.mockResolvedValue({
      success: true,
      inserted: 0,
      updated: 0,
      errors: [],
      storageLocations: 0,
      skippedUnknownLocations: 0,
      skippedUnknownCommodities: 0,
      skippedExcludedLocations: 0,
      fioLastSync: null,
    })
    mockSyncUserPlanets.mockResolvedValue({
      success: true,
      inserted: 0,
      updated: 0,
      errors: [],
      planetsFound: 0,
      planetsSynced: 0,
      skippedExcludedPlanets: 0,
      buildingsSynced: 0,
      workforceTypesSynced: 0,
      productionLinesSynced: 0,
    })
    mockRecalculateDemandOrders.mockResolvedValue({
      ordersProcessed: 0,
      ordersUpdated: 0,
      errors: [],
    })

    await syncUserAll(1, 'api-key', 'TestUser', {
      excludedLocations: ['BEN'],
      excludedPlanets: ['UV-351a'],
    })

    expect(mockSyncUserInventory).toHaveBeenCalledWith(1, 'api-key', 'TestUser', {
      excludedLocations: ['BEN'],
    })
    expect(mockSyncUserPlanets).toHaveBeenCalledWith(1, 'api-key', 'TestUser', {
      excludedPlanets: ['UV-351a'],
    })
  })

  it('should aggregate errors from all steps', async () => {
    mockSyncUserInventory.mockResolvedValue({
      success: false,
      inserted: 0,
      updated: 0,
      errors: ['Inventory error'],
      storageLocations: 0,
      skippedUnknownLocations: 0,
      skippedUnknownCommodities: 0,
      skippedExcludedLocations: 0,
      fioLastSync: null,
    })
    mockSyncUserPlanets.mockResolvedValue({
      success: false,
      inserted: 0,
      updated: 0,
      errors: ['Planet error'],
      planetsFound: 0,
      planetsSynced: 0,
      skippedExcludedPlanets: 0,
      buildingsSynced: 0,
      workforceTypesSynced: 0,
      productionLinesSynced: 0,
    })
    mockRecalculateDemandOrders.mockResolvedValue({
      ordersProcessed: 0,
      ordersUpdated: 0,
      errors: ['Demand error'],
    })
    mockRecalculateDemandReserves.mockResolvedValue({
      ordersProcessed: 0,
      ordersUpdated: 0,
      errors: ['Reserve error'],
    })

    const result = await syncUserAll(1, 'api-key', 'TestUser')

    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(4)
    expect(result.errors).toContain('Inventory error')
    expect(result.errors).toContain('Planet error')
    expect(result.errors).toContain('Demand error')
    expect(result.errors).toContain('Reserve error')
  })
})
