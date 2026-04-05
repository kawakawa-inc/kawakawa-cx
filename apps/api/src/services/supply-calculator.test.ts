import { describe, it, expect } from 'vitest'
import {
  calculateCondition,
  calculateRepairCost,
  calculateBuildingRepairNeeds,
  calculateWorkforceBurn,
  calculateProductionNeeds,
  calculatePlanetSupply,
  calculateSupply,
} from './supply-calculator.js'
import type {
  BuildingData,
  WorkforceData,
  ProductionData,
  PlanetSupplyInput,
  SupplyCalculationOptions,
} from '@kawakawa/types'

// Fixed "now" for deterministic tests
const NOW = new Date('2026-04-01T00:00:00Z')

function makeBuilding(overrides: Partial<BuildingData> = {}): BuildingData {
  return {
    buildingTicker: 'CHP',
    buildingCreated: new Date('2026-01-01T00:00:00Z'),
    buildingLastRepair: new Date('2026-03-01T00:00:00Z'),
    condition: 0.95,
    repairMaterials: [
      { ticker: 'BBH', amount: 2 },
      { ticker: 'INS', amount: 10 },
    ],
    reclaimableMaterials: [
      { ticker: 'BBH', amount: 4 },
      { ticker: 'INS', amount: 80 },
    ],
    ...overrides,
  }
}

function makeWorkforce(overrides: Partial<WorkforceData> = {}): WorkforceData {
  return {
    workforceType: 'SETTLER',
    population: 100,
    needs: [
      { ticker: 'RAT', unitsPerInterval: 6.0, essential: true },
      { ticker: 'DW', unitsPerInterval: 3.0, essential: true },
    ],
    ...overrides,
  }
}

function makeProduction(overrides: Partial<ProductionData> = {}): ProductionData {
  return {
    lineType: 'chemPlant',
    condition: 0.8,
    efficiency: 1.0,
    orders: [
      {
        recurring: true,
        durationMs: 3_600_000 * 12, // 12 hours
        inputs: [
          { ticker: 'HAL', amount: 3 },
          { ticker: 'H2O', amount: 10 },
        ],
        outputs: [{ ticker: 'NA', amount: 2 }],
      },
    ],
    ...overrides,
  }
}

function makePlanet(overrides: Partial<PlanetSupplyInput> = {}): PlanetSupplyInput {
  return {
    planetId: 'UV-351a',
    planetName: 'Katoa',
    buildings: [makeBuilding()],
    workforce: [makeWorkforce()],
    production: [makeProduction()],
    ...overrides,
  }
}

function makeOptions(overrides: Partial<SupplyCalculationOptions> = {}): SupplyCalculationOptions {
  return {
    repairDays: 0,
    burnDays: 7,
    includeProduction: false,
    planetOverrides: {},
    now: NOW,
    ...overrides,
  }
}

describe('calculateCondition', () => {
  it('should return ~1.0 at day 0 (never repaired)', () => {
    const condition = calculateCondition(0, true)
    expect(condition).toBeCloseTo(1.0, 2)
  })

  it('should return ~1.0 at day 0 (previously repaired)', () => {
    const condition = calculateCondition(0, false)
    expect(condition).toBeCloseTo(1.0, 2)
  })

  it('should remain near 1.0 at day 30', () => {
    const condition = calculateCondition(30, false)
    expect(condition).toBeGreaterThan(0.98)
  })

  it('should start dropping noticeably by day 60', () => {
    const condition = calculateCondition(60, false)
    expect(condition).toBeLessThan(0.98)
    expect(condition).toBeGreaterThan(0.85)
  })

  it('should fall below 80% by day 90', () => {
    const condition = calculateCondition(90, false)
    expect(condition).toBeLessThan(0.8)
  })

  it('should approach 33% floor at day 180', () => {
    const condition = calculateCondition(180, false)
    expect(condition).toBeCloseTo(0.33, 1)
  })

  it('should never go below 33%', () => {
    const condition = calculateCondition(500, false)
    expect(condition).toBeGreaterThanOrEqual(0.33)
    expect(condition).toBeCloseTo(0.33, 2)
  })

  it('should degrade slower for new buildings (never repaired)', () => {
    // New buildings use C=107.87 vs normal C=100.87
    const condNormal = calculateCondition(100, false)
    const condNew = calculateCondition(100, true)
    expect(condNew).toBeGreaterThan(condNormal)
  })
})

describe('calculateRepairCost', () => {
  it('should return 0 repair cost at day 0', () => {
    const { repairCost, reclaimable } = calculateRepairCost(100, 0)
    expect(repairCost).toBe(0)
    expect(reclaimable).toBe(100)
  })

  it('should return full cost at day 180', () => {
    const { repairCost, reclaimable } = calculateRepairCost(100, 180)
    expect(repairCost).toBe(100)
    expect(reclaimable).toBe(0)
  })

  it('should return full cost beyond day 180', () => {
    const { repairCost } = calculateRepairCost(100, 250)
    expect(repairCost).toBe(100)
  })

  it('should use floor() for reclaimable (discrete tick behavior)', () => {
    // 90 days: reclaimable = floor(100 * 90 / 180) = floor(50) = 50
    const { repairCost, reclaimable } = calculateRepairCost(100, 90)
    expect(reclaimable).toBe(50)
    expect(repairCost).toBe(50)
  })

  it('should handle non-divisible amounts with floor', () => {
    // 1 day: reclaimable = floor(10 * 179 / 180) = floor(9.944...) = 9
    const { reclaimable, repairCost } = calculateRepairCost(10, 1)
    expect(reclaimable).toBe(9)
    expect(repairCost).toBe(1)
  })

  it('should always satisfy repairCost + reclaimable = constructionCost', () => {
    for (const days of [0, 1, 30, 60, 89, 90, 91, 120, 150, 179, 180, 200]) {
      const { repairCost, reclaimable } = calculateRepairCost(100, days)
      expect(repairCost + reclaimable).toBe(100)
    }
  })
})

describe('calculateBuildingRepairNeeds', () => {
  it('should use RepairMaterials directly when repairDays = 0', () => {
    const building = makeBuilding()
    const needs = calculateBuildingRepairNeeds(building, 0, NOW)

    expect(needs).toEqual([
      { ticker: 'BBH', amount: 2 },
      { ticker: 'INS', amount: 10 },
    ])
  })

  it('should project future repair cost when repairDays > 0', () => {
    // Building repaired on March 1, now is April 1 = 31 days since repair
    // repairDays = 30 means repair at day 61
    // constructionCost BBH = 2 + 4 = 6
    // reclaimable = floor(6 * (180 - 61) / 180) = floor(6 * 119 / 180) = floor(3.966) = 3
    // repairCost = 6 - 3 = 3
    const building = makeBuilding()
    const needs = calculateBuildingRepairNeeds(building, 30, NOW)

    const bbh = needs.find(n => n.ticker === 'BBH')
    expect(bbh).toBeDefined()
    expect(bbh!.amount).toBe(3)
  })

  it('should use buildingCreated when never repaired', () => {
    // Created Jan 1, now April 1 = 90 days since creation
    // repairDays = 0 means use RepairMaterials directly
    const building = makeBuilding({ buildingLastRepair: null })
    const needs = calculateBuildingRepairNeeds(building, 0, NOW)

    // Should return exact repair materials
    expect(needs).toEqual([
      { ticker: 'BBH', amount: 2 },
      { ticker: 'INS', amount: 10 },
    ])
  })

  it('should use buildingCreated for projection when never repaired', () => {
    // Created Jan 1, now April 1 = 90 days since creation
    // repairDays = 10 means repair at day 100
    // constructionCost BBH = 2 + 4 = 6
    // reclaimable = floor(6 * (180 - 100) / 180) = floor(6 * 80 / 180) = floor(2.666) = 2
    // repairCost = 6 - 2 = 4
    const building = makeBuilding({ buildingLastRepair: null })
    const needs = calculateBuildingRepairNeeds(building, 10, NOW)

    const bbh = needs.find(n => n.ticker === 'BBH')
    expect(bbh).toBeDefined()
    expect(bbh!.amount).toBe(4)
  })

  it('should filter out materials with 0 amount', () => {
    const building = makeBuilding({
      repairMaterials: [
        { ticker: 'BBH', amount: 0 },
        { ticker: 'INS', amount: 5 },
      ],
    })
    const needs = calculateBuildingRepairNeeds(building, 0, NOW)
    expect(needs).toEqual([{ ticker: 'INS', amount: 5 }])
  })
})

describe('calculateWorkforceBurn', () => {
  it('should multiply daily rate by days and ceil', () => {
    const workforce = [makeWorkforce()]
    const needs = calculateWorkforceBurn(workforce, 7)

    const rat = needs.find(n => n.ticker === 'RAT')
    const dw = needs.find(n => n.ticker === 'DW')
    // RAT: ceil(6.0 * 7) = 42
    // DW: ceil(3.0 * 7) = 21
    expect(rat).toEqual({ ticker: 'RAT', amount: 42 })
    expect(dw).toEqual({ ticker: 'DW', amount: 21 })
  })

  it('should ceil fractional results', () => {
    const workforce = [
      makeWorkforce({
        needs: [{ ticker: 'RAT', unitsPerInterval: 6.1, essential: true }],
      }),
    ]
    const needs = calculateWorkforceBurn(workforce, 7)

    // ceil(6.1 * 7) = ceil(42.7) = 43
    expect(needs[0].amount).toBe(43)
  })

  it('should return empty for 0 burn days', () => {
    const needs = calculateWorkforceBurn([makeWorkforce()], 0)
    expect(needs).toEqual([])
  })

  it('should aggregate across multiple workforce types', () => {
    const workforce = [
      makeWorkforce({
        workforceType: 'PIONEER',
        needs: [{ ticker: 'RAT', unitsPerInterval: 3.0, essential: true }],
      }),
      makeWorkforce({
        workforceType: 'SETTLER',
        needs: [{ ticker: 'RAT', unitsPerInterval: 6.0, essential: true }],
      }),
    ]
    const needs = calculateWorkforceBurn(workforce, 10)

    // PIONEER RAT: ceil(3.0 * 10) = 30
    // SETTLER RAT: ceil(6.0 * 10) = 60
    // Total: 30 + 60 = 90
    const rat = needs.find(n => n.ticker === 'RAT')
    expect(rat).toEqual({ ticker: 'RAT', amount: 90 })
  })

  it('should skip workforce types with 0 population', () => {
    const workforce = [makeWorkforce({ population: 0 })]
    const needs = calculateWorkforceBurn(workforce, 7)
    expect(needs).toEqual([])
  })
})

describe('calculateProductionNeeds', () => {
  it('should calculate input needs for recurring orders', () => {
    const production = [makeProduction()]
    // 12 hour orders over 7 days = 7 * 24 / 12 = 14 runs
    // HAL: ceil(3 * 14) = 42
    // H2O: ceil(10 * 14) = 140
    const needs = calculateProductionNeeds(production, 7, false)

    expect(needs).toContainEqual({ ticker: 'HAL', amount: 42 })
    expect(needs).toContainEqual({ ticker: 'H2O', amount: 140 })
  })

  it('should use post-repair duration when willRepair is true', () => {
    // condition = 0.8, duration = 12h
    // post-repair duration = 12h * 0.8 = 9.6h
    // runs over 7 days = 7 * 24 / 9.6 = 17.5
    // HAL: ceil(3 * 17.5) = ceil(52.5) = 53
    const production = [makeProduction()]
    const needs = calculateProductionNeeds(production, 7, true)

    const hal = needs.find(n => n.ticker === 'HAL')
    expect(hal).toBeDefined()
    expect(hal!.amount).toBe(53)
  })

  it('should skip non-recurring orders', () => {
    const production = [
      makeProduction({
        orders: [
          {
            recurring: false,
            durationMs: 3_600_000,
            inputs: [{ ticker: 'HAL', amount: 3 }],
            outputs: [{ ticker: 'NA', amount: 2 }],
          },
        ],
      }),
    ]
    const needs = calculateProductionNeeds(production, 7, false)
    expect(needs).toEqual([])
  })

  it('should return empty for 0 days', () => {
    const needs = calculateProductionNeeds([makeProduction()], 0, false)
    expect(needs).toEqual([])
  })

  it('should aggregate inputs across multiple production lines', () => {
    const production = [
      makeProduction({
        lineType: 'line1',
        orders: [
          {
            recurring: true,
            durationMs: 3_600_000 * 24, // 24h
            inputs: [{ ticker: 'H2O', amount: 5 }],
            outputs: [],
          },
        ],
      }),
      makeProduction({
        lineType: 'line2',
        orders: [
          {
            recurring: true,
            durationMs: 3_600_000 * 24, // 24h
            inputs: [{ ticker: 'H2O', amount: 3 }],
            outputs: [],
          },
        ],
      }),
    ]
    // line1: 7 runs, ceil(5 * 7) = 35
    // line2: 7 runs, ceil(3 * 7) = 21
    // total H2O: 35 + 21 = 56
    const needs = calculateProductionNeeds(production, 7, false)
    const h2o = needs.find(n => n.ticker === 'H2O')
    expect(h2o).toEqual({ ticker: 'H2O', amount: 56 })
  })
})

describe('calculatePlanetSupply', () => {
  const repairableTickers = new Set(['CHP', 'FRM', 'SME'])

  it('should calculate repair and burn needs for a planet', () => {
    const planet = makePlanet()
    const options = makeOptions()
    const result = calculatePlanetSupply(planet, options, repairableTickers)

    expect(result.planetId).toBe('UV-351a')
    expect(result.buildingCount).toBe(1)
    expect(result.repairableBuildingCount).toBe(1)
    expect(result.repairNeeds.length).toBeGreaterThan(0)
    expect(result.burnNeeds.length).toBeGreaterThan(0)
    expect(result.productionNeeds).toEqual([])
    expect(result.options).toEqual({
      repairDays: 0,
      burnDays: 7,
      includeProduction: false,
    })
  })

  it('should include production needs when enabled', () => {
    const planet = makePlanet()
    const options = makeOptions({ includeProduction: true })
    const result = calculatePlanetSupply(planet, options, repairableTickers)

    expect(result.productionNeeds.length).toBeGreaterThan(0)
  })

  it('should skip non-repairable buildings', () => {
    const planet = makePlanet({
      buildings: [
        makeBuilding({ buildingTicker: 'CHP' }), // repairable
        makeBuilding({ buildingTicker: 'STO' }), // not repairable
      ],
    })
    const result = calculatePlanetSupply(planet, makeOptions(), repairableTickers)

    expect(result.buildingCount).toBe(2)
    expect(result.repairableBuildingCount).toBe(1)
  })

  it('should apply per-planet overrides', () => {
    const planet = makePlanet()
    const options = makeOptions({
      burnDays: 7,
      planetOverrides: {
        'UV-351a': { burnDays: 30 },
      },
    })
    const result = calculatePlanetSupply(planet, options, repairableTickers)

    expect(result.options.burnDays).toBe(30)
    // Burn should be higher with 30 days vs 7
    const rat = result.burnNeeds.find(n => n.ticker === 'RAT')
    expect(rat).toBeDefined()
    // ceil(6.0 * 30) = 180
    expect(rat!.quantity).toBe(180)
  })

  it('should use global defaults when no per-planet override exists', () => {
    const planet = makePlanet()
    const options = makeOptions({
      burnDays: 14,
      planetOverrides: {
        'SOME-OTHER-PLANET': { burnDays: 30 },
      },
    })
    const result = calculatePlanetSupply(planet, options, repairableTickers)

    expect(result.options.burnDays).toBe(14)
  })

  it('should tag all needs with the planet ID', () => {
    const planet = makePlanet()
    const result = calculatePlanetSupply(planet, makeOptions(), repairableTickers)

    for (const need of [...result.repairNeeds, ...result.burnNeeds]) {
      expect(need.planetId).toBe('UV-351a')
    }
  })
})

describe('calculateSupply', () => {
  const repairableTickers = new Set(['CHP', 'FRM'])

  it('should aggregate across multiple planets', () => {
    const planets = [
      makePlanet({ planetId: 'UV-351a', planetName: 'Katoa' }),
      makePlanet({ planetId: 'KW-688c', planetName: 'Promitor' }),
    ]
    const result = calculateSupply(planets, makeOptions(), repairableTickers)

    expect(result.planets).toHaveLength(2)
    // Each planet contributes 2 repair materials (BBH, INS) and 2 burn materials (RAT, DW)
    expect(Object.keys(result.aggregatedMaterials).length).toBeGreaterThan(0)

    // Repair materials should be doubled (2 planets with same buildings)
    expect(result.repairMaterials['BBH']).toBe(4) // 2 per planet * 2 planets
    expect(result.repairMaterials['INS']).toBe(20) // 10 per planet * 2 planets

    // Burn materials should be doubled
    expect(result.burnMaterials['RAT']).toBe(84) // ceil(6.0 * 7) * 2 = 42 * 2
    expect(result.burnMaterials['DW']).toBe(42) // ceil(3.0 * 7) * 2 = 21 * 2
  })

  it('should return empty results for no planets', () => {
    const result = calculateSupply([], makeOptions(), repairableTickers)

    expect(result.planets).toEqual([])
    expect(result.aggregatedMaterials).toEqual({})
    expect(result.repairMaterials).toEqual({})
    expect(result.burnMaterials).toEqual({})
    expect(result.productionMaterials).toEqual({})
  })

  it('should separate repair, burn, and production in aggregation', () => {
    const planet = makePlanet()
    const options = makeOptions({ includeProduction: true })
    const result = calculateSupply([planet], options, repairableTickers)

    // Aggregated should contain all three
    expect(Object.keys(result.repairMaterials).length).toBeGreaterThan(0)
    expect(Object.keys(result.burnMaterials).length).toBeGreaterThan(0)
    expect(Object.keys(result.productionMaterials).length).toBeGreaterThan(0)

    // Aggregated total should be the sum of all three
    for (const ticker of Object.keys(result.aggregatedMaterials)) {
      const expected =
        (result.repairMaterials[ticker] ?? 0) +
        (result.burnMaterials[ticker] ?? 0) +
        (result.productionMaterials[ticker] ?? 0)
      expect(result.aggregatedMaterials[ticker]).toBe(expected)
    }
  })
})
