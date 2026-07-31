// Burn/repair cache computation service
// Pre-computes workforce burn, production input/output, and building repair needs
// per user per planet per ticker. Results are stored in burn_repair_cache
// so corp-wide aggregation is a plain SQL SUM query.

import { db, burnRepairCache, corpSnapshotUserTicker, fioUserPlanets } from '@kawakawa/db'
import { eq, desc, sql } from 'drizzle-orm'
import { getUserPlanetData } from '../fio/sync-user-planets.js'
import { toPlanetInput, getRepairableTickers } from './planet-data-helpers.js'
import {
  calculateWorkforceBurn,
  calculateProductionNeeds,
  calculateProductionOutputs,
  calculateBuildingRepairNeeds,
} from './supply-calculator.js'
import * as userSettingsService from '../user-settings/user-settings-service.js'
import type { PlanetOverrides } from '@kawakawa/types'
import { createLogger } from '../utils/logger.js'

type PlanetData = Awaited<ReturnType<typeof getUserPlanetData>>[number]

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
  const fioExcludedLocationsRaw =
    ((await userSettingsService.getSetting(userId, 'fio.excludedLocations')) as string[]) ?? []
  const excludedPlanets = new Set([
    ...excludedPlanetsRaw.map(p => p.toLowerCase()),
    ...fioExcludedLocationsRaw.map(p => p.toLowerCase()),
  ])

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

    // Workforce burn: calculate for 1 day to get daily rate.
    // fractional=true so sub-unit rates (eg. 0.33/day) aren't rounded up.
    const burnResults = calculateWorkforceBurn(input.workforce, 1, { fractional: true })

    // Production inputs: always included, 1-day fractional rate
    const inputResults = calculateProductionNeeds(input.production, 1, willRepair, {
      fractional: true,
    })

    // Production outputs: 1-day fractional rate
    const outputResults = calculateProductionOutputs(input.production, 1, willRepair, {
      fractional: true,
    })

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

  // 6. Write today's historical snapshot. Uses concrete "as-is" parameters
  // (willRepair=false, repairDays=0) so historical rows stay comparable across
  // users regardless of each member's planning-window setting. Idempotent per
  // (userId, ticker, UTC-day) — repeated syncs on the same day overwrite.
  await writeUserSnapshotRows(userId, planets, excludedPlanets, repairableTickers, now)

  log.info(
    { userId, planets: planets.length, cacheRows: rows.length },
    'Burn/repair cache computed'
  )
}

/**
 * Sum per-ticker base rates across a user's planets, computed with
 * willRepair=false and repairDays=0 — the "current game state" view — and
 * upsert today's row per ticker into `corp_snapshot_user_ticker`.
 *
 * Intentionally independent of `burn_repair_cache`: snapshots track reality,
 * the cache tracks each user's live planning projection. Two users with
 * different repairDays settings should produce comparable snapshot rows.
 */
async function writeUserSnapshotRows(
  userId: number,
  planets: PlanetData[],
  excludedPlanets: Set<string>,
  repairableTickers: Set<string>,
  now: Date
): Promise<void> {
  interface Totals {
    burnDaily: number
    inputsDaily: number
    productionDaily: number
    repairTotal: number
  }
  const byTicker = new Map<string, Totals>()
  const bump = (ticker: string, patch: Partial<Totals>): void => {
    const existing = byTicker.get(ticker) ?? {
      burnDaily: 0,
      inputsDaily: 0,
      productionDaily: 0,
      repairTotal: 0,
    }
    byTicker.set(ticker, {
      burnDaily: existing.burnDaily + (patch.burnDaily ?? 0),
      inputsDaily: existing.inputsDaily + (patch.inputsDaily ?? 0),
      productionDaily: existing.productionDaily + (patch.productionDaily ?? 0),
      repairTotal: existing.repairTotal + (patch.repairTotal ?? 0),
    })
  }

  for (const planet of planets) {
    if (
      excludedPlanets.has(planet.planetNaturalId.toLowerCase()) ||
      excludedPlanets.has(planet.planetName.toLowerCase())
    ) {
      continue
    }

    const input = toPlanetInput(planet)

    const burnResults = calculateWorkforceBurn(input.workforce, 1, { fractional: true })
    for (const r of burnResults) bump(r.ticker, { burnDaily: r.amount })

    // willRepair=false → rates reflect current condition, no ideal-repair projection.
    const inputResults = calculateProductionNeeds(input.production, 1, false, {
      fractional: true,
    })
    for (const r of inputResults) bump(r.ticker, { inputsDaily: r.amount })

    const outputResults = calculateProductionOutputs(input.production, 1, false, {
      fractional: true,
    })
    for (const r of outputResults) bump(r.ticker, { productionDaily: r.amount })

    // repairDays=0 → concrete materials owed right now, not projected forward.
    const repairable = input.buildings.filter(b => repairableTickers.has(b.buildingTicker))
    for (const building of repairable) {
      const needs = calculateBuildingRepairNeeds(building, 0, now)
      for (const n of needs) bump(n.ticker, { repairTotal: n.amount })
    }
  }

  if (byTicker.size === 0) return

  const snapshotAt = now.toISOString().slice(0, 10)
  const rows = [...byTicker.entries()].map(([commodityTicker, t]) => ({
    snapshotAt,
    userId,
    commodityTicker,
    burnDaily: String(t.burnDaily),
    inputsDaily: String(t.inputsDaily),
    productionDaily: String(t.productionDaily),
    repairTotal: String(t.repairTotal),
  }))

  await db
    .insert(corpSnapshotUserTicker)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        corpSnapshotUserTicker.userId,
        corpSnapshotUserTicker.commodityTicker,
        corpSnapshotUserTicker.snapshotAt,
      ],
      set: {
        burnDaily: sql`excluded.burn_daily`,
        inputsDaily: sql`excluded.inputs_daily`,
        productionDaily: sql`excluded.production_daily`,
        repairTotal: sql`excluded.repair_total`,
      },
    })
}
