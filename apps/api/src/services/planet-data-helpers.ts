// Shared helpers for converting DB planet data to calculator input format
// and getting repairable building tickers from FIO.

import { getUserPlanetData } from './fio/sync-user-planets.js'
import { FioClient } from './fio/client.js'
import type { FioBuilding } from './fio/types.js'
import type { PlanetSupplyInput } from '@kawakawa/types'

// Module-level cache for repairable tickers (FIO building defs rarely change)
let repairableTickersCache: Set<string> | null = null
let repairableTickersCacheExpiry = 0
const REPAIRABLE_TICKERS_TTL_MS = 3_600_000 // 1 hour

/**
 * Fetch building definitions from FIO and return the set of tickers
 * that have workforce > 0 (and therefore need repairs).
 * Cached for 1 hour to avoid repeated FIO API calls during sync runs.
 */
export async function getRepairableTickers(): Promise<Set<string>> {
  if (repairableTickersCache && Date.now() < repairableTickersCacheExpiry) {
    return repairableTickersCache
  }

  const client = new FioClient()
  const buildings = (await client.getBuildings()) as FioBuilding[]
  const repairable = new Set<string>()
  for (const b of buildings) {
    const totalWorkforce = b.Pioneers + b.Settlers + b.Technicians + b.Engineers + b.Scientists
    if (totalWorkforce > 0) {
      repairable.add(b.Ticker)
    }
  }

  repairableTickersCache = repairable
  repairableTickersCacheExpiry = Date.now() + REPAIRABLE_TICKERS_TTL_MS
  return repairable
}

/** Clear the cached repairable tickers (for testing) */
export function clearRepairableTickersCache(): void {
  repairableTickersCache = null
  repairableTickersCacheExpiry = 0
}

/**
 * Convert DB planet data (from getUserPlanetData) to the calculator's PlanetSupplyInput format.
 * Handles the FIO JSON field name mapping (MaterialTicker → ticker, etc.)
 */
export function toPlanetInput(
  planetData: Awaited<ReturnType<typeof getUserPlanetData>>[number]
): PlanetSupplyInput {
  return {
    planetId: planetData.planetNaturalId,
    planetName: planetData.planetName,
    buildings: planetData.buildings.map(b => ({
      buildingTicker: b.buildingTicker,
      buildingCreated: b.buildingCreated,
      buildingLastRepair: b.buildingLastRepair,
      condition: Number(b.condition),
      repairMaterials: (
        b.repairMaterials as { MaterialTicker: string; MaterialAmount: number }[]
      ).map(m => ({ ticker: m.MaterialTicker, amount: m.MaterialAmount })),
      reclaimableMaterials: (
        b.reclaimableMaterials as { MaterialTicker: string; MaterialAmount: number }[]
      ).map(m => ({ ticker: m.MaterialTicker, amount: m.MaterialAmount })),
    })),
    workforce: planetData.workforce.map(w => ({
      workforceType: w.workforceType,
      population: w.population,
      needs: (
        w.needs as {
          MaterialTicker: string
          UnitsPerInterval: number
          Essential: boolean
        }[]
      ).map(n => ({
        ticker: n.MaterialTicker,
        unitsPerInterval: n.UnitsPerInterval,
        essential: n.Essential,
      })),
    })),
    production: planetData.production.map(p => ({
      lineType: p.lineType,
      capacity: p.capacity,
      condition: Number(p.condition),
      efficiency: Number(p.efficiency),
      orders: (
        p.orders as {
          Recurring: boolean
          DurationMs: number
          Inputs: { MaterialTicker: string; MaterialAmount: number }[]
          Outputs: { MaterialTicker: string; MaterialAmount: number }[]
        }[]
      ).map(o => ({
        recurring: o.Recurring,
        durationMs: o.DurationMs,
        inputs: o.Inputs.map(i => ({
          ticker: i.MaterialTicker,
          amount: i.MaterialAmount,
        })),
        outputs: o.Outputs.map(out => ({
          ticker: out.MaterialTicker,
          amount: out.MaterialAmount,
        })),
      })),
    })),
  }
}
