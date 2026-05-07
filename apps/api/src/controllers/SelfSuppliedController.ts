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
import type { SelfSuppliedEntry, CreateSelfSuppliedRequest } from '@kawakawa/types'
import { db, logisticsSelfSupplied } from '../db/index.js'
import { eq, and, asc } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'

type Row = typeof logisticsSelfSupplied.$inferSelect

/** Convert a database row to API response. Exported for testing. */
export function toEntry(row: Row): SelfSuppliedEntry {
  return {
    id: row.id,
    locationId: row.locationId,
    commodityTicker: row.commodityTicker,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Normalize and validate create request. Exported for testing. */
export function validateCreateRequest(body: CreateSelfSuppliedRequest): {
  locationId: string
  ticker: string
  note: string | null
} {
  if (!body.locationId) throw BadRequest('locationId is required')
  if (!body.commodityTicker) throw BadRequest('commodityTicker is required')
  return {
    locationId: body.locationId,
    ticker: body.commodityTicker.toUpperCase(),
    note: body.note ?? null,
  }
}

/**
 * "I handle this locally" — entries that hide a (location, ticker) pair
 * from contract suggestions on the Plan tab. The Plan tab's contract walk
 * treats these pairs as producers, just like nodes with FIO production for
 * the ticker. Useful when the production isn't reflected in FIO data
 * (e.g., expert juggling at a hub).
 */
@Route('logistics/self-supplied')
@Tags('Logistics')
@Security('jwt')
export class SelfSuppliedController extends Controller {
  /** List all of the user's self-supplied entries. */
  @Get()
  public async list(@Request() request: { user: JwtPayload }): Promise<SelfSuppliedEntry[]> {
    const userId = request.user.userId
    const rows = await db
      .select()
      .from(logisticsSelfSupplied)
      .where(eq(logisticsSelfSupplied.userId, userId))
      .orderBy(asc(logisticsSelfSupplied.createdAt))
    return rows.map(toEntry)
  }

  /**
   * Create a new self-supplied entry. Returns 200 with the existing entry
   * if the (location, ticker) pair is already marked — make repeat clicks
   * a no-op rather than an error.
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async create(
    @Body() body: CreateSelfSuppliedRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SelfSuppliedEntry> {
    const userId = request.user.userId
    const { locationId, ticker, note } = validateCreateRequest(body)

    const [existing] = await db
      .select()
      .from(logisticsSelfSupplied)
      .where(
        and(
          eq(logisticsSelfSupplied.userId, userId),
          eq(logisticsSelfSupplied.locationId, locationId),
          eq(logisticsSelfSupplied.commodityTicker, ticker)
        )
      )
    if (existing) return toEntry(existing)

    const [row] = await db
      .insert(logisticsSelfSupplied)
      .values({
        userId,
        locationId,
        commodityTicker: ticker,
        note,
      })
      .returning()
    this.setStatus(201)
    return toEntry(row)
  }

  /** Remove a self-supplied entry. */
  @Delete('{id}')
  public async delete(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId
    const [existing] = await db
      .select({ id: logisticsSelfSupplied.id })
      .from(logisticsSelfSupplied)
      .where(and(eq(logisticsSelfSupplied.id, id), eq(logisticsSelfSupplied.userId, userId)))
    if (!existing) throw NotFound('Self-supplied entry not found')
    await db.delete(logisticsSelfSupplied).where(eq(logisticsSelfSupplied.id, id))
    return { success: true }
  }
}
