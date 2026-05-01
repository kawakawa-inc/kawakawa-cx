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
  ShipmentLine,
  ShipmentLineInput,
  ShipmentStatus,
  CreateShipmentRequest,
  UpdateShipmentRequest,
  UpdateShipmentStatusRequest,
} from '@kawakawa/types'
import { db, shipments, shipmentLines, logisticsFlows } from '../db/index.js'
import { eq, and, inArray, asc } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'

type ShipmentRow = typeof shipments.$inferSelect
type LineRow = typeof shipmentLines.$inferSelect

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
    fromLocationId: row.fromLocationId,
    toLocationId: row.toLocationId,
    shipDbId: row.shipDbId,
    plannedLoadAt: row.plannedLoadAt.toISOString(),
    plannedArrivalAt: row.plannedArrivalAt.toISOString(),
    status: row.status as ShipmentStatus,
    actualDispatchAt: row.actualDispatchAt ? row.actualDispatchAt.toISOString() : null,
    actualArrivalAt: row.actualArrivalAt ? row.actualArrivalAt.toISOString() : null,
    notes: row.notes,
    lines: lines.map(toLine),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Validate the manifest for a create or full-replace update. Returns the
 * normalized lines the caller can pass to the insert. Throws BadRequest on
 * any violation. The shipment row's (from, to) is required so we can verify
 * each flow line's flow matches the route.
 */
async function validateLines(
  userId: number,
  fromLocationId: string,
  toLocationId: string,
  lines: ShipmentLineInput[]
): Promise<{ flowId: number | null; commodityTicker: string; amount: number }[]> {
  if (!lines || lines.length === 0) {
    throw BadRequest('Shipment must have at least one line')
  }

  const normalized = lines.map(line => {
    if (!line.commodityTicker) throw BadRequest('Each line requires commodityTicker')
    if (!Number.isFinite(line.amount) || line.amount <= 0) {
      throw BadRequest(`Line for ${line.commodityTicker}: amount must be > 0`)
    }
    return {
      flowId: line.flowId ?? null,
      commodityTicker: line.commodityTicker,
      amount: Math.floor(line.amount),
    }
  })

  // Verify referenced flows exist, belong to the user, and match the route.
  const flowIds = [...new Set(normalized.map(l => l.flowId).filter((v): v is number => v !== null))]
  if (flowIds.length > 0) {
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
    for (const id of flowIds) {
      const f = byId.get(id)
      if (!f) throw BadRequest(`Flow ${id} not found`)
      if (f.userId !== userId) throw BadRequest(`Flow ${id} does not belong to user`)
      if (f.from !== fromLocationId || f.to !== toLocationId) {
        throw BadRequest(
          `Flow ${id} route ${f.from}→${f.to} does not match shipment ${fromLocationId}→${toLocationId}`
        )
      }
    }
  }

  return normalized
}

async function loadLinesForShipments(shipmentIds: number[]): Promise<Map<number, LineRow[]>> {
  const result = new Map<number, LineRow[]>()
  if (shipmentIds.length === 0) return result
  const rows = await db
    .select()
    .from(shipmentLines)
    .where(inArray(shipmentLines.shipmentId, shipmentIds))
  for (const row of rows) {
    const bucket = result.get(row.shipmentId) ?? []
    bucket.push(row)
    result.set(row.shipmentId, bucket)
  }
  return result
}

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

@Route('logistics/shipments')
@Tags('Logistics')
@Security('jwt')
export class ShipmentsController extends Controller {
  /** List all shipments for the current user, ordered by plannedArrivalAt ascending. */
  @Get()
  public async listShipments(@Request() request: { user: JwtPayload }): Promise<Shipment[]> {
    const userId = request.user.userId
    const rows = await db
      .select()
      .from(shipments)
      .where(eq(shipments.userId, userId))
      .orderBy(asc(shipments.plannedArrivalAt))

    const linesMap = await loadLinesForShipments(rows.map(r => r.id))
    return rows.map(r => toShipment(r, linesMap.get(r.id) ?? []))
  }

  /** Get a single shipment with its lines. */
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

    const lineRows = await db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id))
    return toShipment(row, lineRows)
  }

  /** Create a new shipment in `planned` status. */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createShipment(
    @Body() body: CreateShipmentRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Shipment> {
    const userId = request.user.userId
    const loadAt = new Date(body.plannedLoadAt)
    const arriveAt = new Date(body.plannedArrivalAt)
    if (Number.isNaN(loadAt.getTime())) throw BadRequest('Invalid plannedLoadAt')
    if (Number.isNaN(arriveAt.getTime())) throw BadRequest('Invalid plannedArrivalAt')
    if (arriveAt < loadAt) {
      throw BadRequest('plannedArrivalAt must be >= plannedLoadAt')
    }

    const lines = await validateLines(userId, body.fromLocationId, body.toLocationId, body.lines)

    const [inserted] = await db
      .insert(shipments)
      .values({
        userId,
        fromLocationId: body.fromLocationId,
        toLocationId: body.toLocationId,
        shipDbId: body.shipDbId ?? null,
        plannedLoadAt: loadAt,
        plannedArrivalAt: arriveAt,
        notes: body.notes ?? null,
      })
      .returning()

    const insertedLines = await db
      .insert(shipmentLines)
      .values(lines.map(l => ({ ...l, shipmentId: inserted.id })))
      .returning()

    this.setStatus(201)
    return toShipment(inserted, insertedLines)
  }

  /**
   * Update a planned shipment. Updates are rejected once the shipment has
   * been dispatched, delivered, or cancelled — the manifest is then a record
   * of what was sent, not a plan to edit.
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

    const newLoadAt = body.plannedLoadAt ? new Date(body.plannedLoadAt) : existing.plannedLoadAt
    const newArriveAt = body.plannedArrivalAt
      ? new Date(body.plannedArrivalAt)
      : existing.plannedArrivalAt
    if (Number.isNaN(newLoadAt.getTime())) throw BadRequest('Invalid plannedLoadAt')
    if (Number.isNaN(newArriveAt.getTime())) throw BadRequest('Invalid plannedArrivalAt')
    if (newArriveAt < newLoadAt) {
      throw BadRequest('plannedArrivalAt must be >= plannedLoadAt')
    }

    const [updated] = await db
      .update(shipments)
      .set({
        shipDbId: body.shipDbId !== undefined ? body.shipDbId : existing.shipDbId,
        plannedLoadAt: newLoadAt,
        plannedArrivalAt: newArriveAt,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, id))
      .returning()

    let lineRows: LineRow[]
    if (body.lines !== undefined) {
      const validated = await validateLines(
        userId,
        existing.fromLocationId,
        existing.toLocationId,
        body.lines
      )
      await db.delete(shipmentLines).where(eq(shipmentLines.shipmentId, id))
      lineRows = await db
        .insert(shipmentLines)
        .values(validated.map(l => ({ ...l, shipmentId: id })))
        .returning()
    } else {
      lineRows = await db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id))
    }

    return toShipment(updated, lineRows)
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
    const lineRows = await db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id))
    return toShipment(updated, lineRows)
  }

  /**
   * Hard-delete a shipment. Only allowed in `planned` or `cancelled` status —
   * dispatched/delivered shipments are historical records and should not be
   * removed (the user can cancel a dispatched shipment first if they made a
   * tracking mistake).
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
}
