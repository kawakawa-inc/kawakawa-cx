import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import type { Currency } from '@kawakawa/types'
import { db, recipes, recipeInputs, fioCommodities, users } from '../db/index.js'
import { eq, and, inArray } from 'drizzle-orm'
import { BadRequest, NotFound } from '../utils/errors.js'
import type { JwtPayload } from '../utils/jwt.js'
import type { RecipeType } from '../services/recipe-price-calculator.js'
import {
  calculateAllRecipePrices,
  calculateRecipePrice,
  type RecipePriceBreakdown,
} from '../services/recipe-price-calculator.js'

type RecipeRow = typeof recipes.$inferSelect

interface RecipeInputDto {
  commodityTicker: string
  commodityName: string | null
  quantity: number
}

interface RecipeResponse {
  id: number
  name: string
  type: RecipeType
  salePrice: number | null
  currency: Currency | null
  description: string | null
  isActive: boolean
  createdByUserId: number | null
  createdByUsername: string | null
  createdAt: Date
  updatedAt: Date
  inputs: RecipeInputDto[]
}

interface RecipeInputRequest {
  commodityTicker: string
  quantity: number
}

interface CreateRecipeRequest {
  name: string
  type?: RecipeType
  salePrice?: number | null
  currency?: Currency | null
  description?: string | null
  isActive?: boolean
  inputs: RecipeInputRequest[]
}

interface UpdateRecipeRequest {
  name?: string
  type?: RecipeType
  salePrice?: number | null
  currency?: Currency | null
  description?: string | null
  isActive?: boolean
  /** If provided, fully replaces the recipe's existing material lines. */
  inputs?: RecipeInputRequest[]
}

interface NormalizedInput {
  commodityTicker: string
  quantity: number
}

/**
 * Normalize and validate the raw input lines: uppercase tickers, require a
 * positive integer quantity, reject duplicate tickers, and verify every
 * ticker exists in fioCommodities. Throws BadRequest on any violation.
 */
async function validateInputs(inputs: RecipeInputRequest[]): Promise<NormalizedInput[]> {
  if (!inputs || inputs.length === 0) {
    throw BadRequest('A recipe must have at least one material line')
  }

  const normalized: NormalizedInput[] = inputs.map((line, i) => {
    const lineNum = i + 1
    if (!line.commodityTicker) {
      throw BadRequest(`Line ${lineNum}: commodityTicker is required`)
    }
    const quantity = Math.floor(line.quantity)
    if (!Number.isFinite(line.quantity) || quantity <= 0) {
      throw BadRequest(
        `Line ${lineNum} (${line.commodityTicker.toUpperCase()}): quantity must be > 0`
      )
    }
    return { commodityTicker: line.commodityTicker.toUpperCase(), quantity }
  })

  const tickers = normalized.map(n => n.commodityTicker)
  const uniqueTickers = new Set(tickers)
  if (uniqueTickers.size !== tickers.length) {
    throw BadRequest('Duplicate commodityTicker values are not allowed within a recipe')
  }

  const found = await db
    .select({ ticker: fioCommodities.ticker })
    .from(fioCommodities)
    .where(inArray(fioCommodities.ticker, [...uniqueTickers]))
  const foundSet = new Set(found.map(f => f.ticker))
  const missing = tickers.filter(t => !foundSet.has(t))
  if (missing.length > 0) {
    throw BadRequest(`Unknown commodity ticker(s): ${[...new Set(missing)].join(', ')}`)
  }

  return normalized
}

async function loadInputsForRecipes(recipeIds: number[]): Promise<Map<number, RecipeInputDto[]>> {
  const out = new Map<number, RecipeInputDto[]>()
  if (recipeIds.length === 0) return out
  const rows = await db
    .select({
      recipeId: recipeInputs.recipeId,
      commodityTicker: recipeInputs.commodityTicker,
      commodityName: fioCommodities.name,
      quantity: recipeInputs.quantity,
    })
    .from(recipeInputs)
    .leftJoin(fioCommodities, eq(recipeInputs.commodityTicker, fioCommodities.ticker))
    .where(inArray(recipeInputs.recipeId, recipeIds))
    .orderBy(recipeInputs.commodityTicker)
  for (const r of rows) {
    const list = out.get(r.recipeId) ?? []
    list.push({
      commodityTicker: r.commodityTicker,
      commodityName: r.commodityName,
      quantity: r.quantity,
    })
    out.set(r.recipeId, list)
  }
  return out
}

function toResponse(
  row: RecipeRow & { createdByUsername?: string | null },
  inputs: RecipeInputDto[]
): RecipeResponse {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    salePrice: row.salePrice !== null ? parseFloat(row.salePrice) : null,
    currency: row.currency,
    description: row.description,
    isActive: row.isActive,
    createdByUserId: row.createdByUserId,
    createdByUsername: row.createdByUsername ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    inputs,
  }
}

@Route('recipes')
@Tags('Pricing')
export class RecipesController extends Controller {
  /**
   * List recipes (bills of materials sold as a bundle, e.g. ships).
   * @param type Filter by recipe type ('ship' or 'building')
   * @param activeOnly Only return active recipes (default: true when omitted, pass false to include inactive)
   */
  @Get()
  @Security('jwt', ['recipes.view'])
  public async listRecipes(
    @Query() type?: RecipeType,
    @Query() activeOnly?: boolean
  ): Promise<RecipeResponse[]> {
    const conditions = []
    if (type) conditions.push(eq(recipes.type, type))
    if (activeOnly !== false) conditions.push(eq(recipes.isActive, true))

    const rows = await db
      .select({
        id: recipes.id,
        name: recipes.name,
        type: recipes.type,
        salePrice: recipes.salePrice,
        currency: recipes.currency,
        description: recipes.description,
        isActive: recipes.isActive,
        createdByUserId: recipes.createdByUserId,
        createdByUsername: users.username,
        createdAt: recipes.createdAt,
        updatedAt: recipes.updatedAt,
      })
      .from(recipes)
      .leftJoin(users, eq(recipes.createdByUserId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(recipes.name)

    const inputsMap = await loadInputsForRecipes(rows.map(r => r.id))
    return rows.map(r => toResponse(r, inputsMap.get(r.id) ?? []))
  }

  /**
   * Compute price breakdowns for every active recipe against a price list,
   * comparing the summed material cost to each recipe's listed sale price.
   * @param priceListCode The price list to price materials against
   * @param locationId Location to price at (defaults to the version's default location)
   * @param version Price list version (defaults to the price list's current version)
   * @param type Filter by recipe type
   */
  @Get('price')
  @Security('jwt', ['recipes.view'])
  public async getAllRecipePrices(
    @Query() priceListCode: string,
    @Query() locationId?: string,
    @Query() version?: number,
    @Query() type?: RecipeType
  ): Promise<RecipePriceBreakdown[]> {
    if (!priceListCode) {
      throw BadRequest('priceListCode is required')
    }
    return calculateAllRecipePrices(priceListCode, locationId, version, type)
  }

  /** Get a single recipe with its material lines. */
  @Get('{id}')
  @Security('jwt', ['recipes.view'])
  public async getRecipe(@Path() id: number): Promise<RecipeResponse> {
    const [row] = await db
      .select({
        id: recipes.id,
        name: recipes.name,
        type: recipes.type,
        salePrice: recipes.salePrice,
        currency: recipes.currency,
        description: recipes.description,
        isActive: recipes.isActive,
        createdByUserId: recipes.createdByUserId,
        createdByUsername: users.username,
        createdAt: recipes.createdAt,
        updatedAt: recipes.updatedAt,
      })
      .from(recipes)
      .leftJoin(users, eq(recipes.createdByUserId, users.id))
      .where(eq(recipes.id, id))
      .limit(1)
    if (!row) throw NotFound(`Recipe with ID ${id} not found`)

    const inputsMap = await loadInputsForRecipes([id])
    return toResponse(row, inputsMap.get(id) ?? [])
  }

  /**
   * Compute the price breakdown for a single recipe against a price list,
   * comparing the summed material cost to its listed sale price.
   * @param id The recipe ID
   * @param priceListCode The price list to price materials against
   * @param locationId Location to price at (defaults to the version's default location)
   * @param version Price list version (defaults to the price list's current version)
   */
  @Get('{id}/price')
  @Security('jwt', ['recipes.view'])
  public async getRecipePrice(
    @Path() id: number,
    @Query() priceListCode: string,
    @Query() locationId?: string,
    @Query() version?: number
  ): Promise<RecipePriceBreakdown> {
    if (!priceListCode) {
      throw BadRequest('priceListCode is required')
    }
    return calculateRecipePrice(id, priceListCode, locationId, version)
  }

  /** Create a new recipe with its material lines. */
  @Post()
  @Security('jwt', ['recipes.manage'])
  @SuccessResponse('201', 'Created')
  public async createRecipe(
    @Body() body: CreateRecipeRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<RecipeResponse> {
    if (!body.name?.trim()) {
      throw BadRequest('name is required')
    }
    if (body.currency && body.salePrice === undefined) {
      throw BadRequest('salePrice is required when currency is set')
    }
    const normalizedInputs = await validateInputs(body.inputs)

    const result = await db.transaction(async tx => {
      const [row] = await tx
        .insert(recipes)
        .values({
          name: body.name.trim(),
          type: body.type ?? 'ship',
          salePrice: body.salePrice != null ? body.salePrice.toFixed(2) : null,
          currency: body.currency ?? null,
          description: body.description ?? null,
          isActive: body.isActive ?? true,
          createdByUserId: request.user.userId,
        })
        .returning()
      const inputRows = await tx
        .insert(recipeInputs)
        .values(normalizedInputs.map(i => ({ ...i, recipeId: row.id })))
        .returning()
      return { row, inputRows }
    })

    this.setStatus(201)
    return toResponse(
      { ...result.row, createdByUsername: null },
      result.inputRows.map(r => ({
        commodityTicker: r.commodityTicker,
        commodityName: null,
        quantity: r.quantity,
      }))
    )
  }

  /**
   * Update a recipe. When `inputs` is supplied, it fully replaces the
   * existing material lines.
   */
  @Put('{id}')
  @Security('jwt', ['recipes.manage'])
  public async updateRecipe(
    @Path() id: number,
    @Body() body: UpdateRecipeRequest
  ): Promise<RecipeResponse> {
    const [existing] = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1)
    if (!existing) throw NotFound(`Recipe with ID ${id} not found`)

    if (body.name !== undefined && !body.name.trim()) {
      throw BadRequest('name cannot be empty')
    }

    let normalizedInputs: NormalizedInput[] | null = null
    if (body.inputs !== undefined) {
      normalizedInputs = await validateInputs(body.inputs)
    }

    const updateData: Partial<RecipeRow> & { updatedAt: Date } = {
      updatedAt: new Date(),
    }
    if (body.name !== undefined) updateData.name = body.name.trim()
    if (body.type !== undefined) updateData.type = body.type
    if (body.salePrice !== undefined) {
      updateData.salePrice = body.salePrice != null ? body.salePrice.toFixed(2) : null
    }
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.description !== undefined) updateData.description = body.description
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    await db.transaction(async tx => {
      await tx.update(recipes).set(updateData).where(eq(recipes.id, id))
      if (normalizedInputs) {
        await tx.delete(recipeInputs).where(eq(recipeInputs.recipeId, id))
        await tx.insert(recipeInputs).values(normalizedInputs.map(i => ({ ...i, recipeId: id })))
      }
    })

    return this.getRecipe(id)
  }

  /** Delete a recipe (and its material lines, via cascade). */
  @Delete('{id}')
  @Security('jwt', ['recipes.manage'])
  @SuccessResponse('204', 'Deleted')
  public async deleteRecipe(@Path() id: number): Promise<void> {
    const [existing] = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.id, id))
      .limit(1)
    if (!existing) throw NotFound(`Recipe with ID ${id} not found`)

    await db.delete(recipes).where(eq(recipes.id, id))
    this.setStatus(204)
  }
}

// Exported for unit testing
export { validateInputs }
