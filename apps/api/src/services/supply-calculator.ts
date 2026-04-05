// Supply calculator — pure functions for computing repair, burn, and production needs
// No database access; all data is passed in as arguments.

import type {
  BuildingData,
  WorkforceData,
  ProductionData,
  PlanetSupplyInput,
  PlanetSupplyResult,
  SupplyCalculationOptions,
  SupplyCalculationResult,
  MaterialNeed,
} from '@kawakawa/types'

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000

// Condition formula constants
const CONDITION_AMPLITUDE = 0.67
const CONDITION_FLOOR = 0.33
const CONDITION_RATE = 1789 / 25000
const CONDITION_CENTER_NORMAL = 100.87
const CONDITION_CENTER_NEW = 107.87

/**
 * Calculate building condition at a given number of days since last repair.
 *
 * condition = 0.67 / (1 + exp((1789/25000) * (D - C))) + 0.33
 *
 * @param daysSinceRepair - Days since last repair (or construction if never repaired)
 * @param neverRepaired - True if the building has never been repaired (uses higher center constant)
 */
export function calculateCondition(daysSinceRepair: number, neverRepaired: boolean): number {
  const center = neverRepaired ? CONDITION_CENTER_NEW : CONDITION_CENTER_NORMAL
  return (
    CONDITION_AMPLITUDE / (1 + Math.exp(CONDITION_RATE * (daysSinceRepair - center))) +
    CONDITION_FLOOR
  )
}

/**
 * Calculate the repair cost for a single material at a given day count.
 *
 * reclaimable = floor(constructionCost * (180 - min(D, 180)) / 180)
 * repairCost = constructionCost - reclaimable
 *
 * @param constructionCost - Total construction cost for this material (repair + reclaimable)
 * @param daysSinceRepair - Days since last repair
 */
export function calculateRepairCost(
  constructionCost: number,
  daysSinceRepair: number
): { reclaimable: number; repairCost: number } {
  const clampedDays = Math.min(daysSinceRepair, 180)
  const reclaimable = Math.floor((constructionCost * (180 - clampedDays)) / 180)
  return { reclaimable, repairCost: constructionCost - reclaimable }
}

/**
 * Calculate repair needs for a single building.
 *
 * - repairDays = 0: use RepairMaterials directly (exact game values)
 * - repairDays > 0: project future repair cost using the formula
 *
 * @param building - Building data from database
 * @param repairDays - Days in the future to project (0 = repair now)
 * @param now - Current time (for calculating days since repair)
 * @returns Array of material needs for this building's repair
 */
export function calculateBuildingRepairNeeds(
  building: BuildingData,
  repairDays: number,
  now: Date
): { ticker: string; amount: number }[] {
  if (repairDays === 0) {
    // Use exact game values
    return building.repairMaterials
      .filter(m => m.amount > 0)
      .map(m => ({ ticker: m.ticker, amount: m.amount }))
  }

  // Project future repair cost
  const referenceDate = building.buildingLastRepair ?? building.buildingCreated
  const daysSinceRepair = (now.getTime() - referenceDate.getTime()) / MS_PER_DAY
  const daysAtRepair = daysSinceRepair + repairDays

  // Build construction cost map: repair + reclaimable per material
  const constructionCosts = new Map<string, number>()
  for (const m of building.repairMaterials) {
    constructionCosts.set(m.ticker, (constructionCosts.get(m.ticker) ?? 0) + m.amount)
  }
  for (const m of building.reclaimableMaterials) {
    constructionCosts.set(m.ticker, (constructionCosts.get(m.ticker) ?? 0) + m.amount)
  }

  const needs: { ticker: string; amount: number }[] = []
  for (const [ticker, cost] of constructionCosts) {
    const { repairCost } = calculateRepairCost(cost, daysAtRepair)
    if (repairCost > 0) {
      needs.push({ ticker, amount: repairCost })
    }
  }

  return needs
}

/**
 * Calculate workforce consumable burn for a planet.
 *
 * total = ceil(UnitsPerInterval * days)
 *
 * Static calculation — not affected by building condition.
 */
export function calculateWorkforceBurn(
  workforce: WorkforceData[],
  burnDays: number
): { ticker: string; amount: number }[] {
  if (burnDays <= 0) return []

  const totals = new Map<string, number>()
  for (const wf of workforce) {
    if (wf.population <= 0) continue
    for (const need of wf.needs) {
      const total = Math.ceil(need.unitsPerInterval * burnDays)
      if (total > 0) {
        totals.set(need.ticker, (totals.get(need.ticker) ?? 0) + total)
      }
    }
  }

  return Array.from(totals.entries()).map(([ticker, amount]) => ({ ticker, amount }))
}

/**
 * Calculate production input needs for a planet.
 *
 * If repairing (repairDays >= 0 and we're including repair):
 *   post_repair_duration = current_duration * current_condition
 * Otherwise:
 *   use DurationMs as-is
 *
 * runs = (24 * days) / (duration_ms / 3_600_000)
 * material_need = ceil(amount_per_run * runs)
 *
 * Only recurring orders are included.
 *
 * @param production - Production line data
 * @param days - Number of days to calculate for
 * @param willRepair - If true, use post-repair (100% condition) duration
 */
export function calculateProductionNeeds(
  production: ProductionData[],
  days: number,
  willRepair: boolean
): { ticker: string; amount: number }[] {
  if (days <= 0) return []

  const totals = new Map<string, number>()
  const hoursInPeriod = 24 * days

  for (const line of production) {
    for (const order of line.orders) {
      if (!order.recurring) continue
      if (order.durationMs <= 0) continue

      // If repairing, remove condition factor from duration
      const effectiveDurationMs = willRepair ? order.durationMs * line.condition : order.durationMs

      const durationHours = effectiveDurationMs / MS_PER_HOUR
      if (durationHours <= 0) continue

      const runs = hoursInPeriod / durationHours

      for (const input of order.inputs) {
        const need = Math.ceil(input.amount * runs)
        if (need > 0) {
          totals.set(input.ticker, (totals.get(input.ticker) ?? 0) + need)
        }
      }
    }
  }

  return Array.from(totals.entries()).map(([ticker, amount]) => ({ ticker, amount }))
}

/**
 * Calculate supply needs for a single planet.
 *
 * @param input - Planet data (buildings, workforce, production)
 * @param options - Calculation options (may be overridden per-planet)
 * @param repairableTickers - Set of building tickers that require repairs (workforce > 0)
 */
export function calculatePlanetSupply(
  input: PlanetSupplyInput,
  options: SupplyCalculationOptions,
  repairableTickers: Set<string>
): PlanetSupplyResult {
  const now = options.now ?? new Date()

  // Resolve per-planet overrides
  const overrides = options.planetOverrides[input.planetId] ?? {}
  const repairDays = overrides.repairDays ?? options.repairDays
  const burnDays = overrides.burnDays ?? options.burnDays
  const includeProduction = overrides.includeProduction ?? options.includeProduction

  // Filter to repairable buildings
  const repairableBuildings = input.buildings.filter(b => repairableTickers.has(b.buildingTicker))

  // Calculate repair needs
  const repairNeeds: MaterialNeed[] = []
  for (const building of repairableBuildings) {
    const needs = calculateBuildingRepairNeeds(building, repairDays, now)
    for (const need of needs) {
      repairNeeds.push({
        ticker: need.ticker,
        quantity: need.amount,
        source: 'repair',
        planetId: input.planetId,
      })
    }
  }

  // Calculate workforce burn
  const burnResults = calculateWorkforceBurn(input.workforce, burnDays)
  const burnNeeds: MaterialNeed[] = burnResults.map(b => ({
    ticker: b.ticker,
    quantity: b.amount,
    source: 'burn',
    planetId: input.planetId,
  }))

  // Calculate production needs
  let productionNeeds: MaterialNeed[] = []
  if (includeProduction) {
    // Use burnDays as the production period (how many days of inputs to stock)
    const productionResults = calculateProductionNeeds(
      input.production,
      burnDays,
      repairDays >= 0 // will repair if repairDays is set
    )
    productionNeeds = productionResults.map(p => ({
      ticker: p.ticker,
      quantity: p.amount,
      source: 'production',
      planetId: input.planetId,
    }))
  }

  return {
    planetId: input.planetId,
    planetName: input.planetName,
    repairNeeds,
    burnNeeds,
    productionNeeds,
    buildingCount: input.buildings.length,
    repairableBuildingCount: repairableBuildings.length,
    options: { repairDays, burnDays, includeProduction },
  }
}

/**
 * Aggregate material needs into a ticker -> quantity map.
 */
function aggregateNeeds(needs: MaterialNeed[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const need of needs) {
    totals[need.ticker] = (totals[need.ticker] ?? 0) + need.quantity
  }
  return totals
}

/**
 * Calculate supply needs across all planets.
 *
 * @param planets - Array of planet data
 * @param options - Global calculation options (with per-planet overrides)
 * @param repairableTickers - Set of building tickers that require repairs
 */
export function calculateSupply(
  planets: PlanetSupplyInput[],
  options: SupplyCalculationOptions,
  repairableTickers: Set<string>
): SupplyCalculationResult {
  const planetResults = planets.map(planet =>
    calculatePlanetSupply(planet, options, repairableTickers)
  )

  const allRepairNeeds = planetResults.flatMap(p => p.repairNeeds)
  const allBurnNeeds = planetResults.flatMap(p => p.burnNeeds)
  const allProductionNeeds = planetResults.flatMap(p => p.productionNeeds)
  const allNeeds = [...allRepairNeeds, ...allBurnNeeds, ...allProductionNeeds]

  return {
    planets: planetResults,
    aggregatedMaterials: aggregateNeeds(allNeeds),
    repairMaterials: aggregateNeeds(allRepairNeeds),
    burnMaterials: aggregateNeeds(allBurnNeeds),
    productionMaterials: aggregateNeeds(allProductionNeeds),
  }
}
