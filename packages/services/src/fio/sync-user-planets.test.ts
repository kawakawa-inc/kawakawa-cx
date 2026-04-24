import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncUserPlanets } from './sync-user-planets.js'

// Create mock functions at module scope
const mockGetUserPlanets = vi.fn()
const mockGetUserSiteData = vi.fn()
const mockGetUserWorkforce = vi.fn()
const mockGetUserProduction = vi.fn()
const mockGetPlanetData = vi.fn()
const mockGetBuildingDefinition = vi.fn()
const mockGetBuildings = vi.fn()

// Mock the FIO client module
vi.mock('./client.js', () => ({
  FioClient: class MockFioClient {
    getUserPlanets = mockGetUserPlanets
    getUserSiteData = mockGetUserSiteData
    getUserWorkforce = mockGetUserWorkforce
    getUserProduction = mockGetUserProduction
    getPlanetData = mockGetPlanetData
    getBuildingDefinition = mockGetBuildingDefinition
    getBuildings = mockGetBuildings
  },
}))

// Mock the database module
const mockDeleteWhere = vi.fn()
const mockInsertReturning = vi.fn()

// The insert chain now supports both:
// - insert().values().returning() (for buildings/workforce/production)
// - insert().values().onConflictDoUpdate().returning() (for planet upsert)
const mockOnConflictDoUpdate = vi.fn()

vi.mock('@kawakawa/db', () => ({
  db: {
    delete: vi.fn(() => ({
      where: mockDeleteWhere,
    })),
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnValue({
        returning: mockInsertReturning,
        onConflictDoUpdate: mockOnConflictDoUpdate.mockReturnValue({
          returning: mockInsertReturning,
        }),
      }),
    })),
  },
  fioUserPlanets: {
    id: 'id',
    userId: 'userId',
    planetNaturalId: 'planetNaturalId',
    planetName: 'planetName',
    lastSyncedAt: 'lastSyncedAt',
  },
  fioPlanetBuildings: {
    id: 'id',
    userPlanetId: 'userPlanetId',
    buildingId: 'buildingId',
    buildingTicker: 'buildingTicker',
  },
  fioPlanetWorkforce: {
    id: 'id',
    userPlanetId: 'userPlanetId',
    workforceType: 'workforceType',
  },
  fioPlanetProduction: {
    id: 'id',
    userPlanetId: 'userPlanetId',
    lineType: 'lineType',
  },
}))

describe('syncUserPlanets', () => {
  const userId = 1
  const fioApiKey = 'test-api-key'
  const fioUsername = 'TestUser'

  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteWhere.mockReset()
    mockInsertReturning.mockReset()
    mockOnConflictDoUpdate.mockReset()
    mockGetUserPlanets.mockReset()
    mockGetUserSiteData.mockReset()
    mockGetUserWorkforce.mockReset()
    mockGetUserProduction.mockReset()
    mockGetPlanetData.mockReset()
    mockGetBuildingDefinition.mockReset()

    // Default: planet has no environmental requirements, CM area = 25
    mockGetPlanetData.mockResolvedValue({ BuildRequirements: [] })
    mockGetBuildingDefinition.mockImplementation(async (ticker: string) => ({
      Ticker: ticker,
      AreaCost: ticker === 'CM' ? 25 : 12,
      BuildingCosts: [],
      Pioneers: 0,
      Settlers: 0,
      Technicians: 0,
      Engineers: 0,
      Scientists: 0,
    }))

    mockDeleteWhere.mockResolvedValue(undefined)
    mockOnConflictDoUpdate.mockReturnValue({ returning: mockInsertReturning })
  })

  it('should sync planet data successfully', async () => {
    mockGetUserPlanets.mockResolvedValue([{ NaturalId: 'UV-351a', Name: 'Katoa' }])

    // Mock planet upsert returning ID
    mockInsertReturning.mockResolvedValueOnce([{ id: 10 }])

    mockGetUserSiteData.mockResolvedValue({
      PlanetId: 'uuid-1',
      Buildings: [
        {
          BuildingId: 'bld-1',
          BuildingTicker: 'CHP',
          BuildingCreated: 1700000000000,
          BuildingLastRepair: 1710000000000,
          Condition: 0.8113,
          RepairMaterials: [{ MaterialTicker: 'BBH', MaterialAmount: 2 }],
          ReclaimableMaterials: [{ MaterialTicker: 'BBH', MaterialAmount: 1 }],
        },
      ],
    })

    mockGetUserWorkforce.mockResolvedValue({
      Workforces: [
        {
          WorkforceTypeName: 'SETTLER',
          Population: 100,
          Required: 100,
          WorkforceNeeds: [{ MaterialTicker: 'RAT', UnitsPerInterval: 6.0, Essential: true }],
        },
      ],
    })

    mockGetUserProduction.mockResolvedValue([
      {
        Type: 'chemPlant',
        Condition: 0.8113,
        Efficiency: 1.0452,
        Orders: [
          {
            Recurring: true,
            DurationMs: 47946998,
            Inputs: [{ MaterialTicker: 'HAL', MaterialAmount: 3 }],
            Outputs: [{ MaterialTicker: 'NA', MaterialAmount: 2 }],
          },
        ],
      },
    ])

    // Subsequent inserts (buildings, workforce, production)
    mockInsertReturning.mockResolvedValue([{ id: 1 }])

    const result = await syncUserPlanets(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.planetsFound).toBe(1)
    expect(result.planetsSynced).toBe(1)
    expect(result.buildingsSynced).toBe(1)
    expect(result.workforceTypesSynced).toBe(1)
    expect(result.productionLinesSynced).toBe(1)
    expect(result.errors).toHaveLength(0)

    expect(mockGetUserPlanets).toHaveBeenCalledWith(fioApiKey, fioUsername)
    expect(mockGetUserSiteData).toHaveBeenCalledWith(fioApiKey, fioUsername, 'UV-351a')
    expect(mockGetUserWorkforce).toHaveBeenCalledWith(fioApiKey, fioUsername, 'UV-351a')
    expect(mockGetUserProduction).toHaveBeenCalledWith(fioApiKey, fioUsername, 'UV-351a')
  })

  it('should use upsert to preserve planet IDs', async () => {
    mockGetUserPlanets.mockResolvedValue([{ NaturalId: 'UV-351a', Name: 'Katoa' }])

    mockInsertReturning.mockResolvedValueOnce([{ id: 10 }])
    mockGetUserSiteData.mockResolvedValue({ PlanetId: 'uuid-1', Buildings: [] })
    mockGetUserWorkforce.mockResolvedValue({ Workforces: [] })
    mockGetUserProduction.mockResolvedValue([])

    await syncUserPlanets(userId, fioApiKey, fioUsername)

    // Should have called onConflictDoUpdate for planet upsert
    expect(mockOnConflictDoUpdate).toHaveBeenCalled()
  })

  it('should skip excluded planets', async () => {
    mockGetUserPlanets.mockResolvedValue([
      { NaturalId: 'UV-351a', Name: 'Katoa' },
      { NaturalId: 'KW-688c', Name: 'Promitor' },
    ])

    mockInsertReturning.mockResolvedValueOnce([{ id: 10 }])
    mockGetUserSiteData.mockResolvedValue({ PlanetId: 'uuid-2', Buildings: [] })
    mockGetUserWorkforce.mockResolvedValue({ Workforces: [] })
    mockGetUserProduction.mockResolvedValue([])

    const result = await syncUserPlanets(userId, fioApiKey, fioUsername, {
      excludedPlanets: ['UV-351a'],
    })

    expect(result.planetsFound).toBe(2)
    expect(result.planetsSynced).toBe(1)
    expect(result.skippedExcludedPlanets).toBe(1)

    expect(mockGetUserSiteData).toHaveBeenCalledTimes(1)
    expect(mockGetUserSiteData).toHaveBeenCalledWith(fioApiKey, fioUsername, 'KW-688c')
  })

  it('should exclude planets case-insensitively by name', async () => {
    mockGetUserPlanets.mockResolvedValue([{ NaturalId: 'UV-351a', Name: 'Katoa' }])

    const result = await syncUserPlanets(userId, fioApiKey, fioUsername, {
      excludedPlanets: ['katoa'],
    })

    expect(result.skippedExcludedPlanets).toBe(1)
    expect(result.planetsSynced).toBe(0)
    expect(mockGetUserSiteData).not.toHaveBeenCalled()
  })

  it('should handle FIO API errors for individual planet endpoints gracefully', async () => {
    mockGetUserPlanets.mockResolvedValue([{ NaturalId: 'UV-351a', Name: 'Katoa' }])

    mockInsertReturning.mockResolvedValue([{ id: 10 }])

    mockGetUserSiteData.mockRejectedValue(new Error('FIO API timeout'))
    mockGetUserWorkforce.mockResolvedValue({
      Workforces: [
        {
          WorkforceTypeName: 'PIONEER',
          Population: 50,
          Required: 50,
          WorkforceNeeds: [{ MaterialTicker: 'DW', UnitsPerInterval: 3.0, Essential: true }],
        },
      ],
    })
    mockGetUserProduction.mockResolvedValue([])

    const result = await syncUserPlanets(userId, fioApiKey, fioUsername)

    expect(result.planetsSynced).toBe(1)
    expect(result.buildingsSynced).toBe(0)
    expect(result.workforceTypesSynced).toBe(1)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Failed to fetch site data for UV-351a')
    )
    expect(result.success).toBe(false)
  })

  it('should handle complete FIO API failure', async () => {
    mockGetUserPlanets.mockRejectedValue(new Error('Network error'))

    const result = await syncUserPlanets(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(false)
    expect(result.planetsFound).toBe(0)
    expect(result.planetsSynced).toBe(0)
    expect(result.errors).toContainEqual(
      expect.stringContaining('Failed to sync planets for user 1')
    )
  })

  it('should handle multiple planets sequentially', async () => {
    mockGetUserPlanets.mockResolvedValue([
      { NaturalId: 'UV-351a', Name: 'Katoa' },
      { NaturalId: 'KW-688c', Name: 'Promitor' },
    ])

    mockInsertReturning
      .mockResolvedValueOnce([{ id: 10 }]) // Planet 1 upsert
      .mockResolvedValueOnce([{ id: 11 }]) // Planet 2 upsert

    mockGetUserSiteData
      .mockResolvedValueOnce({ PlanetId: 'uuid-1', Buildings: [] })
      .mockResolvedValueOnce({ PlanetId: 'uuid-2', Buildings: [] })

    mockGetUserWorkforce
      .mockResolvedValueOnce({ Workforces: [] })
      .mockResolvedValueOnce({ Workforces: [] })
    mockGetUserProduction.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const result = await syncUserPlanets(userId, fioApiKey, fioUsername)

    expect(result.planetsFound).toBe(2)
    expect(result.planetsSynced).toBe(2)
    expect(result.success).toBe(true)

    expect(mockGetUserSiteData).toHaveBeenCalledTimes(2)
    expect(mockGetUserWorkforce).toHaveBeenCalledTimes(2)
    expect(mockGetUserProduction).toHaveBeenCalledTimes(2)
  })

  it('should clean up removed planets when user has no planets', async () => {
    mockGetUserPlanets.mockResolvedValue([])

    await syncUserPlanets(userId, fioApiKey, fioUsername)

    // Should delete all planet data for user (cleanup of removed planets)
    expect(mockDeleteWhere).toHaveBeenCalled()
  })

  it('should return empty results when user has no planets', async () => {
    mockGetUserPlanets.mockResolvedValue([])

    const result = await syncUserPlanets(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.planetsFound).toBe(0)
    expect(result.planetsSynced).toBe(0)
    expect(result.buildingsSynced).toBe(0)
    expect(result.workforceTypesSynced).toBe(0)
    expect(result.productionLinesSynced).toBe(0)
  })
})
