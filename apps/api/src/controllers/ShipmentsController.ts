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
  Shipment,
  ShipmentLine,
  ShipmentLineInput,
  CreateShipmentRequest,
  UpdateShipmentRequest,
  RepeatShipmentRequest,
} from '@kawakawa/types'
import { db, shipments, shipmentLines, logisticsFlows } from '../db/index.js'
import { eq, and, inArray, isNull, asc } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { buildAndSolveGraph } from '../services/logistics-graph-loader.js'

type ShipmentRow = typeof shipments.$inferSelect
type LineRow = typeof shipmentLines.$inferSelect

// ==================== Response shaping ====================

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

async function loadLinesForShipments(ids: number[]): Promise<Map<number, LineRow[]>> {
  const out = new Map<number, LineRow[]>()
  if (ids.length === 0) return out
  const rows = await db.select().from(shipmentLines).where(inArray(shipmentLines.shipmentId, ids))
  for (const r of rows) {
    const list = out.get(r.shipmentId) ?? []
    list.push(r)
    out.set(r.shipmentId, list)
  }
  return out
}

// ==================== Validation ====================

interface NormalizedLine {
  flowId: number | null
  commodityTicker: string
  amount: number
}

/** Exported for testing */
export type NormalizedLineInput = NormalizedLine

/**
 * Normalize and validate a single line input. Throws BadRequest on invalid input.
 * Exported for unit testing.
 *
 * @param line The input line to validate
 * @param index Zero-based index in the lines array (used for error messages)
 */
export function normalizeLineInput(line: ShipmentLineInput, index: number): NormalizedLine {
  const lineNum = index + 1
  if (!line.commodityTicker) {
    throw BadRequest(`Line ${lineNum}: commodityTicker is required`)
  }
  const amount = Math.floor(line.amount)
  if (!Number.isFinite(line.amount) || amount <= 0) {
    throw BadRequest(`Line ${lineNum} (${line.commodityTicker.toUpperCase()}): amount must be > 0`)
  }
  return {
    flowId: line.flowId ?? null,
    commodityTicker: line.commodityTicker.toUpperCase(),
    amount,
  }
}

/**
 * Validate the manifest (≥ 1 line, valid amounts, ticker present) and verify
 * any flow references belong to the user and route from origin to destination.
 */
async function validateLines(
  userId: number,
  originLocationId: string,
  destLocationId: string,
  lines: ShipmentLineInput[]
): Promise<NormalizedLine[]> {
  if (!lines || lines.length === 0) {
    throw BadRequest('A shipment must have at least one line')
  }

  const normalized: NormalizedLine[] = lines.map((l, i) => normalizeLineInput(l, i))

  const flowIds = [...new Set(normalized.map(l => l.flowId).filter((v): v is number => v !== null))]
  if (flowIds.length === 0) return normalized

  const rows = await db
    .select({
      id: logisticsFlows.id,
      userId: logisticsFlows.userId,
      from: logisticsFlows.fromLocationId,
      to: logisticsFlows.toLocationId,
    })
    .from(logisticsFlows)
    .where(inArray(logisticsFlows.id, flowIds))
  const byId = new Map(rows.map(f => [f.id, f]))

  for (let i = 0; i < normalized.length; i++) {
    const l = normalized[i]
    if (l.flowId === null) continue
    const f = byId.get(l.flowId)
    if (!f) throw BadRequest(`Line ${i + 1}: flow ${l.flowId} not found`)
    if (f.userId !== userId) {
      throw BadRequest(`Line ${i + 1}: flow ${l.flowId} does not belong to user`)
    }
    if (f.from !== originLocationId || f.to !== destLocationId) {
      throw BadRequest(
        `Line ${i + 1}: flow ${l.flowId} routes ${f.from}→${f.to}, ` +
          `but the shipment is ${originLocationId}→${destLocationId}`
      )
    }
  }

  return normalized
}

// ==================== Controller ====================

@Route('logistics/shipments')
@Tags('Logistics')
@Security('jwt')
export class ShipmentsController extends Controller {
  /**
   * List the user's shipments. By default returns all shipments; pass
   * `queued=true` to filter to those not yet assigned to a trip.
   */
  @Get()
  public async listShipments(
    @Request() request: { user: JwtPayload },
    @Query() queued?: boolean
  ): Promise<Shipment[]> {
    const userId = request.user.userId
    const where = queued
      ? and(eq(shipments.userId, userId), isNull(shipments.tripId))
      : eq(shipments.userId, userId)
    const rows = await db.select().from(shipments).where(where).orderBy(asc(shipments.createdAt))
    const linesMap = await loadLinesForShipments(rows.map(r => r.id))
    return rows.map(r => toShipment(r, linesMap.get(r.id) ?? []))
  }

  /** Get one shipment with its lines. */
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

  /** Create a new queued shipment (no trip assigned). */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createShipment(
    @Body() body: CreateShipmentRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Shipment> {
    const userId = request.user.userId
    if (!body.originLocationId) throw BadRequest('originLocationId is required')
    if (!body.destLocationId) throw BadRequest('destLocationId is required')
    if (body.originLocationId === body.destLocationId) {
      throw BadRequest('originLocationId and destLocationId must differ')
    }
    const lines = await validateLines(
      userId,
      body.originLocationId,
      body.destLocationId,
      body.lines
    )

    const result = await db.transaction(async tx => {
      const [shipRow] = await tx
        .insert(shipments)
        .values({
          userId,
          tripId: null,
          originLocationId: body.originLocationId,
          destLocationId: body.destLocationId,
          notes: body.notes ?? null,
        })
        .returning()
      const lineRows = await tx
        .insert(shipmentLines)
        .values(lines.map(l => ({ ...l, shipmentId: shipRow.id })))
        .returning()
      return { shipRow, lineRows }
    })

    this.setStatus(201)
    return toShipment(result.shipRow, result.lineRows)
  }

  /**
   * Update a shipment's notes / lines / origin / destination. Origin and
   * destination can only be edited while the shipment is queued (no trip).
   * Lines, when supplied, fully replace the existing manifest.
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

    const wantsOriginChange =
      body.originLocationId !== undefined && body.originLocationId !== existing.originLocationId
    const wantsDestChange =
      body.destLocationId !== undefined && body.destLocationId !== existing.destLocationId
    if ((wantsOriginChange || wantsDestChange) && existing.tripId !== null) {
      throw BadRequest(
        'Origin and destination can only be changed while the shipment is queued (un-assign from trip first)'
      )
    }

    const newOrigin = body.originLocationId ?? existing.originLocationId
    const newDest = body.destLocationId ?? existing.destLocationId
    if (newOrigin === newDest) throw BadRequest('originLocationId and destLocationId must differ')

    let validatedLines: NormalizedLine[] | null = null
    if (body.lines !== undefined) {
      validatedLines = await validateLines(userId, newOrigin, newDest, body.lines)
    }

    const result = await db.transaction(async tx => {
      await tx
        .update(shipments)
        .set({
          originLocationId: newOrigin,
          destLocationId: newDest,
          notes: body.notes !== undefined ? body.notes : existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, id))

      let lineRows: LineRow[]
      if (validatedLines) {
        await tx.delete(shipmentLines).where(eq(shipmentLines.shipmentId, id))
        lineRows = await tx
          .insert(shipmentLines)
          .values(validatedLines.map(l => ({ ...l, shipmentId: id })))
          .returning()
      } else {
        lineRows = await tx.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id))
      }
      const [updated] = await tx
        .select()
        .from(shipments)
        .where(and(eq(shipments.id, id), eq(shipments.userId, userId)))
      return { row: updated, lineRows }
    })

    return toShipment(result.row, result.lineRows)
  }

  /**
   * Delete a shipment. Only allowed when queued — shipments on a trip must
   * be unassigned first (via the trip update endpoint) or removed when the
   * trip itself is deleted/cancelled.
   */
  @Delete('{id}')
  public async deleteShipment(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId
    const [existing] = await db
      .select({ id: shipments.id, tripId: shipments.tripId })
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.userId, userId)))
    if (!existing) throw NotFound('Shipment not found')
    if (existing.tripId !== null) {
      throw BadRequest(
        `Shipment is assigned to trip ${existing.tripId} — un-assign from the trip first`
      )
    }
    await db.delete(shipments).where(eq(shipments.id, id))
    return { success: true }
  }

  /**
   * Clone a shipment back into the queue with refreshed flow-linked amounts.
   * The new shipment is unassigned (trip_id = null). Useful for "ship the
   * H2O run again" without rebuilding the manifest.
   */
  @Post('{id}/repeat')
  @SuccessResponse('201', 'Created')
  public async repeatShipment(
    @Path() id: number,
    @Body() _body: RepeatShipmentRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Shipment> {
    const userId = request.user.userId
    const [source] = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.id, id), eq(shipments.userId, userId)))
    if (!source) throw NotFound('Shipment not found')
    const sourceLines = await db
      .select()
      .from(shipmentLines)
      .where(eq(shipmentLines.shipmentId, id))

    // Refresh flow-linked amounts.
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
      const [newRow] = await tx
        .insert(shipments)
        .values({
          userId,
          tripId: null,
          originLocationId: source.originLocationId,
          destLocationId: source.destLocationId,
          notes: source.notes,
        })
        .returning()
      let newLines: LineRow[] = []
      if (sourceLines.length > 0) {
        newLines = await tx
          .insert(shipmentLines)
          .values(
            sourceLines.map(l => {
              const refreshed = l.flowId !== null ? perShipmentByFlow.get(l.flowId) : undefined
              const amount =
                refreshed !== undefined && refreshed > 0
                  ? Math.max(1, Math.round(refreshed))
                  : l.amount
              return {
                shipmentId: newRow.id,
                flowId: l.flowId,
                commodityTicker: l.commodityTicker,
                amount,
              }
            })
          )
          .returning()
      }
      return { row: newRow, lineRows: newLines }
    })

    this.setStatus(201)
    return toShipment(result.row, result.lineRows)
  }
}
