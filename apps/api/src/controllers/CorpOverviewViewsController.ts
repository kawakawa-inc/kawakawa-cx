import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Query,
  Route,
  Security,
  Tags,
  Request,
  SuccessResponse,
} from 'tsoa'
import type {
  CorpOverviewView,
  CreateCorpOverviewViewRequest,
  UpdateCorpOverviewViewRequest,
  ViewCard,
  ViewCardFilter,
  ViewCardSort,
} from '@kawakawa/types'
import { isFilterOperator, isMetricFilterable, isMetricValidFor } from '@kawakawa/types'
import { db, corpOverviewViews, users } from '../db/index.js'
import { and, eq, or, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { hasPermission } from '../utils/permissionService.js'
import { BadRequest, Forbidden, NotFound } from '../utils/errors.js'

const VIEWS_PIN_PERMISSION = 'filters.pin'

function validateFilters(
  raw: unknown,
  groupBy: ViewCard['groupBy'],
  cardIndex: number
): ViewCardFilter[] {
  if (!Array.isArray(raw)) {
    throw BadRequest(`cards[${cardIndex}].filters must be an array`)
  }
  const out: ViewCardFilter[] = []
  for (const [fi, f] of raw.entries()) {
    if (!f || typeof f !== 'object') {
      throw BadRequest(`cards[${cardIndex}].filters[${fi}] must be an object`)
    }
    const rec = f as Record<string, unknown>
    if (typeof rec.metric !== 'string' || !isMetricFilterable(rec.metric, groupBy)) {
      throw BadRequest(
        `cards[${cardIndex}].filters[${fi}].metric is not a filterable metric for groupBy='${groupBy}'`
      )
    }
    if (typeof rec.op !== 'string' || !isFilterOperator(rec.op)) {
      throw BadRequest(
        `cards[${cardIndex}].filters[${fi}].op must be one of <, <=, =, !=, >=, >`
      )
    }
    if (typeof rec.value !== 'number' || !Number.isFinite(rec.value)) {
      throw BadRequest(`cards[${cardIndex}].filters[${fi}].value must be a finite number`)
    }
    out.push({ metric: rec.metric, op: rec.op, value: rec.value })
  }
  return out
}

function validateSortBy(
  raw: unknown,
  groupBy: ViewCard['groupBy'],
  cardIndex: number
): ViewCardSort[] {
  if (!Array.isArray(raw)) {
    throw BadRequest(`cards[${cardIndex}].sortBy must be an array`)
  }
  const out: ViewCardSort[] = []
  for (const [si, s] of raw.entries()) {
    if (!s || typeof s !== 'object') {
      throw BadRequest(`cards[${cardIndex}].sortBy[${si}] must be an object`)
    }
    const rec = s as Record<string, unknown>
    if (typeof rec.metric !== 'string' || !isMetricValidFor(rec.metric, groupBy)) {
      throw BadRequest(
        `cards[${cardIndex}].sortBy[${si}].metric is not a valid metric for groupBy='${groupBy}'`
      )
    }
    if (rec.direction !== 'asc' && rec.direction !== 'desc') {
      throw BadRequest(`cards[${cardIndex}].sortBy[${si}].direction must be 'asc' or 'desc'`)
    }
    out.push({ metric: rec.metric, direction: rec.direction })
  }
  return out
}

/**
 * Validate a card config. Throws BadRequest on any structural issue.
 *
 * The validation here mirrors what the frontend editor enforces, so a rejected
 * card means the client sent something the editor shouldn't have produced.
 * We still check server-side because cards arrive as raw JSON.
 */
function validateCard(card: unknown, index: number): ViewCard {
  if (!card || typeof card !== 'object') {
    throw BadRequest(`cards[${index}] must be an object`)
  }
  const c = card as Record<string, unknown>

  if (typeof c.name !== 'string' || c.name.trim().length === 0) {
    throw BadRequest(`cards[${index}].name must be a non-empty string`)
  }
  if (c.groupBy !== 'ticker' && c.groupBy !== 'user-ticker') {
    throw BadRequest(`cards[${index}].groupBy must be 'ticker' or 'user-ticker'`)
  }
  const groupBy = c.groupBy

  const filters = validateFilters(c.filters, groupBy, index)
  const sortBy = validateSortBy(c.sortBy, groupBy, index)

  if (!Array.isArray(c.columns) || c.columns.length === 0) {
    throw BadRequest(`cards[${index}].columns must be a non-empty array`)
  }
  for (const [ci, col] of c.columns.entries()) {
    if (typeof col !== 'string' || !isMetricValidFor(col, groupBy)) {
      throw BadRequest(
        `cards[${index}].columns[${ci}] is not a valid metric for groupBy='${groupBy}'`
      )
    }
  }

  if (typeof c.limit !== 'number' || !Number.isInteger(c.limit) || c.limit <= 0 || c.limit > 100) {
    throw BadRequest(`cards[${index}].limit must be an integer between 1 and 100`)
  }

  return {
    name: c.name.trim(),
    groupBy,
    filters,
    sortBy,
    columns: c.columns as ViewCard['columns'],
    limit: c.limit,
  }
}

function validateCards(cards: unknown): ViewCard[] {
  if (!Array.isArray(cards)) {
    throw BadRequest('cards must be an array')
  }
  return cards.map((c, i) => validateCard(c, i))
}

function validateTickers(tickers: unknown): string[] {
  if (!Array.isArray(tickers)) {
    throw BadRequest('tickers must be an array')
  }
  const out: string[] = []
  for (const [i, t] of tickers.entries()) {
    if (typeof t !== 'string' || t.trim().length === 0) {
      throw BadRequest(`tickers[${i}] must be a non-empty string`)
    }
    out.push(t.trim().toUpperCase())
  }
  // De-dupe; preserve first-occurrence order.
  return Array.from(new Set(out))
}

function validatePrivacy(p: unknown): 'private' | 'link' | 'public' {
  if (p !== 'private' && p !== 'link' && p !== 'public') {
    throw BadRequest(`privacy must be one of: private, link, public`)
  }
  return p
}

type ViewRow = typeof corpOverviewViews.$inferSelect & { userName: string }

function toResponse(row: ViewRow): CorpOverviewView {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    name: row.name,
    tickers: row.tickers as string[],
    cards: row.cards as ViewCard[],
    privacy: row.privacy,
    isPinned: row.isPinned,
    createdAt: row.createdAt.toISOString(),
  }
}

const VIEW_SELECT = {
  id: corpOverviewViews.id,
  userId: corpOverviewViews.userId,
  userName: users.username,
  name: corpOverviewViews.name,
  tickers: corpOverviewViews.tickers,
  cards: corpOverviewViews.cards,
  privacy: corpOverviewViews.privacy,
  isPinned: corpOverviewViews.isPinned,
  createdAt: corpOverviewViews.createdAt,
  updatedAt: corpOverviewViews.updatedAt,
}

@Route('corp-overview-views')
@Tags('Corp Overview Views')
@Security('jwt')
export class CorpOverviewViewsController extends Controller {
  /**
   * List the caller's own views plus all public views from other users.
   */
  @Get()
  public async list(@Request() request: { user: JwtPayload }): Promise<CorpOverviewView[]> {
    const userId = request.user.userId

    const rows = await db
      .select(VIEW_SELECT)
      .from(corpOverviewViews)
      .innerJoin(users, eq(corpOverviewViews.userId, users.id))
      .where(or(eq(corpOverviewViews.userId, userId), eq(corpOverviewViews.privacy, 'public')))
      .orderBy(sql`${corpOverviewViews.updatedAt} DESC`)

    return rows.map(toResponse)
  }

  /**
   * Get all pinned views. These appear globally for all users on Corp Overview.
   */
  @Get('pinned')
  public async getPinned(
    @Request() _request: { user: JwtPayload }
  ): Promise<CorpOverviewView[]> {
    const rows = await db
      .select(VIEW_SELECT)
      .from(corpOverviewViews)
      .innerJoin(users, eq(corpOverviewViews.userId, users.id))
      .where(eq(corpOverviewViews.isPinned, true))
      .orderBy(corpOverviewViews.name)

    return rows.map(toResponse)
  }

  /**
   * Browse all public views with optional name search. Paginated.
   */
  @Get('browse')
  public async browse(
    @Request() _request: { user: JwtPayload },
    @Query() search?: string,
    @Query() page?: number
  ): Promise<CorpOverviewView[]> {
    const pageSize = 20
    const offset = ((page ?? 1) - 1) * pageSize

    const rows = await db
      .select(VIEW_SELECT)
      .from(corpOverviewViews)
      .innerJoin(users, eq(corpOverviewViews.userId, users.id))
      .where(
        and(
          eq(corpOverviewViews.privacy, 'public'),
          search
            ? sql`lower(${corpOverviewViews.name}) like ${`%${search.toLowerCase()}%`}`
            : undefined
        )
      )
      .orderBy(corpOverviewViews.name)
      .limit(pageSize)
      .offset(offset)

    return rows.map(toResponse)
  }

  /**
   * Get a view by ID. Private views are only accessible by their owner.
   * Link-privacy views are accessible by any authenticated user with the ID.
   */
  @Get('{id}')
  public async getById(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<CorpOverviewView> {
    const userId = request.user.userId

    const [row] = await db
      .select(VIEW_SELECT)
      .from(corpOverviewViews)
      .innerJoin(users, eq(corpOverviewViews.userId, users.id))
      .where(eq(corpOverviewViews.id, id))

    if (!row) {
      throw NotFound('View not found')
    }

    if (row.privacy === 'private' && row.userId !== userId) {
      throw NotFound('View not found')
    }

    return toResponse(row)
  }

  /**
   * Create a new view.
   */
  @Post()
  @SuccessResponse(201, 'View created')
  public async create(
    @Body() body: CreateCorpOverviewViewRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<CorpOverviewView> {
    const userId = request.user.userId

    if (!body.name || body.name.trim().length === 0) {
      throw BadRequest('Name is required')
    }
    const cards = validateCards(body.cards)
    const tickers = validateTickers(body.tickers)
    const privacy = validatePrivacy(body.privacy)

    const [inserted] = await db
      .insert(corpOverviewViews)
      .values({
        userId,
        name: body.name.trim(),
        tickers,
        cards,
        privacy,
        isPinned: false,
      })
      .returning()

    const [row] = await db
      .select(VIEW_SELECT)
      .from(corpOverviewViews)
      .innerJoin(users, eq(corpOverviewViews.userId, users.id))
      .where(eq(corpOverviewViews.id, inserted.id))

    this.setStatus(201)

    return toResponse(row)
  }

  /**
   * Update a view. Only the owner can update.
   */
  @Put('{id}')
  public async update(
    @Path() id: number,
    @Body() body: UpdateCorpOverviewViewRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<CorpOverviewView> {
    const userId = request.user.userId

    const [existing] = await db
      .select()
      .from(corpOverviewViews)
      .where(eq(corpOverviewViews.id, id))

    if (!existing) {
      throw NotFound('View not found')
    }

    if (existing.userId !== userId) {
      throw Forbidden('You do not have permission to update this view')
    }

    const updates: Partial<typeof corpOverviewViews.$inferInsert & { updatedAt: Date }> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) {
      if (body.name.trim().length === 0) {
        throw BadRequest('Name cannot be empty')
      }
      updates.name = body.name.trim()
    }

    if (body.cards !== undefined) {
      updates.cards = validateCards(body.cards)
    }

    if (body.tickers !== undefined) {
      updates.tickers = validateTickers(body.tickers)
    }

    if (body.privacy !== undefined) {
      updates.privacy = validatePrivacy(body.privacy)
    }

    await db.update(corpOverviewViews).set(updates).where(eq(corpOverviewViews.id, id))

    const [row] = await db
      .select(VIEW_SELECT)
      .from(corpOverviewViews)
      .innerJoin(users, eq(corpOverviewViews.userId, users.id))
      .where(eq(corpOverviewViews.id, id))

    return toResponse(row)
  }

  /**
   * Delete a view. Only the owner can delete.
   */
  @Delete('{id}')
  @SuccessResponse(204, 'View deleted')
  public async delete(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    const [existing] = await db
      .select()
      .from(corpOverviewViews)
      .where(eq(corpOverviewViews.id, id))

    if (!existing) {
      throw NotFound('View not found')
    }

    if (existing.userId !== userId) {
      throw Forbidden('You do not have permission to delete this view')
    }

    await db.delete(corpOverviewViews).where(eq(corpOverviewViews.id, id))

    this.setStatus(204)
  }

  /**
   * Toggle the pinned state. Requires `filters.pin` permission. Only public
   * views can be pinned (pinning makes them visible to everyone).
   */
  @Put('{id}/pin')
  public async togglePin(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<CorpOverviewView> {
    const userRoles = request.user.roles

    const canPin = await hasPermission(userRoles, VIEWS_PIN_PERMISSION)
    if (!canPin) {
      throw Forbidden('You do not have permission to pin views')
    }

    const [existing] = await db
      .select()
      .from(corpOverviewViews)
      .where(eq(corpOverviewViews.id, id))

    if (!existing) {
      throw NotFound('View not found')
    }

    if (existing.privacy !== 'public') {
      throw BadRequest('Only public views can be pinned')
    }

    await db
      .update(corpOverviewViews)
      .set({ isPinned: !existing.isPinned, updatedAt: new Date() })
      .where(eq(corpOverviewViews.id, id))

    const [row] = await db
      .select(VIEW_SELECT)
      .from(corpOverviewViews)
      .innerJoin(users, eq(corpOverviewViews.userId, users.id))
      .where(eq(corpOverviewViews.id, id))

    return toResponse(row)
  }
}
