import { Controller, Get, Path, Post, Query, Route, Security, Tags, Request, Body } from 'tsoa'
import {
  db,
  burnRepairCache,
  fioUserPlanets,
  fioPlanetBuildings,
  fioPlanetWorkforce,
  fioUserStorage,
  fioInventory,
} from '../db/index.js'
import { eq, inArray, sql, and } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import {
  computeCorpListedStock,
  computeCorpStock,
  getRepairableTickers,
  resolveActiveMembers,
  resolveDisplayUsernames,
} from '@kawakawa/services/burn-repair'
import type {
  BurnRepairMyBasesResponse,
  BurnRepairPlanetSummary,
  BurnRepairBuildingInstance,
  BurnRepairCorpResponse,
  BurnRepairCorpMaterial,
  BurnRepairCorpPerUserRow,
  ExcludedMember,
  BurnRepairCorpBuildingsResponse,
  BurnRepairCorpWorkforceResponse,
  BurnRepairWorkforceEntry,
  BurnRepairShoppingListRequest,
  BurnRepairShoppingListResponse,
  BurnRepairShoppingListItem,
  BurnRepairCacheRow,
  BurnRepairCorpMaterialBreakdown,
  BurnRepairCorpMaterialUserContribution,
} from '@kawakawa/types'
import { BadRequest } from '../utils/errors.js'

@Route('burn-repair')
@Tags('Burn & Repair')
@Security('jwt')
export class BurnRepairController extends Controller {
  /**
   * Get burn/repair data for the current user's bases.
   * Returns pre-computed daily burn rates, input rates, and repair totals
   * grouped by planet. Also includes building count and workforce summary.
   */
  @Get('my-bases')
  public async getMyBases(
    @Request() request: { user: JwtPayload }
  ): Promise<BurnRepairMyBasesResponse> {
    const userId = request.user.userId

    // Get cached burn/repair data
    const cacheRows = await db
      .select()
      .from(burnRepairCache)
      .where(eq(burnRepairCache.userId, userId))
      .orderBy(burnRepairCache.planetName, burnRepairCache.commodityTicker)

    // Get planet summaries (buildings + workforce)
    const planets = await db.query.fioUserPlanets.findMany({
      where: eq(fioUserPlanets.userId, userId),
      with: {
        buildings: true,
        workforce: true,
      },
    })

    const repairableTickers = await getRepairableTickers()
    const now = Date.now()
    const MS_PER_DAY = 86_400_000

    // Group cache rows by planet
    const planetMap = new Map<string, BurnRepairCacheRow[]>()
    let latestComputedAt: Date | null = null
    for (const row of cacheRows) {
      const key = row.planetNaturalId
      if (!planetMap.has(key)) planetMap.set(key, [])
      planetMap.get(key)!.push({
        planetNaturalId: row.planetNaturalId,
        planetName: row.planetName,
        commodityTicker: row.commodityTicker,
        burnDaily: Number(row.burnDaily),
        inputsDaily: Number(row.inputsDaily),
        repairTotal: Number(row.repairTotal),
        productionDaily: Number(row.productionDaily),
      })
      if (!latestComputedAt || row.computedAt > latestComputedAt) {
        latestComputedAt = row.computedAt
      }
    }

    const result: BurnRepairPlanetSummary[] = []

    for (const planet of planets) {
      const materials = planetMap.get(planet.planetNaturalId) ?? []
      const workforceSummary = planet.workforce.map(w => ({
        type: w.workforceType,
        population: w.population,
        required: w.required,
      }))

      const buildings: BurnRepairBuildingInstance[] = planet.buildings.map(b => {
        const anchor = b.buildingLastRepair ?? b.buildingCreated
        const ageDays = anchor ? (now - new Date(anchor).getTime()) / MS_PER_DAY : 0
        return {
          ticker: b.buildingTicker,
          ageDays,
          needsRepair: repairableTickers.has(b.buildingTicker),
        }
      })

      result.push({
        planetNaturalId: planet.planetNaturalId,
        planetName: planet.planetName,
        userPlanetId: planet.id,
        materials,
        buildingCount: planet.buildings.length,
        buildings,
        workforceSummary,
        computedAt: latestComputedAt?.toISOString() ?? '',
      })
    }

    return { planets: result }
  }

  /**
   * Get corp-wide aggregated burn/repair data.
   * Sums across all users whose roles match the burnRepair.includedRoles setting.
   *
   * `excludedUserIds` is a CSV of user IDs to additionally exclude on top of
   * the role + FIO-freshness filter. Used by the "Users included" planning
   * dropdown so the corp view can be modeled as if specific members weren't
   * around (e.g. summer-vacation gap planning).
   */
  @Get('corp')
  public async getCorpOverview(
    @Request() request: { user: JwtPayload },
    @Query() excludedUserIds?: string
  ): Promise<BurnRepairCorpResponse> {
    const resolved = await resolveActiveMembers(request.user.userId)
    const manuallyExcludedIds = parseExcludedUserIds(excludedUserIds).filter(id =>
      resolved.activeUserIds.includes(id)
    )
    const activeUserIds = applyExclusion(resolved.activeUserIds, excludedUserIds)
    const staleUserCount = resolved.staleUserCount
    const fioAgeMap = resolved.fioAgeMap

    // Resolve display names for both groups: still-active members (for perUser
    // rows) and excluded members (for the chip tooltip). One batched lookup
    // keeps it to a single round trip even when the exclusion list is large.
    const allDisplayNameIds = [...activeUserIds, ...manuallyExcludedIds, ...resolved.staleUserIds]
    const usernameMap = await resolveDisplayUsernames([...new Set(allDisplayNameIds)])

    const excludedMembers = buildExcludedMembers(
      manuallyExcludedIds,
      resolved.staleUserIds,
      fioAgeMap,
      usernameMap
    )

    if (activeUserIds.length === 0) {
      return {
        materials: [],
        includedUserCount: 0,
        staleUserCount,
        availableSurplus: {},
        listedStock: {},
        perUser: [],
        excludedMembers,
      }
    }

    const [rows, perUserRows, availableSurplus, listedStock] = await Promise.all([
      db
        .select({
          commodityTicker: burnRepairCache.commodityTicker,
          burnDaily: sql<string>`SUM(${burnRepairCache.burnDaily})`,
          inputsDaily: sql<string>`SUM(${burnRepairCache.inputsDaily})`,
          repairTotal: sql<string>`SUM(${burnRepairCache.repairTotal})`,
          productionDaily: sql<string>`SUM(${burnRepairCache.productionDaily})`,
        })
        .from(burnRepairCache)
        .where(inArray(burnRepairCache.userId, activeUserIds))
        .groupBy(burnRepairCache.commodityTicker)
        .orderBy(burnRepairCache.commodityTicker),
      db
        .select({
          userId: burnRepairCache.userId,
          commodityTicker: burnRepairCache.commodityTicker,
          burnDaily: sql<string>`SUM(${burnRepairCache.burnDaily})`,
          inputsDaily: sql<string>`SUM(${burnRepairCache.inputsDaily})`,
          repairTotal: sql<string>`SUM(${burnRepairCache.repairTotal})`,
          productionDaily: sql<string>`SUM(${burnRepairCache.productionDaily})`,
        })
        .from(burnRepairCache)
        .where(inArray(burnRepairCache.userId, activeUserIds))
        .groupBy(burnRepairCache.userId, burnRepairCache.commodityTicker),
      computeCorpStock(activeUserIds),
      computeCorpListedStock(activeUserIds),
    ])

    const materials: BurnRepairCorpMaterial[] = rows.map(r => ({
      commodityTicker: r.commodityTicker,
      burnDaily: Number(r.burnDaily),
      inputsDaily: Number(r.inputsDaily),
      repairTotal: Number(r.repairTotal),
      productionDaily: Number(r.productionDaily),
    }))

    const perUser: BurnRepairCorpPerUserRow[] = perUserRows.map(r => ({
      userId: r.userId,
      username: usernameMap.get(r.userId) ?? `user:${r.userId}`,
      commodityTicker: r.commodityTicker,
      burnDaily: Number(r.burnDaily),
      inputsDaily: Number(r.inputsDaily),
      repairTotal: Number(r.repairTotal),
      productionDaily: Number(r.productionDaily),
      fioDataAge: fioAgeMap.get(r.userId) ?? null,
    }))

    return {
      materials,
      includedUserCount: activeUserIds.length,
      staleUserCount,
      availableSurplus,
      listedStock,
      perUser,
      excludedMembers,
    }
  }

  /**
   * Get corp-wide building counts by ticker.
   */
  @Get('corp/buildings')
  public async getCorpBuildings(
    @Request() request: { user: JwtPayload },
    @Query() excludedUserIds?: string
  ): Promise<BurnRepairCorpBuildingsResponse> {
    const resolved = await resolveActiveMembers(request.user.userId)
    const activeUserIds = applyExclusion(resolved.activeUserIds, excludedUserIds)

    if (activeUserIds.length === 0) {
      return { buildings: {}, totalBuildings: 0 }
    }

    const rows = await db
      .select({
        buildingTicker: fioPlanetBuildings.buildingTicker,
        count: sql<string>`COUNT(*)`,
      })
      .from(fioPlanetBuildings)
      .innerJoin(fioUserPlanets, eq(fioPlanetBuildings.userPlanetId, fioUserPlanets.id))
      .where(inArray(fioUserPlanets.userId, activeUserIds))
      .groupBy(fioPlanetBuildings.buildingTicker)
      .orderBy(fioPlanetBuildings.buildingTicker)

    const buildings: Record<string, number> = {}
    let totalBuildings = 0
    for (const r of rows) {
      const count = Number(r.count)
      buildings[r.buildingTicker] = count
      totalBuildings += count
    }

    return { buildings, totalBuildings }
  }

  /**
   * Get corp-wide workforce summary.
   */
  @Get('corp/workforce')
  public async getCorpWorkforce(
    @Request() request: { user: JwtPayload },
    @Query() excludedUserIds?: string
  ): Promise<BurnRepairCorpWorkforceResponse> {
    const resolved = await resolveActiveMembers(request.user.userId)
    const activeUserIds = applyExclusion(resolved.activeUserIds, excludedUserIds)

    if (activeUserIds.length === 0) {
      return { workforce: [] }
    }

    const rows = await db
      .select({
        workforceType: fioPlanetWorkforce.workforceType,
        totalPopulation: sql<string>`SUM(${fioPlanetWorkforce.population})`,
        totalRequired: sql<string>`SUM(${fioPlanetWorkforce.required})`,
      })
      .from(fioPlanetWorkforce)
      .innerJoin(fioUserPlanets, eq(fioPlanetWorkforce.userPlanetId, fioUserPlanets.id))
      .where(inArray(fioUserPlanets.userId, activeUserIds))
      .groupBy(fioPlanetWorkforce.workforceType)
      .orderBy(fioPlanetWorkforce.workforceType)

    const workforce: BurnRepairWorkforceEntry[] = rows.map(r => ({
      type: r.workforceType,
      totalPopulation: Number(r.totalPopulation),
      totalRequired: Number(r.totalRequired),
    }))

    return { workforce }
  }

  /**
   * Per-ticker breakdown for the "where do these numbers come from?" modal.
   *
   * Aggregates production, workforce burn, and production inputs for a single
   * commodity, then exposes the user × planet rows that fold into them. Stock
   * and repair are intentionally omitted — neither drills cleanly through
   * `burn_repair_cache` and both are tracked separately for now.
   */
  @Get('corp/material/{ticker}')
  public async getCorpMaterialBreakdown(
    @Path() ticker: string,
    @Request() request: { user: JwtPayload },
    @Query() excludedUserIds?: string
  ): Promise<BurnRepairCorpMaterialBreakdown> {
    const tickerKey = ticker.trim().toUpperCase()
    if (tickerKey.length === 0) {
      throw BadRequest('ticker is required')
    }

    const resolved = await resolveActiveMembers(request.user.userId)
    const activeUserIds = applyExclusion(resolved.activeUserIds, excludedUserIds)

    if (activeUserIds.length === 0) {
      return {
        commodityTicker: tickerKey,
        productionDaily: 0,
        burnDaily: 0,
        inputsDaily: 0,
        consumptionDaily: 0,
        perUser: [],
      }
    }

    const [rows, usernameMap] = await Promise.all([
      db
        .select({
          userId: burnRepairCache.userId,
          planetNaturalId: burnRepairCache.planetNaturalId,
          planetName: burnRepairCache.planetName,
          burnDaily: burnRepairCache.burnDaily,
          inputsDaily: burnRepairCache.inputsDaily,
          productionDaily: burnRepairCache.productionDaily,
        })
        .from(burnRepairCache)
        .where(
          and(
            inArray(burnRepairCache.userId, activeUserIds),
            eq(burnRepairCache.commodityTicker, tickerKey)
          )
        ),
      resolveDisplayUsernames(activeUserIds),
    ])

    type UserAccumulator = BurnRepairCorpMaterialUserContribution

    const usersById = new Map<number, UserAccumulator>()
    let totalProduction = 0
    let totalBurn = 0
    let totalInputs = 0

    for (const r of rows) {
      const burnDaily = Number(r.burnDaily)
      const inputsDaily = Number(r.inputsDaily)
      const productionDaily = Number(r.productionDaily)

      // A row that's all zero contributes nothing — drop it so the modal isn't
      // padded with empty planets for users who happen to have a base that
      // doesn't touch this ticker.
      if (burnDaily === 0 && inputsDaily === 0 && productionDaily === 0) continue

      totalBurn += burnDaily
      totalInputs += inputsDaily
      totalProduction += productionDaily

      let user = usersById.get(r.userId)
      if (!user) {
        user = {
          userId: r.userId,
          username: usernameMap.get(r.userId) ?? `user:${r.userId}`,
          productionDaily: 0,
          burnDaily: 0,
          inputsDaily: 0,
          perPlanet: [],
        }
        usersById.set(r.userId, user)
      }
      user.productionDaily += productionDaily
      user.burnDaily += burnDaily
      user.inputsDaily += inputsDaily
      user.perPlanet.push({
        planetNaturalId: r.planetNaturalId,
        planetName: r.planetName,
        productionDaily,
        burnDaily,
        inputsDaily,
      })
    }

    const perUser: BurnRepairCorpMaterialUserContribution[] = [...usersById.values()]
    for (const u of perUser) {
      u.perPlanet.sort((a, b) => a.planetName.localeCompare(b.planetName))
    }
    // Sort users by their footprint so the heaviest contributors land at the
    // top of the modal. Tie-break alphabetically for stable ordering.
    perUser.sort((a, b) => {
      const aw = a.productionDaily + a.burnDaily + a.inputsDaily
      const bw = b.productionDaily + b.burnDaily + b.inputsDaily
      if (aw !== bw) return bw - aw
      return a.username.localeCompare(b.username)
    })

    return {
      commodityTicker: tickerKey,
      productionDaily: totalProduction,
      burnDaily: totalBurn,
      inputsDaily: totalInputs,
      consumptionDaily: totalBurn + totalInputs,
      perUser,
    }
  }

  /**
   * Generate a shopping list for a specific base.
   * Formula: (burn_daily + inputs_daily) * days + repair_total - origin_stock - base_stock
   * Per-user scope: only the requesting user's demand and stock.
   */
  @Post('shopping-list')
  public async getShoppingList(
    @Body() body: BurnRepairShoppingListRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BurnRepairShoppingListResponse> {
    const userId = request.user.userId
    const { originLocationId, basePlanetId, days } = body

    if (days <= 0) {
      this.setStatus(400)
      throw BadRequest('Days must be greater than 0')
    }

    // Get cache rows for the specified base
    const cacheRows = await db
      .select()
      .from(burnRepairCache)
      .where(
        and(eq(burnRepairCache.userId, userId), eq(burnRepairCache.planetNaturalId, basePlanetId))
      )

    // Get user's inventory at origin
    const originStock = await this.getInventoryAtLocation(userId, originLocationId)

    // Get user's inventory at base
    const baseStock = await this.getInventoryAtLocation(userId, basePlanetId)

    const items: BurnRepairShoppingListItem[] = []

    for (const row of cacheRows) {
      const consumption =
        (Number(row.burnDaily) + Number(row.inputsDaily)) * days + Number(row.repairTotal)
      const production = Number(row.productionDaily) * days
      const oStock = originStock.get(row.commodityTicker) ?? 0
      const bStock = baseStock.get(row.commodityTicker) ?? 0
      const gap = Math.max(0, Math.ceil(consumption - production - oStock - bStock))

      if (gap > 0) {
        items.push({
          commodityTicker: row.commodityTicker,
          demand: Math.ceil(consumption),
          production: Math.floor(production),
          originStock: oStock,
          baseStock: bStock,
          gap,
        })
      }
    }

    // Sort by gap descending
    items.sort((a, b) => b.gap - a.gap)

    return { items, days, originLocationId, basePlanetId }
  }

  // Active-member resolution + FIO stock aggregation moved to the shared
  // services in `@kawakawa/services/burn-repair` so the scheduled snapshot cron
  // uses the same logic. See `resolveActiveMembers` and `computeCorpStock`.

  /**
   * Get a user's total inventory at a location, grouped by ticker.
   */
  private async getInventoryAtLocation(
    userId: number,
    locationId: string
  ): Promise<Map<string, number>> {
    const rows = await db
      .select({
        ticker: fioInventory.commodityTicker,
        quantity: fioInventory.quantity,
      })
      .from(fioInventory)
      .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
      .where(and(eq(fioUserStorage.userId, userId), eq(fioUserStorage.locationId, locationId)))

    const stock = new Map<string, number>()
    for (const r of rows) {
      stock.set(r.ticker, (stock.get(r.ticker) ?? 0) + r.quantity)
    }
    return stock
  }
}

/** CSV → unique sanitized integer IDs. Shared by applyExclusion + member detail. */
export function parseExcludedUserIds(excludedUserIds?: string): number[] {
  if (!excludedUserIds) return []
  return [
    ...new Set(
      excludedUserIds
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => Number.isInteger(n) && n > 0)
    ),
  ]
}

/**
 * Subtract a CSV exclusion list from the active members. Garbage IDs in the
 * input are silently dropped; empty or missing input is a no-op. Used by every
 * corp endpoint to support the "Users included" planning dropdown without each
 * handler reimplementing the parse/filter dance.
 */
export function applyExclusion(activeUserIds: number[], excludedUserIds?: string): number[] {
  const excluded = new Set(parseExcludedUserIds(excludedUserIds))
  if (excluded.size === 0) return activeUserIds
  return activeUserIds.filter(id => !excluded.has(id))
}

/**
 * Build the per-member breakdown the UI uses for the "N excluded" tooltip.
 * Manual exclusions take precedence over the FIO-stale tag in the (rare) case
 * a user falls into both buckets.
 */
function buildExcludedMembers(
  manuallyExcludedIds: number[],
  staleUserIds: number[],
  fioAgeMap: Map<number, string>,
  usernameMap: Map<number, string>
): ExcludedMember[] {
  const seen = new Set<number>()
  const out: ExcludedMember[] = []
  const push = (userId: number, reason: ExcludedMember['reason']): void => {
    if (seen.has(userId)) return
    seen.add(userId)
    out.push({
      userId,
      username: usernameMap.get(userId) ?? `user:${userId}`,
      fioDataAge: fioAgeMap.get(userId) ?? null,
      reason,
    })
  }
  for (const id of manuallyExcludedIds) push(id, 'manual')
  for (const id of staleUserIds) push(id, 'fio-stale')
  // Sort: manual first then stale, alphabetical within each group.
  return out.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === 'manual' ? -1 : 1
    return a.username.localeCompare(b.username)
  })
}
