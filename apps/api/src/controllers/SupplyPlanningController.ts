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
import { calculateLineDemand, getFilteredStock } from '../services/demand-calculator.js'
import * as userSettingsService from '../services/userSettingsService.js'
import type {
  PlanetSupplyInput,
  PlanetSupplyResult,
  PlanetOverride,
  PlanetOverrides,
  SupplyCalculationOptions,
  SupplyCalculationResult,
  SupplyDashboard,
  SourceDashboard,
  DestinationDashboard,
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
   * Get supply dashboard data organized by source location and material.
   * Computes demand from supply chain lines, stock levels, and gaps.
   */
  @Get('dashboard')
  public async getDashboard(@Request() request: { user: JwtPayload }): Promise<SupplyDashboard> {
    const userId = request.user.userId
    const burnDays =
      ((await userSettingsService.getSetting(userId, 'supply.burnDays')) as number) ?? 7
    const repairDays =
      ((await userSettingsService.getSetting(userId, 'supply.repairDays')) as number) ?? 0
    const conditionMode =
      ((await userSettingsService.getSetting(userId, 'supply.conditionMode')) as string) ?? 'max'

    // Get all supply chain lines
    const lines = await db
      .select()
      .from(supplyChainLines)
      .where(eq(supplyChainLines.userId, userId))

    if (lines.length === 0) {
      return {
        settings: { burnDays, repairDays, conditionMode: conditionMode as 'actual' | 'max' },
        sources: [],
        materials: [],
      }
    }

    // Get planet names for display
    const planets = await db
      .select({
        planetNaturalId: fioUserPlanets.planetNaturalId,
        planetName: fioUserPlanets.planetName,
      })
      .from(fioUserPlanets)
      .where(eq(fioUserPlanets.userId, userId))
    const planetNames = new Map(planets.map(p => [p.planetNaturalId, p.planetName]))

    // Group lines by source location
    const sourceGroups = new Map<string, (typeof lines)[number][]>()
    for (const line of lines) {
      const group = sourceGroups.get(line.sourceLocationId) ?? []
      group.push(line)
      sourceGroups.set(line.sourceLocationId, group)
    }

    // Material aggregation across all sources
    const matAgg = new Map<
      string,
      { burnNeed: number; repairNeed: number; productionNeed: number; sources: Set<string> }
    >()
    // Stock aggregation (deduplicated by location+ticker)
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

    const sources: SourceDashboard[] = []

    for (const [sourceLocationId, sourceLines] of sourceGroups) {
      // Group by destination + storage types within this source
      // so the same planet with different storage types shows as separate entries
      const destGroups = new Map<string, (typeof lines)[number][]>()
      for (const line of sourceLines) {
        const destStorageKey =
          line.destinationPlanetId +
          ':' +
          (line.destinationStorageTypes as string[]).sort().join(',')
        const group = destGroups.get(destStorageKey) ?? []
        group.push(line)
        destGroups.set(destStorageKey, group)
      }

      const destinations: DestinationDashboard[] = []
      const aggregatedNeed: Record<string, number> = {}
      const allSourceStorageTypes = new Set<string>()
      const allSourceTickers = new Set<string>()

      for (const [, destLines] of destGroups) {
        const destPlanetId = destLines[0].destinationPlanetId
        const destStorageTypes = (destLines[0].destinationStorageTypes as string[]).sort()
        const burn: { ticker: string; need: number }[] = []
        const repair: { ticker: string; need: number }[] = []
        const production: { ticker: string; need: number }[] = []
        const other: { ticker: string; need: number }[] = []
        const destTickers = new Set<string>()

        for (const line of destLines) {
          for (const st of line.sourceStorageTypes as string[]) allSourceStorageTypes.add(st)
          destTickers.add(line.commodityTicker)
          allSourceTickers.add(line.commodityTicker)

          if (line.mode !== 'demand') continue

          const targetDays =
            line.demandSource === 'repair'
              ? repairDays
              : line.demandSource === 'consumables' || line.demandSource === 'inputs'
                ? burnDays
                : 0
          const demand = await calculateLineDemand(
            line,
            userId,
            targetDays,
            conditionMode === 'max'
          )

          if (line.demandSource === 'consumables') {
            burn.push({ ticker: line.commodityTicker, need: demand })
            this.addToMatAgg(matAgg, line.commodityTicker, 'burnNeed', demand, sourceLocationId)
          } else if (line.demandSource === 'repair') {
            repair.push({ ticker: line.commodityTicker, need: demand })
            this.addToMatAgg(matAgg, line.commodityTicker, 'repairNeed', demand, sourceLocationId)
          } else if (line.demandSource === 'inputs') {
            production.push({ ticker: line.commodityTicker, need: demand })
            this.addToMatAgg(
              matAgg,
              line.commodityTicker,
              'productionNeed',
              demand,
              sourceLocationId
            )
          } else {
            // government, other, or null demandSource with fixed demand
            other.push({ ticker: line.commodityTicker, need: demand })
            this.addToMatAgg(matAgg, line.commodityTicker, 'burnNeed', demand, sourceLocationId)
          }

          aggregatedNeed[line.commodityTicker] =
            (aggregatedNeed[line.commodityTicker] ?? 0) + demand
        }

        // Get destination stock per ticker filtered by this group's storage types
        const destinationStock: Record<string, number> = {}
        for (const ticker of destTickers) {
          destinationStock[ticker] = await getStock(ticker, destPlanetId, destStorageTypes)
        }

        destinations.push({
          planetId: destPlanetId,
          planetName: planetNames.get(destPlanetId) ?? destPlanetId,
          destinationStorageTypes: destStorageTypes,
          burn,
          repair,
          production,
          other,
          destinationStock,
        })
      }

      // Get source stock
      const sourceStock: Record<string, number> = {}
      const srcStorageArr = [...allSourceStorageTypes]
      for (const ticker of allSourceTickers) {
        sourceStock[ticker] = await getStock(ticker, sourceLocationId, srcStorageArr)
      }

      // Calculate gap per ticker: need minus source stock only.
      // Destination stock is not subtracted — it may be earmarked or consumed locally.
      // To account for destination surplus, the user would set up a reverse supply chain line.
      const gap: Record<string, number> = {}
      for (const ticker of Object.keys(aggregatedNeed)) {
        gap[ticker] = Math.max(0, aggregatedNeed[ticker] - (sourceStock[ticker] ?? 0))
      }

      sources.push({ sourceLocationId, sourceStock, destinations, aggregatedNeed, gap })
    }

    // Build materials array
    const materials: MaterialDashboard[] = []
    for (const [ticker, agg] of matAgg) {
      const totalNeed = agg.burnNeed + agg.repairNeed + agg.productionNeed
      let sourceStock = 0
      let destinationStock = 0
      for (const src of sources) {
        sourceStock += src.sourceStock[ticker] ?? 0
        for (const dest of src.destinations) {
          destinationStock += dest.destinationStock[ticker] ?? 0
        }
      }
      materials.push({
        ticker,
        burnNeed: agg.burnNeed,
        repairNeed: agg.repairNeed,
        productionNeed: agg.productionNeed,
        totalNeed,
        sourceStock,
        destinationStock,
        gap: Math.max(0, totalNeed - sourceStock),
        sources: [...agg.sources],
      })
    }
    materials.sort((a, b) => b.gap - a.gap)

    return {
      settings: { burnDays, repairDays, conditionMode: conditionMode as 'actual' | 'max' },
      sources,
      materials,
    }
  }

  private addToMatAgg(
    matAgg: Map<
      string,
      { burnNeed: number; repairNeed: number; productionNeed: number; sources: Set<string> }
    >,
    ticker: string,
    field: 'burnNeed' | 'repairNeed' | 'productionNeed',
    amount: number,
    sourceLocationId: string
  ): void {
    const entry = matAgg.get(ticker) ?? {
      burnNeed: 0,
      repairNeed: 0,
      productionNeed: 0,
      sources: new Set<string>(),
    }
    entry[field] += amount
    entry.sources.add(sourceLocationId)
    matAgg.set(ticker, entry)
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
