// Burn/repair cache computation service
// Pre-computes workforce burn, production input/output, and building repair needs
// per user per planet per ticker. Results are stored in burn_repair_cache
// so corp-wide aggregation is a plain SQL SUM query.

import { db, burnRepairCache, fioUserPlanets } from '../db/index.js'
import { eq, desc, and } from 'drizzle-orm'
import { getUserPlanetData } from './fio/sync-user-planets.js'
import { toPlanetInput, getRepairableTickers } from './planet-data-helpers.js'
import {
  calculateWorkforceBurn,
  calculateProductionNeeds,
  calculateProductionOutputs,
  calculateBuildingRepairNeeds,
} from './supply-calculator.js'
import * as userSettingsService from './userSettingsService.js'
import type { PlanetOverrides } from '@kawakawa/types'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'burn-repair-cache' })

/**
 * Recompute the burn/repair cache for a single user.
 *
 * Reads synced planet data from the DB, runs the supply calculator for each
 * planet with 1-day rates for burn/inputs/outputs and the configured repairDays
 * for repair, then upserts the results into burn_repair_cache.
 *
 * Inputs and production outputs are always included — no toggle.
 *
 * Called after every FIO sync and when supply-related settings change.
 */
export async function computeBurnRepairCache(
  userId: number,
  options: { force?: boolean } = {}
): Promise<void> {
  // 0. Skip if cache is already fresh (planet data hasn't changed since last compute)
  if (!options.force) {
    const [latestSync] = await db
      .select({ lastSyncedAt: fioUserPlanets.lastSyncedAt })
      .from(fioUserPlanets)
      .where(eq(fioUserPlanets.userId, userId))
      .orderBy(desc(fioUserPlanets.lastSyncedAt))
      .limit(1)

    if (latestSync) {
      const [latestCache] = await db
        .select({ computedAt: burnRepairCache.computedAt })
        .from(burnRepairCache)
        .where(eq(burnRepairCache.userId, userId))
        .orderBy(desc(burnRepairCache.computedAt))
        .limit(1)

      if (latestCache && latestCache.computedAt >= latestSync.lastSyncedAt) {
        log.info({ userId }, 'Burn/repair cache is fresh, skipping recompute')
        return
      }
    }
  }

  // 1. Read user settings
  const repairDays =
    ((await userSettingsService.getSetting(userId, 'burnRepair.repairDays')) as number) ?? 0

  const overridesRaw =
    ((await userSettingsService.getSetting(userId, 'burnRepair.planetOverrides')) as string) ?? '{}'
  let planetOverrides: PlanetOverrides = {}
  try {
    planetOverrides = typeof overridesRaw === 'string' ? JSON.parse(overridesRaw) : overridesRaw
  } catch {
    // Invalid JSON, use empty overrides
  }

  const excludedPlanetsRaw =
    ((await userSettingsService.getSetting(userId, 'burnRepair.excludedPlanets')) as string[]) ?? []
  const excludedPlanets = new Set(excludedPlanetsRaw.map(p => p.toLowerCase()))

  // 2. Load planet data from DB (already synced)
  const planets = await getUserPlanetData(userId)

  // 3. Get repairable tickers (cached at module level)
  const repairableTickers = await getRepairableTickers()

  // 4. Compute cache rows
  const now = new Date()
  const rows: (typeof burnRepairCache.$inferInsert)[] = []

  for (const planet of planets) {
    // Check exclusion
    if (
      excludedPlanets.has(planet.planetNaturalId.toLowerCase()) ||
      excludedPlanets.has(planet.planetName.toLowerCase())
    ) {
      continue
    }

    const input = toPlanetInput(planet)

    // Resolve per-planet overrides
    const overrides = planetOverrides[planet.planetNaturalId] ?? {}
    const effectiveRepairDays = overrides.repairDays ?? repairDays
    const willRepair = effectiveRepairDays >= 0

    // Workforce burn: calculate for 1 day to get daily rate
    const burnResults = calculateWorkforceBurn(input.workforce, 1)

    // Production inputs: always included, 1-day rate
    const inputResults = calculateProductionNeeds(input.production, 1, willRepair)

    // Production outputs: 1-day rate
    const outputResults = calculateProductionOutputs(input.production, 1, willRepair)

    // Repair: calculate total at configured repairDays (non-linear, can't reduce to daily)
    const repairTotals = new Map<string, number>()
    const repairableBuildings = input.buildings.filter(b => repairableTickers.has(b.buildingTicker))
    for (const building of repairableBuildings) {
      const needs = calculateBuildingRepairNeeds(building, effectiveRepairDays, now)
      for (const n of needs) {
        repairTotals.set(n.ticker, (repairTotals.get(n.ticker) ?? 0) + n.amount)
      }
    }

    // Merge all tickers into cache rows
    const allTickers = new Set([
      ...burnResults.map(b => b.ticker),
      ...inputResults.map(p => p.ticker),
      ...outputResults.map(o => o.ticker),
      ...repairTotals.keys(),
    ])

    for (const ticker of allTickers) {
      const burnDaily = burnResults.find(b => b.ticker === ticker)?.amount ?? 0
      const inputsDaily = inputResults.find(p => p.ticker === ticker)?.amount ?? 0
      const productionDaily = outputResults.find(o => o.ticker === ticker)?.amount ?? 0
      const repairTotal = repairTotals.get(ticker) ?? 0

      rows.push({
        userId,
        userPlanetId: planet.id,
        planetNaturalId: planet.planetNaturalId,
        planetName: planet.planetName,
        commodityTicker: ticker,
        burnDaily: String(burnDaily),
        inputsDaily: String(inputsDaily),
        repairTotal: String(repairTotal),
        productionDaily: String(productionDaily),
        computedAt: now,
      })
    }
  }

  // 5. Delete existing cache for user, insert new rows
  await db.delete(burnRepairCache).where(eq(burnRepairCache.userId, userId))

  if (rows.length > 0) {
    await db.insert(burnRepairCache).values(rows)
  }

  log.info(
    { userId, planets: planets.length, cacheRows: rows.length },
    'Burn/repair cache computed'
  )
}
