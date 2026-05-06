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
  Shipment,
  ShipmentStop,
  ShipmentLine,
  ShipmentStopInput,
  ShipmentLineInput,
  ShipmentStatus,
  CreateShipmentRequest,
  UpdateShipmentRequest,
  UpdateShipmentStatusRequest,
  RepeatShipmentRequest,
  SuggestStopTimesRequest,
  SuggestStopTimesResponse,
} from '@kawakawa/types'
import {
  db,
  shipments,
  shipmentStops,
  shipmentLines,
  logisticsFlows,
  fioCommodities,
  fioUserShips,
  fioLocations,
} from '../db/index.js'
import { eq, and, inArray, asc } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { buildAndSolveGraph } from '../services/logistics-graph-loader.js'
import { FioClient } from '@kawakawa/services/fio'

type ShipmentRow = typeof shipments.$inferSelect
type StopRow = typeof shipmentStops.$inferSelect
type LineRow = typeof shipmentLines.$inferSelect

// ==================== Response shaping ====================

function toStop(row: StopRow): ShipmentStop {
  return {
    id: row.id,
    sequence: row.sequence,
    locationId: row.locationId,
    plannedArriveAt: row.plannedArriveAt.toISOString(),
    notes: row.notes,
  }
}

function toLine(row: LineRow): ShipmentLine {
  return {
    id: row.id,
    originStopId: row.originStopId,
    destinationStopId: row.destinationStopId,
    flowId: row.flowId,
    commodityTicker: row.commodityTicker,
    amount: row.amount,
  }
}

function toShipment(row: ShipmentRow, stops: StopRow[], lines: LineRow[]): Shipment {
  const orderedStops = [...stops].sort((a, b) => a.sequence - b.sequence)
  return {
    id: row.id,
    shipDbId: row.shipDbId,
    status: row.status as ShipmentStatus,
    actualDispatchAt: row.actualDispatchAt ? row.actualDispatchAt.toISOString() : null,
    actualArrivalAt: row.actualArrivalAt ? row.actualArrivalAt.toISOString() : null,
    notes: row.notes,
    stops: orderedStops.map(toStop),
    lines: lines.map(toLine),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function loadStopsAndLinesForShipments(
  shipmentIds: number[]
): Promise<{ stops: Map<number, StopRow[]>; lines: Map<number, LineRow[]> }> {
  const result = { stops: new Map<number, StopRow[]>(), lines: new Map<number, LineRow[]>() }
  if (shipmentIds.length === 0) return result

  const [stopRows, lineRows] = await Promise.all([
    db.select().from(shipmentStops).where(inArray(shipmentStops.shipmentId, shipmentIds)),
    db.select().from(shipmentLines).where(inArray(shipmentLines.shipmentId, shipmentIds)),
  ])

  for (const r of stopRows) {
    const list = result.stops.get(r.shipmentId) ?? []
    list.push(r)
    result.stops.set(r.shipmentId, list)
  }
  for (const r of lineRows) {
    const list = result.lines.get(r.shipmentId) ?? []
    list.push(r)
    result.lines.set(r.shipmentId, list)
  }
  return result
}

// ==================== Status state machine ====================

/**
 * The shipment status state machine. Exported for unit testing.
 *
 *   planned    → dispatched, cancelled
 *   dispatched → delivered,  cancelled
 *   delivered  → (terminal)
 *   cancelled  → (terminal)
 */
export const SHIPMENT_STATUS_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  planned: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export function isValidShipmentStatusTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return SHIPMENT_STATUS_TRANSITIONS[from].includes(to)
}

function validateStatusTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (!isValidShipmentStatusTransition(from, to)) {
    throw BadRequest(`Invalid status transition: ${from} → ${to}`)
  }
}

// ==================== Pure validation helpers ====================

/**
 * One segment of the trip — the leg between consecutive stops. Used by the
 * capacity check. `weight` and `volume` are the totals of cargo onboard
 * during this segment (loaded at or before stop N, dropped after stop N+1).
 */
export interface SegmentLoad {
  segmentIndex: number
  weight: number
  volume: number
}

/**
 * Compute per-segment load from line indices and per-line weight/volume.
 * Pure function, exported for unit tests. A line with origin index `o` and
 * destination index `d` contributes to every segment in `[o, d)`.
 */
export function computeSegmentLoads(
  stopCount: number,
  lines: Array<{
    originStopIndex: number
    destinationStopIndex: number
    weightTotal: number
    volumeTotal: number
  }>
): SegmentLoad[] {
  const segCount = Math.max(0, stopCount - 1)
  const out: SegmentLoad[] = []
  for (let i = 0; i < segCount; i++) out.push({ segmentIndex: i, weight: 0, volume: 0 })
  for (const line of lines) {
    for (let s = line.originStopIndex; s < line.destinationStopIndex; s++) {
      const seg = out[s]
      if (!seg) continue
      seg.weight += line.weightTotal
      seg.volume += line.volumeTotal
    }
  }
  return out
}

/**
 * One leg's time-estimation inputs, after I/O has resolved them. Pure helper
 * is separated so it can be unit-tested without DB or FIO calls.
 */
export interface SuggestLegInput {
  /** Jump count from FIO. `null` = unknown — we treat it as 1. */
  jumpCount: number | null
  /** Both endpoints in the same star system. */
  sameSystem: boolean
  /** Cargo weight on this segment as a fraction of ship cargo cap. 0 when no
   *  ship is assigned or the ship has no cap; clamped to [0, 1]. */
  loadFraction: number
}

// Tier-1 heuristic constants. These are deliberately rough — the user can
// override the auto-suggested arrival times in the dialog if reality differs.
const SAME_SYSTEM_DAYS = 0.5
const PER_JUMP_DAYS = 1.0
const STL_RAMP_DAYS = 0.5 // STL out of origin gate / into destination gate
const MAX_LOAD_PENALTY = 0.5 // full ship is 1.5× empty time

/**
 * Estimate one leg's duration in days. Pure: takes already-resolved inputs.
 * - Same-system trips: a small constant for STL between bodies.
 * - Cross-system: jumps × PER_JUMP_DAYS + STL_RAMP_DAYS for gate-to-body STL
 *   on each end (counted once for the whole leg, not per system traversed).
 * - Load factor: 1 + 0.5 × loadFraction; full ship slows the trip 50%.
 */
export function estimateLegDays(leg: SuggestLegInput): number {
  const loadFactor = 1 + MAX_LOAD_PENALTY * Math.max(0, Math.min(1, leg.loadFraction))
  if (leg.sameSystem) return SAME_SYSTEM_DAYS * loadFactor
  const jumps = leg.jumpCount ?? 1
  return (jumps * PER_JUMP_DAYS + STL_RAMP_DAYS) * loadFactor
}

interface NormalizedStop {
  locationId: string
  plannedArriveAt: Date
  notes: string | null
}

interface NormalizedLine {
  originStopIndex: number
  destinationStopIndex: number
  flowId: number | null
  commodityTicker: string
  amount: number
}

/**
 * Validate stops + lines structure (sequence, indices, monotonic times) and
 * normalize for insert. Throws BadRequest on any violation. Does NOT touch
 * the database — that's separated so the network-bound checks (flow lookup,
 * capacity) can run after this passes.
 */
function validateStructure(
  stops: ShipmentStopInput[],
  lines: ShipmentLineInput[]
): { stops: NormalizedStop[]; lines: NormalizedLine[] } {
  if (!stops || stops.length < 2) {
    throw BadRequest('A trip must have at least 2 stops')
  }
  if (!lines || lines.length === 0) {
    throw BadRequest('A trip must have at least 1 manifest line')
  }

  const normalizedStops: NormalizedStop[] = stops.map((s, i) => {
    if (!s.locationId) throw BadRequest(`Stop ${i + 1}: locationId is required`)
    const t = new Date(s.plannedArriveAt)
    if (Number.isNaN(t.getTime())) {
      throw BadRequest(`Stop ${i + 1}: invalid plannedArriveAt`)
    }
    return { locationId: s.locationId, plannedArriveAt: t, notes: s.notes ?? null }
  })

  for (let i = 1; i < normalizedStops.length; i++) {
    if (normalizedStops[i].plannedArriveAt < normalizedStops[i - 1].plannedArriveAt) {
      throw BadRequest(`Stop ${i + 1} arrives before stop ${i} — stop times must be non-decreasing`)
    }
    if (normalizedStops[i].locationId === normalizedStops[i - 1].locationId) {
      throw BadRequest(
        `Stops ${i} and ${i + 1} are at the same location — collapse them or visit a different location in between`
      )
    }
  }

  const normalizedLines: NormalizedLine[] = lines.map((line, i) => {
    if (!Number.isInteger(line.originStopIndex) || !Number.isInteger(line.destinationStopIndex)) {
      throw BadRequest(`Line ${i + 1}: originStopIndex and destinationStopIndex must be integers`)
    }
    if (line.originStopIndex < 0 || line.originStopIndex >= stops.length) {
      throw BadRequest(`Line ${i + 1}: originStopIndex out of range`)
    }
    if (line.destinationStopIndex < 0 || line.destinationStopIndex >= stops.length) {
      throw BadRequest(`Line ${i + 1}: destinationStopIndex out of range`)
    }
    if (line.originStopIndex >= line.destinationStopIndex) {
      throw BadRequest(
        `Line ${i + 1}: cargo must be loaded before it's dropped (origin stop must come before destination stop)`
      )
    }
    if (!line.commodityTicker) throw BadRequest(`Line ${i + 1}: commodityTicker is required`)
    if (!Number.isFinite(line.amount) || line.amount <= 0) {
      throw BadRequest(`Line ${i + 1} (${line.commodityTicker}): amount must be > 0`)
    }
    return {
      originStopIndex: line.originStopIndex,
      destinationStopIndex: line.destinationStopIndex,
      flowId: line.flowId ?? null,
      commodityTicker: line.commodityTicker.toUpperCase(),
      amount: Math.floor(line.amount),
    }
  })

  return { stops: normalizedStops, lines: normalizedLines }
}

/**
 * Check that every flow-linked line refers to a flow that (a) belongs to
 * this user and (b) routes from the line's origin stop to its destination
 * stop. The flow's `from`/`to` must match the segment endpoints exactly.
 */
async function validateFlowReferences(
  userId: number,
  stops: NormalizedStop[],
  lines: NormalizedLine[]
): Promise<void> {
  const flowIds = [...new Set(lines.map(l => l.flowId).filter((v): v is number => v !== null))]
  if (flowIds.length === 0) return

  const flowRows = await db
    .select({
      id: logisticsFlows.id,
      userId: logisticsFlows.userId,
      from: logisticsFlows.fromLocationId,
      to: logisticsFlows.toLocationId,
    })
    .from(logisticsFlows)
    .where(inArray(logisticsFlows.id, flowIds))
  const byId = new Map(flowRows.map(f => [f.id, f]))

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.flowId === null) continue
    const flow = byId.get(line.flowId)
    if (!flow) throw BadRequest(`Line ${i + 1}: flow ${line.flowId} not found`)
    if (flow.userId !== userId) {
      throw BadRequest(`Line ${i + 1}: flow ${line.flowId} does not belong to user`)
    }
    const originLoc = stops[line.originStopIndex].locationId
    const destLoc = stops[line.destinationStopIndex].locationId
    if (flow.from !== originLoc || flow.to !== destLoc) {
      throw BadRequest(
        `Line ${i + 1}: flow ${line.flowId} routes ${flow.from}→${flow.to}, ` +
          `but the line's stops are ${originLoc}→${destLoc}`
      )
    }
  }
}

/**
 * Hard-fail capacity check: for the assigned ship (if any), confirm that no
 * segment of the trip exceeds the ship's cargo weight or volume capacity.
 * Skipped when no ship is assigned — the user can pick one later.
 */
async function validateCapacity(
  userId: number,
  shipDbId: number | null,
  stops: NormalizedStop[],
  lines: NormalizedLine[]
): Promise<void> {
  if (shipDbId === null) return

  const [shipRow] = await db
    .select({
      weightCap: fioUserShips.cargoWeightCapacity,
      volumeCap: fioUserShips.cargoVolumeCapacity,
      userId: fioUserShips.userId,
    })
    .from(fioUserShips)
    .where(eq(fioUserShips.id, shipDbId))
  if (!shipRow) throw BadRequest(`Ship ${shipDbId} not found`)
  if (shipRow.userId !== userId) throw BadRequest(`Ship ${shipDbId} does not belong to user`)

  const weightCap = Number(shipRow.weightCap)
  const volumeCap = Number(shipRow.volumeCap)

  // Look up weight/volume for each ticker the manifest references.
  const tickers = [...new Set(lines.map(l => l.commodityTicker))]
  const commRows = await db
    .select({
      ticker: fioCommodities.ticker,
      weight: fioCommodities.weight,
      volume: fioCommodities.volume,
    })
    .from(fioCommodities)
    .where(inArray(fioCommodities.ticker, tickers))
  const commByTicker = new Map(commRows.map(c => [c.ticker, c]))

  const linesWithMass = lines.map((l, i) => {
    const c = commByTicker.get(l.commodityTicker)
    if (!c) throw BadRequest(`Line ${i + 1}: unknown ticker '${l.commodityTicker}'`)
    const wPer = Number(c.weight ?? 0)
    const vPer = Number(c.volume ?? 0)
    return {
      originStopIndex: l.originStopIndex,
      destinationStopIndex: l.destinationStopIndex,
      weightTotal: wPer * l.amount,
      volumeTotal: vPer * l.amount,
    }
  })

  const segments = computeSegmentLoads(stops.length, linesWithMass)
  for (const seg of segments) {
    const overWeight = weightCap > 0 && seg.weight > weightCap + 1e-6
    const overVolume = volumeCap > 0 && seg.volume > volumeCap + 1e-6
    if (overWeight || overVolume) {
      const fromIdx = seg.segmentIndex
      const toIdx = seg.segmentIndex + 1
      const fromLoc = stops[fromIdx].locationId
      const toLoc = stops[toIdx].locationId
      const reasons: string[] = []
      if (overWeight) {
        reasons.push(`${seg.weight.toFixed(1)}t cargo vs ${weightCap.toFixed(0)}t capacity`)
      }
      if (overVolume) {
        reasons.push(`${seg.volume.toFixed(1)}m³ cargo vs ${volumeCap.toFixed(0)}m³ capacity`)
      }
      throw BadRequest(
        `Segment ${fromLoc}→${toLoc} (stop ${fromIdx + 1}→${toIdx + 1}) exceeds ship capacity: ${reasons.join('; ')}`
      )
    }
  }
}

// ==================== Controller ====================

@Route('logistics/shipments')
@Tags('Logistics')
@Security('jwt')
export class ShipmentsController extends Controller {
  /** List all shipments for the current user, ordered by first stop's planned arrival. */
  @Get()
  public async listShipments(@Request() request: { user: JwtPayload }): Promise<Shipment[]> {
    const userId = request.user.userId
    const rows = await db
      .select()
      .from(shipments)
      .where(eq(shipments.userId, userId))
      .orderBy(asc(shipments.createdAt))

    const { stops, lines } = await loadStopsAndLinesForShipments(rows.map(r => r.id))
    const built = rows.map(r => toShipment(r, stops.get(r.id) ?? [], lines.get(r.id) ?? []))

    // Sort by first-stop planned arrival ascending. Shipments with no stops
    // (shouldn't happen, but defensively) sink to the bottom.
    built.sort((a, b) => {
      const aT = a.stops[0]?.plannedArriveAt ?? '9999'
      const bT = b.stops[0]?.plannedArriveAt ?? '9999'
      return aT.localeCompare(bT)
    })
    return built
  }

  /** Get a single shipment with its stops + lines. */
  @Get('{id}')
  public async getShipment(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<Shipment> {
    const userId = request.user.userId
    const [row] = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.userId, userId)))
    if (!row) throw NotFound('Shipment not found')

    const [stopRows, lineRows] = await Promise.all([
      db.select().from(shipmentStops).where(eq(shipmentStops.shipmentId, id)),
      db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)),
    ])
    return toShipment(row, stopRows, lineRows)
  }

  /** Create a new shipment in `planned` status. */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createShipment(
    @Body() body: CreateShipmentRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Shipment> {
    const userId = request.user.userId
    const { stops, lines } = validateStructure(body.stops, body.lines)
    await validateFlowReferences(userId, stops, lines)
    await validateCapacity(userId, body.shipDbId ?? null, stops, lines)

    const result = await db.transaction(async tx => {
      const [insertedShipment] = await tx
        .insert(shipments)
        .values({
          userId,
          shipDbId: body.shipDbId ?? null,
          notes: body.notes ?? null,
        })
        .returning()

      const stopRows = await tx
        .insert(shipmentStops)
        .values(
          stops.map((s, i) => ({
            shipmentId: insertedShipment.id,
            sequence: i,
            locationId: s.locationId,
            plannedArriveAt: s.plannedArriveAt,
            notes: s.notes,
          }))
        )
        .returning()
      stopRows.sort((a, b) => a.sequence - b.sequence)

      const lineRows = await tx
        .insert(shipmentLines)
        .values(
          lines.map(l => ({
            shipmentId: insertedShipment.id,
            originStopId: stopRows[l.originStopIndex].id,
            destinationStopId: stopRows[l.destinationStopIndex].id,
            flowId: l.flowId,
            commodityTicker: l.commodityTicker,
            amount: l.amount,
          }))
        )
        .returning()

      return { shipment: insertedShipment, stops: stopRows, lines: lineRows }
    })

    this.setStatus(201)
    return toShipment(result.shipment, result.stops, result.lines)
  }

  /**
   * Update a planned shipment. Updates are rejected once the shipment has
   * been dispatched, delivered, or cancelled — the manifest is then a record
   * of what was sent, not a plan to edit. Structural updates (stops + lines)
   * must be sent together since lines reference stops by index.
   */
  @Put('{id}')
  public async updateShipment(
    @Path() id: number,
    @Body() body: UpdateShipmentRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Shipment> {
    const userId = request.user.userId
    const [existing] = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.userId, userId)))
    if (!existing) throw NotFound('Shipment not found')
    if (existing.status !== 'planned') {
      throw BadRequest(`Cannot edit a ${existing.status} shipment`)
    }

    const wantsStops = body.stops !== undefined
    const wantsLines = body.lines !== undefined
    if (wantsStops !== wantsLines) {
      throw BadRequest(
        'Structural updates must include both stops and lines together (lines reference stops by index)'
      )
    }

    const newShipDbId = body.shipDbId !== undefined ? body.shipDbId : existing.shipDbId

    let validated: { stops: NormalizedStop[]; lines: NormalizedLine[] } | null = null
    if (wantsStops && wantsLines && body.stops && body.lines) {
      validated = validateStructure(body.stops, body.lines)
      await validateFlowReferences(userId, validated.stops, validated.lines)
      await validateCapacity(userId, newShipDbId, validated.stops, validated.lines)
    } else if (newShipDbId !== existing.shipDbId && newShipDbId !== null) {
      // Ship swap with no structural change — re-validate capacity against
      // the existing manifest using the new ship.
      const [stopRows, lineRows] = await Promise.all([
        db.select().from(shipmentStops).where(eq(shipmentStops.shipmentId, id)),
        db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)),
      ])
      const stopsBySeq = [...stopRows].sort((a, b) => a.sequence - b.sequence)
      const stopIdToIndex = new Map(stopsBySeq.map((s, i) => [s.id, i]))
      const normStops: NormalizedStop[] = stopsBySeq.map(s => ({
        locationId: s.locationId,
        plannedArriveAt: s.plannedArriveAt,
        notes: s.notes,
      }))
      const normLines: NormalizedLine[] = lineRows.map(l => ({
        originStopIndex: stopIdToIndex.get(l.originStopId) ?? 0,
        destinationStopIndex: stopIdToIndex.get(l.destinationStopId) ?? 0,
        flowId: l.flowId,
        commodityTicker: l.commodityTicker,
        amount: l.amount,
      }))
      await validateCapacity(userId, newShipDbId, normStops, normLines)
    }

    const result = await db.transaction(async tx => {
      await tx
        .update(shipments)
        .set({
          shipDbId: newShipDbId,
          notes: body.notes !== undefined ? body.notes : existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, id))

      let stopRows: StopRow[]
      let lineRows: LineRow[]
      if (validated) {
        // Delete lines first, then stops, to keep referential integrity tidy
        // even though both cascade from the shipment.
        await tx.delete(shipmentLines).where(eq(shipmentLines.shipmentId, id))
        await tx.delete(shipmentStops).where(eq(shipmentStops.shipmentId, id))

        stopRows = await tx
          .insert(shipmentStops)
          .values(
            validated.stops.map((s, i) => ({
              shipmentId: id,
              sequence: i,
              locationId: s.locationId,
              plannedArriveAt: s.plannedArriveAt,
              notes: s.notes,
            }))
          )
          .returning()
        stopRows.sort((a, b) => a.sequence - b.sequence)

        lineRows = await tx
          .insert(shipmentLines)
          .values(
            validated.lines.map(l => ({
              shipmentId: id,
              originStopId: stopRows[l.originStopIndex].id,
              destinationStopId: stopRows[l.destinationStopIndex].id,
              flowId: l.flowId,
              commodityTicker: l.commodityTicker,
              amount: l.amount,
            }))
          )
          .returning()
      } else {
        ;[stopRows, lineRows] = await Promise.all([
          tx.select().from(shipmentStops).where(eq(shipmentStops.shipmentId, id)),
          tx.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)),
        ])
      }

      const [updated] = await tx
        .select()
        .from(shipments)
        .where(and(eq(shipments.id, id), eq(shipments.userId, userId)))
      return { shipment: updated, stops: stopRows, lines: lineRows }
    })

    return toShipment(result.shipment, result.stops, result.lines)
  }

  /**
   * Transition a shipment between statuses. Stamps actualDispatchAt /
   * actualArrivalAt automatically on the relevant transitions.
   */
  @Put('{id}/status')
  public async setShipmentStatus(
    @Path() id: number,
    @Body() body: UpdateShipmentStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Shipment> {
    const userId = request.user.userId
    const [existing] = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.userId, userId)))
    if (!existing) throw NotFound('Shipment not found')

    validateStatusTransition(existing.status as ShipmentStatus, body.status)

    const now = new Date()
    const patch: Partial<typeof shipments.$inferInsert> = {
      status: body.status,
      updatedAt: now,
    }
    if (body.status === 'dispatched') patch.actualDispatchAt = now
    if (body.status === 'delivered') patch.actualArrivalAt = now

    const [updated] = await db.update(shipments).set(patch).where(eq(shipments.id, id)).returning()
    const [stopRows, lineRows] = await Promise.all([
      db.select().from(shipmentStops).where(eq(shipmentStops.shipmentId, id)),
      db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)),
    ])
    return toShipment(updated, stopRows, lineRows)
  }

  /**
   * Hard-delete a shipment. Only allowed in `planned` or `cancelled` status —
   * dispatched/delivered shipments are historical records and should not be
   * removed (the user can cancel a dispatched shipment first if they made a
   * tracking mistake). Cascade removes its stops + lines.
   */
  @Delete('{id}')
  public async deleteShipment(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId
    const [existing] = await db
      .select({ id: shipments.id, status: shipments.status })
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.userId, userId)))
    if (!existing) throw NotFound('Shipment not found')
    if (existing.status !== 'planned' && existing.status !== 'cancelled') {
      throw BadRequest(`Cannot delete a ${existing.status} shipment — cancel it first`)
    }
    await db.delete(shipments).where(eq(shipments.id, id))
    return { success: true }
  }

  /**
   * Clone a past shipment as a new draft. Stops + lines copy over; flow-linked
   * line amounts refresh from the current solver `perShipmentAmount`; ad-hoc
   * line amounts copy as-is. Stop times shift forward so the first stop lands
   * at `firstStopAt` (defaults to now) preserving relative offsets.
   */
  @Post('{id}/repeat')
  @SuccessResponse('201', 'Created')
  public async repeatShipment(
    @Path() id: number,
    @Body() body: RepeatShipmentRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Shipment> {
    const userId = request.user.userId
    const [source] = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.userId, userId)))
    if (!source) throw NotFound('Shipment not found')

    const [sourceStops, sourceLines] = await Promise.all([
      db.select().from(shipmentStops).where(eq(shipmentStops.shipmentId, id)),
      db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)),
    ])
    if (sourceStops.length < 2) {
      throw BadRequest('Source shipment is malformed (needs ≥ 2 stops)')
    }

    const orderedStops = [...sourceStops].sort((a, b) => a.sequence - b.sequence)
    const stopIdToIndex = new Map(orderedStops.map((s, i) => [s.id, i]))

    // Shift stop times so that stop 0 lands at the requested anchor (defaults
    // to now). Preserves all inter-stop offsets.
    const anchor = body.firstStopAt ? new Date(body.firstStopAt) : new Date()
    if (Number.isNaN(anchor.getTime())) throw BadRequest('Invalid firstStopAt')
    const sourceFirstMs = orderedStops[0].plannedArriveAt.getTime()
    const shiftMs = anchor.getTime() - sourceFirstMs

    // Refresh amounts from the solver for flow-linked lines.
    const flowIds = [
      ...new Set(sourceLines.map(l => l.flowId).filter((v): v is number => v !== null)),
    ]
    let perShipmentByFlow = new Map<number, number>()
    if (flowIds.length > 0) {
      const graph = await buildAndSolveGraph(userId)
      perShipmentByFlow = new Map(
        graph.edges.filter(e => flowIds.includes(e.id)).map(e => [e.id, e.perShipmentAmount])
      )
    }

    const result = await db.transaction(async tx => {
      const [insertedShipment] = await tx
        .insert(shipments)
        .values({
          userId,
          shipDbId: source.shipDbId,
          notes: source.notes,
        })
        .returning()

      const stopRows = await tx
        .insert(shipmentStops)
        .values(
          orderedStops.map((s, i) => ({
            shipmentId: insertedShipment.id,
            sequence: i,
            locationId: s.locationId,
            plannedArriveAt: new Date(s.plannedArriveAt.getTime() + shiftMs),
            notes: s.notes,
          }))
        )
        .returning()
      stopRows.sort((a, b) => a.sequence - b.sequence)

      const lineRows = await tx
        .insert(shipmentLines)
        .values(
          sourceLines.map(l => {
            const oIdx = stopIdToIndex.get(l.originStopId) ?? 0
            const dIdx = stopIdToIndex.get(l.destinationStopId) ?? 0
            const refreshed = l.flowId !== null ? perShipmentByFlow.get(l.flowId) : undefined
            const amount =
              refreshed !== undefined && refreshed > 0
                ? Math.max(1, Math.round(refreshed))
                : l.amount
            return {
              shipmentId: insertedShipment.id,
              originStopId: stopRows[oIdx].id,
              destinationStopId: stopRows[dIdx].id,
              flowId: l.flowId,
              commodityTicker: l.commodityTicker,
              amount,
            }
          })
        )
        .returning()

      return { shipment: insertedShipment, stops: stopRows, lines: lineRows }
    })

    this.setStatus(201)
    return toShipment(result.shipment, result.stops, result.lines)
  }

  /**
   * Tier-1 heuristic stop-time suggester. Estimates each leg's duration as
   * (jumps × per-jump-day + same-system constant) × cargo-load factor, then
   * accumulates timestamps starting from the user-provided `startAt`. The
   * user can still hand-edit any stop's planned arrival in the dialog —
   * this just removes typing-each-leg friction.
   */
  @Post('suggest-times')
  public async suggestStopTimes(
    @Body() body: SuggestStopTimesRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SuggestStopTimesResponse> {
    const userId = request.user.userId
    const start = new Date(body.startAt)
    if (Number.isNaN(start.getTime())) throw BadRequest('Invalid startAt')
    if (!body.stops || body.stops.length === 0) throw BadRequest('At least one stop is required')

    const warnings: string[] = []
    const stopOut: Array<{ plannedArriveAt: string }> = [{ plannedArriveAt: start.toISOString() }]
    if (body.stops.length === 1) return { stops: stopOut, warnings }

    // Resolve system per stop location.
    const locationIds = [...new Set(body.stops.map(s => s.locationId).filter(Boolean))]
    const locRows = locationIds.length
      ? await db
          .select({
            naturalId: fioLocations.naturalId,
            systemNaturalId: fioLocations.systemNaturalId,
          })
          .from(fioLocations)
          .where(inArray(fioLocations.naturalId, locationIds))
      : []
    const systemByLoc = new Map(locRows.map(r => [r.naturalId, r.systemNaturalId]))

    // Ship cargo cap (only relevant for the load factor).
    let shipCap = 0
    if (body.shipDbId != null) {
      const [shipRow] = await db
        .select({
          weightCap: fioUserShips.cargoWeightCapacity,
          userId: fioUserShips.userId,
        })
        .from(fioUserShips)
        .where(eq(fioUserShips.id, body.shipDbId))
      if (!shipRow) {
        warnings.push(`Ship ${body.shipDbId} not found — load factor will not be applied`)
      } else if (shipRow.userId !== userId) {
        throw BadRequest(`Ship ${body.shipDbId} does not belong to user`)
      } else {
        shipCap = Number(shipRow.weightCap)
      }
    }

    // Per-segment cargo weight, derived from the manifest and commodity weights.
    const tickers = [...new Set((body.lines ?? []).map(l => l.commodityTicker.toUpperCase()))]
    const commRows = tickers.length
      ? await db
          .select({ ticker: fioCommodities.ticker, weight: fioCommodities.weight })
          .from(fioCommodities)
          .where(inArray(fioCommodities.ticker, tickers))
      : []
    const weightByTicker = new Map(commRows.map(c => [c.ticker, Number(c.weight ?? 0)]))
    const linesForLoad = (body.lines ?? []).map(l => ({
      originStopIndex: l.originStopIndex,
      destinationStopIndex: l.destinationStopIndex,
      weightTotal: (weightByTicker.get(l.commodityTicker.toUpperCase()) ?? 0) * l.amount,
      volumeTotal: 0, // unused for time estimation
    }))
    const segmentLoads = computeSegmentLoads(body.stops.length, linesForLoad)

    // Walk each leg, accumulating arrival times.
    const fio = new FioClient()
    let cursorMs = start.getTime()
    for (let i = 0; i < body.stops.length - 1; i++) {
      const fromLoc = body.stops[i].locationId
      const toLoc = body.stops[i + 1].locationId
      const fromSystem = systemByLoc.get(fromLoc)
      const toSystem = systemByLoc.get(toLoc)

      let sameSystem = false
      let jumpCount: number | null = null
      if (!fromSystem || !toSystem) {
        warnings.push(
          `Stop ${i + 1}→${i + 2}: location not synced (${!fromSystem ? fromLoc : toLoc}) — assuming 1 jump`
        )
      } else if (fromSystem === toSystem) {
        sameSystem = true
      } else {
        try {
          jumpCount = await fio.getJumpCount(fromSystem, toSystem)
          if (jumpCount === null) {
            warnings.push(
              `Stop ${i + 1}→${i + 2}: jump count unknown (${fromSystem}→${toSystem}) — assuming 1 jump`
            )
          }
        } catch {
          warnings.push(
            `Stop ${i + 1}→${i + 2}: jump-count lookup failed (${fromSystem}→${toSystem}) — assuming 1 jump`
          )
        }
      }

      const segWeight = segmentLoads[i]?.weight ?? 0
      const loadFraction = shipCap > 0 ? segWeight / shipCap : 0

      const days = estimateLegDays({ jumpCount, sameSystem, loadFraction })
      cursorMs += days * 86_400_000
      stopOut.push({ plannedArriveAt: new Date(cursorMs).toISOString() })
    }

    return { stops: stopOut, warnings }
  }
}
