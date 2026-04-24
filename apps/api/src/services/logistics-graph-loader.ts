// Loads all data needed to run the logistics solver for a single user:
//   - flows (edges)
//   - location demand claims (node augmentations)
//   - FIO-derived node natives (workforce burn, production in/out, repair)
//   - FIO stock per location, filtered by storage types touched by the graph
//
// All values are converted to "totals over burnDays" before being handed to the solver.

import { db } from '../db/index.js'
import {
  logisticsFlows,
  locationDemandClaims,
  fioUserPlanets,
  fioPlanetBuildings,
  fioPlanetWorkforce,
  fioPlanetProduction,
  fioUserStorage,
  fioInventory,
  fioLocations,
} from '@kawakawa/db'
import { eq, and, inArray } from 'drizzle-orm'
import type {
  BuildingData,
  ClaimCategory,
  FlowKind,
  LogisticsGraph,
  NativeConsumptionBreakdown,
} from '@kawakawa/types'
import {
  solve,
  type SolverEdge,
  type SolverNode,
  type SolverSettings,
  type JumpDistanceFn,
} from './logistics-solver.js'
import { getAllProductionRates, getAllBurnRates } from './demand-calculator.js'
import { calculateBuildingRepairNeeds } from '@kawakawa/services/supply'
import { FioClient } from '@kawakawa/services/fio'
import type { FioBuilding } from '@kawakawa/services/fio'
import * as userSettingsService from '@kawakawa/services/user-settings'

const CATEGORIES: ClaimCategory[] = ['government', 'contract', 'reserve', 'other']

function emptyBreakdown(): NativeConsumptionBreakdown {
  return {
    workforceBurn: 0,
    repair: 0,
    productionInputs: 0,
    claims: { government: 0, contract: 0, reserve: 0, other: 0 },
    total: 0,
  }
}

function addToBreakdown(
  breakdowns: Record<string, NativeConsumptionBreakdown>,
  ticker: string,
  field: keyof Omit<NativeConsumptionBreakdown, 'claims' | 'total'>,
  amount: number
): void {
  if (amount <= 0) return
  if (!breakdowns[ticker]) breakdowns[ticker] = emptyBreakdown()
  breakdowns[ticker][field] += amount
  breakdowns[ticker].total += amount
}

function addClaimToBreakdown(
  breakdowns: Record<string, NativeConsumptionBreakdown>,
  ticker: string,
  category: ClaimCategory,
  amount: number
): void {
  if (amount <= 0) return
  if (!breakdowns[ticker]) breakdowns[ticker] = emptyBreakdown()
  breakdowns[ticker].claims[category] += amount
  breakdowns[ticker].total += amount
}

async function getRepairableBuildingTickers(): Promise<Set<string>> {
  const client = new FioClient()
  const buildings = (await client.getBuildings()) as FioBuilding[]
  const out = new Set<string>()
  for (const b of buildings) {
    const workforce = b.Pioneers + b.Settlers + b.Technicians + b.Engineers + b.Scientists
    if (workforce > 0) out.add(b.Ticker)
  }
  return out
}

/**
 * Build per-location stock records filtered to the given storage types per location.
 * Stock is summed across whatever storage types actually exist at each location.
 * The solver honors stockMode, so we always include raw numbers here and let the
 * solver zero them out when stockMode='ignored'.
 */
// Module-level cache for system coordinates (fetched from FIO /systemstars).
// Systems don't move, so this is valid for the lifetime of the server process.
let systemCoordsCache: Map<string, { x: number; z: number }> | null = null

async function getSystemCoordinates(): Promise<Map<string, { x: number; z: number }>> {
  if (systemCoordsCache) return systemCoordsCache
  const client = new FioClient()
  const systems =
    await client.fetchJson<Array<{ NaturalId: string; PositionX: number; PositionZ: number }>>(
      '/systemstars'
    )
  const map = new Map<string, { x: number; z: number }>()
  for (const s of systems) {
    map.set(s.NaturalId, { x: s.PositionX, z: s.PositionZ })
  }
  systemCoordsCache = map
  return map
}

async function loadStockByLocation(
  userId: number,
  locationIds: string[],
  storageTypesByLocation: Map<string, Set<string>>
): Promise<Map<string, Record<string, number>>> {
  const stockByLoc = new Map<string, Record<string, number>>()
  for (const loc of locationIds) stockByLoc.set(loc, {})
  if (locationIds.length === 0) return stockByLoc

  const rows = await db
    .select({
      locationId: fioUserStorage.locationId,
      storageType: fioUserStorage.type,
      commodityTicker: fioInventory.commodityTicker,
      quantity: fioInventory.quantity,
    })
    .from(fioInventory)
    .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
    .where(and(eq(fioUserStorage.userId, userId), inArray(fioUserStorage.locationId, locationIds)))

  for (const row of rows) {
    if (!row.locationId) continue
    const allowed = storageTypesByLocation.get(row.locationId)
    if (allowed && allowed.size > 0 && !allowed.has(row.storageType)) continue
    const bucket = stockByLoc.get(row.locationId)
    if (!bucket) continue
    bucket[row.commodityTicker] = (bucket[row.commodityTicker] ?? 0) + row.quantity
  }

  return stockByLoc
}

/** Simple in-memory cache for jump distances computed during one graph build. */
function makeJumpDistance(): JumpDistanceFn {
  const cache = new Map<string, number | null>()
  const client = new FioClient()
  // Note: we return a synchronous function by priming the cache on demand from
  // an async source is awkward, so we fall back to equal-distance (null) when
  // unknown. Upstream code warms the cache before calling solve().
  return (from: string, to: string) => {
    if (from === to) return 0
    const key = [from, to].sort().join('|')
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    // Kick off async fetch in the background; subsequent solves will benefit.
    client
      .getJumpCount(from, to)
      .then(count => cache.set(key, count))
      .catch(() => cache.set(key, null))
    return null
  }
}

export async function buildAndSolveGraph(userId: number): Promise<LogisticsGraph> {
  // ---- Load settings ----
  const burnDays =
    ((await userSettingsService.getSetting(userId, 'burnRepair.burnDays')) as number) ?? 7
  const repairDays =
    ((await userSettingsService.getSetting(userId, 'burnRepair.repairDays')) as number) ?? 0
  const conditionMode =
    ((await userSettingsService.getSetting(userId, 'burnRepair.conditionMode')) as
      | 'actual'
      | 'max') ?? 'max'
  const stockMode =
    ((await userSettingsService.getSetting(userId, 'burnRepair.stockMode')) as
      | 'included'
      | 'ignored') ?? 'included'
  const settings: SolverSettings = { burnDays, repairDays, conditionMode, stockMode }

  // ---- Load flows ----
  const flowRows = await db.select().from(logisticsFlows).where(eq(logisticsFlows.userId, userId))

  // ---- Load claims ----
  const claimRows = await db
    .select()
    .from(locationDemandClaims)
    .where(eq(locationDemandClaims.userId, userId))

  // ---- Load user's synced planets for FIO-derived natives ----
  const userPlanets = await db
    .select({
      id: fioUserPlanets.id,
      planetNaturalId: fioUserPlanets.planetNaturalId,
      planetName: fioUserPlanets.planetName,
    })
    .from(fioUserPlanets)
    .where(eq(fioUserPlanets.userId, userId))

  const planetDbIdByLoc = new Map<string, number>()
  const planetNameByLoc = new Map<string, string>()
  for (const p of userPlanets) {
    planetDbIdByLoc.set(p.planetNaturalId, p.id)
    planetNameByLoc.set(p.planetNaturalId, p.planetName)
  }

  // ---- FIO-excluded locations: user told the sync to skip these, so they
  // shouldn't show up as standalone nodes in the graph. If a flow or claim
  // explicitly touches one, we still include it below (union rule).
  const fioExcludedLocations =
    ((await userSettingsService.getSetting(userId, 'fio.excludedLocations')) as string[]) ?? []
  const fioExcluded = new Set(fioExcludedLocations)

  // ---- Determine the set of nodes in the graph ----
  // Union of: every location touched by a flow or claim, plus all of the user's
  // synced planets (minus any that are in fio.excludedLocations).
  const nodeLocIds = new Set<string>()
  for (const p of userPlanets) {
    if (fioExcluded.has(p.planetNaturalId)) continue
    nodeLocIds.add(p.planetNaturalId)
  }
  for (const f of flowRows) {
    nodeLocIds.add(f.fromLocationId)
    nodeLocIds.add(f.toLocationId)
  }
  for (const c of claimRows) nodeLocIds.add(c.locationId)

  // ---- Load location display names for any non-planet nodes we need ----
  const locationRows =
    nodeLocIds.size > 0
      ? await db
          .select({
            naturalId: fioLocations.naturalId,
            name: fioLocations.name,
            systemNaturalId: fioLocations.systemNaturalId,
            systemName: fioLocations.systemName,
          })
          .from(fioLocations)
          .where(inArray(fioLocations.naturalId, [...nodeLocIds]))
      : []
  const locationNameById = new Map<string, string>()
  const locationSystemById = new Map<string, { systemNaturalId: string; systemName: string }>()
  for (const row of locationRows) {
    locationNameById.set(row.naturalId, row.name ?? row.naturalId)
    locationSystemById.set(row.naturalId, {
      systemNaturalId: row.systemNaturalId,
      systemName: row.systemName,
    })
  }

  // Fetch system coordinates for the universe layout
  const systemCoords = await getSystemCoordinates()

  // ---- Determine which tickers we need FIO-derived natives for ----
  // Starts empty per planet, then pre-scans FIO workforce needs and production
  // orders so every material the planet actually burns or produces is counted,
  // not just the ones currently referenced by a flow/claim. Flow/claim tickers
  // are unioned in on top so non-planet claim locations are covered too.
  const tickersByPlanet = new Map<string, Set<string>>()
  for (const loc of nodeLocIds) {
    if (planetDbIdByLoc.has(loc)) tickersByPlanet.set(loc, new Set())
  }

  const planetDbIds = [...planetDbIdByLoc.values()]
  if (planetDbIds.length > 0) {
    // Workforce needs — one query across all user planets, group by planet.
    const wfRows = await db
      .select({
        planetDbId: fioPlanetWorkforce.userPlanetId,
        needs: fioPlanetWorkforce.needs,
      })
      .from(fioPlanetWorkforce)
      .where(inArray(fioPlanetWorkforce.userPlanetId, planetDbIds))

    const dbIdToLoc = new Map<number, string>()
    for (const [loc, dbId] of planetDbIdByLoc) dbIdToLoc.set(dbId, loc)

    for (const row of wfRows) {
      const loc = dbIdToLoc.get(row.planetDbId)
      if (!loc) continue
      const set = tickersByPlanet.get(loc)
      if (!set) continue
      const needs = row.needs as { MaterialTicker: string; UnitsPerInterval: number }[]
      for (const n of needs) {
        if (n.UnitsPerInterval > 0) set.add(n.MaterialTicker)
      }
    }

    // Production orders — one query across all user planets, group by planet.
    const prodRows = await db
      .select({
        planetDbId: fioPlanetProduction.userPlanetId,
        orders: fioPlanetProduction.orders,
      })
      .from(fioPlanetProduction)
      .where(inArray(fioPlanetProduction.userPlanetId, planetDbIds))

    for (const row of prodRows) {
      const loc = dbIdToLoc.get(row.planetDbId)
      if (!loc) continue
      const set = tickersByPlanet.get(loc)
      if (!set) continue
      const orders = row.orders as {
        Recurring: boolean
        Inputs: { MaterialTicker: string }[]
        Outputs: { MaterialTicker: string }[]
      }[]
      for (const order of orders) {
        if (!order.Recurring) continue
        for (const i of order.Inputs ?? []) set.add(i.MaterialTicker)
        for (const o of order.Outputs ?? []) set.add(o.MaterialTicker)
      }
    }
  }

  // Union in anything explicitly touched by a flow or claim.
  for (const f of flowRows) {
    if (tickersByPlanet.has(f.fromLocationId))
      tickersByPlanet.get(f.fromLocationId)!.add(f.commodityTicker)
    if (tickersByPlanet.has(f.toLocationId))
      tickersByPlanet.get(f.toLocationId)!.add(f.commodityTicker)
  }
  for (const c of claimRows) {
    if (tickersByPlanet.has(c.locationId)) tickersByPlanet.get(c.locationId)!.add(c.commodityTicker)
  }

  // ---- Compute node natives per planet ----
  // We return a SolverNode per location in `nodeLocIds`. Planets get full FIO math;
  // non-planet locations (hubs) get empty natives and will rely on claims + flows only.
  const repairableTickers = await getRepairableBuildingTickers()
  const now = new Date()
  const solverNodes: SolverNode[] = []
  const storageTypesByLocation = new Map<string, Set<string>>()

  for (const loc of nodeLocIds) {
    const planetDbId = planetDbIdByLoc.get(loc)
    const nativeConsumption: Record<string, number> = {}
    const nativeProduction: Record<string, number> = {}
    const consumptionBreakdown: Record<string, NativeConsumptionBreakdown> = {}

    if (planetDbId) {
      const tickers = tickersByPlanet.get(loc) ?? new Set<string>()

      // Workforce burn — daily rate * burnDays = total
      if (tickers.size > 0) {
        const burnRates = await getAllBurnRates(planetDbId, tickers)
        for (const [t, rate] of Object.entries(burnRates)) {
          const total = rate * burnDays
          if (total > 0) {
            nativeConsumption[t] = (nativeConsumption[t] ?? 0) + total
            addToBreakdown(consumptionBreakdown, t, 'workforceBurn', total)
          }
        }

        // Production rates — dailyInput becomes consumption, dailyOutput becomes production.
        const prodRates = await getAllProductionRates(planetDbId, tickers, conditionMode === 'max')
        for (const [t, { dailyInput, dailyOutput }] of Object.entries(prodRates)) {
          const netConsumption = Math.max(0, dailyInput - dailyOutput) * burnDays
          const netProduction = Math.max(0, dailyOutput - dailyInput) * burnDays
          if (netConsumption > 0) {
            nativeConsumption[t] = (nativeConsumption[t] ?? 0) + netConsumption
            addToBreakdown(consumptionBreakdown, t, 'productionInputs', netConsumption)
          }
          if (netProduction > 0) {
            nativeProduction[t] = (nativeProduction[t] ?? 0) + netProduction
          }
        }
      }

      // Repair — project repair cost over repairDays
      if (repairDays > 0) {
        const effectiveRepairDays = repairDays
        const buildingRows = await db
          .select({
            buildingTicker: fioPlanetBuildings.buildingTicker,
            buildingCreated: fioPlanetBuildings.buildingCreated,
            buildingLastRepair: fioPlanetBuildings.buildingLastRepair,
            condition: fioPlanetBuildings.condition,
            repairMaterials: fioPlanetBuildings.repairMaterials,
            reclaimableMaterials: fioPlanetBuildings.reclaimableMaterials,
          })
          .from(fioPlanetBuildings)
          .where(eq(fioPlanetBuildings.userPlanetId, planetDbId))

        for (const row of buildingRows) {
          if (!repairableTickers.has(row.buildingTicker)) continue
          const building: BuildingData = {
            buildingTicker: row.buildingTicker,
            buildingCreated: row.buildingCreated,
            buildingLastRepair: row.buildingLastRepair,
            condition: Number(row.condition),
            repairMaterials: (
              row.repairMaterials as { MaterialTicker: string; MaterialAmount: number }[]
            ).map(m => ({ ticker: m.MaterialTicker, amount: m.MaterialAmount })),
            reclaimableMaterials: (
              row.reclaimableMaterials as { MaterialTicker: string; MaterialAmount: number }[]
            ).map(m => ({ ticker: m.MaterialTicker, amount: m.MaterialAmount })),
          }
          const needs = calculateBuildingRepairNeeds(building, effectiveRepairDays, now)
          for (const need of needs) {
            nativeConsumption[need.ticker] = (nativeConsumption[need.ticker] ?? 0) + need.amount
            addToBreakdown(consumptionBreakdown, need.ticker, 'repair', need.amount)
          }
        }
      }
    }

    // Claims for this location — convert to total over burnDays, add to nativeConsumption.
    for (const claim of claimRows) {
      if (claim.locationId !== loc) continue
      const total = claim.rate === 'daily' ? claim.quantity * burnDays : claim.quantity
      nativeConsumption[claim.commodityTicker] =
        (nativeConsumption[claim.commodityTicker] ?? 0) + total
      addClaimToBreakdown(
        consumptionBreakdown,
        claim.commodityTicker,
        claim.category as ClaimCategory,
        total
      )
    }

    // Collect storage types touched by any flow at this location (used for stock filtering)
    const storageTypes = new Set<string>()
    for (const f of flowRows) {
      if (f.fromLocationId === loc) {
        for (const st of f.fromStorageTypes as string[]) storageTypes.add(st)
      }
      if (f.toLocationId === loc) {
        for (const st of f.toStorageTypes as string[]) storageTypes.add(st)
      }
    }
    storageTypesByLocation.set(loc, storageTypes)

    const sysInfo = locationSystemById.get(loc)
    const sysCoord = sysInfo ? systemCoords.get(sysInfo.systemNaturalId) : undefined

    solverNodes.push({
      locationId: loc,
      locationName: planetNameByLoc.get(loc) ?? locationNameById.get(loc) ?? loc,
      systemNaturalId: sysInfo?.systemNaturalId ?? '',
      systemName: sysInfo?.systemName ?? '',
      systemPositionX: sysCoord?.x,
      systemPositionZ: sysCoord?.z,
      stock: {}, // filled in below
      nativeConsumption,
      nativeProduction,
      consumptionBreakdown,
    })
  }

  // ---- Load stock ----
  const stockByLoc = await loadStockByLocation(userId, [...nodeLocIds], storageTypesByLocation)
  for (const node of solverNodes) {
    node.stock = stockByLoc.get(node.locationId) ?? {}
  }

  // ---- Build solver edges ----
  const solverEdges: SolverEdge[] = flowRows.map(row => {
    const amt =
      row.kind === 'fixed'
        ? row.rate === 'daily'
          ? (row.amountOverride ?? 0) * burnDays
          : (row.amountOverride ?? 0)
        : null
    return {
      id: row.id,
      fromLocationId: row.fromLocationId,
      toLocationId: row.toLocationId,
      commodityTicker: row.commodityTicker,
      kind: row.kind as FlowKind,
      amountOverride: amt,
      priority: row.priority,
      note: row.note,
    }
  })

  // ---- Run solver ----
  const graph = solve({
    nodes: solverNodes,
    edges: solverEdges,
    settings,
    getJumpDistance: makeJumpDistance(),
  })

  // Suppress unused-import lint noise from the CATEGORIES constant if not referenced elsewhere
  void CATEGORIES
  return graph
}
