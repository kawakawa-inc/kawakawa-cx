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
  SuccessResponse,
} from 'tsoa'
import type { SupplyChainMode, SupplyChainDemandSource } from '@kawakawa/types'
import {
  db,
  supplyChainLines,
  fioCommodities,
  fioLocations,
  fioUserPlanets,
  fioPlanetWorkforce,
  fioPlanetBuildings,
  fioPlanetProduction,
} from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'

// ==================== Request/Response Types ====================

interface SupplyChainLineResponse {
  id: number
  commodityTicker: string
  sourceLocationId: string
  sourceStorageTypes: string[]
  destinationPlanetId: string
  destinationStorageTypes: string[]
  mode: SupplyChainMode
  demandSource: SupplyChainDemandSource | null
  demand: number | null
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
  demandSource?: SupplyChainDemandSource
  demand?: number
}

interface UpdateSupplyChainLineRequest {
  sourceStorageTypes?: string[]
  destinationStorageTypes?: string[]
  demand?: number | null
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

// ==================== Helpers ====================

const DEFAULT_STORAGE_TYPES = ['STORE']

function toLineResponse(line: typeof supplyChainLines.$inferSelect): SupplyChainLineResponse {
  return {
    id: line.id,
    commodityTicker: line.commodityTicker,
    sourceLocationId: line.sourceLocationId,
    sourceStorageTypes: line.sourceStorageTypes as string[],
    destinationPlanetId: line.destinationPlanetId,
    destinationStorageTypes: line.destinationStorageTypes as string[],
    mode: line.mode,
    demandSource: line.demandSource,
    demand: line.demand,
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
    if (body.mode === 'reserve' && body.demandSource) {
      throw BadRequest('Reserve lines cannot have a demandSource')
    }
    if (body.mode === 'demand' && !body.demandSource && body.demand == null) {
      throw BadRequest('Demand lines require either demandSource or a fixed demand amount')
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
        demandSource: body.demandSource ?? null,
        demand: body.demand ?? null,
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
   * Clear all supply chain lines for a source-destination pair
   */
  @Delete('source/{sourceLocationId}/{destinationPlanetId}')
  public async clearLines(
    @Path() sourceLocationId: string,
    @Path() destinationPlanetId: string,
    @Request() request: { user: JwtPayload }
  ): Promise<{ deleted: number }> {
    const userId = request.user.userId

    const toDelete = await db
      .select({ id: supplyChainLines.id })
      .from(supplyChainLines)
      .where(
        and(
          eq(supplyChainLines.userId, userId),
          eq(supplyChainLines.sourceLocationId, sourceLocationId),
          eq(supplyChainLines.destinationPlanetId, destinationPlanetId)
        )
      )

    if (toDelete.length > 0) {
      await db
        .delete(supplyChainLines)
        .where(
          and(
            eq(supplyChainLines.userId, userId),
            eq(supplyChainLines.sourceLocationId, sourceLocationId),
            eq(supplyChainLines.destinationPlanetId, destinationPlanetId)
          )
        )
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
    const sourceStorageTypes = body.sourceStorageTypes ?? DEFAULT_STORAGE_TYPES
    const destinationStorageTypes = body.destinationStorageTypes ?? DEFAULT_STORAGE_TYPES

    const planet = await this.resolveUserPlanet(userId, body.destinationPlanetId)

    // Get workforce needs
    const workforceRows = await db
      .select({ needs: fioPlanetWorkforce.needs })
      .from(fioPlanetWorkforce)
      .where(eq(fioPlanetWorkforce.userPlanetId, planet.id))

    // Extract unique material tickers
    const tickers = new Set<string>()
    for (const row of workforceRows) {
      const needs = row.needs as { MaterialTicker: string }[]
      for (const need of needs) {
        tickers.add(need.MaterialTicker)
      }
    }

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
    const sourceStorageTypes = body.sourceStorageTypes ?? DEFAULT_STORAGE_TYPES
    const destinationStorageTypes = body.destinationStorageTypes ?? DEFAULT_STORAGE_TYPES

    const planet = await this.resolveUserPlanet(userId, body.destinationPlanetId)

    // Get building repair materials
    const buildingRows = await db
      .select({ repairMaterials: fioPlanetBuildings.repairMaterials })
      .from(fioPlanetBuildings)
      .where(eq(fioPlanetBuildings.userPlanetId, planet.id))

    const tickers = new Set<string>()
    for (const row of buildingRows) {
      const materials = row.repairMaterials as { MaterialTicker: string }[]
      for (const mat of materials) {
        tickers.add(mat.MaterialTicker)
      }
    }

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
    const sourceStorageTypes = body.sourceStorageTypes ?? DEFAULT_STORAGE_TYPES
    const destinationStorageTypes = body.destinationStorageTypes ?? DEFAULT_STORAGE_TYPES

    const planet = await this.resolveUserPlanet(userId, body.destinationPlanetId)

    // Get production inputs from recurring orders
    const productionRows = await db
      .select({ orders: fioPlanetProduction.orders })
      .from(fioPlanetProduction)
      .where(eq(fioPlanetProduction.userPlanetId, planet.id))

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

  private async bulkInsertLines(
    userId: number,
    sourceLocationId: string,
    destinationPlanetId: string,
    sourceStorageTypes: string[],
    destinationStorageTypes: string[],
    demandSource: SupplyChainDemandSource,
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
          eq(supplyChainLines.demandSource, demandSource)
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
          demandSource,
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
