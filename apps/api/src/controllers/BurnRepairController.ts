import { Controller, Get, Post, Route, Security, Tags, Request, Body } from 'tsoa'
import {
  db,
  burnRepairCache,
  userRoles,
  users,
  userSettings,
  fioUserPlanets,
  fioPlanetBuildings,
  fioPlanetWorkforce,
  fioUserStorage,
  fioInventory,
  sellOrders,
} from '../db/index.js'
import { eq, inArray, sql, and } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import * as userSettingsService from '@kawakawa/services/user-settings'
import { getRepairableTickers } from '@kawakawa/services/supply'
import { enrichSellOrdersWithQuantities } from '@kawakawa/services/market'
import type {
  BurnRepairMyBasesResponse,
  BurnRepairPlanetSummary,
  BurnRepairBuildingInstance,
  BurnRepairCorpResponse,
  BurnRepairCorpMaterial,
  BurnRepairCorpPerUserRow,
  BurnRepairCorpBuildingsResponse,
  BurnRepairCorpWorkforceResponse,
  BurnRepairWorkforceEntry,
  BurnRepairShoppingListRequest,
  BurnRepairShoppingListResponse,
  BurnRepairShoppingListItem,
  BurnRepairCacheRow,
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
   */
  @Get('corp')
  public async getCorpOverview(
    @Request() request: { user: JwtPayload }
  ): Promise<BurnRepairCorpResponse> {
    const { activeUserIds, staleUserCount, fioAgeMap } = await this.getIncludedUserIds(
      request.user.userId
    )

    if (activeUserIds.length === 0) {
      return {
        materials: [],
        includedUserCount: 0,
        staleUserCount,
        availableSurplus: {},
        perUser: [],
      }
    }

    const [rows, perUserRows, availableSurplus, usernameMap] = await Promise.all([
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
      this.computeAvailableSurplus(activeUserIds),
      this.getDisplayUsernames(activeUserIds),
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
      perUser,
    }
  }

  /**
   * Build a userId → display name map for the given users.
   * Prefers the FIO username (fio.username user setting, JSON-encoded) which
   * matches the PrUn in-game name 1:1. Falls back to users.username when unset.
   */
  private async getDisplayUsernames(userIds: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>()
    if (userIds.length === 0) return map

    const [loginRows, fioRows] = await Promise.all([
      db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds)),
      db
        .select({ userId: userSettings.userId, value: userSettings.value })
        .from(userSettings)
        .where(
          and(inArray(userSettings.userId, userIds), eq(userSettings.settingKey, 'fio.username'))
        ),
    ])

    for (const r of loginRows) map.set(r.id, r.username)
    for (const r of fioRows) {
      try {
        const parsed = JSON.parse(r.value)
        if (typeof parsed === 'string' && parsed.length > 0) map.set(r.userId, parsed)
      } catch {
        // Malformed setting value; keep login username fallback
      }
    }
    return map
  }

  /**
   * Sum corp-wide remaining sell-order quantity per ticker.
   * Uses the same enrichment pipeline as /sell-orders so reservations and FIO-aware
   * fulfilment are accounted for; we just collapse to ticker totals.
   */
  private async computeAvailableSurplus(userIds: number[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {}

    const orders = await db
      .select({
        id: sellOrders.id,
        userId: sellOrders.userId,
        commodityTicker: sellOrders.commodityTicker,
        locationId: sellOrders.locationId,
        limitMode: sellOrders.limitMode,
        limitQuantity: sellOrders.limitQuantity,
      })
      .from(sellOrders)
      .where(inArray(sellOrders.userId, userIds))

    if (orders.length === 0) return {}

    const quantityMap = await enrichSellOrdersWithQuantities(orders)

    const totals: Record<string, number> = {}
    for (const o of orders) {
      const q = quantityMap.get(o.id)?.remainingQuantity ?? 0
      if (q <= 0) continue
      totals[o.commodityTicker] = (totals[o.commodityTicker] ?? 0) + q
    }
    return totals
  }

  /**
   * Get corp-wide building counts by ticker.
   */
  @Get('corp/buildings')
  public async getCorpBuildings(
    @Request() request: { user: JwtPayload }
  ): Promise<BurnRepairCorpBuildingsResponse> {
    const { activeUserIds } = await this.getIncludedUserIds(request.user.userId)

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
    @Request() request: { user: JwtPayload }
  ): Promise<BurnRepairCorpWorkforceResponse> {
    const { activeUserIds } = await this.getIncludedUserIds(request.user.userId)

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

  /** FIO uploads older than this mean the player hasn't logged into PrUn with FIO enabled recently — exclude them from corp aggregates. */
  private static readonly STALE_DATA_DAYS = 30

  /**
   * Resolve which user IDs are included in corp-wide views.
   *
   * Filters by `burnRepair.includedRoles` AND FIO upload freshness: a user is
   * kept only when the oldest `fio_user_storage.fio_uploaded_at` across their
   * storages is within the cutoff. Users without any FIO uploads are excluded.
   *
   * We check FIO upload age (not `burn_repair_cache.computed_at`) because
   * computed_at is bumped whenever our backend recomputes — it says nothing
   * about whether the underlying FIO data is fresh. An inactive player whose
   * cache was recomputed today still has stale game data.
   *
   * The FIO age map is returned alongside the IDs so callers can reuse it
   * without re-querying.
   */
  private async getIncludedUserIds(requestingUserId: number): Promise<{
    activeUserIds: number[]
    staleUserCount: number
    fioAgeMap: Map<number, string>
  }> {
    const includedRoles =
      ((await userSettingsService.getSetting(
        requestingUserId,
        'burnRepair.includedRoles'
      )) as string[]) ?? []

    if (includedRoles.length === 0) {
      return { activeUserIds: [], staleUserCount: 0, fioAgeMap: new Map() }
    }

    // Get all users with matching roles
    const roleRows = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(inArray(userRoles.roleId, includedRoles))

    const allUserIds = [...new Set(roleRows.map(r => r.userId))]
    if (allUserIds.length === 0) {
      return { activeUserIds: [], staleUserCount: 0, fioAgeMap: new Map() }
    }

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - BurnRepairController.STALE_DATA_DAYS)

    // Oldest FIO upload across each user's storages. Users with no rows (never
    // uploaded to FIO) are absent from the result and excluded below.
    const ageRows = await db
      .select({
        userId: fioUserStorage.userId,
        oldest: sql<Date | null>`MIN(${fioUserStorage.fioUploadedAt})`,
      })
      .from(fioUserStorage)
      .where(inArray(fioUserStorage.userId, allUserIds))
      .groupBy(fioUserStorage.userId)

    const fioAgeMap = new Map<number, string>()
    const activeUserIds: number[] = []
    for (const r of ageRows) {
      if (r.oldest === null || r.oldest === undefined) continue
      const date = r.oldest instanceof Date ? r.oldest : new Date(r.oldest)
      const iso = date.toISOString()
      fioAgeMap.set(r.userId, iso)
      if (date > cutoff) activeUserIds.push(r.userId)
    }

    const staleUserCount = allUserIds.length - activeUserIds.length

    return { activeUserIds, staleUserCount, fioAgeMap }
  }

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
