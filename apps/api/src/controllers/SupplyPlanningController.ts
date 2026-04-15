import {
  Controller,
  Get,
  Post,
  Delete,
  Route,
  Security,
  Tags,
  Request,
  Body,
  Path,
  Query,
  SuccessResponse,
} from 'tsoa'
import { db, fioUserPlanets, supplyChainLines, shoppingLists } from '../db/index.js'
import { eq, desc } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { syncUserPlanets } from '../services/fio/sync-user-planets.js'
import { getUserPlanetData } from '../services/fio/sync-user-planets.js'
import { FioClient } from '../services/fio/client.js'
import type { FioBuilding } from '../services/fio/types.js'
import { calculateSupply, calculatePlanetSupply } from '../services/supply-calculator.js'
import {
  calculateLineDemand,
  calculateOutputSupply,
  getFilteredStock,
  getAllProductionRates,
  getAllBurnRates,
} from '../services/demand-calculator.js'
import * as userSettingsService from '../services/userSettingsService.js'
import type {
  PlanetSupplyInput,
  PlanetSupplyResult,
  PlanetOverride,
  PlanetOverrides,
  SupplyCalculationOptions,
  SupplyCalculationResult,
  SupplyDashboard,
  LocationDashboard,
  ConnectionDashboard,
  MaterialDashboard,
} from '@kawakawa/types'

interface PlanetSyncResponse {
  success: boolean
  planetsFound: number
  planetsSynced: number
  skippedExcludedPlanets: number
  buildingsSynced: number
  workforceTypesSynced: number
  productionLinesSynced: number
  errors: string[]
}

interface UserPlanetSummary {
  id: number
  planetNaturalId: string
  planetName: string
  lastSyncedAt: string
}

@Route('supply-planning')
@Tags('Supply Planning')
@Security('jwt')
export class SupplyPlanningController extends Controller {
  /**
   * Sync planet data (buildings, workforce, production) from FIO
   * Requires FIO credentials to be configured in user settings
   */
  @Post('sync')
  @SuccessResponse('200', 'Sync completed')
  public async syncPlanetData(
    @Request() request: { user: JwtPayload }
  ): Promise<PlanetSyncResponse> {
    const userId = request.user.userId

    const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(userId)

    if (!fioUsername || !fioApiKey) {
      this.setStatus(400)
      throw BadRequest(
        'FIO credentials not configured. Please set your FIO username and API key in Settings.'
      )
    }

    const excludedPlanets = ((await userSettingsService.getSetting(
      userId,
      'supply.excludedPlanets'
    )) ?? []) as string[]

    const result = await syncUserPlanets(userId, fioApiKey, fioUsername, {
      excludedPlanets,
    })

    return {
      success: result.success,
      planetsFound: result.planetsFound,
      planetsSynced: result.planetsSynced,
      skippedExcludedPlanets: result.skippedExcludedPlanets,
      buildingsSynced: result.buildingsSynced,
      workforceTypesSynced: result.workforceTypesSynced,
      productionLinesSynced: result.productionLinesSynced,
      errors: result.errors,
    }
  }

  /**
   * List synced planets with last sync timestamps
   */
  @Get('planets')
  public async getPlanets(@Request() request: { user: JwtPayload }): Promise<UserPlanetSummary[]> {
    const userId = request.user.userId

    const planets = await db
      .select({
        id: fioUserPlanets.id,
        planetNaturalId: fioUserPlanets.planetNaturalId,
        planetName: fioUserPlanets.planetName,
        lastSyncedAt: fioUserPlanets.lastSyncedAt,
      })
      .from(fioUserPlanets)
      .where(eq(fioUserPlanets.userId, userId))
      .orderBy(fioUserPlanets.planetName)

    return planets.map(p => ({
      id: p.id,
      planetNaturalId: p.planetNaturalId,
      planetName: p.planetName,
      lastSyncedAt: p.lastSyncedAt.toISOString(),
    }))
  }

  /**
   * Get the most recent planet data sync time
   */
  @Get('last-sync')
  public async getLastSyncTime(
    @Request() request: { user: JwtPayload }
  ): Promise<{ lastSyncedAt: string | null }> {
    const userId = request.user.userId

    const [planet] = await db
      .select({ lastSyncedAt: fioUserPlanets.lastSyncedAt })
      .from(fioUserPlanets)
      .where(eq(fioUserPlanets.userId, userId))
      .orderBy(desc(fioUserPlanets.lastSyncedAt))
      .limit(1)

    return {
      lastSyncedAt: planet?.lastSyncedAt?.toISOString() ?? null,
    }
  }

  /**
   * Clear all planet data for the current user
   */
  @Delete()
  @SuccessResponse('200', 'Planet data cleared')
  public async clearPlanetData(
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean; deletedPlanets: number }> {
    const userId = request.user.userId

    const planets = await db
      .select({ id: fioUserPlanets.id })
      .from(fioUserPlanets)
      .where(eq(fioUserPlanets.userId, userId))

    // Cascade delete handles buildings, workforce, production
    await db.delete(fioUserPlanets).where(eq(fioUserPlanets.userId, userId))

    return {
      success: true,
      deletedPlanets: planets.length,
    }
  }

  /**
   * Calculate supply needs using the user's saved settings
   */
  @Get('calculate')
  public async calculateSupplyFromSettings(
    @Request() request: { user: JwtPayload }
  ): Promise<SupplyCalculationResult> {
    const userId = request.user.userId
    const options = await this.resolveCalculationOptions(userId)
    return this.runCalculation(userId, options)
  }

  /**
   * Calculate supply needs with custom options (overrides saved settings)
   */
  @Post('calculate')
  public async calculateSupplyCustom(
    @Body()
    body: {
      repairDays?: number
      burnDays?: number
      includeProduction?: boolean
      planetOverrides?: Record<string, PlanetOverride>
    },
    @Request() request: { user: JwtPayload }
  ): Promise<SupplyCalculationResult> {
    const userId = request.user.userId
    const defaults = await this.resolveCalculationOptions(userId)
    const options: SupplyCalculationOptions = {
      repairDays: body.repairDays ?? defaults.repairDays,
      burnDays: body.burnDays ?? defaults.burnDays,
      includeProduction: body.includeProduction ?? defaults.includeProduction,
      planetOverrides: body.planetOverrides ?? defaults.planetOverrides,
    }
    return this.runCalculation(userId, options)
  }

  /**
   * Calculate supply needs for a single planet
   */
  @Get('calculate/{planetId}')
  public async calculatePlanetSupplyEndpoint(
    @Path() planetId: string,
    @Request() request: { user: JwtPayload }
  ): Promise<PlanetSupplyResult> {
    const userId = request.user.userId
    const options = await this.resolveCalculationOptions(userId)

    const allPlanets = await getUserPlanetData(userId)
    const planetData = allPlanets.find(p => p.planetNaturalId === planetId)
    if (!planetData) {
      this.setStatus(404)
      throw NotFound(`Planet ${planetId} not found. Have you synced your planet data?`)
    }

    const repairableTickers = await this.getRepairableTickers()
    const input = this.toPlanetInput(planetData)
    return calculatePlanetSupply(input, options, repairableTickers)
  }

  /**
   * Resolve calculation options from user settings
   */
  private async resolveCalculationOptions(userId: number): Promise<SupplyCalculationOptions> {
    const repairDays =
      ((await userSettingsService.getSetting(userId, 'supply.repairDays')) as number) ?? 0
    const burnDays =
      ((await userSettingsService.getSetting(userId, 'supply.burnDays')) as number) ?? 7
    const includeProduction =
      ((await userSettingsService.getSetting(userId, 'supply.includeProduction')) as boolean) ??
      false

    const overridesRaw =
      ((await userSettingsService.getSetting(userId, 'supply.planetOverrides')) as string) ?? '{}'
    let planetOverrides: PlanetOverrides = {}
    try {
      planetOverrides = typeof overridesRaw === 'string' ? JSON.parse(overridesRaw) : overridesRaw
    } catch {
      // Invalid JSON, use empty overrides
    }

    return { repairDays, burnDays, includeProduction, planetOverrides }
  }

  /**
   * Run the supply calculation for all synced planets
   */
  private async runCalculation(
    userId: number,
    options: SupplyCalculationOptions
  ): Promise<SupplyCalculationResult> {
    const planetData = await getUserPlanetData(userId)
    if (planetData.length === 0) {
      return {
        planets: [],
        aggregatedMaterials: {},
        repairMaterials: {},
        burnMaterials: {},
        productionMaterials: {},
      }
    }

    const repairableTickers = await this.getRepairableTickers()
    const inputs = planetData.map(p => this.toPlanetInput(p))
    return calculateSupply(inputs, options, repairableTickers)
  }

  /**
   * Fetch building definitions from FIO and return the set of tickers
   * that have workforce > 0 (and therefore need repairs)
   */
  private async getRepairableTickers(): Promise<Set<string>> {
    const client = new FioClient()
    const buildings = (await client.getBuildings()) as FioBuilding[]
    const repairable = new Set<string>()
    for (const b of buildings) {
      const totalWorkforce = b.Pioneers + b.Settlers + b.Technicians + b.Engineers + b.Scientists
      if (totalWorkforce > 0) {
        repairable.add(b.Ticker)
      }
    }
    return repairable
  }

  /**
   * Convert DB planet data to calculator input format
   */
  private toPlanetInput(
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

  /**
   * Get supply dashboard data organized by location.
   * Each location that appears in any supply chain line (as source or destination)
   * gets a panel showing all connected locations with import/export flows.
   */
  @Get('dashboard')
  public async getDashboard(
    @Request() request: { user: JwtPayload },
    @Query() locationId?: string
  ): Promise<SupplyDashboard> {
    const userId = request.user.userId
    const burnDays =
      ((await userSettingsService.getSetting(userId, 'supply.burnDays')) as number) ?? 7
    const repairDays =
      ((await userSettingsService.getSetting(userId, 'supply.repairDays')) as number) ?? 0
    const conditionMode =
      ((await userSettingsService.getSetting(userId, 'supply.conditionMode')) as string) ?? 'max'

    const lines = await db
      .select()
      .from(supplyChainLines)
      .where(eq(supplyChainLines.userId, userId))

    if (lines.length === 0) {
      return {
        settings: { burnDays, repairDays, conditionMode: conditionMode as 'actual' | 'max' },
        locations: [],
        materials: [],
      }
    }

    // Planet names for display
    const planets = await db
      .select({
        id: fioUserPlanets.id,
        planetNaturalId: fioUserPlanets.planetNaturalId,
        planetName: fioUserPlanets.planetName,
      })
      .from(fioUserPlanets)
      .where(eq(fioUserPlanets.userId, userId))
    const planetNames = new Map(planets.map(p => [p.planetNaturalId, p.planetName]))
    const planetDbIds = new Map(planets.map(p => [p.planetNaturalId, p.id]))

    // Stock cache
    const stockCache = new Map<string, number>()
    const getStock = async (
      ticker: string,
      locationId: string,
      storageTypes: string[]
    ): Promise<number> => {
      const key = `${locationId}:${ticker}:${storageTypes.sort().join(',')}`
      if (stockCache.has(key)) return stockCache.get(key)!
      const qty = await getFilteredStock(userId, ticker, locationId, storageTypes)
      stockCache.set(key, qty)
      return qty
    }

    // Pre-calculate amounts for relevant lines
    const relevantLines = locationId
      ? lines.filter(l => l.sourceLocationId === locationId || l.destinationPlanetId === locationId)
      : lines
    const lineAmounts = new Map<number, number>()
    for (const line of relevantLines) {
      if (line.mode !== 'demand') continue
      let amount: number
      if (line.lineSource === 'production_output') {
        amount = await calculateOutputSupply(line, userId, burnDays, conditionMode === 'max')
      } else {
        const targetDays =
          line.lineSource === 'repair'
            ? repairDays
            : line.lineSource === 'consumables' || line.lineSource === 'inputs'
              ? burnDays
              : 0
        amount = await calculateLineDemand(line, userId, targetDays, conditionMode === 'max')
      }
      lineAmounts.set(line.id, amount)
    }

    // Group lines by every location they touch (each line appears under both source and dest)
    // If a specific locationId is requested, only build that location's data
    const locationLines = new Map<string, (typeof lines)[number][]>()
    for (const line of lines) {
      for (const locId of [line.sourceLocationId, line.destinationPlanetId]) {
        if (locationId && locId !== locationId) continue
        const group = locationLines.get(locId) ?? []
        group.push(line)
        locationLines.set(locId, group)
      }
    }

    // Build location dashboards
    const locations: LocationDashboard[] = []
    const matAgg = new Map<
      string,
      { totalExport: number; totalImport: number; locations: Set<string> }
    >()

    for (const [locationId, locLines] of locationLines) {
      // Group by the OTHER location in the pair (the connected location)
      const connectionGroups = new Map<string, (typeof lines)[number][]>()
      for (const line of locLines) {
        const otherId =
          line.sourceLocationId === locationId ? line.destinationPlanetId : line.sourceLocationId
        const group = connectionGroups.get(otherId) ?? []
        group.push(line)
        connectionGroups.set(otherId, group)
      }

      const connections: ConnectionDashboard[] = []
      const aggregatedExport: Record<string, number> = {}
      const aggregatedImport: Record<string, number> = {}
      // Demand exports = materials this location needs to source (excludes production_output)
      const demandExport: Record<string, number> = {}
      const allStorageTypes = new Set<string>()
      const allTickers = new Set<string>()

      for (const [connId, connLines] of connectionGroups) {
        const exports: { ticker: string; amount: number; lineSource: string }[] = []
        const imports: { ticker: string; amount: number; lineSource: string }[] = []
        const connTickers = new Set<string>()

        for (const line of connLines) {
          if (line.mode !== 'demand') continue
          const amount = lineAmounts.get(line.id) ?? 0
          const lineSource = line.lineSource ?? 'other'
          connTickers.add(line.commodityTicker)
          allTickers.add(line.commodityTicker)

          // Determine direction relative to this location
          const isExport = line.sourceLocationId === locationId

          // Collect storage types for this location
          const localStorageTypes = isExport
            ? (line.sourceStorageTypes as string[])
            : (line.destinationStorageTypes as string[])
          for (const st of localStorageTypes) allStorageTypes.add(st)

          if (isExport) {
            exports.push({ ticker: line.commodityTicker, amount, lineSource })
            aggregatedExport[line.commodityTicker] =
              (aggregatedExport[line.commodityTicker] ?? 0) + amount
            // Only non-production exports create a gap (need to acquire)
            if (lineSource !== 'production_output') {
              demandExport[line.commodityTicker] =
                (demandExport[line.commodityTicker] ?? 0) + amount
            }
          } else {
            imports.push({ ticker: line.commodityTicker, amount, lineSource })
            aggregatedImport[line.commodityTicker] =
              (aggregatedImport[line.commodityTicker] ?? 0) + amount
          }
        }

        // Get stock at the connected location
        const connStorageTypes = new Set<string>()
        for (const line of connLines) {
          const connSt =
            line.sourceLocationId === locationId
              ? (line.destinationStorageTypes as string[])
              : (line.sourceStorageTypes as string[])
          for (const st of connSt) connStorageTypes.add(st)
        }
        const connectionStock: Record<string, number> = {}
        for (const ticker of connTickers) {
          connectionStock[ticker] = await getStock(ticker, connId, [...connStorageTypes])
        }

        // Compute production/demand rates for planet connections
        let rates: Record<string, { dailyProduction: number; dailyDemand: number }> | null = null
        const connPlanetDbId = planetDbIds.get(connId)
        if (connPlanetDbId && connTickers.size > 0) {
          const prodRates = await getAllProductionRates(
            connPlanetDbId,
            connTickers,
            conditionMode === 'max'
          )
          const burnRates = await getAllBurnRates(connPlanetDbId, connTickers)
          rates = {}
          for (const ticker of connTickers) {
            const pr = prodRates[ticker] ?? { dailyInput: 0, dailyOutput: 0 }
            const netProduction = Math.max(0, pr.dailyOutput - pr.dailyInput)
            let netDemand = (burnRates[ticker] ?? 0) + Math.max(0, pr.dailyInput - pr.dailyOutput)

            // Add fixed demand from supply chain lines (government, other, repair)
            // targeting this connection as a destination
            for (const line of connLines) {
              if (line.mode !== 'demand') continue
              if (line.commodityTicker !== ticker) continue
              if (line.lineSource === 'production_output') continue
              if (line.lineSource === 'consumables' || line.lineSource === 'inputs') continue
              // government, other, repair — convert total to daily rate
              const amount = lineAmounts.get(line.id) ?? 0
              const days =
                line.lineSource === 'repair' ? (repairDays > 0 ? repairDays : burnDays) : burnDays
              if (amount > 0 && days > 0) {
                netDemand += amount / days
              }
            }

            rates[ticker] = { dailyProduction: netProduction, dailyDemand: netDemand }
          }
        }

        connections.push({
          locationId: connId,
          locationName: planetNames.get(connId) ?? connId,
          storageTypes: [...connStorageTypes].sort(),
          exports,
          imports,
          connectionStock,
          rates,
        })
      }

      // Get stock at this location
      const stock: Record<string, number> = {}
      const storageArr = [...allStorageTypes]
      for (const ticker of allTickers) {
        stock[ticker] = await getStock(ticker, locationId, storageArr)
      }

      // Gap = how much we need to acquire to fulfill demand exports, after stock + imports.
      // Production exports don't create a gap — the location produces those.
      const allTickerSet = new Set([
        ...Object.keys(aggregatedExport),
        ...Object.keys(aggregatedImport),
      ])
      const gap: Record<string, number> = {}
      for (const ticker of allTickerSet) {
        gap[ticker] = Math.max(
          0,
          (demandExport[ticker] ?? 0) - (stock[ticker] ?? 0) - (aggregatedImport[ticker] ?? 0)
        )
      }

      locations.push({ locationId, stock, connections, aggregatedExport, aggregatedImport, gap })

      // Material aggregation
      for (const ticker of allTickerSet) {
        const entry = matAgg.get(ticker) ?? {
          totalExport: 0,
          totalImport: 0,
          locations: new Set<string>(),
        }
        entry.totalExport += aggregatedExport[ticker] ?? 0
        entry.totalImport += aggregatedImport[ticker] ?? 0
        entry.locations.add(locationId)
        matAgg.set(ticker, entry)
      }
    }

    // Build materials array — gap is sum of per-location gaps
    const materials: MaterialDashboard[] = []
    for (const [ticker, agg] of matAgg) {
      let totalStock = 0
      let totalGap = 0
      for (const loc of locations) {
        totalStock += loc.stock[ticker] ?? 0
        totalGap += loc.gap[ticker] ?? 0
      }
      materials.push({
        ticker,
        totalExport: agg.totalExport,
        totalImport: agg.totalImport,
        totalNeed: agg.totalExport,
        stock: totalStock,
        gap: totalGap,
        locations: [...agg.locations],
      })
    }
    materials.sort((a, b) => b.gap - a.gap)

    return {
      settings: { burnDays, repairDays, conditionMode: conditionMode as 'actual' | 'max' },
      locations,
      materials,
    }
  }

  /**
   * Generate a shopping list from supply calculation results
   */
  @Post('generate-list')
  @SuccessResponse('201', 'Shopping list created')
  public async generateShoppingList(
    @Body()
    body: {
      name?: string
      includeRepair?: boolean
      includeBurn?: boolean
      includeProduction?: boolean
      notes?: string
    },
    @Request() request: { user: JwtPayload }
  ): Promise<{ id: number; name: string; materials: Record<string, number> }> {
    const userId = request.user.userId
    const options = await this.resolveCalculationOptions(userId)

    // Override includeProduction if specified in body
    if (body.includeProduction !== undefined) {
      options.includeProduction = body.includeProduction
    }

    const calcResult = await this.runCalculation(userId, options)

    // Build materials map from selected categories
    const materials: Record<string, number> = {}
    const includeRepair = body.includeRepair ?? true
    const includeBurn = body.includeBurn ?? true
    const includeProduction = body.includeProduction ?? options.includeProduction

    if (includeRepair) {
      for (const [ticker, qty] of Object.entries(calcResult.repairMaterials)) {
        materials[ticker] = (materials[ticker] ?? 0) + qty
      }
    }
    if (includeBurn) {
      for (const [ticker, qty] of Object.entries(calcResult.burnMaterials)) {
        materials[ticker] = (materials[ticker] ?? 0) + qty
      }
    }
    if (includeProduction) {
      for (const [ticker, qty] of Object.entries(calcResult.productionMaterials)) {
        materials[ticker] = (materials[ticker] ?? 0) + qty
      }
    }

    if (Object.keys(materials).length === 0) {
      this.setStatus(400)
      throw BadRequest(
        'No materials to add to shopping list. Check your supply settings and synced data.'
      )
    }

    const listName = body.name ?? `Supply Plan ${new Date().toISOString().split('T')[0]}`

    const [list] = await db
      .insert(shoppingLists)
      .values({
        userId,
        name: listName,
        materials,
        notes: body.notes ?? null,
      })
      .returning({ id: shoppingLists.id, name: shoppingLists.name })

    this.setStatus(201)
    return { id: list.id, name: list.name, materials }
  }
}
