import type { Currency } from '@kawakawa/types'
import { db, packages, packageInputs, fioCommodities } from '../db/index.js'
import { eq, and, inArray } from 'drizzle-orm'
import { calculateEffectivePrices, type EffectivePrice } from './price-calculator.js'
import { resolveVersionContext } from './price-version.js'
import { NotFound, BadRequest } from '../utils/errors.js'

export type PackageType = 'ship' | 'building'
export type PackagePricingMode = 'fixed' | 'margin'

export interface PackageLinePrice {
  commodityTicker: string
  commodityName: string | null
  quantity: number
  unitPrice: number | null // null if no price found for this ticker
  lineTotal: number | null // quantity * unitPrice, null if unitPrice is missing
  isFallback: boolean // true if unitPrice came from the version's default location
}

export interface PackagePriceBreakdown {
  packageId: number
  packageName: string
  type: PackageType
  priceListCode: string
  version: number
  locationId: string
  currency: Currency
  lines: PackageLinePrice[]
  materialCost: number // sum of lineTotal across lines that have a price
  missingPriceTickers: string[] // tickers with no effective price at this list/version/location
  salePrice: number | null // the package's own listed bundle price, if set
  saleCurrency: Currency | null
  currencyMismatch: boolean // true if salePrice's currency differs from the price list's currency
  margin: number | null // salePrice - materialCost; null if incomplete pricing or currency mismatch
  marginPercent: number | null // margin as a % of salePrice
  pricingMode: PackagePricingMode
  marginMultiplier: number | null // set when pricingMode = 'margin'; the multiplier salePrice was last computed from
}

interface PackageRow {
  id: number
  name: string
  type: PackageType
  salePrice: string | null
  currency: Currency | null
  pricingMode: PackagePricingMode
  marginMultiplier: string | null
}

interface PackageInputRow {
  commodityTicker: string
  commodityName: string | null
  quantity: number
}

function buildBreakdown(
  pkg: PackageRow,
  inputs: PackageInputRow[],
  priceMap: Map<string, EffectivePrice>,
  priceListCode: string,
  version: number,
  locationId: string,
  currency: Currency
): PackagePriceBreakdown {
  const lines: PackageLinePrice[] = []
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

  const salePrice = pkg.salePrice !== null ? parseFloat(pkg.salePrice) : null
  const saleCurrency = pkg.currency
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
    packageId: pkg.id,
    packageName: pkg.name,
    type: pkg.type,
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
    pricingMode: pkg.pricingMode,
    marginMultiplier: pkg.marginMultiplier !== null ? parseFloat(pkg.marginMultiplier) : null,
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
 * Compute the material-cost breakdown for a single package against a price
 * list/version/location, plus its margin vs. the package's own listed sale price.
 */
export async function calculatePackagePrice(
  packageId: number,
  priceListCode: string,
  locationId?: string,
  version?: number
): Promise<PackagePriceBreakdown> {
  const [pkg] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1)
  if (!pkg) {
    throw NotFound(`Package with ID ${packageId} not found`)
  }

  const inputs = await db
    .select({
      commodityTicker: packageInputs.commodityTicker,
      commodityName: fioCommodities.name,
      quantity: packageInputs.quantity,
    })
    .from(packageInputs)
    .leftJoin(fioCommodities, eq(packageInputs.commodityTicker, fioCommodities.ticker))
    .where(eq(packageInputs.packageId, packageId))
    .orderBy(packageInputs.commodityTicker)

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
    pkg,
    inputs,
    priceMap,
    priceListCode.toUpperCase(),
    context.version,
    resolvedLocationId,
    context.currency
  )
}

/**
 * Compute breakdowns for every active package (optionally filtered by type)
 * against a single price list/version/location. Fetches effective prices once
 * and reuses them across every package, regardless of how many there are.
 */
export async function calculateAllPackagePrices(
  priceListCode: string,
  locationId?: string,
  version?: number,
  type?: PackageType
): Promise<PackagePriceBreakdown[]> {
  const conditions = [eq(packages.isActive, true)]
  if (type) conditions.push(eq(packages.type, type))

  const packageRows = await db
    .select()
    .from(packages)
    .where(and(...conditions))
    .orderBy(packages.name)

  const context = await resolveContextOrThrow(priceListCode, version)
  const resolvedLocationId = locationId ?? context.defaultLocationId

  if (packageRows.length === 0) {
    return []
  }

  const packageIds = packageRows.map(r => r.id)
  const allInputs = await db
    .select({
      packageId: packageInputs.packageId,
      commodityTicker: packageInputs.commodityTicker,
      commodityName: fioCommodities.name,
      quantity: packageInputs.quantity,
    })
    .from(packageInputs)
    .leftJoin(fioCommodities, eq(packageInputs.commodityTicker, fioCommodities.ticker))
    .where(inArray(packageInputs.packageId, packageIds))
    .orderBy(packageInputs.commodityTicker)

  const effectivePrices = await calculateEffectivePrices(
    priceListCode,
    resolvedLocationId,
    context.currency,
    context.version
  )
  const priceMap = new Map(effectivePrices.map(p => [p.commodityTicker, p]))

  const inputsByPackage = new Map<number, PackageInputRow[]>()
  for (const input of allInputs) {
    const list = inputsByPackage.get(input.packageId) ?? []
    list.push(input)
    inputsByPackage.set(input.packageId, list)
  }

  return packageRows.map(pkg =>
    buildBreakdown(
      pkg,
      inputsByPackage.get(pkg.id) ?? [],
      priceMap,
      priceListCode.toUpperCase(),
      context.version,
      resolvedLocationId,
      context.currency
    )
  )
}
