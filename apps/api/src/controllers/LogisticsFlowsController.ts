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
import type {
  LogisticsFlow,
  CreateLogisticsFlowRequest,
  UpdateLogisticsFlowRequest,
  FlowKind,
  DemandRate,
  BulkCreateLogisticsFlowsRequest,
  BulkCreateLogisticsFlowsResponse,
  BulkDetectionCategory,
  BulkMultiCreateLogisticsFlowsRequest,
  BulkMultiCreateLogisticsFlowsResponse,
  BulkMultiPlanetResult,
  BulkFlowCategory,
  BulkMultiPreviewRequest,
  BulkMultiPreviewResponse,
  BulkPlanetPreview,
} from '@kawakawa/types'
import { db, logisticsFlows, fioUserPlanets, locationDemandClaims } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import {
  getConsumableTickers,
  getRecurringInputTickers,
  getRecurringOutputTickers,
  getRepairMaterialTickers,
} from '../services/fio-ticker-detection.js'
import { getAllProductionRates } from '../services/demand-calculator.js'

function toFlowResponse(row: typeof logisticsFlows.$inferSelect): LogisticsFlow {
  return {
    id: row.id,
    commodityTicker: row.commodityTicker,
    fromLocationId: row.fromLocationId,
    fromStorageTypes: row.fromStorageTypes as string[],
    toLocationId: row.toLocationId,
    toStorageTypes: row.toStorageTypes as string[],
    kind: row.kind as FlowKind,
    amountOverride: row.amountOverride,
    rate: row.rate as DemandRate,
    priority: row.priority,
    transitDays: row.transitDays,
    cadenceDays: row.cadenceDays,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function normalizeTransitDays(input: number | undefined | null): number {
  if (input == null) return 0
  if (!Number.isFinite(input) || input < 0) {
    throw BadRequest('transitDays must be a non-negative number')
  }
  return Math.floor(input)
}

function normalizeCadenceDays(input: number | undefined | null): number {
  if (input == null) return 7
  if (!Number.isFinite(input) || input < 1) {
    throw BadRequest('cadenceDays must be an integer >= 1')
  }
  return Math.floor(input)
}

/** Per-ticker adjacency map of `from → [to...]` used for cycle detection. */
type TickerAdjacency = Map<string, Map<string, Set<string>>>

/**
 * Kind-group of a flow for cycle-detection purposes. Demand and fixed share a
 * group because fixed edges are semantically pinned demand commitments. Surplus
 * has its own group — opposite-direction surplus flows don't interact with
 * demand flows topologically, so they can coexist without forming a cycle.
 */
type CycleGroup = 'demand' | 'surplus'

function groupForKind(kind: FlowKind): CycleGroup {
  return kind === 'surplus' ? 'surplus' : 'demand'
}

interface GroupedAdjacency {
  demand: TickerAdjacency
  surplus: TickerAdjacency
}

/**
 * Load every flow for the user and build a per-kind-group, per-ticker directed
 * adjacency map. Cheap enough to rebuild on demand — the bulk endpoint preloads
 * once then mutates incrementally as it inserts.
 */
async function loadAdjacency(userId: number, excludeFlowId?: number): Promise<GroupedAdjacency> {
  const rows = await db
    .select({
      id: logisticsFlows.id,
      ticker: logisticsFlows.commodityTicker,
      from: logisticsFlows.fromLocationId,
      to: logisticsFlows.toLocationId,
      kind: logisticsFlows.kind,
    })
    .from(logisticsFlows)
    .where(eq(logisticsFlows.userId, userId))

  const adjacency: GroupedAdjacency = { demand: new Map(), surplus: new Map() }
  for (const row of rows) {
    if (excludeFlowId && row.id === excludeFlowId) continue
    const group = groupForKind(row.kind as FlowKind)
    addToAdjacency(adjacency[group], row.from, row.to, row.ticker)
  }
  return adjacency
}

function addToAdjacency(
  adjacency: TickerAdjacency,
  from: string,
  to: string,
  ticker: string
): void {
  let tickerMap = adjacency.get(ticker)
  if (!tickerMap) {
    tickerMap = new Map()
    adjacency.set(ticker, tickerMap)
  }
  let toSet = tickerMap.get(from)
  if (!toSet) {
    toSet = new Set()
    tickerMap.set(from, toSet)
  }
  toSet.add(to)
}

/**
 * Detect whether adding `from → to` for `ticker` would create a cycle in the
 * given kind-group's adjacency map. BFS from `to`; if we reach `from`, it's a cycle.
 */
function hasCycle(adjacency: TickerAdjacency, from: string, to: string, ticker: string): boolean {
  if (from === to) return true
  const tickerMap = adjacency.get(ticker)
  if (!tickerMap) return false
  const visited = new Set<string>()
  const queue: string[] = [to]
  while (queue.length > 0) {
    const loc = queue.shift()!
    if (loc === from) return true
    if (visited.has(loc)) continue
    visited.add(loc)
    const next = tickerMap.get(loc)
    if (!next) continue
    for (const n of next) queue.push(n)
  }
  return false
}

/** Mutate the adjacency map for a kind-group to reflect a newly-inserted edge. */
function recordEdge(
  adjacency: GroupedAdjacency,
  kind: FlowKind,
  from: string,
  to: string,
  ticker: string
): void {
  addToAdjacency(adjacency[groupForKind(kind)], from, to, ticker)
}

async function wouldCreateCycle(
  userId: number,
  fromLocationId: string,
  toLocationId: string,
  commodityTicker: string,
  kind: FlowKind,
  excludeFlowId?: number
): Promise<boolean> {
  if (fromLocationId === toLocationId) return true
  const adjacency = await loadAdjacency(userId, excludeFlowId)
  return hasCycle(adjacency[groupForKind(kind)], fromLocationId, toLocationId, commodityTicker)
}

/**
 * Returns the user's planet DB id for a natural id, or null if the location
 * isn't in `fio_user_planets` (for stations, unsynced planets, etc).
 * Bulk detection uses null as a signal to skip the category gracefully.
 */
async function lookupUserPlanetDbId(
  userId: number,
  planetNaturalId: string
): Promise<number | null> {
  const [planet] = await db
    .select({ id: fioUserPlanets.id })
    .from(fioUserPlanets)
    .where(
      and(eq(fioUserPlanets.userId, userId), eq(fioUserPlanets.planetNaturalId, planetNaturalId))
    )
  return planet?.id ?? null
}

/**
 * Detect tickers for a category at the appropriate end of the flow. Returns an
 * empty set (not an error) when the relevant end isn't a user planet — that's
 * the correct answer for e.g. "detect consumables at BEN": stations have no
 * workforce, so the category is simply empty.
 *
 * For demand categories (consumables / inputs / repair), tickers where the
 * planet is a net producer are excluded — those edges would always compute to
 * 0 in the solver and just add clutter.
 */
async function detectTickersForCategory(
  userId: number,
  category: BulkDetectionCategory,
  fromLocationId: string,
  toLocationId: string
): Promise<Set<string>> {
  const isOutput = category === 'production_output'
  const planetLoc = isOutput ? fromLocationId : toLocationId
  const planetDbId = await lookupUserPlanetDbId(userId, planetLoc)
  if (planetDbId == null) return new Set()

  let tickers: Set<string>
  switch (category) {
    case 'consumables':
      tickers = await getConsumableTickers(planetDbId)
      break
    case 'inputs':
      tickers = await getRecurringInputTickers(planetDbId)
      break
    case 'repair':
      tickers = await getRepairMaterialTickers(userId, planetDbId)
      break
    case 'production_output':
      return getRecurringOutputTickers(planetDbId)
  }

  // For demand categories, exclude tickers where the planet's production
  // exceeds its consumption — the solver would size those edges to 0.
  if (tickers.size > 0) {
    const prodRates = await getAllProductionRates(planetDbId, tickers, false)
    for (const ticker of [...tickers]) {
      const rates = prodRates[ticker]
      if (rates && rates.dailyOutput > rates.dailyInput) {
        tickers.delete(ticker)
      }
    }
  }

  return tickers
}

/**
 * Detect tickers for a granular BulkFlowCategory. Maps the fine-grained
 * categories to their data sources:
 *  - burn / production_input / repair / production_output: FIO data
 *  - government / contract / reserve: manual demand claims
 *
 * For demand FIO categories, net-producer filtering is applied.
 */
async function detectTickersForBulkCategory(
  userId: number,
  category: BulkFlowCategory,
  planetLocationId: string
): Promise<Set<string>> {
  // Manual claim categories — read from location_demand_claims
  if (category === 'government' || category === 'contract' || category === 'reserve') {
    const rows = await db
      .select({ ticker: locationDemandClaims.commodityTicker })
      .from(locationDemandClaims)
      .where(
        and(
          eq(locationDemandClaims.userId, userId),
          eq(locationDemandClaims.locationId, planetLocationId),
          eq(locationDemandClaims.category, category)
        )
      )
    const tickers = new Set<string>()
    for (const row of rows) tickers.add(row.ticker)
    return tickers
  }

  // FIO-based categories — need a user planet DB id
  const planetDbId = await lookupUserPlanetDbId(userId, planetLocationId)
  if (planetDbId == null) return new Set()

  let tickers: Set<string>
  switch (category) {
    case 'burn':
      tickers = await getConsumableTickers(planetDbId)
      break
    case 'production_input':
      tickers = await getRecurringInputTickers(planetDbId)
      break
    case 'repair':
      tickers = await getRepairMaterialTickers(userId, planetDbId)
      break
    case 'production_output':
      return getRecurringOutputTickers(planetDbId)
  }

  // For demand FIO categories, exclude net producers.
  if (tickers.size > 0) {
    const prodRates = await getAllProductionRates(planetDbId, tickers, false)
    for (const ticker of [...tickers]) {
      const rates = prodRates[ticker]
      if (rates && rates.dailyOutput > rates.dailyInput) {
        tickers.delete(ticker)
      }
    }
  }

  return tickers
}

@Route('logistics/flows')
@Tags('Logistics')
@Security('jwt')
export class LogisticsFlowsController extends Controller {
  /**
   * List all logistics flows for the current user.
   */
  @Get()
  public async listFlows(@Request() request: { user: JwtPayload }): Promise<LogisticsFlow[]> {
    const rows = await db
      .select()
      .from(logisticsFlows)
      .where(eq(logisticsFlows.userId, request.user.userId))
    return rows.map(toFlowResponse)
  }

  /**
   * Create a new logistics flow (edge).
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createFlow(
    @Body() body: CreateLogisticsFlowRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<LogisticsFlow> {
    const userId = request.user.userId

    if (body.fromLocationId === body.toLocationId) {
      throw BadRequest('from and to locations must differ')
    }
    if (body.kind === 'fixed' && body.amountOverride == null) {
      throw BadRequest('fixed flows require amountOverride')
    }

    if (
      await wouldCreateCycle(
        userId,
        body.fromLocationId,
        body.toLocationId,
        body.commodityTicker,
        body.kind
      )
    ) {
      throw BadRequest(
        `Adding this flow would create a cycle for ${body.commodityTicker} between ${body.fromLocationId} and ${body.toLocationId}`
      )
    }

    const [inserted] = await db
      .insert(logisticsFlows)
      .values({
        userId,
        commodityTicker: body.commodityTicker,
        fromLocationId: body.fromLocationId,
        fromStorageTypes: body.fromStorageTypes,
        toLocationId: body.toLocationId,
        toStorageTypes: body.toStorageTypes,
        kind: body.kind,
        amountOverride: body.amountOverride ?? null,
        rate: body.rate ?? 'daily',
        priority: body.priority ?? null,
        transitDays: normalizeTransitDays(body.transitDays),
        cadenceDays: normalizeCadenceDays(body.cadenceDays),
        note: body.note ?? null,
      })
      .returning()

    this.setStatus(201)
    return toFlowResponse(inserted)
  }

  /**
   * Update an existing logistics flow.
   */
  @Put('{id}')
  public async updateFlow(
    @Path() id: number,
    @Body() body: UpdateLogisticsFlowRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<LogisticsFlow> {
    const userId = request.user.userId

    const [existing] = await db
      .select()
      .from(logisticsFlows)
      .where(and(eq(logisticsFlows.id, id), eq(logisticsFlows.userId, userId)))
    if (!existing) throw NotFound('Logistics flow not found')

    const nextKind = body.kind ?? existing.kind
    const nextAmountOverride =
      body.amountOverride !== undefined ? body.amountOverride : existing.amountOverride
    if (nextKind === 'fixed' && nextAmountOverride == null) {
      throw BadRequest('fixed flows require amountOverride')
    }

    const [updated] = await db
      .update(logisticsFlows)
      .set({
        fromStorageTypes: body.fromStorageTypes ?? existing.fromStorageTypes,
        toStorageTypes: body.toStorageTypes ?? existing.toStorageTypes,
        kind: nextKind,
        amountOverride: nextAmountOverride,
        rate: body.rate ?? existing.rate,
        priority: body.priority !== undefined ? body.priority : existing.priority,
        transitDays:
          body.transitDays !== undefined
            ? normalizeTransitDays(body.transitDays)
            : existing.transitDays,
        cadenceDays:
          body.cadenceDays !== undefined
            ? normalizeCadenceDays(body.cadenceDays)
            : existing.cadenceDays,
        note: body.note !== undefined ? body.note : existing.note,
        updatedAt: new Date(),
      })
      .where(eq(logisticsFlows.id, id))
      .returning()

    return toFlowResponse(updated)
  }

  /**
   * Bulk-create logistics flows from auto-detected FIO material categories.
   *
   * For `consumables`, `inputs`, and `repair`: tickers come from the destination
   * planet's FIO data and become `demand` edges.
   *
   * For `production_output`: tickers come from the source planet's FIO data
   * and become `surplus` edges.
   *
   * Skips dupes (existing flow with same from/to/ticker) and skips any edge
   * that would create a cycle. Returns a summary of what happened.
   */
  @Post('bulk')
  @SuccessResponse('201', 'Created')
  public async bulkCreateFlows(
    @Body() body: BulkCreateLogisticsFlowsRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BulkCreateLogisticsFlowsResponse> {
    const userId = request.user.userId

    if (body.fromLocationId === body.toLocationId) {
      throw BadRequest('from and to locations must differ')
    }
    if (body.categories.length === 0) {
      throw BadRequest('at least one category is required')
    }
    if (body.fromStorageTypes.length === 0 || body.toStorageTypes.length === 0) {
      throw BadRequest('fromStorageTypes and toStorageTypes must not be empty')
    }

    // Preload adjacency once; incrementally update as we insert.
    const adjacency = await loadAdjacency(userId)

    // Preload existing (from, to, ticker) tuples so we can dedupe.
    const existingRows = await db
      .select({
        from: logisticsFlows.fromLocationId,
        to: logisticsFlows.toLocationId,
        ticker: logisticsFlows.commodityTicker,
      })
      .from(logisticsFlows)
      .where(eq(logisticsFlows.userId, userId))
    const existingKeys = new Set<string>()
    for (const r of existingRows) {
      existingKeys.add(`${r.from}|${r.to}|${r.ticker}`)
    }

    const response: BulkCreateLogisticsFlowsResponse = {
      created: [],
      skippedDuplicates: [],
      skippedCycles: [],
      emptyCategories: [],
    }

    for (const category of body.categories) {
      const tickers = await detectTickersForCategory(
        userId,
        category,
        body.fromLocationId,
        body.toLocationId
      )
      if (tickers.size === 0) {
        response.emptyCategories.push(category)
        continue
      }

      const kind: FlowKind = category === 'production_output' ? 'surplus' : 'demand'
      const group = groupForKind(kind)

      for (const ticker of tickers) {
        // Dedup key includes category so the same ticker can exist as
        // different categories (e.g. DW as both consumables and inputs).
        const key = `${body.fromLocationId}|${body.toLocationId}|${ticker}|${category}`
        if (existingKeys.has(key)) {
          response.skippedDuplicates.push({ category, ticker })
          continue
        }
        if (hasCycle(adjacency[group], body.fromLocationId, body.toLocationId, ticker)) {
          response.skippedCycles.push({ category, ticker })
          continue
        }

        const [inserted] = await db
          .insert(logisticsFlows)
          .values({
            userId,
            commodityTicker: ticker,
            fromLocationId: body.fromLocationId,
            fromStorageTypes: body.fromStorageTypes,
            toLocationId: body.toLocationId,
            toStorageTypes: body.toStorageTypes,
            kind,
            amountOverride: null,
            rate: 'daily',
            priority: null,
            note: null,
          })
          .returning()

        response.created.push({ category, flow: toFlowResponse(inserted) })
        existingKeys.add(key)
        recordEdge(adjacency, kind, body.fromLocationId, body.toLocationId, ticker)
      }
    }

    this.setStatus(201)
    return response
  }

  /**
   * Template-based bulk create: connect a single hub to many planets in one
   * operation. Direction auto-orients per category — consumption categories
   * become hub→planet demand edges; production_output becomes planet→hub
   * surplus edges. Supports granular categories (burn, production_input,
   * repair, government, contract, reserve, production_output) and per-planet
   * ticker exclusions from the review step.
   */
  @Post('bulk-multi')
  @SuccessResponse('201', 'Created')
  public async bulkMultiCreateFlows(
    @Body() body: BulkMultiCreateLogisticsFlowsRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BulkMultiCreateLogisticsFlowsResponse> {
    const userId = request.user.userId

    if (!body.hubLocationId) {
      throw BadRequest('hubLocationId is required')
    }
    if (body.planetLocationIds.length === 0) {
      throw BadRequest('planetLocationIds must be non-empty')
    }
    if (body.categories.length === 0) {
      throw BadRequest('at least one category is required')
    }
    if (body.hubStorageTypes.length === 0 || body.planetStorageTypes.length === 0) {
      throw BadRequest('hubStorageTypes and planetStorageTypes must not be empty')
    }
    if (body.planetLocationIds.includes(body.hubLocationId)) {
      throw BadRequest('planetLocationIds must not include the hub')
    }

    const exclusions = body.exclusions ?? {}

    // Preload adjacency once; mutate incrementally across all planets.
    const adjacency = await loadAdjacency(userId)

    // Preload (from, to, ticker) tuples for dedup across all inserts.
    const existingRows = await db
      .select({
        from: logisticsFlows.fromLocationId,
        to: logisticsFlows.toLocationId,
        ticker: logisticsFlows.commodityTicker,
      })
      .from(logisticsFlows)
      .where(eq(logisticsFlows.userId, userId))
    const existingKeys = new Set<string>()
    for (const r of existingRows) existingKeys.add(`${r.from}|${r.to}|${r.ticker}`)

    const perPlanet: BulkMultiPlanetResult[] = []
    const totals = { created: 0, duplicates: 0, cycles: 0, empty: 0 }

    for (const planetLocationId of body.planetLocationIds) {
      const planetExclusions = exclusions[planetLocationId] ?? {}
      const result: BulkMultiPlanetResult = {
        planetLocationId,
        created: [],
        skippedDuplicates: [],
        skippedCycles: [],
        emptyCategories: [],
      }

      for (const category of body.categories) {
        // Auto-orient direction: consumption → hub→planet; output → planet→hub.
        const isOutput = category === 'production_output'
        const fromLocationId = isOutput ? planetLocationId : body.hubLocationId
        const toLocationId = isOutput ? body.hubLocationId : planetLocationId
        const fromStorageTypes = isOutput ? body.planetStorageTypes : body.hubStorageTypes
        const toStorageTypes = isOutput ? body.hubStorageTypes : body.planetStorageTypes
        const kind: FlowKind = isOutput ? 'surplus' : 'demand'
        const group = groupForKind(kind)

        const tickers = await detectTickersForBulkCategory(userId, category, planetLocationId)
        const categoryExclusions = new Set(planetExclusions[category] ?? [])

        if (tickers.size === 0) {
          result.emptyCategories.push(category)
          totals.empty += 1
          continue
        }

        for (const ticker of tickers) {
          // Skip user-deselected tickers from the review step.
          if (categoryExclusions.has(ticker)) continue

          // Dedup key includes category so the same ticker can exist as
          // different categories (e.g. DW as both burn and production_input).
          const key = `${fromLocationId}|${toLocationId}|${ticker}|${category}`
          if (existingKeys.has(key)) {
            result.skippedDuplicates.push({ category, ticker })
            totals.duplicates += 1
            continue
          }
          if (hasCycle(adjacency[group], fromLocationId, toLocationId, ticker)) {
            result.skippedCycles.push({ category, ticker })
            totals.cycles += 1
            continue
          }

          const [inserted] = await db
            .insert(logisticsFlows)
            .values({
              userId,
              commodityTicker: ticker,
              fromLocationId,
              fromStorageTypes,
              toLocationId,
              toStorageTypes,
              kind,
              amountOverride: null,
              rate: 'daily',
              priority: null,
              note: null,
            })
            .returning()

          result.created.push({ category, flow: toFlowResponse(inserted) })
          totals.created += 1
          existingKeys.add(key)
          recordEdge(adjacency, kind, fromLocationId, toLocationId, ticker)
        }
      }

      perPlanet.push(result)
    }

    this.setStatus(201)
    return { perPlanet, totals }
  }

  /**
   * Preview what the bulk-multi endpoint would create, without writing to the
   * database. Returns per-planet detected tickers grouped by granular category
   * (burn, production_input, repair, government, contract, reserve,
   * production_output). The frontend review step uses this to let the user
   * deselect individual materials before committing.
   */
  @Post('bulk-multi/preview')
  public async previewBulkMultiFlows(
    @Body() body: BulkMultiPreviewRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BulkMultiPreviewResponse> {
    const userId = request.user.userId

    if (!body.hubLocationId) {
      throw BadRequest('hubLocationId is required')
    }
    if (body.planetLocationIds.length === 0) {
      throw BadRequest('planetLocationIds must be non-empty')
    }
    if (body.categories.length === 0) {
      throw BadRequest('at least one category is required')
    }
    if (body.hubStorageTypes.length === 0 || body.planetStorageTypes.length === 0) {
      throw BadRequest('hubStorageTypes and planetStorageTypes must not be empty')
    }
    if (body.planetLocationIds.includes(body.hubLocationId)) {
      throw BadRequest('planetLocationIds must not include the hub')
    }

    // Preload adjacency + existing keys for dedup/cycle checks.
    const adjacency = await loadAdjacency(userId)
    const existingRows = await db
      .select({
        from: logisticsFlows.fromLocationId,
        to: logisticsFlows.toLocationId,
        ticker: logisticsFlows.commodityTicker,
      })
      .from(logisticsFlows)
      .where(eq(logisticsFlows.userId, userId))
    const existingKeys = new Set<string>()
    for (const r of existingRows) existingKeys.add(`${r.from}|${r.to}|${r.ticker}`)

    const perPlanet: BulkPlanetPreview[] = []
    const totals = { items: 0, duplicates: 0, cycles: 0 }

    for (const planetLocationId of body.planetLocationIds) {
      const result: BulkPlanetPreview = {
        planetLocationId,
        items: [],
        skippedDuplicates: [],
        skippedCycles: [],
      }

      for (const category of body.categories) {
        const isOutput = category === 'production_output'
        const fromLocationId = isOutput ? planetLocationId : body.hubLocationId
        const toLocationId = isOutput ? body.hubLocationId : planetLocationId
        const kind: 'demand' | 'surplus' = isOutput ? 'surplus' : 'demand'
        const group = groupForKind(kind)

        const tickers = await detectTickersForBulkCategory(userId, category, planetLocationId)

        for (const ticker of tickers) {
          // Dedup key includes category so the same ticker can exist as
          // different categories (e.g. DW as both burn and production_input).
          const key = `${fromLocationId}|${toLocationId}|${ticker}|${category}`
          if (existingKeys.has(key)) {
            result.skippedDuplicates.push({ category, ticker })
            totals.duplicates += 1
            continue
          }
          if (hasCycle(adjacency[group], fromLocationId, toLocationId, ticker)) {
            result.skippedCycles.push({ category, ticker })
            totals.cycles += 1
            continue
          }
          result.items.push({ ticker, category, kind })
          totals.items += 1
        }
      }

      perPlanet.push(result)
    }

    return { perPlanet, totals }
  }

  /**
   * Delete a logistics flow.
   */
  @Delete('{id}')
  public async deleteFlow(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId
    const [existing] = await db
      .select({ id: logisticsFlows.id })
      .from(logisticsFlows)
      .where(and(eq(logisticsFlows.id, id), eq(logisticsFlows.userId, userId)))
    if (!existing) throw NotFound('Logistics flow not found')

    await db.delete(logisticsFlows).where(eq(logisticsFlows.id, id))
    return { success: true }
  }
}
