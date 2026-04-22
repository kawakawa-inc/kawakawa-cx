import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeBurnRepairCache } from './burn-repair-cache.js'

// Mock dependencies
vi.mock('@kawakawa/db', () => {
  const burnRepairCache = { userId: 'user_id' }
  return {
    db: {
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    },
    burnRepairCache,
  }
})

vi.mock('../fio/sync-user-planets.js', () => ({
  getUserPlanetData: vi.fn(),
}))

vi.mock('./planet-data-helpers.js', async () => {
  const actual = await vi.importActual('./planet-data-helpers.js')
  return {
    ...actual,
    getRepairableTickers: vi.fn().mockResolvedValue(new Set(['HB1', 'HB2', 'FRM', 'PP1'])),
  }
})

vi.mock('../user-settings/user-settings-service.js', () => ({
  getSetting: vi.fn(),
}))

import { db } from '@kawakawa/db'
import { getUserPlanetData } from '../fio/sync-user-planets.js'
import * as userSettingsService from '../user-settings/user-settings-service.js'

describe('computeBurnRepairCache', () => {
  const userId = 1

  function setupDefaultSettings() {
    vi.mocked(userSettingsService.getSetting)
      .mockResolvedValueOnce(0) // burnRepair.repairDays
      .mockResolvedValueOnce('{}') // burnRepair.planetOverrides
      .mockResolvedValueOnce([]) // burnRepair.excludedPlanets
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should compute and store daily burn rates', async () => {
    setupDefaultSettings()

    vi.mocked(getUserPlanetData).mockResolvedValue([
      {
        id: 10,
        userId: 1,
        planetNaturalId: 'UV-351a',
        planetName: 'Katoa',
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        buildings: [],
        workforce: [
          {
            id: 1,
            userPlanetId: 10,
            workforceType: 'PIONEER',
            population: 100,
            required: 100,
            createdAt: new Date(),
            needs: [
              { MaterialTicker: 'RAT', UnitsPerInterval: 4.0, Essential: true },
              { MaterialTicker: 'DW', UnitsPerInterval: 5.0, Essential: true },
            ],
          },
        ],
        production: [],
      },
    ])

    await computeBurnRepairCache(userId, { force: true })

    // Should delete old cache
    expect(db.delete).toHaveBeenCalled()

    // Should insert new rows
    expect(db.insert).toHaveBeenCalled()
    const insertCall = vi.mocked(db.insert).mock.results[0].value
    const valuesCall = insertCall.values.mock.calls[0][0]

    // Should have rows for RAT and DW
    expect(valuesCall).toHaveLength(2)

    const ratRow = valuesCall.find((r: Record<string, unknown>) => r.commodityTicker === 'RAT')
    const dwRow = valuesCall.find((r: Record<string, unknown>) => r.commodityTicker === 'DW')

    // calculateWorkforceBurn(workforce, 1) → ceil(4.0 * 1) = 4, ceil(5.0 * 1) = 5
    expect(ratRow.burnDaily).toBe('4')
    expect(ratRow.inputsDaily).toBe('0')
    expect(ratRow.repairTotal).toBe('0')
    expect(dwRow.burnDaily).toBe('5')
    expect(ratRow.planetNaturalId).toBe('UV-351a')
    expect(ratRow.userPlanetId).toBe(10)
  })

  it('should skip excluded planets', async () => {
    vi.mocked(userSettingsService.getSetting)
      .mockResolvedValueOnce(0) // burnRepair.repairDays
      .mockResolvedValueOnce('{}') // burnRepair.planetOverrides
      .mockResolvedValueOnce(['UV-351a']) // burnRepair.excludedPlanets

    vi.mocked(getUserPlanetData).mockResolvedValue([
      {
        id: 10,
        userId: 1,
        planetNaturalId: 'UV-351a',
        planetName: 'Katoa',
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        buildings: [],
        workforce: [
          {
            id: 1,
            userPlanetId: 10,
            workforceType: 'PIONEER',
            population: 100,
            required: 100,
            createdAt: new Date(),
            needs: [{ MaterialTicker: 'RAT', UnitsPerInterval: 4.0, Essential: true }],
          },
        ],
        production: [],
      },
    ])

    await computeBurnRepairCache(userId, { force: true })

    // Should delete old cache but NOT insert (planet excluded)
    expect(db.delete).toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('should produce no rows for empty planet data', async () => {
    setupDefaultSettings()
    vi.mocked(getUserPlanetData).mockResolvedValue([])

    await computeBurnRepairCache(userId, { force: true })

    expect(db.delete).toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('should compute repair totals for repairable buildings', async () => {
    vi.mocked(userSettingsService.getSetting)
      .mockResolvedValueOnce(30) // burnRepair.repairDays (project 30 days ahead)
      .mockResolvedValueOnce('{}') // burnRepair.planetOverrides
      .mockResolvedValueOnce([]) // burnRepair.excludedPlanets

    const buildingCreated = new Date('2024-01-01')

    vi.mocked(getUserPlanetData).mockResolvedValue([
      {
        id: 10,
        userId: 1,
        planetNaturalId: 'UV-351a',
        planetName: 'Katoa',
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        buildings: [
          {
            id: 1,
            userPlanetId: 10,
            buildingId: 'b1',
            buildingTicker: 'FRM',
            buildingCreated,
            buildingLastRepair: null,
            condition: '0.95',
            createdAt: new Date(),
            constructionCosts: [],
            repairMaterials: [{ MaterialTicker: 'BSE', MaterialAmount: 4 }],
            reclaimableMaterials: [{ MaterialTicker: 'BSE', MaterialAmount: 8 }],
          },
        ],
        workforce: [],
        production: [],
      },
    ])

    await computeBurnRepairCache(userId, { force: true })

    expect(db.insert).toHaveBeenCalled()
    const insertCall = vi.mocked(db.insert).mock.results[0].value
    const valuesCall = insertCall.values.mock.calls[0][0]

    // Should have a row for BSE with repairTotal > 0
    const bseRow = valuesCall.find((r: Record<string, unknown>) => r.commodityTicker === 'BSE')
    expect(bseRow).toBeDefined()
    expect(Number(bseRow.repairTotal)).toBeGreaterThan(0)
    expect(bseRow.burnDaily).toBe('0')
    expect(bseRow.inputsDaily).toBe('0')
  })

  it('should always include production inputs and outputs', async () => {
    setupDefaultSettings()

    vi.mocked(getUserPlanetData).mockResolvedValue([
      {
        id: 10,
        userId: 1,
        planetNaturalId: 'UV-351a',
        planetName: 'Katoa',
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        buildings: [],
        workforce: [],
        production: [
          {
            id: 1,
            userPlanetId: 10,
            lineType: 'FRM',
            capacity: 1,
            condition: '1.0',
            efficiency: '1.0',
            createdAt: new Date(),
            orders: [
              {
                Recurring: true,
                DurationMs: 86400000, // 1 day
                Inputs: [{ MaterialTicker: 'H2O', MaterialAmount: 10 }],
                Outputs: [{ MaterialTicker: 'RAT', MaterialAmount: 5 }],
              },
            ],
          },
        ],
      },
    ])

    await computeBurnRepairCache(userId, { force: true })

    expect(db.insert).toHaveBeenCalled()
    const insertCall = vi.mocked(db.insert).mock.results[0].value
    const valuesCall = insertCall.values.mock.calls[0][0]

    // Should have rows for both input (H2O) and output (RAT)
    const h2oRow = valuesCall.find((r: Record<string, unknown>) => r.commodityTicker === 'H2O')
    expect(h2oRow).toBeDefined()
    expect(Number(h2oRow.inputsDaily)).toBeGreaterThan(0)

    const ratRow = valuesCall.find((r: Record<string, unknown>) => r.commodityTicker === 'RAT')
    expect(ratRow).toBeDefined()
    expect(Number(ratRow.productionDaily)).toBeGreaterThan(0)
    expect(ratRow.productionDaily).toBe('5')
  })
})
