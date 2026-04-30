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
  AddViewOwnerRequest,
  CorpOverviewView,
  CreateCorpOverviewViewRequest,
  MetricKey,
  UpdateCorpOverviewViewRequest,
  ViewCard,
  ViewCardFilter,
  ViewCardSort,
  ViewOwner,
} from '@kawakawa/types'
import { isFilterOperator, isMetricFilterable, isMetricValidFor } from '@kawakawa/types'
import { db, corpOverviewViews, viewOwners, userVisitedViews, users } from '../db/index.js'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { JwtPayload } from '../utils/jwt.js'
import { hasPermission } from '../utils/permissionService.js'
import { BadRequest, Conflict, Forbidden, NotFound } from '../utils/errors.js'

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
      throw BadRequest(`cards[${cardIndex}].filters[${fi}].op must be one of <, <=, =, !=, >=, >`)
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

  // Card type: defaults to 'table' when missing so pre-histogram cards in the
  // DB still round-trip cleanly. Graph-specific validation arrives with the
  // histogram feature; for now any `type` that's not 'graph' is treated as
  // 'table', and graph config is preserved verbatim for forward compatibility.
  const type: ViewCard['type'] = c.type === 'graph' ? 'graph' : 'table'

  let cardTickers: string[] | undefined
  if (c.tickers !== undefined) {
    if (!Array.isArray(c.tickers)) {
      throw BadRequest(`cards[${index}].tickers must be an array`)
    }
    const normalized: string[] = []
    for (const [ti, t] of c.tickers.entries()) {
      if (typeof t !== 'string' || t.trim().length === 0) {
        throw BadRequest(`cards[${index}].tickers[${ti}] must be a non-empty string`)
      }
      normalized.push(normalizeScopeEntry(t.trim()))
    }
    cardTickers = normalized.length > 0 ? Array.from(new Set(normalized)) : undefined
  }

  // Forgiving on `clientId`: a properly-updated client always sends one, but
  // legacy clones / pre-feature browsers might not. Generate one server-side
  // so the row is consistent on disk and clients always see a stable ID.
  const clientId =
    typeof c.clientId === 'string' && c.clientId.trim().length > 0
      ? c.clientId.trim()
      : randomUUID()

  return {
    clientId,
    name: c.name.trim(),
    groupBy,
    type,
    filters,
    sortBy,
    columns: c.columns as ViewCard['columns'],
    limit: c.limit,
    tickers: cardTickers,
    graph: type === 'graph' ? (c.graph as ViewCard['graph']) : undefined,
  }
}

function validateCards(cards: unknown): ViewCard[] {
  if (!Array.isArray(cards)) {
    throw BadRequest('cards must be an array')
  }
  return cards.map((c, i) => validateCard(c, i))
}

/**
 * Validate a mixed scope-entry array (bare tickers + `category:Foo` refs).
 * Used for the view's overall scope, the materials-table scope override, and
 * any future per-card ticker overrides — all share the same shape.
 */
function validateScopeArray(raw: unknown, fieldName: string): string[] {
  if (!Array.isArray(raw)) {
    throw BadRequest(`${fieldName} must be an array`)
  }
  const out: string[] = []
  for (const [i, t] of raw.entries()) {
    if (typeof t !== 'string' || t.trim().length === 0) {
      throw BadRequest(`${fieldName}[${i}] must be a non-empty string`)
    }
    out.push(normalizeScopeEntry(t.trim()))
  }
  return Array.from(new Set(out))
}

function validateTickers(tickers: unknown): string[] {
  return validateScopeArray(tickers, 'tickers')
}

function validateMaterialsTableTickers(raw: unknown): string[] {
  return validateScopeArray(raw, 'materialsTableTickers')
}

function validateExcludedUserIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    throw BadRequest('excludedUserIds must be an array')
  }
  const out: number[] = []
  for (const [i, v] of raw.entries()) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw BadRequest(`excludedUserIds[${i}] must be a positive integer`)
    }
    out.push(v)
  }
  return Array.from(new Set(out)).sort((a, b) => a - b)
}

/**
 * Materials-table columns must all be valid `ticker`-grouping metrics. The
 * panel-level table is per-ticker, so user-only metrics like `username` are
 * rejected even though they're valid on user-ticker cards. We preserve order
 * because that's the column layout the user picked, deduping along the way.
 */
function validateMaterialsTableColumns(raw: unknown): MetricKey[] {
  if (!Array.isArray(raw)) {
    throw BadRequest('materialsTableColumns must be an array')
  }
  const out: MetricKey[] = []
  const seen = new Set<string>()
  for (const [i, v] of raw.entries()) {
    if (typeof v !== 'string' || !isMetricValidFor(v, 'ticker')) {
      throw BadRequest(`materialsTableColumns[${i}] is not a valid metric for the materials table`)
    }
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

const CATEGORY_PREFIX = 'category:'

function normalizeScopeEntry(raw: string): string {
  // Live category refs (`category:Name`) keep the human-readable name as-typed
  // so the chip UI doesn't shout it back. Bare tickers stay uppercased to
  // match the rest of the catalog.
  if (raw.toLowerCase().startsWith(CATEGORY_PREFIX)) {
    return CATEGORY_PREFIX + raw.slice(CATEGORY_PREFIX.length)
  }
  return raw.toUpperCase()
}

function validatePrivacy(p: unknown): 'private' | 'unlisted' | 'public' {
  if (p !== 'private' && p !== 'unlisted' && p !== 'public') {
    throw BadRequest(`privacy must be one of: private, unlisted, public`)
  }
  return p
}

/**
 * One row coming back from a view-list query. The `ownersJson` field is the
 * raw output of the `json_agg` subquery (string when populated, NULL when no
 * matching rows in `view_owners`). `parseOwnersJson` normalizes it into the
 * `ViewOwner[]` shape we expose.
 */
type ViewRow = typeof corpOverviewViews.$inferSelect & {
  ownersJson: string | ViewOwner[] | null
}

function parseOwnersJson(raw: unknown): ViewOwner[] {
  if (raw === null || raw === undefined) return []
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ViewOwner[]
    } catch {
      return []
    }
  }
  return raw as ViewOwner[]
}

/**
 * Active-only filter, applied to every read path. A view with `deletedAt` set
 * is invisible to all reads (and treated as gone for updates/permissions);
 * admin recovery would clear it.
 */
const ACTIVE = isNull(corpOverviewViews.deletedAt)

/**
 * Build a subquery that produces one row per view with a JSON array of owners
 * (`userId`, `username`) ordered by `addedAt`. Joined into every view-fetching
 * query with an INNER JOIN so ownerless views are filtered out of every
 * read path — they're effectively orphaned (no one to maintain them) and
 * showing them on Browse / list / pinned just clutters the picker. A future
 * admin-recovery flow can reassign owners and surface them again.
 *
 * Built per-call rather than once at module load so tests can mock `db.select`
 * fresh inside each `it`.
 */
function buildOwnersSubquery() {
  return db
    .select({
      viewId: viewOwners.viewId,
      ownersJson:
        sql<string>`coalesce(json_agg(json_build_object('userId', ${viewOwners.userId}, 'username', ${users.username}) ORDER BY ${viewOwners.addedAt}), '[]')`.as(
          'owners_json'
        ),
    })
    .from(viewOwners)
    .innerJoin(users, eq(viewOwners.userId, users.id))
    .groupBy(viewOwners.viewId)
    .as('view_owners_agg')
}

/**
 * Build the canonical view-row select shape, parameterized by the same
 * subquery instance used in the JOIN. Keeping these together eliminates
 * the cross-statement aliasing trap where `VIEW_SELECT` would refer to a
 * different subquery instance than the one actually joined.
 */
function buildViewSelect(owners: ReturnType<typeof buildOwnersSubquery>) {
  return {
    id: corpOverviewViews.id,
    ownersJson: owners.ownersJson,
    name: corpOverviewViews.name,
    tickers: corpOverviewViews.tickers,
    cards: corpOverviewViews.cards,
    excludedUserIds: corpOverviewViews.excludedUserIds,
    materialsTableColumns: corpOverviewViews.materialsTableColumns,
    materialsTableTickers: corpOverviewViews.materialsTableTickers,
    privacy: corpOverviewViews.privacy,
    isPinned: corpOverviewViews.isPinned,
    deletedAt: corpOverviewViews.deletedAt,
    createdAt: corpOverviewViews.createdAt,
    updatedAt: corpOverviewViews.updatedAt,
  }
}

/**
 * Membership check used by every owner-only endpoint. Single-row probe; cheap
 * and cache-friendly under the (view_id, user_id) primary key.
 */
async function isOwner(viewId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ x: sql<number>`1` })
    .from(viewOwners)
    .where(and(eq(viewOwners.viewId, viewId), eq(viewOwners.userId, userId)))
  return !!row
}

/**
 * Lazy migration: ensure every card on every supplied row carries a stable
 * `clientId`. Legacy rows saved before the field existed get UUIDs filled in
 * once, persisted back to the DB, and reflected in the in-memory row so the
 * caller's `toResponse` returns the fresh values. After the first read of
 * each view, this is a no-op.
 *
 * Cheap by design: most views have a handful of cards, the loop only writes
 * when a row actually needs migration, and the cost is amortized across the
 * lifetime of the row.
 */
async function ensureCardClientIds(rows: ViewRow[]): Promise<void> {
  for (const row of rows) {
    const cards = (row.cards as ViewCard[]) ?? []
    let mutated = false
    const next = cards.map(c => {
      if (typeof c.clientId === 'string' && c.clientId.length > 0) return c
      mutated = true
      return { ...c, clientId: randomUUID() }
    })
    if (!mutated) continue
    await db.update(corpOverviewViews).set({ cards: next }).where(eq(corpOverviewViews.id, row.id))
    row.cards = next
  }
}

function toResponse(row: ViewRow): CorpOverviewView {
  return {
    id: row.id,
    owners: parseOwnersJson(row.ownersJson),
    name: row.name,
    tickers: row.tickers as string[],
    cards: row.cards as ViewCard[],
    excludedUserIds: (row.excludedUserIds as number[] | null) ?? [],
    materialsTableColumns: (row.materialsTableColumns as MetricKey[] | null) ?? [],
    materialsTableTickers: (row.materialsTableTickers as string[] | null) ?? [],
    privacy: row.privacy,
    isPinned: row.isPinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

@Route('corp-overview-views')
@Tags('Corp Overview Views')
@Security('jwt')
export class CorpOverviewViewsController extends Controller {
  /**
   * List the caller's own views plus all public views from other corp members.
   */
  @Get()
  public async list(@Request() request: { user: JwtPayload }): Promise<CorpOverviewView[]> {
    const userId = request.user.userId

    const ownedViewIds = db
      .select({ id: viewOwners.viewId })
      .from(viewOwners)
      .where(eq(viewOwners.userId, userId))

    // Unlisted views the caller has previously visited come along too — that's
    // how a shared link stays in the selector across browsers/devices once
    // they've opened it once.
    const visitedViewIds = db
      .select({ id: userVisitedViews.viewId })
      .from(userVisitedViews)
      .where(eq(userVisitedViews.userId, userId))

    const owners = buildOwnersSubquery()
    const rows = await db
      .select(buildViewSelect(owners))
      .from(corpOverviewViews)
      .innerJoin(owners, eq(owners.viewId, corpOverviewViews.id))
      .where(
        and(
          ACTIVE,
          or(
            inArray(corpOverviewViews.id, ownedViewIds),
            eq(corpOverviewViews.privacy, 'public'),
            and(
              eq(corpOverviewViews.privacy, 'unlisted'),
              inArray(corpOverviewViews.id, visitedViewIds)
            )
          )
        )
      )
      .orderBy(sql`${corpOverviewViews.updatedAt} DESC`)

    await ensureCardClientIds(rows)
    return rows.map(toResponse)
  }

  /**
   * Get all pinned views. These appear globally for all users on Corp Overview.
   */
  @Get('pinned')
  public async getPinned(@Request() _request: { user: JwtPayload }): Promise<CorpOverviewView[]> {
    const owners = buildOwnersSubquery()
    const rows = await db
      .select(buildViewSelect(owners))
      .from(corpOverviewViews)
      .innerJoin(owners, eq(owners.viewId, corpOverviewViews.id))
      .where(and(ACTIVE, eq(corpOverviewViews.isPinned, true)))
      .orderBy(corpOverviewViews.name)

    await ensureCardClientIds(rows)
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

    const owners = buildOwnersSubquery()
    const rows = await db
      .select(buildViewSelect(owners))
      .from(corpOverviewViews)
      .innerJoin(owners, eq(owners.viewId, corpOverviewViews.id))
      .where(
        and(
          ACTIVE,
          eq(corpOverviewViews.privacy, 'public'),
          search
            ? sql`lower(${corpOverviewViews.name}) like ${`%${search.toLowerCase()}%`}`
            : undefined
        )
      )
      .orderBy(corpOverviewViews.name)
      .limit(pageSize)
      .offset(offset)

    await ensureCardClientIds(rows)
    return rows.map(toResponse)
  }

  /**
   * The caller's recently-visited unlisted views, paginated, most-recent
   * first. Soft-deleted views are filtered out automatically. Public views
   * aren't included even if they were "visited" — Browse covers their
   * discovery surface and there's nothing to recover by listing them here.
   *
   * Declared before `{id}` so TSOA's route table matches `/visited` literally
   * instead of trying to parse it as a numeric id.
   */
  @Get('visited')
  public async getVisited(
    @Request() request: { user: JwtPayload },
    @Query() page?: number
  ): Promise<CorpOverviewView[]> {
    const userId = request.user.userId
    const pageSize = 20
    const offset = ((page ?? 1) - 1) * pageSize

    const owners = buildOwnersSubquery()
    const rows = await db
      .select(buildViewSelect(owners))
      .from(corpOverviewViews)
      .innerJoin(
        userVisitedViews,
        and(eq(userVisitedViews.viewId, corpOverviewViews.id), eq(userVisitedViews.userId, userId))
      )
      .innerJoin(owners, eq(owners.viewId, corpOverviewViews.id))
      .where(and(ACTIVE, eq(corpOverviewViews.privacy, 'unlisted')))
      .orderBy(desc(userVisitedViews.lastVisitedAt))
      .limit(pageSize)
      .offset(offset)

    await ensureCardClientIds(rows)
    return rows.map(toResponse)
  }

  /**
   * Get a view by ID. Private views are only accessible by their owners.
   * Unlisted views are accessible by any authenticated user with the ID.
   */
  @Get('{id}')
  public async getById(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<CorpOverviewView> {
    const userId = request.user.userId

    const owners = buildOwnersSubquery()
    const [row] = await db
      .select(buildViewSelect(owners))
      .from(corpOverviewViews)
      .innerJoin(owners, eq(owners.viewId, corpOverviewViews.id))
      .where(and(eq(corpOverviewViews.id, id), ACTIVE))

    if (!row) {
      throw NotFound('View not found')
    }

    if (row.privacy === 'private' && !(await isOwner(id, userId))) {
      throw NotFound('View not found')
    }

    await ensureCardClientIds([row])
    return toResponse(row)
  }

  /**
   * Create a new view. The caller becomes the sole initial owner; other owners
   * can be added via the owner-management endpoints.
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
    const excludedUserIds =
      body.excludedUserIds === undefined ? [] : validateExcludedUserIds(body.excludedUserIds)
    const materialsTableColumns =
      body.materialsTableColumns === undefined
        ? []
        : validateMaterialsTableColumns(body.materialsTableColumns)
    const materialsTableTickers =
      body.materialsTableTickers === undefined
        ? []
        : validateMaterialsTableTickers(body.materialsTableTickers)

    // Wrap in a transaction so a view never lands on disk without an owner row;
    // a partial failure here would leave a view ownerless and invisible.
    const insertedId = await db.transaction(async tx => {
      const [inserted] = await tx
        .insert(corpOverviewViews)
        .values({
          name: body.name.trim(),
          tickers,
          cards,
          excludedUserIds,
          materialsTableColumns,
          materialsTableTickers,
          privacy,
          isPinned: false,
        })
        .returning({ id: corpOverviewViews.id })

      await tx.insert(viewOwners).values({ viewId: inserted.id, userId })
      return inserted.id
    })

    const owners = buildOwnersSubquery()
    const [row] = await db
      .select(buildViewSelect(owners))
      .from(corpOverviewViews)
      .innerJoin(owners, eq(owners.viewId, corpOverviewViews.id))
      .where(eq(corpOverviewViews.id, insertedId))

    this.setStatus(201)

    return toResponse(row)
  }

  /**
   * Update a view. Only owners can update.
   */
  @Put('{id}')
  public async update(
    @Path() id: number,
    @Body() body: UpdateCorpOverviewViewRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<CorpOverviewView> {
    const userId = request.user.userId

    const [existing] = await db
      .select({ id: corpOverviewViews.id })
      .from(corpOverviewViews)
      .where(and(eq(corpOverviewViews.id, id), ACTIVE))

    if (!existing) {
      throw NotFound('View not found')
    }

    if (!(await isOwner(id, userId))) {
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

    if (body.excludedUserIds !== undefined) {
      updates.excludedUserIds = validateExcludedUserIds(body.excludedUserIds)
    }

    if (body.materialsTableColumns !== undefined) {
      updates.materialsTableColumns = validateMaterialsTableColumns(body.materialsTableColumns)
    }

    if (body.materialsTableTickers !== undefined) {
      updates.materialsTableTickers = validateMaterialsTableTickers(body.materialsTableTickers)
    }

    if (body.privacy !== undefined) {
      updates.privacy = validatePrivacy(body.privacy)
    }

    await db.update(corpOverviewViews).set(updates).where(eq(corpOverviewViews.id, id))

    const owners = buildOwnersSubquery()
    const [row] = await db
      .select(buildViewSelect(owners))
      .from(corpOverviewViews)
      .innerJoin(owners, eq(owners.viewId, corpOverviewViews.id))
      .where(eq(corpOverviewViews.id, id))

    return toResponse(row)
  }

  /**
   * Soft-delete a view. Only owners can delete. The row is preserved with
   * `deletedAt` set so admins can recover it in a future revision.
   */
  @Delete('{id}')
  @SuccessResponse(204, 'View deleted')
  public async delete(@Path() id: number, @Request() request: { user: JwtPayload }): Promise<void> {
    const userId = request.user.userId

    const [existing] = await db
      .select({ id: corpOverviewViews.id })
      .from(corpOverviewViews)
      .where(and(eq(corpOverviewViews.id, id), ACTIVE))

    if (!existing) {
      throw NotFound('View not found')
    }

    if (!(await isOwner(id, userId))) {
      throw Forbidden('You do not have permission to delete this view')
    }

    const now = new Date()
    await db
      .update(corpOverviewViews)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(corpOverviewViews.id, id))

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
      .select({
        id: corpOverviewViews.id,
        privacy: corpOverviewViews.privacy,
        isPinned: corpOverviewViews.isPinned,
      })
      .from(corpOverviewViews)
      .where(and(eq(corpOverviewViews.id, id), ACTIVE))

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

    const owners = buildOwnersSubquery()
    const [row] = await db
      .select(buildViewSelect(owners))
      .from(corpOverviewViews)
      .innerJoin(owners, eq(owners.viewId, corpOverviewViews.id))
      .where(eq(corpOverviewViews.id, id))

    return toResponse(row)
  }

  /**
   * Add a user as an owner of a view. Caller must already be an owner. The
   * action is immediate (it has its own endpoint rather than riding on the
   * dirty/save flow) so granting access takes effect at click time.
   *
   * - 404 if the view doesn't exist or is soft-deleted.
   * - 403 if the caller isn't an owner.
   * - 400 if the target userId is invalid.
   * - 404 if the target user doesn't exist.
   * - 409 if the target is already an owner.
   */
  @Post('{id}/owners')
  public async addOwner(
    @Path() id: number,
    @Body() body: AddViewOwnerRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<CorpOverviewView> {
    const callerId = request.user.userId

    if (typeof body.userId !== 'number' || !Number.isInteger(body.userId) || body.userId <= 0) {
      throw BadRequest('userId must be a positive integer')
    }

    const [existing] = await db
      .select({ id: corpOverviewViews.id })
      .from(corpOverviewViews)
      .where(and(eq(corpOverviewViews.id, id), ACTIVE))

    if (!existing) {
      throw NotFound('View not found')
    }

    if (!(await isOwner(id, callerId))) {
      throw Forbidden('You do not have permission to manage owners on this view')
    }

    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, body.userId))

    if (!target) {
      throw NotFound('Target user not found')
    }

    if (await isOwner(id, body.userId)) {
      throw Conflict('User is already an owner of this view')
    }

    await db.insert(viewOwners).values({ viewId: id, userId: body.userId })

    return this.fetchViewById(id)
  }

  /**
   * Remove a user from a view's owners. Caller must be an owner. Refuses to
   * remove the last owner — delete the view instead if that's the goal.
   *
   * - 404 if the view doesn't exist or the target isn't an owner.
   * - 403 if the caller isn't an owner.
   * - 409 if the removal would leave the view with zero owners.
   */
  @Delete('{id}/owners/{userId}')
  public async removeOwner(
    @Path() id: number,
    @Path() userId: number,
    @Request() request: { user: JwtPayload }
  ): Promise<CorpOverviewView> {
    const callerId = request.user.userId

    const [existing] = await db
      .select({ id: corpOverviewViews.id })
      .from(corpOverviewViews)
      .where(and(eq(corpOverviewViews.id, id), ACTIVE))

    if (!existing) {
      throw NotFound('View not found')
    }

    if (!(await isOwner(id, callerId))) {
      throw Forbidden('You do not have permission to manage owners on this view')
    }

    if (!(await isOwner(id, userId))) {
      throw NotFound('User is not an owner of this view')
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(viewOwners)
      .where(eq(viewOwners.viewId, id))

    if (count <= 1) {
      throw Conflict(
        'Cannot remove the last owner of a view. Delete the view instead if that is your intent.'
      )
    }

    await db.delete(viewOwners).where(and(eq(viewOwners.viewId, id), eq(viewOwners.userId, userId)))

    return this.fetchViewById(id)
  }

  /**
   * Record that the caller visited this view. Idempotent upsert of
   * `(userId, viewId, lastVisitedAt = now)`. Frontend posts this after a
   * successful unlisted deep-link load so the view appears in the selector
   * across the user's devices on subsequent sessions.
   *
   * Permissions mirror `getById`: anyone with view access can record a visit.
   * Recording a visit on a view the caller already owns or can see publicly
   * is a no-op semantically — the row exists but the list query already
   * surfaced the view through other branches of the union.
   */
  @Post('{id}/visit')
  @SuccessResponse(204, 'Visit recorded')
  public async recordVisit(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    const [existing] = await db
      .select({ id: corpOverviewViews.id, privacy: corpOverviewViews.privacy })
      .from(corpOverviewViews)
      .where(and(eq(corpOverviewViews.id, id), ACTIVE))

    if (!existing) {
      throw NotFound('View not found')
    }

    if (existing.privacy === 'private' && !(await isOwner(id, userId))) {
      throw NotFound('View not found')
    }

    const now = new Date()
    await db
      .insert(userVisitedViews)
      .values({ userId, viewId: id, lastVisitedAt: now })
      .onConflictDoUpdate({
        target: [userVisitedViews.userId, userVisitedViews.viewId],
        set: { lastVisitedAt: now },
      })

    this.setStatus(204)
  }

  /**
   * Re-fetch a view by id with the full response shape. Used after owner
   * mutations so the caller gets a consistent, up-to-date `owners` array.
   */
  private async fetchViewById(id: number): Promise<CorpOverviewView> {
    const owners = buildOwnersSubquery()
    const [row] = await db
      .select(buildViewSelect(owners))
      .from(corpOverviewViews)
      .innerJoin(owners, eq(owners.viewId, corpOverviewViews.id))
      .where(eq(corpOverviewViews.id, id))
    return toResponse(row)
  }
}
