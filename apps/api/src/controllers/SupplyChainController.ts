import {
  Controller,
  Get,
  Post,
  Put,
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
import type {
  SupplyChainMode,
  SupplyChainLineSource,
  DemandRate,
  BuildingData,
} from '@kawakawa/types'
import {
  db,
  supplyChainLines,
  fioCommodities,
  fioLocations,
  fioUserPlanets,
  fioUserStorage,
  fioPlanetWorkforce,
  fioPlanetBuildings,
  fioPlanetProduction,
} from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { calculateBuildingRepairNeeds } from '../services/supply-calculator.js'
import { FioClient } from '../services/fio/client.js'
import type { FioBuilding } from '../services/fio/types.js'
import * as userSettingsService from '../services/userSettingsService.js'

// ==================== Request/Response Types ====================

interface SupplyChainLineResponse {
  id: number
  commodityTicker: string
  sourceLocationId: string
  sourceStorageTypes: string[]
  destinationPlanetId: string
  destinationStorageTypes: string[]
  mode: SupplyChainMode
  lineSource: SupplyChainLineSource | null
  demand: number | null
  demandRate: DemandRate | null
  createdAt: string
  updatedAt: string
}

interface CreateSupplyChainLineRequest {
  commodityTicker: string
  sourceLocationId: string
  sourceStorageTypes: string[]
  destinationPlanetId: string
  destinationStorageTypes: string[]
  mode: SupplyChainMode
  lineSource?: SupplyChainLineSource
  demand?: number
  demandRate?: DemandRate
}

interface UpdateSupplyChainLineRequest {
  sourceStorageTypes?: string[]
  destinationStorageTypes?: string[]
  lineSource?: SupplyChainLineSource
  demand?: number | null
  demandRate?: DemandRate
}

interface BulkAddLinesRequest {
  sourceLocationId: string
  destinationPlanetId: string
  sourceStorageTypes?: string[]
  destinationStorageTypes?: string[]
}

interface BulkAddLinesResponse {
  created: number
  skipped: number
  lines: SupplyChainLineResponse[]
}

interface StorageLocationInfo {
  locationId: string
  storageTypes: string[]
}

// ==================== Helpers ====================

const FALLBACK_STORAGE_TYPES = ['STORE']

function toLineResponse(line: typeof supplyChainLines.$inferSelect): SupplyChainLineResponse {
  return {
    id: line.id,
    commodityTicker: line.commodityTicker,
    sourceLocationId: line.sourceLocationId,
    sourceStorageTypes: line.sourceStorageTypes as string[],
    destinationPlanetId: line.destinationPlanetId,
    destinationStorageTypes: line.destinationStorageTypes as string[],
    mode: line.mode,
    lineSource: line.lineSource,
    demand: line.demand,
    demandRate: line.demandRate,
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  }
}

@Route('supply-chain')
@Tags('Supply Chain')
@Security('jwt')
export class SupplyChainController extends Controller {
  /**
   * List all supply chain lines for the current user
   */
  @Get()
  public async getLines(
    @Request() request: { user: JwtPayload }
  ): Promise<SupplyChainLineResponse[]> {
    const lines = await db
      .select()
      .from(supplyChainLines)
      .where(eq(supplyChainLines.userId, request.user.userId))

    return lines.map(toLineResponse)
  }

  /**
   * Get supply chain lines for a specific source location
   */
  @Get('source/{sourceLocationId}')
  public async getLinesBySource(
    @Path() sourceLocationId: string,
    @Request() request: { user: JwtPayload }
  ): Promise<SupplyChainLineResponse[]> {
    const lines = await db
      .select()
      .from(supplyChainLines)
      .where(
        and(
          eq(supplyChainLines.userId, request.user.userId),
          eq(supplyChainLines.sourceLocationId, sourceLocationId)
        )
      )

    return lines.map(toLineResponse)
  }

  /**
   * Get all locations where the user has storage, with their available storage types.
   * Used to populate source/destination storage type selectors.
   */
  @Get('locations')
  public async getStorageLocations(
    @Request() request: { user: JwtPayload }
  ): Promise<StorageLocationInfo[]> {
    const rows = await db
      .selectDistinct({
        locationId: fioUserStorage.locationId,
        type: fioUserStorage.type,
      })
      .from(fioUserStorage)
      .where(eq(fioUserStorage.userId, request.user.userId))

    // Group types by location (skip rows without a location)
    const map = new Map<string, string[]>()
    for (const row of rows) {
      if (!row.locationId) continue
      const types = map.get(row.locationId) ?? []
      types.push(row.type)
      map.set(row.locationId, types)
    }

    return [...map.entries()].map(([locationId, storageTypes]) => ({
      locationId,
      storageTypes,
    }))
  }

  /**
   * Create a new supply chain line
   */
  @Post('lines')
  @SuccessResponse('201', 'Created')
  public async createLine(
    @Body() body: CreateSupplyChainLineRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SupplyChainLineResponse> {
    const userId = request.user.userId

    // Validate commodity
    const [commodity] = await db
      .select({ ticker: fioCommodities.ticker })
      .from(fioCommodities)
      .where(eq(fioCommodities.ticker, body.commodityTicker))
    if (!commodity) throw BadRequest('Invalid commodity ticker')

    // Validate source location
    const [location] = await db
      .select({ naturalId: fioLocations.naturalId })
      .from(fioLocations)
      .where(eq(fioLocations.naturalId, body.sourceLocationId))
    if (!location) throw BadRequest('Invalid source location')

    // Validate mode-specific fields
    if (body.mode === 'reserve' && body.lineSource) {
      throw BadRequest('Reserve lines cannot have a lineSource')
    }
    if (body.mode === 'demand' && !body.lineSource && body.demand == null) {
      throw BadRequest('Demand lines require either a category or a fixed demand amount')
    }
    if ((body.lineSource === 'government' || body.lineSource === 'other') && body.demand == null) {
      throw BadRequest('Government and Other categories require a fixed demand amount')
    }

    if (body.sourceStorageTypes.length === 0) {
      throw BadRequest('sourceStorageTypes must not be empty')
    }
    if (body.destinationStorageTypes.length === 0) {
      throw BadRequest('destinationStorageTypes must not be empty')
    }

    const [line] = await db
      .insert(supplyChainLines)
      .values({
        userId,
        commodityTicker: body.commodityTicker,
        sourceLocationId: body.sourceLocationId,
        sourceStorageTypes: body.sourceStorageTypes,
        destinationPlanetId: body.destinationPlanetId,
        destinationStorageTypes: body.destinationStorageTypes,
        mode: body.mode,
        lineSource: body.lineSource ?? null,
        demand: body.demand ?? null,
        demandRate: body.demandRate ?? 'daily',
      })
      .returning()

    this.setStatus(201)
    return toLineResponse(line)
  }

  /**
   * Update a supply chain line
   */
  @Put('lines/{id}')
  public async updateLine(
    @Path() id: number,
    @Body() body: UpdateSupplyChainLineRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SupplyChainLineResponse> {
    const userId = request.user.userId

    const [existing] = await db
      .select()
      .from(supplyChainLines)
      .where(and(eq(supplyChainLines.id, id), eq(supplyChainLines.userId, userId)))

    if (!existing) throw NotFound('Supply chain line not found')

    if (body.sourceStorageTypes && body.sourceStorageTypes.length === 0) {
      throw BadRequest('sourceStorageTypes must not be empty')
    }
    if (body.destinationStorageTypes && body.destinationStorageTypes.length === 0) {
      throw BadRequest('destinationStorageTypes must not be empty')
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.sourceStorageTypes !== undefined) updates.sourceStorageTypes = body.sourceStorageTypes
    if (body.destinationStorageTypes !== undefined)
      updates.destinationStorageTypes = body.destinationStorageTypes
    if (body.lineSource !== undefined) updates.lineSource = body.lineSource
    if (body.demandRate !== undefined) updates.demandRate = body.demandRate
    if (body.demand !== undefined) updates.demand = body.demand

    await db.update(supplyChainLines).set(updates).where(eq(supplyChainLines.id, id))

    const [updated] = await db.select().from(supplyChainLines).where(eq(supplyChainLines.id, id))

    return toLineResponse(updated)
  }

  /**
   * Delete a supply chain line
   */
  @Delete('lines/{id}')
  public async deleteLine(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId

    const [existing] = await db
      .select({ id: supplyChainLines.id })
      .from(supplyChainLines)
      .where(and(eq(supplyChainLines.id, id), eq(supplyChainLines.userId, userId)))

    if (!existing) throw NotFound('Supply chain line not found')

    await db.delete(supplyChainLines).where(eq(supplyChainLines.id, id))

    return { success: true }
  }

  /**
   * Clear supply chain lines for a source-destination pair.
   * Optionally filter by destination storage types (comma-separated).
   */
  @Delete('source/{sourceLocationId}/{destinationPlanetId}')
  public async clearLines(
    @Path() sourceLocationId: string,
    @Path() destinationPlanetId: string,
    @Query() storageTypes?: string,
    @Request() request?: { user: JwtPayload }
  ): Promise<{ deleted: number }> {
    const userId = request!.user.userId

    const candidates = await db
      .select({
        id: supplyChainLines.id,
        destinationStorageTypes: supplyChainLines.destinationStorageTypes,
      })
      .from(supplyChainLines)
      .where(
        and(
          eq(supplyChainLines.userId, userId),
          eq(supplyChainLines.sourceLocationId, sourceLocationId),
          eq(supplyChainLines.destinationPlanetId, destinationPlanetId)
        )
      )

    const filterTypes = storageTypes ? new Set(storageTypes.split(',')) : null
    const toDelete = filterTypes
      ? candidates.filter(c =>
          (c.destinationStorageTypes as string[]).some(t => filterTypes.has(t))
        )
      : candidates

    if (toDelete.length > 0) {
      for (const row of toDelete) {
        await db.delete(supplyChainLines).where(eq(supplyChainLines.id, row.id))
      }
    }

    return { deleted: toDelete.length }
  }

  // ==================== Bulk Add Endpoints ====================

  /**
   * Bulk add consumable burn lines for a planet.
   * Creates one supply chain line per workforce consumable material.
   * Skips materials that already have a matching line.
   */
  @Post('add-consumables')
  @SuccessResponse('201', 'Created')
  public async addConsumableLines(
    @Body() body: BulkAddLinesRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BulkAddLinesResponse> {
    const userId = request.user.userId
    const planet = await this.resolveUserPlanet(userId, body.destinationPlanetId)
    const sourceStorageTypes =
      body.sourceStorageTypes ?? (await this.getStorageTypesAt(userId, body.sourceLocationId))
    const destinationStorageTypes =
      body.destinationStorageTypes ??
      (await this.getStorageTypesAt(userId, body.destinationPlanetId))

    const tickers = await this.getConsumableTickers(planet.id)

    if (tickers.size === 0) {
      this.setStatus(201)
      return { created: 0, skipped: 0, lines: [] }
    }

    return this.bulkInsertLines(
      userId,
      body.sourceLocationId,
      body.destinationPlanetId,
      sourceStorageTypes,
      destinationStorageTypes,
      'consumables',
      tickers
    )
  }

  /**
   * Bulk add repair material lines for a planet.
   * Creates one supply chain line per repair material.
   * Skips materials that already have a matching line.
   */
  @Post('add-repair')
  @SuccessResponse('201', 'Created')
  public async addRepairLines(
    @Body() body: BulkAddLinesRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BulkAddLinesResponse> {
    const userId = request.user.userId
    const planet = await this.resolveUserPlanet(userId, body.destinationPlanetId)
    const sourceStorageTypes =
      body.sourceStorageTypes ?? (await this.getStorageTypesAt(userId, body.sourceLocationId))
    const destinationStorageTypes =
      body.destinationStorageTypes ??
      (await this.getStorageTypesAt(userId, body.destinationPlanetId))

    const tickers = await this.getRepairMaterialTickers(userId, planet.id)

    if (tickers.size === 0) {
      this.setStatus(201)
      return { created: 0, skipped: 0, lines: [] }
    }

    return this.bulkInsertLines(
      userId,
      body.sourceLocationId,
      body.destinationPlanetId,
      sourceStorageTypes,
      destinationStorageTypes,
      'repair',
      tickers
    )
  }

  /**
   * Bulk add production input lines for a planet.
   * Creates one supply chain line per production input material from recurring orders.
   * Skips materials that already have a matching line.
   */
  @Post('add-inputs')
  @SuccessResponse('201', 'Created')
  public async addInputLines(
    @Body() body: BulkAddLinesRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BulkAddLinesResponse> {
    const userId = request.user.userId
    const planet = await this.resolveUserPlanet(userId, body.destinationPlanetId)
    const sourceStorageTypes =
      body.sourceStorageTypes ?? (await this.getStorageTypesAt(userId, body.sourceLocationId))
    const destinationStorageTypes =
      body.destinationStorageTypes ??
      (await this.getStorageTypesAt(userId, body.destinationPlanetId))

    const tickers = await this.getRecurringInputTickers(planet.id)

    if (tickers.size === 0) {
      this.setStatus(201)
      return { created: 0, skipped: 0, lines: [] }
    }

    return this.bulkInsertLines(
      userId,
      body.sourceLocationId,
      body.destinationPlanetId,
      sourceStorageTypes,
      destinationStorageTypes,
      'inputs',
      tickers
    )
  }

  /**
   * Get production output material tickers for a planet.
   * Returns unique tickers from recurring production order outputs.
   */
  @Get('output-tickers/{planetId}')
  public async getOutputTickers(
    @Path() planetId: string,
    @Request() request: { user: JwtPayload }
  ): Promise<string[]> {
    const planet = await this.resolveUserPlanet(request.user.userId, planetId)
    return this.getRecurringOutputTickers(planet.id)
  }

  /**
   * Get detected material tickers for a planet + category, sourced from FIO data.
   * Used by the Supply Lines form to filter the Material dropdown.
   * For `production_output` the planetId is the producing planet; for the others it is the destination.
   */
  @Get('detected-tickers/{planetId}/{category}')
  public async getDetectedTickers(
    @Path() planetId: string,
    @Path() category: SupplyChainLineSource,
    @Request() request: { user: JwtPayload }
  ): Promise<string[]> {
    const userId = request.user.userId
    const planet = await this.resolveUserPlanet(userId, planetId)
    let tickers: Set<string>
    switch (category) {
      case 'consumables':
        tickers = await this.getConsumableTickers(planet.id)
        break
      case 'inputs':
        tickers = await this.getRecurringInputTickers(planet.id)
        break
      case 'repair':
        tickers = await this.getRepairMaterialTickers(userId, planet.id)
        break
      case 'production_output':
        return this.getRecurringOutputTickers(planet.id)
      default:
        return []
    }
    return [...tickers].sort()
  }

  /**
   * Bulk add production output lines for a planet.
   * Creates one supply chain line per production output material from recurring orders.
   * Skips materials that already have a matching line.
   */
  @Post('add-outputs')
  @SuccessResponse('201', 'Created')
  public async addOutputLines(
    @Body() body: BulkAddLinesRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BulkAddLinesResponse> {
    const userId = request.user.userId
    // For production_output: source = producing planet, destination = hub
    const planet = await this.resolveUserPlanet(userId, body.sourceLocationId)
    const sourceStorageTypes =
      body.sourceStorageTypes ?? (await this.getStorageTypesAt(userId, body.sourceLocationId))
    const destinationStorageTypes =
      body.destinationStorageTypes ??
      (await this.getStorageTypesAt(userId, body.destinationPlanetId))

    // Get production output tickers from recurring orders
    const tickerList = await this.getRecurringOutputTickers(planet.id)
    const tickers = new Set(tickerList)

    if (tickers.size === 0) {
      this.setStatus(201)
      return { created: 0, skipped: 0, lines: [] }
    }

    return this.bulkInsertLines(
      userId,
      body.sourceLocationId,
      body.destinationPlanetId,
      sourceStorageTypes,
      destinationStorageTypes,
      'production_output',
      tickers
    )
  }

  // ==================== Private Helpers ====================

  private async resolveUserPlanet(
    userId: number,
    planetNaturalId: string
  ): Promise<{ id: number }> {
    const [planet] = await db
      .select({ id: fioUserPlanets.id })
      .from(fioUserPlanets)
      .where(
        and(eq(fioUserPlanets.userId, userId), eq(fioUserPlanets.planetNaturalId, planetNaturalId))
      )

    if (!planet) {
      throw NotFound(`Planet ${planetNaturalId} not found. Have you synced your planet data?`)
    }

    return planet
  }

  /**
   * Get storage types the user has at a given location.
   * Falls back to ['STORE'] if no storage found.
   */
  private async getStorageTypesAt(userId: number, locationId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ type: fioUserStorage.type })
      .from(fioUserStorage)
      .where(and(eq(fioUserStorage.userId, userId), eq(fioUserStorage.locationId, locationId)))

    return rows.length > 0 ? rows.map(r => r.type) : FALLBACK_STORAGE_TYPES
  }

  /**
   * Get unique output material tickers from recurring production orders for a planet.
   */
  private async getRecurringOutputTickers(userPlanetDbId: number): Promise<string[]> {
    const productionRows = await db
      .select({ orders: fioPlanetProduction.orders })
      .from(fioPlanetProduction)
      .where(eq(fioPlanetProduction.userPlanetId, userPlanetDbId))

    const tickers = new Set<string>()
    for (const row of productionRows) {
      const orders = row.orders as {
        Recurring: boolean
        Outputs: { MaterialTicker: string }[]
      }[]
      for (const order of orders) {
        if (!order.Recurring) continue
        for (const output of order.Outputs) {
          tickers.add(output.MaterialTicker)
        }
      }
    }
    return [...tickers].sort()
  }

  /**
   * Get unique input material tickers from recurring production orders for a planet.
   */
  private async getRecurringInputTickers(userPlanetDbId: number): Promise<Set<string>> {
    const productionRows = await db
      .select({ orders: fioPlanetProduction.orders })
      .from(fioPlanetProduction)
      .where(eq(fioPlanetProduction.userPlanetId, userPlanetDbId))

    const tickers = new Set<string>()
    for (const row of productionRows) {
      const orders = row.orders as {
        Recurring: boolean
        Inputs: { MaterialTicker: string }[]
      }[]
      for (const order of orders) {
        if (!order.Recurring) continue
        for (const input of order.Inputs) {
          tickers.add(input.MaterialTicker)
        }
      }
    }
    return tickers
  }

  /**
   * Get unique consumable material tickers from workforce needs for a planet.
   * Only includes materials with burn rate > 0.
   */
  private async getConsumableTickers(userPlanetDbId: number): Promise<Set<string>> {
    const workforceRows = await db
      .select({ needs: fioPlanetWorkforce.needs })
      .from(fioPlanetWorkforce)
      .where(eq(fioPlanetWorkforce.userPlanetId, userPlanetDbId))

    const tickers = new Set<string>()
    for (const row of workforceRows) {
      const needs = row.needs as { MaterialTicker: string; UnitsPerInterval: number }[]
      for (const need of needs) {
        if (need.UnitsPerInterval > 0) {
          tickers.add(need.MaterialTicker)
        }
      }
    }
    return tickers
  }

  /**
   * Get unique repair material tickers for a planet by projecting repair needs forward.
   * Uses max(45, user's repairDays) so we catch materials even for healthy buildings.
   * Only includes buildings with workforce (infra like PSL, STO don't need repairs).
   */
  private async getRepairMaterialTickers(
    userId: number,
    userPlanetDbId: number
  ): Promise<Set<string>> {
    const userRepairDays =
      ((await userSettingsService.getSetting(userId, 'supply.repairDays')) as number) ?? 0
    const projectionDays = Math.max(45, userRepairDays)
    const now = new Date()

    const repairableTickers = await this.getRepairableBuildingTickers()

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
      .where(eq(fioPlanetBuildings.userPlanetId, userPlanetDbId))

    const tickers = new Set<string>()
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
      const needs = calculateBuildingRepairNeeds(building, projectionDays, now)
      for (const need of needs) {
        tickers.add(need.ticker)
      }
    }
    return tickers
  }

  /**
   * Fetch building definitions from FIO and return tickers that have workforce > 0
   * (infrastructure buildings like PSL, STO don't need repairs).
   */
  private async getRepairableBuildingTickers(): Promise<Set<string>> {
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

  private async bulkInsertLines(
    userId: number,
    sourceLocationId: string,
    destinationPlanetId: string,
    sourceStorageTypes: string[],
    destinationStorageTypes: string[],
    lineSource: SupplyChainLineSource,
    tickers: Set<string>
  ): Promise<BulkAddLinesResponse> {
    // Find existing lines to avoid duplicates
    const existingLines = await db
      .select({
        commodityTicker: supplyChainLines.commodityTicker,
      })
      .from(supplyChainLines)
      .where(
        and(
          eq(supplyChainLines.userId, userId),
          eq(supplyChainLines.sourceLocationId, sourceLocationId),
          eq(supplyChainLines.destinationPlanetId, destinationPlanetId),
          eq(supplyChainLines.mode, 'demand'),
          eq(supplyChainLines.lineSource, lineSource)
        )
      )

    const existingTickers = new Set(existingLines.map(l => l.commodityTicker))
    const newTickers = [...tickers].filter(t => !existingTickers.has(t))
    const skipped = tickers.size - newTickers.length

    if (newTickers.length === 0) {
      this.setStatus(201)
      return { created: 0, skipped, lines: [] }
    }

    const inserted = await db
      .insert(supplyChainLines)
      .values(
        newTickers.map(ticker => ({
          userId,
          commodityTicker: ticker,
          sourceLocationId,
          sourceStorageTypes,
          destinationPlanetId,
          destinationStorageTypes,
          mode: 'demand' as const,
          lineSource,
        }))
      )
      .returning()

    this.setStatus(201)
    return {
      created: inserted.length,
      skipped,
      lines: inserted.map(toLineResponse),
    }
  }
}
