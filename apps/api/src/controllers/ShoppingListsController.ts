import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Security,
  Tags,
  Request,
  SuccessResponse,
} from 'tsoa'
import type {
  SavedShoppingList,
  ShoppingListSummary,
  CreateShoppingListRequest,
  UpdateShoppingListRequest,
  ShoppingListMaterials,
} from '@kawakawa/types'
import { db, shoppingLists } from '../db/index.js'
import { eq, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'

@Route('lists')
@Tags('Shopping Lists')
@Security('jwt')
export class ShoppingListsController extends Controller {
  /**
   * Get all shopping lists for the current user
   */
  @Get()
  public async getLists(@Request() request: { user: JwtPayload }): Promise<ShoppingListSummary[]> {
    const userId = request.user.userId

    const rows = await db
      .select({
        id: shoppingLists.id,
        name: shoppingLists.name,
        materials: shoppingLists.materials,
        createdAt: shoppingLists.createdAt,
        updatedAt: shoppingLists.updatedAt,
      })
      .from(shoppingLists)
      .where(eq(shoppingLists.userId, userId))
      .orderBy(sql`${shoppingLists.updatedAt} DESC`)

    return rows.map(row => {
      const materials = row.materials as ShoppingListMaterials
      const itemCount = Object.keys(materials).length
      const totalQuantity = Object.values(materials).reduce((sum, qty) => sum + qty, 0)

      return {
        id: row.id,
        name: row.name,
        itemCount,
        totalQuantity,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    })
  }

  /**
   * Get a specific shopping list by ID
   */
  @Get('{id}')
  public async getList(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SavedShoppingList> {
    const userId = request.user.userId

    const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.id, id))

    if (!list) {
      throw NotFound('Shopping list not found')
    }

    if (list.userId !== userId) {
      throw Forbidden('You do not have access to this shopping list')
    }

    return {
      id: list.id,
      userId: list.userId,
      name: list.name,
      materials: list.materials as ShoppingListMaterials,
      notes: list.notes,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    }
  }

  /**
   * Create a new shopping list
   */
  @Post()
  @SuccessResponse(201, 'Shopping list created')
  public async createList(
    @Body() body: CreateShoppingListRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SavedShoppingList> {
    const userId = request.user.userId

    if (!body.name || body.name.trim().length === 0) {
      throw BadRequest('Name is required')
    }

    if (!body.materials || Object.keys(body.materials).length === 0) {
      throw BadRequest('Materials cannot be empty')
    }

    // Validate materials are all positive numbers
    for (const [ticker, quantity] of Object.entries(body.materials)) {
      if (typeof quantity !== 'number' || quantity <= 0) {
        throw BadRequest(`Invalid quantity for ${ticker}: must be a positive number`)
      }
    }

    const [list] = await db
      .insert(shoppingLists)
      .values({
        userId,
        name: body.name.trim(),
        materials: body.materials,
        notes: body.notes ?? null,
      })
      .returning()

    this.setStatus(201)

    return {
      id: list.id,
      userId: list.userId,
      name: list.name,
      materials: list.materials as ShoppingListMaterials,
      notes: list.notes,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    }
  }

  /**
   * Update a shopping list
   */
  @Put('{id}')
  public async updateList(
    @Path() id: number,
    @Body() body: UpdateShoppingListRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SavedShoppingList> {
    const userId = request.user.userId

    const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.id, id))

    if (!list) {
      throw NotFound('Shopping list not found')
    }

    if (list.userId !== userId) {
      throw Forbidden('You do not have access to this shopping list')
    }

    // Validate materials if provided
    if (body.materials) {
      if (Object.keys(body.materials).length === 0) {
        throw BadRequest('Materials cannot be empty')
      }
      for (const [ticker, quantity] of Object.entries(body.materials)) {
        if (typeof quantity !== 'number' || quantity <= 0) {
          throw BadRequest(`Invalid quantity for ${ticker}: must be a positive number`)
        }
      }
    }

    // Build update object
    const updates: Partial<{
      name: string
      materials: ShoppingListMaterials
      notes: string | null
      updatedAt: Date
    }> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) {
      if (body.name.trim().length === 0) {
        throw BadRequest('Name cannot be empty')
      }
      updates.name = body.name.trim()
    }

    if (body.materials !== undefined) {
      updates.materials = body.materials
    }

    if (body.notes !== undefined) {
      updates.notes = body.notes
    }

    const [updated] = await db
      .update(shoppingLists)
      .set(updates)
      .where(eq(shoppingLists.id, id))
      .returning()

    return {
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      materials: updated.materials as ShoppingListMaterials,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }
  }

  /**
   * Delete a shopping list
   */
  @Delete('{id}')
  @SuccessResponse(204, 'Shopping list deleted')
  public async deleteList(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.id, id))

    if (!list) {
      throw NotFound('Shopping list not found')
    }

    if (list.userId !== userId) {
      throw Forbidden('You do not have access to this shopping list')
    }

    await db.delete(shoppingLists).where(eq(shoppingLists.id, id))

    this.setStatus(204)
  }
}
