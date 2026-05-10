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
  Trip,
  TripStop,
  TripStatus,
  TripStopInput,
  TripShipmentAssignment,
  CreateTripRequest,
  UpdateTripRequest,
  UpdateTripStatusRequest,
  RepeatTripRequest,
  Shipment,
  ShipmentLine,
  SuggestStopTimesRequest,
  SuggestStopTimesResponse,
} from '@kawakawa/types'
import {
  db,
  trips,
  tripStops,
  shipments,
  shipmentLines,
  fioCommodities,
  fioUserShips,
  fioUserShipFlights,
  fioLocations,
} from '../db/index.js'
import { eq, and, inArray, asc, isNotNull } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { buildAndSolveGraph } from '../services/logistics-graph-loader.js'
import { FioClient } from '@kawakawa/services/fio'

type TripRow = typeof trips.$inferSelect
type StopRow = typeof tripStops.$inferSelect
type ShipmentRow = typeof shipments.$inferSelect
type LineRow = typeof shipmentLines.$inferSelect

// ==================== Response shaping ====================

function toStop(row: StopRow): TripStop {
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
    flowId: row.flowId,
    commodityTicker: row.commodityTicker,
    amount: row.amount,
  }
}

function toShipment(row: ShipmentRow, lines: LineRow[]): Shipment {
  return {
    id: row.id,
    tripId: row.tripId,
    originLocationId: row.originLocationId,
    destLocationId: row.destLocationId,
    originStopId: row.originStopId,
    destStopId: row.destStopId,
    notes: row.notes,
    lines: lines.map(toLine),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toTrip(
  row: TripRow,
  stops: StopRow[],
  shipmentRows: ShipmentRow[],
  lineRows: LineRow[]
): Trip {
  const orderedStops = [...stops].sort((a, b) => a.sequence - b.sequence)
  const linesByShipment = new Map<number, LineRow[]>()
  for (const l of lineRows) {
    const list = linesByShipment.get(l.shipmentId) ?? []
    list.push(l)
    linesByShipment.set(l.shipmentId, list)
  }
  const shipmentsForTrip = shipmentRows.map(s => toShipment(s, linesByShipment.get(s.id) ?? []))
  return {
    id: row.id,
    shipDbId: row.shipDbId,
    status: row.status as TripStatus,
    actualDispatchAt: row.actualDispatchAt ? row.actualDispatchAt.toISOString() : null,
    actualArrivalAt: row.actualArrivalAt ? row.actualArrivalAt.toISOString() : null,
    notes: row.notes,
    stops: orderedStops.map(toStop),
    shipments: shipmentsForTrip,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function loadTripBundles(tripIds: number[]): Promise<{
  stops: Map<number, StopRow[]>
  shipments: Map<number, ShipmentRow[]>
  lines: Map<number, LineRow[]>
}> {
  const out = {
    stops: new Map<number, StopRow[]>(),
    shipments: new Map<number, ShipmentRow[]>(),
    lines: new Map<number, LineRow[]>(),
  }
  if (tripIds.length === 0) return out

  const [stopRows, shipRows] = await Promise.all([
    db.select().from(tripStops).where(inArray(tripStops.tripId, tripIds)),
    db.select().from(shipments).where(inArray(shipments.tripId, tripIds)),
  ])
  for (const s of stopRows) {
    const list = out.stops.get(s.tripId) ?? []
    list.push(s)
    out.stops.set(s.tripId, list)
  }
  for (const s of shipRows) {
    if (s.tripId === null) continue
    const list = out.shipments.get(s.tripId) ?? []
    list.push(s)
    out.shipments.set(s.tripId, list)
  }
  const shipmentIds = shipRows.map(s => s.id)
  if (shipmentIds.length > 0) {
    const lineRows = await db
      .select()
      .from(shipmentLines)
      .where(inArray(shipmentLines.shipmentId, shipmentIds))
    for (const l of lineRows) {
      const list = out.lines.get(l.shipmentId) ?? []
      list.push(l)
      out.lines.set(l.shipmentId, list)
    }
  }
  return out
}

// ==================== Status state machine ====================

/**
 * Trip status state machine. Exported for unit tests.
 *
 *   planned    → dispatched, cancelled
 *   dispatched → delivered,  cancelled
 *   delivered  → (terminal)
 *   cancelled  → (terminal)
 */
export const TRIP_STATUS_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  planned: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export function isValidTripStatusTransition(from: TripStatus, to: TripStatus): boolean {
  return TRIP_STATUS_TRANSITIONS[from].includes(to)
}

function validateStatusTransition(from: TripStatus, to: TripStatus): void {
  if (!isValidTripStatusTransition(from, to)) {
    throw BadRequest(`Invalid status transition: ${from} → ${to}`)
  }
}

// ==================== Pure validation + sizing helpers ====================

export interface SegmentLoad {
  segmentIndex: number
  weight: number
  volume: number
}

/**
 * Compute per-segment load from shipment placements + per-shipment cargo
 * weights/volumes. A shipment with origin index `o` and destination index
 * `d` contributes its cargo to every segment in `[o, d)`.
 */
export function computeSegmentLoads(
  stopCount: number,
  ships: Array<{
    originStopIndex: number
    destStopIndex: number
    weightTotal: number
    volumeTotal: number
  }>
): SegmentLoad[] {
  const segCount = Math.max(0, stopCount - 1)
  const out: SegmentLoad[] = []
  for (let i = 0; i < segCount; i++) out.push({ segmentIndex: i, weight: 0, volume: 0 })
  for (const s of ships) {
    for (let i = s.originStopIndex; i < s.destStopIndex; i++) {
      const seg = out[i]
      if (!seg) continue
      seg.weight += s.weightTotal
      seg.volume += s.volumeTotal
    }
  }
  return out
}

export interface SuggestLegInput {
  jumpCount: number | null
  sameSystem: boolean
  loadFraction: number
}

const SAME_SYSTEM_DAYS = 0.5
const PER_JUMP_DAYS = 1.0
const STL_RAMP_DAYS = 0.5
const MAX_LOAD_PENALTY = 0.5

/** Tier-1 heuristic: estimate one leg's duration in days. Pure. */
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

interface NormalizedAssignment {
  shipmentId: number
  originStopIndex: number
  destStopIndex: number
}

/** Validate trip structure (≥2 stops, monotonic times, indices in range). */
function validateTripStructure(
  stopsIn: TripStopInput[],
  assignmentsIn: TripShipmentAssignment[]
): { stops: NormalizedStop[]; assignments: NormalizedAssignment[] } {
  if (!stopsIn || stopsIn.length < 2) throw BadRequest('A trip must have at least 2 stops')

  const stops: NormalizedStop[] = stopsIn.map((s, i) => {
    if (!s.locationId) throw BadRequest(`Stop ${i + 1}: locationId is required`)
    const t = new Date(s.plannedArriveAt)
    if (Number.isNaN(t.getTime())) throw BadRequest(`Stop ${i + 1}: invalid plannedArriveAt`)
    return { locationId: s.locationId, plannedArriveAt: t, notes: s.notes ?? null }
  })

  for (let i = 1; i < stops.length; i++) {
    if (stops[i].plannedArriveAt < stops[i - 1].plannedArriveAt) {
      throw BadRequest(`Stop ${i + 1} arrives before stop ${i} — stop times must be non-decreasing`)
    }
  }

  const assignments: NormalizedAssignment[] = (assignmentsIn ?? []).map((a, i) => {
    if (!Number.isInteger(a.shipmentId)) {
      throw BadRequest(`Assignment ${i + 1}: shipmentId must be an integer`)
    }
    if (
      !Number.isInteger(a.originStopIndex) ||
      a.originStopIndex < 0 ||
      a.originStopIndex >= stops.length
    ) {
      throw BadRequest(
        `Assignment ${i + 1} (shipment ${a.shipmentId}): originStopIndex out of range`
      )
    }
    if (
      !Number.isInteger(a.destStopIndex) ||
      a.destStopIndex < 0 ||
      a.destStopIndex >= stops.length
    ) {
      throw BadRequest(`Assignment ${i + 1} (shipment ${a.shipmentId}): destStopIndex out of range`)
    }
    if (a.originStopIndex >= a.destStopIndex) {
      throw BadRequest(
        `Assignment ${i + 1} (shipment ${a.shipmentId}): cargo must be loaded before it's dropped`
      )
    }
    return {
      shipmentId: a.shipmentId,
      originStopIndex: a.originStopIndex,
      destStopIndex: a.destStopIndex,
    }
  })

  return { stops, assignments }
}

/**
 * Validate that every assigned shipment exists, belongs to this user, is
 * either queued or already on this same trip, and that its origin/dest
 * locations match the picked stop locations.
 */
async function validateAssignments(
  userId: number,
  tripId: number | null,
  stops: NormalizedStop[],
  assignments: NormalizedAssignment[]
): Promise<void> {
  if (assignments.length === 0) return
  const ids = [...new Set(assignments.map(a => a.shipmentId))]
  const rows = await db
    .select({
      id: shipments.id,
      userId: shipments.userId,
      tripId: shipments.tripId,
      originLocationId: shipments.originLocationId,
      destLocationId: shipments.destLocationId,
    })
    .from(shipments)
    .where(inArray(shipments.id, ids))
  const byId = new Map(rows.map(r => [r.id, r]))

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i]
    const r = byId.get(a.shipmentId)
    if (!r) throw BadRequest(`Assignment ${i + 1}: shipment ${a.shipmentId} not found`)
    if (r.userId !== userId) {
      throw BadRequest(`Assignment ${i + 1}: shipment ${a.shipmentId} does not belong to user`)
    }
    if (r.tripId !== null && r.tripId !== tripId) {
      throw BadRequest(
        `Assignment ${i + 1}: shipment ${a.shipmentId} is already on trip ${r.tripId} — un-assign it first`
      )
    }
    const originLoc = stops[a.originStopIndex].locationId
    const destLoc = stops[a.destStopIndex].locationId
    if (r.originLocationId !== originLoc) {
      throw BadRequest(
        `Assignment ${i + 1} (shipment ${a.shipmentId}): origin stop ${originLoc} does not match shipment origin ${r.originLocationId}`
      )
    }
    if (r.destLocationId !== destLoc) {
      throw BadRequest(
        `Assignment ${i + 1} (shipment ${a.shipmentId}): destination stop ${destLoc} does not match shipment destination ${r.destLocationId}`
      )
    }
  }
}

/**
 * Hard-fail capacity check using the trip's ship cap and per-segment cargo
 * mass derived from the assigned shipments + their lines.
 */
async function validateCapacity(
  userId: number,
  shipDbId: number | null,
  stops: NormalizedStop[],
  assignments: NormalizedAssignment[]
): Promise<void> {
  if (shipDbId === null || assignments.length === 0) return

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

  const ids = [...new Set(assignments.map(a => a.shipmentId))]
  const lineRows = await db
    .select({
      shipmentId: shipmentLines.shipmentId,
      ticker: shipmentLines.commodityTicker,
      amount: shipmentLines.amount,
    })
    .from(shipmentLines)
    .where(inArray(shipmentLines.shipmentId, ids))

  const tickers = [...new Set(lineRows.map(l => l.ticker))]
  const commRows = tickers.length
    ? await db
        .select({
          ticker: fioCommodities.ticker,
          weight: fioCommodities.weight,
          volume: fioCommodities.volume,
        })
        .from(fioCommodities)
        .where(inArray(fioCommodities.ticker, tickers))
    : []
  const commByTicker = new Map(commRows.map(c => [c.ticker, c]))

  // Per-shipment cargo totals (weight + volume).
  const cargoByShipment = new Map<number, { weight: number; volume: number }>()
  for (const l of lineRows) {
    const c = commByTicker.get(l.ticker)
    const wPer = c ? Number(c.weight ?? 0) : 0
    const vPer = c ? Number(c.volume ?? 0) : 0
    const cur = cargoByShipment.get(l.shipmentId) ?? { weight: 0, volume: 0 }
    cur.weight += wPer * l.amount
    cur.volume += vPer * l.amount
    cargoByShipment.set(l.shipmentId, cur)
  }

  const shipsForLoad = assignments.map(a => {
    const c = cargoByShipment.get(a.shipmentId) ?? { weight: 0, volume: 0 }
    return {
      originStopIndex: a.originStopIndex,
      destStopIndex: a.destStopIndex,
      weightTotal: c.weight,
      volumeTotal: c.volume,
    }
  })

  const segs = computeSegmentLoads(stops.length, shipsForLoad)
  for (const seg of segs) {
    const overWeight = weightCap > 0 && seg.weight > weightCap + 1e-6
    const overVolume = volumeCap > 0 && seg.volume > volumeCap + 1e-6
    if (overWeight || overVolume) {
      const fromLoc = stops[seg.segmentIndex].locationId
      const toLoc = stops[seg.segmentIndex + 1].locationId
      const reasons: string[] = []
      if (overWeight) {
        reasons.push(`${seg.weight.toFixed(1)}t cargo vs ${weightCap.toFixed(0)}t capacity`)
      }
      if (overVolume) {
        reasons.push(`${seg.volume.toFixed(1)}m³ cargo vs ${volumeCap.toFixed(0)}m³ capacity`)
      }
      throw BadRequest(
        `Segment ${fromLoc}→${toLoc} (stop ${seg.segmentIndex + 1}→${seg.segmentIndex + 2}) exceeds ship capacity: ${reasons.join('; ')}`
      )
    }
  }
}

// ==================== Controller ====================

@Route('logistics/trips')
@Tags('Logistics')
@Security('jwt')
export class TripsController extends Controller {
  /** List the user's trips, ordered by first stop's planned arrival ascending. */
  @Get()
  public async listTrips(@Request() request: { user: JwtPayload }): Promise<Trip[]> {
    const userId = request.user.userId
    const rows = await db
      .select()
      .from(trips)
      .where(eq(trips.userId, userId))
      .orderBy(asc(trips.createdAt))

    const bundles = await loadTripBundles(rows.map(r => r.id))
    const built = rows.map(r =>
      toTrip(
        r,
        bundles.stops.get(r.id) ?? [],
        bundles.shipments.get(r.id) ?? [],
        (bundles.shipments.get(r.id) ?? []).flatMap(s => bundles.lines.get(s.id) ?? [])
      )
    )

    built.sort((a, b) => {
      const aT = a.stops[0]?.plannedArriveAt ?? '9999'
      const bT = b.stops[0]?.plannedArriveAt ?? '9999'
      return aT.localeCompare(bT)
    })
    return built
  }

  /** Get one trip with stops + assigned shipments. */
  @Get('{id}')
  public async getTrip(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<Trip> {
    const userId = request.user.userId
    const [row] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
    if (!row) throw NotFound('Trip not found')
    const bundles = await loadTripBundles([id])
    return toTrip(
      row,
      bundles.stops.get(id) ?? [],
      bundles.shipments.get(id) ?? [],
      (bundles.shipments.get(id) ?? []).flatMap(s => bundles.lines.get(s.id) ?? [])
    )
  }

  /** Create a new trip in `planned` status. */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createTrip(
    @Body() body: CreateTripRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Trip> {
    const userId = request.user.userId
    const { stops, assignments } = validateTripStructure(body.stops, body.shipments ?? [])
    await validateAssignments(userId, null, stops, assignments)
    await validateCapacity(userId, body.shipDbId ?? null, stops, assignments)

    const tripId = await db.transaction(async tx => {
      const [tripRow] = await tx
        .insert(trips)
        .values({
          userId,
          shipDbId: body.shipDbId ?? null,
          notes: body.notes ?? null,
        })
        .returning()

      const stopRows = await tx
        .insert(tripStops)
        .values(
          stops.map((s, i) => ({
            tripId: tripRow.id,
            sequence: i,
            locationId: s.locationId,
            plannedArriveAt: s.plannedArriveAt,
            notes: s.notes,
          }))
        )
        .returning()
      stopRows.sort((a, b) => a.sequence - b.sequence)

      // Bind queued shipments to this trip + the resolved stop IDs.
      for (const a of assignments) {
        await tx
          .update(shipments)
          .set({
            tripId: tripRow.id,
            originStopId: stopRows[a.originStopIndex].id,
            destStopId: stopRows[a.destStopIndex].id,
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, a.shipmentId))
      }

      return tripRow.id
    })

    this.setStatus(201)
    return this.getTrip(tripId, request)
  }

  /**
   * Replace a planned trip's stops + shipment assignments. Shipments that
   * were on the trip but aren't in the new list go back to the queue
   * (trip_id null). Non-planned trips can update only `shipDbId` and `notes`.
   */
  @Put('{id}')
  public async updateTrip(
    @Path() id: number,
    @Body() body: UpdateTripRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Trip> {
    const userId = request.user.userId
    const [existing] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
    if (!existing) throw NotFound('Trip not found')

    const wantsStops = body.stops !== undefined
    const wantsShipments = body.shipments !== undefined
    if (wantsStops !== wantsShipments) {
      throw BadRequest('Structural updates must include both stops and shipments together')
    }
    if ((wantsStops || wantsShipments) && existing.status !== 'planned') {
      throw BadRequest(`Cannot edit stops/assignments on a ${existing.status} trip`)
    }

    const newShipDbId = body.shipDbId !== undefined ? body.shipDbId : existing.shipDbId

    let validated: { stops: NormalizedStop[]; assignments: NormalizedAssignment[] } | null = null
    if (wantsStops && wantsShipments && body.stops && body.shipments) {
      validated = validateTripStructure(body.stops, body.shipments)
      await validateAssignments(userId, id, validated.stops, validated.assignments)
      await validateCapacity(userId, newShipDbId, validated.stops, validated.assignments)
    }

    await db.transaction(async tx => {
      await tx
        .update(trips)
        .set({
          shipDbId: newShipDbId,
          notes: body.notes !== undefined ? body.notes : existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(trips.id, id))

      if (validated) {
        // Unassign any currently-bound shipments not in the new list.
        const newIds = new Set(validated.assignments.map(a => a.shipmentId))
        const currentlyBound = await tx
          .select({ id: shipments.id })
          .from(shipments)
          .where(eq(shipments.tripId, id))
        const toUnassign = currentlyBound.filter(s => !newIds.has(s.id)).map(s => s.id)
        if (toUnassign.length > 0) {
          await tx
            .update(shipments)
            .set({
              tripId: null,
              originStopId: null,
              destStopId: null,
              updatedAt: new Date(),
            })
            .where(inArray(shipments.id, toUnassign))
        }

        // Replace stops (delete + insert in order).
        await tx.delete(tripStops).where(eq(tripStops.tripId, id))
        const stopRows = await tx
          .insert(tripStops)
          .values(
            validated.stops.map((s, i) => ({
              tripId: id,
              sequence: i,
              locationId: s.locationId,
              plannedArriveAt: s.plannedArriveAt,
              notes: s.notes,
            }))
          )
          .returning()
        stopRows.sort((a, b) => a.sequence - b.sequence)

        // Bind / re-bind shipments to new stops.
        for (const a of validated.assignments) {
          await tx
            .update(shipments)
            .set({
              tripId: id,
              originStopId: stopRows[a.originStopIndex].id,
              destStopId: stopRows[a.destStopIndex].id,
              updatedAt: new Date(),
            })
            .where(eq(shipments.id, a.shipmentId))
        }
      }
    })

    return this.getTrip(id, request)
  }

  /** Transition a trip status; stamp actualDispatchAt / actualArrivalAt. */
  @Put('{id}/status')
  public async setTripStatus(
    @Path() id: number,
    @Body() body: UpdateTripStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Trip> {
    const userId = request.user.userId
    const [existing] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
    if (!existing) throw NotFound('Trip not found')

    validateStatusTransition(existing.status as TripStatus, body.status)

    const now = new Date()
    const patch: Partial<typeof trips.$inferInsert> = { status: body.status, updatedAt: now }
    if (body.status === 'dispatched') patch.actualDispatchAt = now
    if (body.status === 'delivered') patch.actualArrivalAt = now
    await db.update(trips).set(patch).where(eq(trips.id, id))

    // On cancel, return assigned shipments to the queue so the user can re-bundle.
    if (body.status === 'cancelled') {
      await db
        .update(shipments)
        .set({ tripId: null, originStopId: null, destStopId: null, updatedAt: now })
        .where(eq(shipments.tripId, id))
    }

    return this.getTrip(id, request)
  }

  /**
   * Delete a planned or cancelled trip. Assigned shipments are returned to
   * the queue first. Dispatched/delivered trips are historical records —
   * cancel before deleting.
   */
  @Delete('{id}')
  public async deleteTrip(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId
    const [existing] = await db
      .select({ id: trips.id, status: trips.status })
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
    if (!existing) throw NotFound('Trip not found')
    if (existing.status !== 'planned' && existing.status !== 'cancelled') {
      throw BadRequest(`Cannot delete a ${existing.status} trip — cancel it first`)
    }

    await db.transaction(async tx => {
      // Return shipments to the queue (FK is ON DELETE SET NULL but explicit
      // is friendlier — also clears stop refs).
      await tx
        .update(shipments)
        .set({ tripId: null, originStopId: null, destStopId: null, updatedAt: new Date() })
        .where(eq(shipments.tripId, id))
      await tx.delete(trips).where(eq(trips.id, id))
    })
    return { success: true }
  }

  /**
   * Clone a past trip as a new draft. Stops + assigned shipments copy; flow-
   * linked shipment line amounts refresh from the current solver. Stop times
   * shift forward so the first stop lands at `firstStopAt` (defaults to now).
   * The cloned shipments are FRESH parcels (new shipment ids) so the source
   * trip's history isn't disturbed.
   */
  @Post('{id}/repeat')
  @SuccessResponse('201', 'Created')
  public async repeatTrip(
    @Path() id: number,
    @Body() body: RepeatTripRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Trip> {
    const userId = request.user.userId
    const [source] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.userId, userId)))
    if (!source) throw NotFound('Trip not found')

    const bundles = await loadTripBundles([id])
    const sourceStops = (bundles.stops.get(id) ?? []).sort((a, b) => a.sequence - b.sequence)
    const sourceShipments = bundles.shipments.get(id) ?? []
    if (sourceStops.length < 2) throw BadRequest('Source trip is malformed (needs ≥ 2 stops)')

    const stopIdToIndex = new Map(sourceStops.map((s, i) => [s.id, i]))

    const anchor = body.firstStopAt ? new Date(body.firstStopAt) : new Date()
    if (Number.isNaN(anchor.getTime())) throw BadRequest('Invalid firstStopAt')
    const sourceFirstMs = sourceStops[0].plannedArriveAt.getTime()
    const shiftMs = anchor.getTime() - sourceFirstMs

    // Refresh per-flow amounts from the solver.
    const flowIds = [
      ...new Set(
        sourceShipments
          .flatMap(s => bundles.lines.get(s.id) ?? [])
          .map(l => l.flowId)
          .filter((v): v is number => v !== null)
      ),
    ]
    let perShipmentByFlow = new Map<number, number>()
    if (flowIds.length > 0) {
      const graph = await buildAndSolveGraph(userId)
      perShipmentByFlow = new Map(
        graph.edges.filter(e => flowIds.includes(e.id)).map(e => [e.id, e.perShipmentAmount])
      )
    }

    const newTripId = await db.transaction(async tx => {
      const [tripRow] = await tx
        .insert(trips)
        .values({
          userId,
          shipDbId: source.shipDbId,
          notes: source.notes,
        })
        .returning()

      const stopRows = await tx
        .insert(tripStops)
        .values(
          sourceStops.map((s, i) => ({
            tripId: tripRow.id,
            sequence: i,
            locationId: s.locationId,
            plannedArriveAt: new Date(s.plannedArriveAt.getTime() + shiftMs),
            notes: s.notes,
          }))
        )
        .returning()
      stopRows.sort((a, b) => a.sequence - b.sequence)

      // Clone each source shipment with refreshed amounts.
      for (const sShip of sourceShipments) {
        const oIdx = sShip.originStopId !== null ? (stopIdToIndex.get(sShip.originStopId) ?? 0) : 0
        const dIdx =
          sShip.destStopId !== null
            ? (stopIdToIndex.get(sShip.destStopId) ?? Math.max(1, stopRows.length - 1))
            : Math.max(1, stopRows.length - 1)
        const [newShipRow] = await tx
          .insert(shipments)
          .values({
            userId,
            tripId: tripRow.id,
            originLocationId: sShip.originLocationId,
            destLocationId: sShip.destLocationId,
            originStopId: stopRows[oIdx].id,
            destStopId: stopRows[dIdx].id,
            notes: sShip.notes,
          })
          .returning()
        const sourceLines = bundles.lines.get(sShip.id) ?? []
        if (sourceLines.length > 0) {
          await tx.insert(shipmentLines).values(
            sourceLines.map(l => {
              const refreshed = l.flowId !== null ? perShipmentByFlow.get(l.flowId) : undefined
              const amount =
                refreshed !== undefined && refreshed > 0
                  ? Math.max(1, Math.round(refreshed))
                  : l.amount
              return {
                shipmentId: newShipRow.id,
                flowId: l.flowId,
                commodityTicker: l.commodityTicker,
                amount,
              }
            })
          )
        }
      }
      return tripRow.id
    })

    this.setStatus(201)
    return this.getTrip(newTripId, request)
  }

  /**
   * Tier-1 stop-time suggester. Given the trip's stops + assigned shipments
   * + (optional) ship, accumulate per-leg estimates from FIO jump count + a
   * cargo-load factor. Stop 1's time is taken from `startAt`.
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

    // Ship cargo cap.
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

    // Per-segment cargo weight from request shipments + commodity weights.
    const tickers = [
      ...new Set(
        (body.shipments ?? []).flatMap(s => s.lines.map(l => l.commodityTicker.toUpperCase()))
      ),
    ]
    const commRows = tickers.length
      ? await db
          .select({ ticker: fioCommodities.ticker, weight: fioCommodities.weight })
          .from(fioCommodities)
          .where(inArray(fioCommodities.ticker, tickers))
      : []
    const weightByTicker = new Map(commRows.map(c => [c.ticker, Number(c.weight ?? 0)]))
    const shipsForLoad = (body.shipments ?? []).map(s => ({
      originStopIndex: s.originStopIndex,
      destStopIndex: s.destStopIndex,
      weightTotal: s.lines.reduce(
        (sum, l) => sum + (weightByTicker.get(l.commodityTicker.toUpperCase()) ?? 0) * l.amount,
        0
      ),
      volumeTotal: 0,
    }))
    const segmentLoads = computeSegmentLoads(body.stops.length, shipsForLoad)

    // Pull this user's completed FIO flights between any pair of trip
    // locations. We compute median (departureAt → arrivalAt) per
    // (origin, dest) pair and prefer it over the heuristic when we have
    // at least one prior sample. Aborted flights are excluded.
    const flightDaysByPair = new Map<string, number[]>()
    if (locationIds.length >= 2) {
      const flightRows = await db
        .select({
          originNaturalId: fioUserShipFlights.originNaturalId,
          destinationNaturalId: fioUserShipFlights.destinationNaturalId,
          departureAt: fioUserShipFlights.departureAt,
          arrivalAt: fioUserShipFlights.arrivalAt,
        })
        .from(fioUserShipFlights)
        .where(
          and(
            eq(fioUserShipFlights.userId, userId),
            eq(fioUserShipFlights.isAborted, false),
            isNotNull(fioUserShipFlights.departureAt),
            isNotNull(fioUserShipFlights.arrivalAt),
            inArray(fioUserShipFlights.originNaturalId, locationIds),
            inArray(fioUserShipFlights.destinationNaturalId, locationIds)
          )
        )
      for (const f of flightRows) {
        if (!f.originNaturalId || !f.destinationNaturalId || !f.departureAt || !f.arrivalAt)
          continue
        const ms = f.arrivalAt.getTime() - f.departureAt.getTime()
        if (ms <= 0) continue
        const days = ms / 86_400_000
        const key = `${f.originNaturalId}|${f.destinationNaturalId}`
        const arr = flightDaysByPair.get(key) ?? []
        arr.push(days)
        flightDaysByPair.set(key, arr)
      }
    }

    function medianDays(key: string): number | null {
      const arr = flightDaysByPair.get(key)
      if (!arr || arr.length === 0) return null
      const sorted = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }

    // Walk each leg.
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

      // Prefer this user's own FIO flight history for the exact (origin,
      // dest) pair — even one prior real flight beats the heuristic for
      // a single corp's routes. Heuristic is the cold-start fallback.
      const pairKey = `${fromLoc}|${toLoc}`
      const learnedDays = medianDays(pairKey)
      const sampleCount = flightDaysByPair.get(pairKey)?.length ?? 0
      const days = learnedDays ?? estimateLegDays({ jumpCount, sameSystem, loadFraction })
      if (learnedDays !== null) {
        warnings.push(
          `Stop ${i + 1}→${i + 2}: using ${days.toFixed(1)}d median from ${sampleCount} past flight${sampleCount === 1 ? '' : 's'}.`
        )
      }
      cursorMs += days * 86_400_000
      stopOut.push({ plannedArriveAt: new Date(cursorMs).toISOString() })
    }

    return { stops: stopOut, warnings }
  }
}
