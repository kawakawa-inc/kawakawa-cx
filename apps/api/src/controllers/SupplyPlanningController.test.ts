import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupplyPlanningController } from './SupplyPlanningController.js'
import { db } from '../db/index.js'
import * as syncUserPlanetsModule from '../services/fio/sync-user-planets.js'
import * as userSettingsService from '../services/userSettingsService.js'
import * as supplyCalculator from '../services/supply-calculator.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
  fioUserPlanets: {
    id: 'id',
    userId: 'userId',
    planetNaturalId: 'planetNaturalId',
    planetName: 'planetName',
    lastSyncedAt: 'lastSyncedAt',
  },
}))

vi.mock('../services/fio/sync-user-planets.js', () => ({
  syncUserPlanets: vi.fn(),
  getUserPlanetData: vi.fn(),
}))

vi.mock('../services/userSettingsService.js', () => ({
  getSetting: vi.fn(),
  getFioCredentials: vi.fn(),
}))

const mockGetBuildings = vi.fn()

vi.mock('../services/fio/client.js', () => ({
  FioClient: class MockFioClient {
    getBuildings = mockGetBuildings
  },
}))

vi.mock('../services/supply-calculator.js', () => ({
  calculateSupply: vi.fn(),
  calculatePlanetSupply: vi.fn(),
}))

describe('SupplyPlanningController', () => {
  let controller: SupplyPlanningController
  let mockSelect: any
  let mockDelete: any
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: [] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SupplyPlanningController()
    mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    mockDelete = {
      where: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(db.select).mockReturnValue(mockSelect)
    vi.mocked(db.delete).mockReturnValue(mockDelete as any)
  })

  describe('syncPlanetData', () => {
    it('should sync planet data successfully', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: 'TestUser',
        fioApiKey: 'test-key',
      })
      vi.mocked(userSettingsService.getSetting).mockResolvedValue([])
      vi.mocked(syncUserPlanetsModule.syncUserPlanets).mockResolvedValue({
        success: true,
        inserted: 5,
        updated: 0,
        errors: [],
        planetsFound: 2,
        planetsSynced: 2,
        skippedExcludedPlanets: 0,
        buildingsSynced: 3,
        workforceTypesSynced: 4,
        productionLinesSynced: 2,
      })

      const result = await controller.syncPlanetData(mockRequest)

      expect(result.success).toBe(true)
      expect(result.planetsFound).toBe(2)
      expect(result.planetsSynced).toBe(2)
      expect(result.buildingsSynced).toBe(3)
      expect(result.workforceTypesSynced).toBe(4)
      expect(result.productionLinesSynced).toBe(2)
      expect(result.errors).toHaveLength(0)

      expect(syncUserPlanetsModule.syncUserPlanets).toHaveBeenCalledWith(
        1,
        'test-key',
        'TestUser',
        { excludedPlanets: [] }
      )
    })

    it('should throw error when FIO credentials are missing', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: null,
        fioApiKey: null,
      })

      await expect(controller.syncPlanetData(mockRequest)).rejects.toThrow(
        'FIO credentials not configured'
      )
    })

    it('should pass excluded planets from settings', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: 'TestUser',
        fioApiKey: 'test-key',
      })
      vi.mocked(userSettingsService.getSetting).mockResolvedValue(['UV-351a', 'KW-688c'])
      vi.mocked(syncUserPlanetsModule.syncUserPlanets).mockResolvedValue({
        success: true,
        inserted: 0,
        updated: 0,
        errors: [],
        planetsFound: 3,
        planetsSynced: 1,
        skippedExcludedPlanets: 2,
        buildingsSynced: 0,
        workforceTypesSynced: 0,
        productionLinesSynced: 0,
      })

      await controller.syncPlanetData(mockRequest)

      expect(syncUserPlanetsModule.syncUserPlanets).toHaveBeenCalledWith(
        1,
        'test-key',
        'TestUser',
        { excludedPlanets: ['UV-351a', 'KW-688c'] }
      )
    })

    it('should handle null excluded planets setting', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: 'TestUser',
        fioApiKey: 'test-key',
      })
      vi.mocked(userSettingsService.getSetting).mockResolvedValue(null)
      vi.mocked(syncUserPlanetsModule.syncUserPlanets).mockResolvedValue({
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

      await controller.syncPlanetData(mockRequest)

      expect(syncUserPlanetsModule.syncUserPlanets).toHaveBeenCalledWith(
        1,
        'test-key',
        'TestUser',
        { excludedPlanets: [] }
      )
    })
  })

  describe('getPlanets', () => {
    it('should return synced planets with timestamps', async () => {
      const mockPlanets = [
        {
          id: 1,
          planetNaturalId: 'UV-351a',
          planetName: 'Katoa',
          lastSyncedAt: new Date('2024-06-15T12:00:00Z'),
        },
        {
          id: 2,
          planetNaturalId: 'KW-688c',
          planetName: 'Promitor',
          lastSyncedAt: new Date('2024-06-15T12:00:00Z'),
        },
      ]
      mockSelect.orderBy.mockResolvedValue(mockPlanets)

      const result = await controller.getPlanets(mockRequest)

      expect(result).toHaveLength(2)
      expect(result[0].planetNaturalId).toBe('UV-351a')
      expect(result[0].planetName).toBe('Katoa')
      expect(result[0].lastSyncedAt).toBe('2024-06-15T12:00:00.000Z')
    })

    it('should return empty array when no planets synced', async () => {
      mockSelect.orderBy.mockResolvedValue([])

      const result = await controller.getPlanets(mockRequest)

      expect(result).toHaveLength(0)
    })
  })

  describe('getLastSyncTime', () => {
    it('should return the most recent sync time', async () => {
      mockSelect.limit.mockResolvedValue([{ lastSyncedAt: new Date('2024-06-15T14:30:00Z') }])

      const result = await controller.getLastSyncTime(mockRequest)

      expect(result.lastSyncedAt).toBe('2024-06-15T14:30:00.000Z')
    })

    it('should return null when no planets have been synced', async () => {
      mockSelect.limit.mockResolvedValue([])

      const result = await controller.getLastSyncTime(mockRequest)

      expect(result.lastSyncedAt).toBeNull()
    })
  })

  describe('clearPlanetData', () => {
    it('should delete all planet data for the user', async () => {
      mockSelect.where.mockResolvedValue([{ id: 1 }, { id: 2 }])

      const result = await controller.clearPlanetData(mockRequest)

      expect(result.success).toBe(true)
      expect(result.deletedPlanets).toBe(2)
      expect(db.delete).toHaveBeenCalled()
    })

    it('should handle user with no planet data', async () => {
      mockSelect.where.mockResolvedValue([])

      const result = await controller.clearPlanetData(mockRequest)

      expect(result.success).toBe(true)
      expect(result.deletedPlanets).toBe(0)
    })
  })

  describe('calculateSupplyFromSettings', () => {
    const mockCalculationResult = {
      planets: [],
      aggregatedMaterials: { RAT: 42 },
      repairMaterials: { BBH: 2 },
      burnMaterials: { RAT: 42 },
      productionMaterials: {},
    }

    function setupSettingsMock() {
      vi.mocked(userSettingsService.getSetting)
        .mockResolvedValueOnce(0) // burnRepair.repairDays
        .mockResolvedValueOnce(7) // burnRepair.burnDays
        .mockResolvedValueOnce(false) // burnRepair.includeProduction
        .mockResolvedValueOnce('{}') // burnRepair.planetOverrides
    }

    it('should calculate supply using saved settings', async () => {
      setupSettingsMock()
      vi.mocked(syncUserPlanetsModule.getUserPlanetData).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          planetNaturalId: 'UV-351a',
          planetName: 'Katoa',
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          buildings: [],
          workforce: [],
          production: [],
        },
      ])
      vi.mocked(supplyCalculator.calculateSupply).mockReturnValue(mockCalculationResult)
      mockGetBuildings.mockResolvedValue([
        { Ticker: 'CHP', Pioneers: 0, Settlers: 100, Technicians: 0, Engineers: 0, Scientists: 0 },
      ])

      const result = await controller.calculateSupplyFromSettings(mockRequest)

      expect(result).toEqual(mockCalculationResult)
    })

    it('should return empty results when no planets synced', async () => {
      setupSettingsMock()
      vi.mocked(syncUserPlanetsModule.getUserPlanetData).mockResolvedValue([])

      const result = await controller.calculateSupplyFromSettings(mockRequest)

      expect(result.planets).toEqual([])
      expect(result.aggregatedMaterials).toEqual({})
    })

    it('should fetch building definitions for repair eligibility', async () => {
      setupSettingsMock()
      vi.mocked(syncUserPlanetsModule.getUserPlanetData).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          planetNaturalId: 'UV-351a',
          planetName: 'Katoa',
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          buildings: [],
          workforce: [],
          production: [],
        },
      ])
      mockGetBuildings.mockResolvedValue([
        { Ticker: 'CHP', Pioneers: 0, Settlers: 100, Technicians: 0, Engineers: 0, Scientists: 0 },
        { Ticker: 'STO', Pioneers: 0, Settlers: 0, Technicians: 0, Engineers: 0, Scientists: 0 },
      ])
      vi.mocked(supplyCalculator.calculateSupply).mockReturnValue(mockCalculationResult)

      await controller.calculateSupplyFromSettings(mockRequest)

      // calculateSupply should be called with repairableTickers containing CHP but not STO
      const call = vi.mocked(supplyCalculator.calculateSupply).mock.calls[0]
      const repairableTickers = call[2] as Set<string>
      expect(repairableTickers.has('CHP')).toBe(true)
      expect(repairableTickers.has('STO')).toBe(false)
    })
  })

  describe('calculateSupplyCustom', () => {
    function setupSettingsMock() {
      vi.mocked(userSettingsService.getSetting)
        .mockResolvedValueOnce(0) // burnRepair.repairDays
        .mockResolvedValueOnce(7) // burnRepair.burnDays
        .mockResolvedValueOnce(false) // burnRepair.includeProduction
        .mockResolvedValueOnce('{}') // burnRepair.planetOverrides
    }

    it('should override settings with body params', async () => {
      setupSettingsMock()
      vi.mocked(syncUserPlanetsModule.getUserPlanetData).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          planetNaturalId: 'UV-351a',
          planetName: 'Katoa',
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          buildings: [],
          workforce: [],
          production: [],
        },
      ])
      mockGetBuildings.mockResolvedValue([])
      vi.mocked(supplyCalculator.calculateSupply).mockReturnValue({
        planets: [],
        aggregatedMaterials: {},
        repairMaterials: {},
        burnMaterials: {},
        productionMaterials: {},
      })

      await controller.calculateSupplyCustom(
        { repairDays: 30, burnDays: 14, includeProduction: true },
        mockRequest
      )

      const call = vi.mocked(supplyCalculator.calculateSupply).mock.calls[0]
      const options = call[1]
      expect(options.repairDays).toBe(30)
      expect(options.burnDays).toBe(14)
      expect(options.includeProduction).toBe(true)
    })
  })

  describe('calculatePlanetSupplyEndpoint', () => {
    function setupSettingsMock() {
      vi.mocked(userSettingsService.getSetting)
        .mockResolvedValueOnce(0) // burnRepair.repairDays
        .mockResolvedValueOnce(7) // burnRepair.burnDays
        .mockResolvedValueOnce(false) // burnRepair.includeProduction
        .mockResolvedValueOnce('{}') // burnRepair.planetOverrides
    }

    it('should throw NotFound when planet not synced', async () => {
      setupSettingsMock()
      vi.mocked(syncUserPlanetsModule.getUserPlanetData).mockResolvedValue([])

      await expect(
        controller.calculatePlanetSupplyEndpoint('UV-351a', mockRequest)
      ).rejects.toThrow('Planet UV-351a not found')
    })

    it('should calculate supply for a specific planet', async () => {
      setupSettingsMock()
      vi.mocked(syncUserPlanetsModule.getUserPlanetData).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          planetNaturalId: 'UV-351a',
          planetName: 'Katoa',
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          buildings: [],
          workforce: [],
          production: [],
        },
      ])
      mockGetBuildings.mockResolvedValue([])
      const mockResult = {
        planetId: 'UV-351a',
        planetName: 'Katoa',
        repairNeeds: [],
        burnNeeds: [],
        productionNeeds: [],
        buildingCount: 0,
        repairableBuildingCount: 0,
        options: { repairDays: 0, burnDays: 7, includeProduction: false },
      }
      vi.mocked(supplyCalculator.calculatePlanetSupply).mockReturnValue(mockResult)

      const result = await controller.calculatePlanetSupplyEndpoint('UV-351a', mockRequest)

      expect(result.planetId).toBe('UV-351a')
      expect(supplyCalculator.calculatePlanetSupply).toHaveBeenCalled()
    })
  })
})
