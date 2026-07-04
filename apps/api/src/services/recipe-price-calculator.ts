import type { Currency } from '@kawakawa/types'
import { db, recipes, recipeInputs, fioCommodities } from '../db/index.js'
import { eq, and, inArray } from 'drizzle-orm'
import { calculateEffectivePrices, type EffectivePrice } from './price-calculator.js'
import { resolveVersionContext } from './price-version.js'
import { NotFound, BadRequest } from '../utils/errors.js'

export type RecipeType = 'ship' | 'building'

export interface RecipeLinePrice {
  commodityTicker: string
  commodityName: string | null
  quantity: number
  unitPrice: number | null // null if no price found for this ticker
  lineTotal: number | null // quantity * unitPrice, null if unitPrice is missing
  isFallback: boolean // true if unitPrice came from the version's default location
}

export interface RecipePriceBreakdown {
  recipeId: number
  recipeName: string
  type: RecipeType
  priceListCode: string
  version: number
  locationId: string
  currency: Currency
  lines: RecipeLinePrice[]
  materialCost: number // sum of lineTotal across lines that have a price
  missingPriceTickers: string[] // tickers with no effective price at this list/version/location
  salePrice: number | null // the recipe's own listed bundle price, if set
  saleCurrency: Currency | null
  currencyMismatch: boolean // true if salePrice's currency differs from the price list's currency
  margin: number | null // salePrice - materialCost; null if incomplete pricing or currency mismatch
  marginPercent: number | null // margin as a % of salePrice
}

interface RecipeRow {
  id: number
  name: string
  type: RecipeType
  salePrice: string | null
  currency: Currency | null
}

interface RecipeInputRow {
  commodityTicker: string
  commodityName: string | null
  quantity: number
}

function buildBreakdown(
  recipe: RecipeRow,
  inputs: RecipeInputRow[],
  priceMap: Map<string, EffectivePrice>,
  priceListCode: string,
  version: number,
  locationId: string,
  currency: Currency
): RecipePriceBreakdown {
  const lines: RecipeLinePrice[] = []
  const missingPriceTickers: string[] = []
  let materialCost = 0

  for (const input of inputs) {
    const effective = priceMap.get(input.commodityTicker)
    const unitPrice = effective ? effective.finalPrice : null
    const lineTotal = unitPrice !== null ? Math.round(unitPrice * input.quantity * 100) / 100 : null

    if (unitPrice === null) {
      missingPriceTickers.push(input.commodityTicker)
    } else {
      materialCost += lineTotal as number
    }

    lines.push({
      commodityTicker: input.commodityTicker,
      commodityName: input.commodityName,
      quantity: input.quantity,
      unitPrice,
      lineTotal,
      isFallback: effective?.isFallback ?? false,
    })
  }

  materialCost = Math.round(materialCost * 100) / 100

  const salePrice = recipe.salePrice !== null ? parseFloat(recipe.salePrice) : null
  const saleCurrency = recipe.currency
  const currencyMismatch = salePrice !== null && saleCurrency !== null && saleCurrency !== currency
  const hasCompletePricing = missingPriceTickers.length === 0

  const margin =
    salePrice !== null && hasCompletePricing && !currencyMismatch
      ? Math.round((salePrice - materialCost) * 100) / 100
      : null
  const marginPercent =
    margin !== null && salePrice !== null && salePrice !== 0
      ? Math.round((margin / salePrice) * 10000) / 100
      : null

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    type: recipe.type,
    priceListCode,
    version,
    locationId,
    currency,
    lines,
    materialCost,
    missingPriceTickers,
    salePrice,
    saleCurrency,
    currencyMismatch,
    margin,
    marginPercent,
  }
}

/**
 * Resolve price-list/version/location context, throwing a client-friendly
 * BadRequest instead of resolveVersionContext's generic Error.
 */
async function resolveContextOrThrow(priceListCode: string, version?: number) {
  try {
    return await resolveVersionContext(priceListCode, version)
  } catch (err) {
    throw BadRequest(err instanceof Error ? err.message : 'Invalid price list or version')
  }
}

/**
 * Compute the material-cost breakdown for a single recipe against a price
 * list/version/location, plus its margin vs. the recipe's own listed sale price.
 */
export async function calculateRecipePrice(
  recipeId: number,
  priceListCode: string,
  locationId?: string,
  version?: number
): Promise<RecipePriceBreakdown> {
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId)).limit(1)
  if (!recipe) {
    throw NotFound(`Recipe with ID ${recipeId} not found`)
  }

  const inputs = await db
    .select({
      commodityTicker: recipeInputs.commodityTicker,
      commodityName: fioCommodities.name,
      quantity: recipeInputs.quantity,
    })
    .from(recipeInputs)
    .leftJoin(fioCommodities, eq(recipeInputs.commodityTicker, fioCommodities.ticker))
    .where(eq(recipeInputs.recipeId, recipeId))
    .orderBy(recipeInputs.commodityTicker)

  const context = await resolveContextOrThrow(priceListCode, version)
  const resolvedLocationId = locationId ?? context.defaultLocationId

  const effectivePrices = await calculateEffectivePrices(
    priceListCode,
    resolvedLocationId,
    context.currency,
    context.version
  )
  const priceMap = new Map(effectivePrices.map(p => [p.commodityTicker, p]))

  return buildBreakdown(
    recipe,
    inputs,
    priceMap,
    priceListCode.toUpperCase(),
    context.version,
    resolvedLocationId,
    context.currency
  )
}

/**
 * Compute breakdowns for every active recipe (optionally filtered by type)
 * against a single price list/version/location. Fetches effective prices once
 * and reuses them across every recipe, regardless of how many there are.
 */
export async function calculateAllRecipePrices(
  priceListCode: string,
  locationId?: string,
  version?: number,
  type?: RecipeType
): Promise<RecipePriceBreakdown[]> {
  const conditions = [eq(recipes.isActive, true)]
  if (type) conditions.push(eq(recipes.type, type))

  const recipeRows = await db
    .select()
    .from(recipes)
    .where(and(...conditions))
    .orderBy(recipes.name)

  const context = await resolveContextOrThrow(priceListCode, version)
  const resolvedLocationId = locationId ?? context.defaultLocationId

  if (recipeRows.length === 0) {
    return []
  }

  const recipeIds = recipeRows.map(r => r.id)
  const allInputs = await db
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

  const effectivePrices = await calculateEffectivePrices(
    priceListCode,
    resolvedLocationId,
    context.currency,
    context.version
  )
  const priceMap = new Map(effectivePrices.map(p => [p.commodityTicker, p]))

  const inputsByRecipe = new Map<number, RecipeInputRow[]>()
  for (const input of allInputs) {
    const list = inputsByRecipe.get(input.recipeId) ?? []
    list.push(input)
    inputsByRecipe.set(input.recipeId, list)
  }

  return recipeRows.map(recipe =>
    buildBreakdown(
      recipe,
      inputsByRecipe.get(recipe.id) ?? [],
      priceMap,
      priceListCode.toUpperCase(),
      context.version,
      resolvedLocationId,
      context.currency
    )
  )
}
