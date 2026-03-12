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
  SavedMarketFilter,
  CreateSavedFilterRequest,
  UpdateSavedFilterRequest,
  SavedFilterData,
} from '@kawakawa/types'
import { db, savedMarketFilters, users } from '../db/index.js'
import { and, eq, or, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { hasPermission } from '../utils/permissionService.js'
import { BadRequest, Forbidden, NotFound } from '../utils/errors.js'

const FILTERS_PIN_PERMISSION = 'filters.pin'

function toResponse(
  row: typeof savedMarketFilters.$inferSelect & { userName: string }
): SavedMarketFilter {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    name: row.name,
    filterData: row.filterData as SavedFilterData,
    privacy: row.privacy,
    isPinned: row.isPinned,
    createdAt: row.createdAt.toISOString(),
  }
}

@Route('saved-filters')
@Tags('Saved Filters')
@Security('jwt')
export class SavedFiltersController extends Controller {
  /**
   * List the caller's own saved filters plus all public filters from other users.
   */
  @Get()
  public async list(@Request() request: { user: JwtPayload }): Promise<SavedMarketFilter[]> {
    const userId = request.user.userId

    const rows = await db
      .select({
        id: savedMarketFilters.id,
        userId: savedMarketFilters.userId,
        userName: users.username,
        name: savedMarketFilters.name,
        filterData: savedMarketFilters.filterData,
        privacy: savedMarketFilters.privacy,
        isPinned: savedMarketFilters.isPinned,
        createdAt: savedMarketFilters.createdAt,
        updatedAt: savedMarketFilters.updatedAt,
      })
      .from(savedMarketFilters)
      .innerJoin(users, eq(savedMarketFilters.userId, users.id))
      .where(or(eq(savedMarketFilters.userId, userId), eq(savedMarketFilters.privacy, 'public')))
      .orderBy(sql`${savedMarketFilters.updatedAt} DESC`)

    return rows.map(toResponse)
  }

  /**
   * Get all pinned saved filters. These appear globally for all users on the Market page.
   */
  @Get('pinned')
  public async getPinned(@Request() _request: { user: JwtPayload }): Promise<SavedMarketFilter[]> {
    const rows = await db
      .select({
        id: savedMarketFilters.id,
        userId: savedMarketFilters.userId,
        userName: users.username,
        name: savedMarketFilters.name,
        filterData: savedMarketFilters.filterData,
        privacy: savedMarketFilters.privacy,
        isPinned: savedMarketFilters.isPinned,
        createdAt: savedMarketFilters.createdAt,
        updatedAt: savedMarketFilters.updatedAt,
      })
      .from(savedMarketFilters)
      .innerJoin(users, eq(savedMarketFilters.userId, users.id))
      .where(eq(savedMarketFilters.isPinned, true))
      .orderBy(savedMarketFilters.name)

    return rows.map(toResponse)
  }

  /**
   * Browse all public saved filters with optional name search. Paginated.
   */
  @Get('browse')
  public async browse(
    @Request() _request: { user: JwtPayload },
    @Query() search?: string,
    @Query() page?: number
  ): Promise<SavedMarketFilter[]> {
    const pageSize = 20
    const offset = ((page ?? 1) - 1) * pageSize

    const rows = await db
      .select({
        id: savedMarketFilters.id,
        userId: savedMarketFilters.userId,
        userName: users.username,
        name: savedMarketFilters.name,
        filterData: savedMarketFilters.filterData,
        privacy: savedMarketFilters.privacy,
        isPinned: savedMarketFilters.isPinned,
        createdAt: savedMarketFilters.createdAt,
        updatedAt: savedMarketFilters.updatedAt,
      })
      .from(savedMarketFilters)
      .innerJoin(users, eq(savedMarketFilters.userId, users.id))
      .where(
        and(
          eq(savedMarketFilters.privacy, 'public'),
          search
            ? sql`lower(${savedMarketFilters.name}) like ${`%${search.toLowerCase()}%`}`
            : undefined
        )
      )
      .orderBy(savedMarketFilters.name)
      .limit(pageSize)
      .offset(offset)

    return rows.map(toResponse)
  }

  /**
   * Get a saved filter by ID. Private filters are only accessible by their owner.
   * Link-privacy filters are accessible by any authenticated user who has the ID.
   */
  @Get('{id}')
  public async getById(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SavedMarketFilter> {
    const userId = request.user.userId

    const [row] = await db
      .select({
        id: savedMarketFilters.id,
        userId: savedMarketFilters.userId,
        userName: users.username,
        name: savedMarketFilters.name,
        filterData: savedMarketFilters.filterData,
        privacy: savedMarketFilters.privacy,
        isPinned: savedMarketFilters.isPinned,
        createdAt: savedMarketFilters.createdAt,
        updatedAt: savedMarketFilters.updatedAt,
      })
      .from(savedMarketFilters)
      .innerJoin(users, eq(savedMarketFilters.userId, users.id))
      .where(eq(savedMarketFilters.id, id))

    if (!row) {
      throw NotFound('Saved filter not found')
    }

    if (row.privacy === 'private' && row.userId !== userId) {
      throw NotFound('Saved filter not found')
    }

    return toResponse(row)
  }

  /**
   * Create a new saved filter.
   */
  @Post()
  @SuccessResponse(201, 'Saved filter created')
  public async create(
    @Body() body: CreateSavedFilterRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SavedMarketFilter> {
    const userId = request.user.userId

    if (!body.name || body.name.trim().length === 0) {
      throw BadRequest('Name is required')
    }

    if (!body.filterData) {
      throw BadRequest('Filter data is required')
    }

    const validPrivacyValues = ['private', 'link', 'public']
    if (!validPrivacyValues.includes(body.privacy)) {
      throw BadRequest('Privacy must be one of: private, link, public')
    }

    const [inserted] = await db
      .insert(savedMarketFilters)
      .values({
        userId,
        name: body.name.trim(),
        filterData: body.filterData,
        privacy: body.privacy,
        isPinned: false,
      })
      .returning()

    const [row] = await db
      .select({
        id: savedMarketFilters.id,
        userId: savedMarketFilters.userId,
        userName: users.username,
        name: savedMarketFilters.name,
        filterData: savedMarketFilters.filterData,
        privacy: savedMarketFilters.privacy,
        isPinned: savedMarketFilters.isPinned,
        createdAt: savedMarketFilters.createdAt,
        updatedAt: savedMarketFilters.updatedAt,
      })
      .from(savedMarketFilters)
      .innerJoin(users, eq(savedMarketFilters.userId, users.id))
      .where(eq(savedMarketFilters.id, inserted.id))

    this.setStatus(201)

    return toResponse(row)
  }

  /**
   * Update a saved filter. Only the owner can update.
   */
  @Put('{id}')
  public async update(
    @Path() id: number,
    @Body() body: UpdateSavedFilterRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SavedMarketFilter> {
    const userId = request.user.userId

    const [existing] = await db
      .select()
      .from(savedMarketFilters)
      .where(eq(savedMarketFilters.id, id))

    if (!existing) {
      throw NotFound('Saved filter not found')
    }

    if (existing.userId !== userId) {
      throw Forbidden('You do not have permission to update this filter')
    }

    const updates: Partial<typeof savedMarketFilters.$inferInsert & { updatedAt: Date }> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) {
      if (body.name.trim().length === 0) {
        throw BadRequest('Name cannot be empty')
      }
      updates.name = body.name.trim()
    }

    if (body.filterData !== undefined) {
      updates.filterData = body.filterData
    }

    if (body.privacy !== undefined) {
      const validPrivacyValues = ['private', 'link', 'public']
      if (!validPrivacyValues.includes(body.privacy)) {
        throw BadRequest('Privacy must be one of: private, link, public')
      }
      updates.privacy = body.privacy
    }

    await db.update(savedMarketFilters).set(updates).where(eq(savedMarketFilters.id, id))

    const [row] = await db
      .select({
        id: savedMarketFilters.id,
        userId: savedMarketFilters.userId,
        userName: users.username,
        name: savedMarketFilters.name,
        filterData: savedMarketFilters.filterData,
        privacy: savedMarketFilters.privacy,
        isPinned: savedMarketFilters.isPinned,
        createdAt: savedMarketFilters.createdAt,
        updatedAt: savedMarketFilters.updatedAt,
      })
      .from(savedMarketFilters)
      .innerJoin(users, eq(savedMarketFilters.userId, users.id))
      .where(eq(savedMarketFilters.id, id))

    return toResponse(row)
  }

  /**
   * Delete a saved filter. Only the owner can delete.
   */
  @Delete('{id}')
  @SuccessResponse(204, 'Saved filter deleted')
  public async delete(@Path() id: number, @Request() request: { user: JwtPayload }): Promise<void> {
    const userId = request.user.userId

    const [existing] = await db
      .select()
      .from(savedMarketFilters)
      .where(eq(savedMarketFilters.id, id))

    if (!existing) {
      throw NotFound('Saved filter not found')
    }

    if (existing.userId !== userId) {
      throw Forbidden('You do not have permission to delete this filter')
    }

    await db.delete(savedMarketFilters).where(eq(savedMarketFilters.id, id))

    this.setStatus(204)
  }

  /**
   * Toggle the pinned state of a saved filter. Requires the filters.pin permission.
   * Pinned filters appear globally for all users on the Market page.
   * Only public filters can be pinned.
   */
  @Put('{id}/pin')
  public async togglePin(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SavedMarketFilter> {
    const userRoles = request.user.roles

    const canPin = await hasPermission(userRoles, FILTERS_PIN_PERMISSION)
    if (!canPin) {
      throw Forbidden('You do not have permission to pin filters')
    }

    const [existing] = await db
      .select()
      .from(savedMarketFilters)
      .where(eq(savedMarketFilters.id, id))

    if (!existing) {
      throw NotFound('Saved filter not found')
    }

    if (existing.privacy !== 'public') {
      throw BadRequest('Only public filters can be pinned')
    }

    await db
      .update(savedMarketFilters)
      .set({ isPinned: !existing.isPinned, updatedAt: new Date() })
      .where(eq(savedMarketFilters.id, id))

    const [row] = await db
      .select({
        id: savedMarketFilters.id,
        userId: savedMarketFilters.userId,
        userName: users.username,
        name: savedMarketFilters.name,
        filterData: savedMarketFilters.filterData,
        privacy: savedMarketFilters.privacy,
        isPinned: savedMarketFilters.isPinned,
        createdAt: savedMarketFilters.createdAt,
        updatedAt: savedMarketFilters.updatedAt,
      })
      .from(savedMarketFilters)
      .innerJoin(users, eq(savedMarketFilters.userId, users.id))
      .where(eq(savedMarketFilters.id, id))

    return toResponse(row)
  }
}
