import type { Currency } from '@kawakawa/types'
import {
  db,
  prices,
  priceLists,
  priceListVersions,
  priceAdjustments,
  fioCommodities,
  fioLocations,
} from '../db/index.js'
import { eq, and, or, isNull, lte, gt, inArray } from 'drizzle-orm'
import { resolveVersionContext } from './price-version.js'

export type PriceSource = 'manual' | 'csv_import' | 'google_sheets' | 'fio_exchange'
export type AdjustmentType = 'percentage' | 'fixed'

export interface AppliedAdjustment {
  id: number
  description: string | null
  type: AdjustmentType
  value: number
  appliedAmount: number // Actual change in price units
}

export interface EffectivePrice {
  priceListCode: string
  version: number
  commodityTicker: string
  commodityName: string | null
  locationId: string
  locationName: string | null
  currency: Currency
  basePrice: number
  source: PriceSource
  sourceReference: string | null
  adjustments: AppliedAdjustment[]
  finalPrice: number
  // Backwards compatibility
  exchangeCode: string
  // Fallback information
  isFallback?: boolean // True if price came from default location
  requestedLocationId?: string // Original requested location (when isFallback is true)
}

/**
 * Calculate the effective price for a commodity at a specific price list and location
 * Applies all matching adjustments in priority order
 *
 * @param version - Optional version number. If omitted, uses the price list's currentVersion.
 */
export async function calculateEffectivePrice(
  exchange: string,
  ticker: string,
  locationId: string,
  currency: Currency,
  version?: number
): Promise<EffectivePrice | null> {
  const priceListCode = exchange.toUpperCase()
  const commodityTicker = ticker.toUpperCase()
  const location = locationId // Location IDs are case-sensitive (e.g., KW-020c)

  // Resolve version: if not provided, look up the price list's currentVersion
  let resolvedVersion = version
  if (resolvedVersion === undefined) {
    const plResult = await db
      .select({ currentVersion: priceLists.currentVersion })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)
    resolvedVersion = plResult[0]?.currentVersion ?? 1
  }

  // Get the base price from prices table, joined with priceLists for currency
  const basePriceResult = await db
    .select({
      priceListCode: prices.priceListCode,
      version: prices.version,
      commodityTicker: prices.commodityTicker,
      commodityName: fioCommodities.name,
      locationId: prices.locationId,
      locationName: fioLocations.name,
      price: prices.price,
      currency: priceLists.currency,
      source: prices.source,
      sourceReference: prices.sourceReference,
    })
    .from(prices)
    .innerJoin(priceLists, eq(prices.priceListCode, priceLists.code))
    .leftJoin(fioCommodities, eq(prices.commodityTicker, fioCommodities.ticker))
    .leftJoin(fioLocations, eq(prices.locationId, fioLocations.naturalId))
    .where(
      and(
        eq(prices.priceListCode, priceListCode),
        eq(prices.version, resolvedVersion),
        eq(prices.commodityTicker, commodityTicker),
        eq(prices.locationId, location),
        eq(priceLists.currency, currency)
      )
    )
    .limit(1)

  if (basePriceResult.length === 0) {
    return null
  }

  const baseRecord = basePriceResult[0]
  const basePrice = parseFloat(baseRecord.price)
  const now = new Date()

  // Get all matching adjustments
  // An adjustment matches if:
  // - priceListCode is NULL (applies to all) OR matches the specific price list
  // - commodityTicker is NULL (applies to all) OR matches the specific commodity
  // - locationId is NULL (applies to all) OR matches the specific location
  // - isActive is true
  // - effectiveFrom is NULL OR <= now
  // - effectiveUntil is NULL OR > now
  const adjustmentResults = await db
    .select({
      id: priceAdjustments.id,
      priceListCode: priceAdjustments.priceListCode,
      commodityTicker: priceAdjustments.commodityTicker,
      locationId: priceAdjustments.locationId,
      adjustmentType: priceAdjustments.adjustmentType,
      adjustmentValue: priceAdjustments.adjustmentValue,
      priority: priceAdjustments.priority,
      description: priceAdjustments.description,
    })
    .from(priceAdjustments)
    .where(
      and(
        // Match price list (NULL = wildcard)
        or(
          isNull(priceAdjustments.priceListCode),
          eq(priceAdjustments.priceListCode, priceListCode)
        ),
        // Match commodity (NULL = wildcard)
        or(
          isNull(priceAdjustments.commodityTicker),
          eq(priceAdjustments.commodityTicker, commodityTicker)
        ),
        // Match location (NULL = wildcard)
        or(isNull(priceAdjustments.locationId), eq(priceAdjustments.locationId, location)),
        // Must be active
        eq(priceAdjustments.isActive, true),
        // Must be in effective date range
        or(isNull(priceAdjustments.effectiveFrom), lte(priceAdjustments.effectiveFrom, now)),
        or(isNull(priceAdjustments.effectiveUntil), gt(priceAdjustments.effectiveUntil, now))
      )
    )
    .orderBy(priceAdjustments.priority, priceAdjustments.id)

  // Apply adjustments in priority order
  let currentPrice = basePrice
  const appliedAdjustments: AppliedAdjustment[] = []

  for (const adj of adjustmentResults) {
    const adjustmentValue = parseFloat(adj.adjustmentValue)
    let appliedAmount: number

    if (adj.adjustmentType === 'percentage') {
      // Percentage adjustment: price = price * (1 + value/100)
      appliedAmount = currentPrice * (adjustmentValue / 100)
      currentPrice = Math.round((currentPrice + appliedAmount) * 100) / 100
    } else {
      // Fixed adjustment: price = price + value
      appliedAmount = adjustmentValue
      currentPrice = currentPrice + appliedAmount
    }

    appliedAdjustments.push({
      id: adj.id,
      description: adj.description,
      type: adj.adjustmentType,
      value: adjustmentValue,
      appliedAmount: Math.round(appliedAmount * 100) / 100, // Round to 2 decimal places
    })
  }

  // Round final price to 2 decimal places
  const finalPrice = Math.round(currentPrice * 100) / 100

  return {
    priceListCode: baseRecord.priceListCode,
    version: baseRecord.version,
    commodityTicker: baseRecord.commodityTicker,
    commodityName: baseRecord.commodityName,
    locationId: baseRecord.locationId,
    locationName: baseRecord.locationName,
    currency: baseRecord.currency,
    basePrice,
    source: baseRecord.source,
    sourceReference: baseRecord.sourceReference,
    adjustments: appliedAdjustments,
    finalPrice,
    // Backwards compatibility
    exchangeCode: baseRecord.priceListCode,
  }
}

/**
 * Calculate effective price with fallback to the price list's default location
 * This is the recommended function to use when you want automatic fallback behavior
 *
 * Note: The currency parameter is ignored - we use the price list's currency instead.
 * This ensures dynamic pricing always works regardless of what currency was stored on the order.
 */
export async function calculateEffectivePriceWithFallback(
  priceListCode: string,
  ticker: string,
  locationId: string,
  _currency: Currency, // Ignored - we use the price list's currency
  version?: number
): Promise<EffectivePrice | null> {
  // Resolve version + the version's required default location + price list's currency
  let context: { version: number; defaultLocationId: string; currency: Currency }
  try {
    context = await resolveVersionContext(priceListCode, version)
  } catch {
    return null
  }

  // First try the requested location with the price list's currency
  let result = await calculateEffectivePrice(
    priceListCode,
    ticker,
    locationId,
    context.currency,
    context.version
  )

  if (result !== null) {
    return result
  }

  // Same location as default, no fallback possible
  if (context.defaultLocationId === locationId) {
    return null
  }

  // Try the default location with the price list's currency
  result = await calculateEffectivePrice(
    priceListCode,
    ticker,
    context.defaultLocationId,
    context.currency,
    context.version
  )

  // Mark result as fallback with the original requested location
  if (result) {
    return {
      ...result,
      isFallback: true,
      requestedLocationId: locationId,
    }
  }

  return null
}

/**
 * Calculate effective prices for all commodities at a specific price list and location
 *
 * @param version - Optional version number. If omitted, uses the price list's currentVersion.
 */
export async function calculateEffectivePrices(
  exchange: string,
  locationId: string,
  currency: Currency,
  version?: number
): Promise<EffectivePrice[]> {
  const priceListCode = exchange.toUpperCase()
  const location = locationId // Location IDs are case-sensitive (e.g., KW-020c)

  // Resolve version: if not provided, look up the price list's currentVersion
  let resolvedVersion = version
  if (resolvedVersion === undefined) {
    const plResult = await db
      .select({ currentVersion: priceLists.currentVersion })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)
    resolvedVersion = plResult[0]?.currentVersion ?? 1
  }

  // Get all base prices for this price list/version/location/currency
  const basePriceResults = await db
    .select({
      priceListCode: prices.priceListCode,
      version: prices.version,
      commodityTicker: prices.commodityTicker,
      commodityName: fioCommodities.name,
      locationId: prices.locationId,
      locationName: fioLocations.name,
      price: prices.price,
      currency: priceLists.currency,
      source: prices.source,
      sourceReference: prices.sourceReference,
    })
    .from(prices)
    .innerJoin(priceLists, eq(prices.priceListCode, priceLists.code))
    .leftJoin(fioCommodities, eq(prices.commodityTicker, fioCommodities.ticker))
    .leftJoin(fioLocations, eq(prices.locationId, fioLocations.naturalId))
    .where(
      and(
        eq(prices.priceListCode, priceListCode),
        eq(prices.version, resolvedVersion),
        eq(prices.locationId, location),
        eq(priceLists.currency, currency)
      )
    )
    .orderBy(prices.commodityTicker)

  // For efficiency, get all potentially matching adjustments once
  const now = new Date()
  const allAdjustments = await db
    .select({
      id: priceAdjustments.id,
      priceListCode: priceAdjustments.priceListCode,
      commodityTicker: priceAdjustments.commodityTicker,
      locationId: priceAdjustments.locationId,
      adjustmentType: priceAdjustments.adjustmentType,
      adjustmentValue: priceAdjustments.adjustmentValue,
      priority: priceAdjustments.priority,
      description: priceAdjustments.description,
    })
    .from(priceAdjustments)
    .where(
      and(
        // Must match price list or be global
        or(
          isNull(priceAdjustments.priceListCode),
          eq(priceAdjustments.priceListCode, priceListCode)
        ),
        // Must match location or be global
        or(isNull(priceAdjustments.locationId), eq(priceAdjustments.locationId, location)),
        // Must be active
        eq(priceAdjustments.isActive, true),
        // Must be in effective date range
        or(isNull(priceAdjustments.effectiveFrom), lte(priceAdjustments.effectiveFrom, now)),
        or(isNull(priceAdjustments.effectiveUntil), gt(priceAdjustments.effectiveUntil, now))
      )
    )
    .orderBy(priceAdjustments.priority, priceAdjustments.id)

  // Process each base price
  const results: EffectivePrice[] = []

  for (const baseRecord of basePriceResults) {
    const basePrice = parseFloat(baseRecord.price)

    // Filter adjustments that apply to this specific commodity
    const applicableAdjustments = allAdjustments.filter(
      adj => adj.commodityTicker === null || adj.commodityTicker === baseRecord.commodityTicker
    )

    // Apply adjustments
    let currentPrice = basePrice
    const appliedAdjustments: AppliedAdjustment[] = []

    for (const adj of applicableAdjustments) {
      const adjustmentValue = parseFloat(adj.adjustmentValue)
      let appliedAmount: number

      if (adj.adjustmentType === 'percentage') {
        appliedAmount = currentPrice * (adjustmentValue / 100)
        currentPrice = Math.round((currentPrice + appliedAmount) * 100) / 100
      } else {
        appliedAmount = adjustmentValue
        currentPrice = currentPrice + appliedAmount
      }

      appliedAdjustments.push({
        id: adj.id,
        description: adj.description,
        type: adj.adjustmentType,
        value: adjustmentValue,
        appliedAmount: Math.round(appliedAmount * 100) / 100,
      })
    }

    const finalPrice = Math.round(currentPrice * 100) / 100

    results.push({
      priceListCode: baseRecord.priceListCode,
      version: baseRecord.version,
      commodityTicker: baseRecord.commodityTicker,
      commodityName: baseRecord.commodityName,
      locationId: baseRecord.locationId,
      locationName: baseRecord.locationName,
      currency: baseRecord.currency,
      basePrice,
      source: baseRecord.source,
      sourceReference: baseRecord.sourceReference,
      adjustments: appliedAdjustments,
      finalPrice,
      // Backwards compatibility
      exchangeCode: baseRecord.priceListCode,
    })
  }

  return results
}

/**
 * Request for batch price calculation
 */
export interface PriceRequest {
  priceListCode: string
  ticker: string
  locationId: string
  currency: Currency // Ignored - we use the price list's currency
}

/**
 * Apply adjustments to a base price, returning the final price and applied adjustments.
 * Shared logic extracted from calculateEffectivePrice and batch function.
 */
function applyAdjustments(
  basePrice: number,
  adjustments: {
    id: number
    adjustmentType: AdjustmentType
    adjustmentValue: string
    description: string | null
  }[]
): { finalPrice: number; appliedAdjustments: AppliedAdjustment[] } {
  let currentPrice = basePrice
  const appliedAdjustments: AppliedAdjustment[] = []

  for (const adj of adjustments) {
    const adjustmentValue = parseFloat(adj.adjustmentValue)
    let appliedAmount: number

    if (adj.adjustmentType === 'percentage') {
      appliedAmount = currentPrice * (adjustmentValue / 100)
      currentPrice = Math.round((currentPrice + appliedAmount) * 100) / 100
    } else {
      appliedAmount = adjustmentValue
      currentPrice = currentPrice + appliedAmount
    }

    appliedAdjustments.push({
      id: adj.id,
      description: adj.description,
      type: adj.adjustmentType,
      value: adjustmentValue,
      appliedAmount: Math.round(appliedAmount * 100) / 100,
    })
  }

  return {
    finalPrice: Math.round(currentPrice * 100) / 100,
    appliedAdjustments,
  }
}

/**
 * Batch calculate effective prices with fallback for multiple orders.
 * Uses only 3 DB queries regardless of the number of requests (vs 3-5 per request).
 *
 * Returns a Map keyed by "PRICELIST:TICKER:LOCATION" (using the original requested location).
 */
export async function calculateEffectivePriceBatch(
  requests: PriceRequest[]
): Promise<Map<string, EffectivePrice | null>> {
  const result = new Map<string, EffectivePrice | null>()

  if (requests.length === 0) {
    return result
  }

  // Normalize requests
  const normalized = requests.map(r => ({
    priceListCode: r.priceListCode.toUpperCase(),
    ticker: r.ticker.toUpperCase(),
    locationId: r.locationId,
  }))

  // Query 1: Fetch all needed price lists joined with their current version's default location
  const uniqueCodes = [...new Set(normalized.map(r => r.priceListCode))]
  const priceListRows = await db
    .select({
      code: priceLists.code,
      currency: priceLists.currency,
      defaultLocationId: priceListVersions.defaultLocationId,
      currentVersion: priceLists.currentVersion,
    })
    .from(priceLists)
    .innerJoin(
      priceListVersions,
      and(
        eq(priceListVersions.priceListCode, priceLists.code),
        eq(priceListVersions.version, priceLists.currentVersion)
      )
    )
    .where(inArray(priceLists.code, uniqueCodes))

  const priceListMap = new Map(
    priceListRows.map(r => [
      r.code,
      {
        currency: r.currency,
        defaultLocationId: r.defaultLocationId,
        currentVersion: r.currentVersion,
      },
    ])
  )

  // Build the full set of (code, ticker, location) tuples including fallback locations
  const allTuples = new Set<string>()
  for (const req of normalized) {
    allTuples.add(`${req.priceListCode}:${req.ticker}:${req.locationId}`)
    const pl = priceListMap.get(req.priceListCode)
    if (pl && pl.defaultLocationId !== req.locationId) {
      allTuples.add(`${req.priceListCode}:${req.ticker}:${pl.defaultLocationId}`)
    }
  }

  // Collect unique values for each column for the WHERE clause
  const allPriceListCodes = [...new Set([...allTuples].map(t => t.split(':')[0]))]
  const allTickers = [...new Set([...allTuples].map(t => t.split(':')[1]))]
  const allLocationIds = [...new Set([...allTuples].map(t => t.split(':').slice(2).join(':')))]

  // Build version filter conditions — each price list uses its own currentVersion
  const versionConditions = uniqueCodes.map(code => {
    const pl = priceListMap.get(code)
    const ver = pl?.currentVersion ?? 1
    return and(eq(prices.priceListCode, code), eq(prices.version, ver))
  })

  // Query 2: Fetch all base prices in one query, filtered by each price list's current version
  const basePriceRows = await db
    .select({
      priceListCode: prices.priceListCode,
      version: prices.version,
      commodityTicker: prices.commodityTicker,
      commodityName: fioCommodities.name,
      locationId: prices.locationId,
      locationName: fioLocations.name,
      price: prices.price,
      currency: priceLists.currency,
      source: prices.source,
      sourceReference: prices.sourceReference,
    })
    .from(prices)
    .innerJoin(priceLists, eq(prices.priceListCode, priceLists.code))
    .leftJoin(fioCommodities, eq(prices.commodityTicker, fioCommodities.ticker))
    .leftJoin(fioLocations, eq(prices.locationId, fioLocations.naturalId))
    .where(
      and(
        or(...versionConditions),
        inArray(prices.commodityTicker, allTickers),
        inArray(prices.locationId, allLocationIds)
      )
    )

  // Index base prices by tuple key, filtering to only tuples we actually need
  const basePriceMap = new Map<string, (typeof basePriceRows)[number]>()
  for (const row of basePriceRows) {
    const key = `${row.priceListCode}:${row.commodityTicker}:${row.locationId}`
    if (allTuples.has(key)) {
      basePriceMap.set(key, row)
    }
  }

  // Query 3: Fetch all potentially matching adjustments in one query
  const now = new Date()
  const allAdjustments = await db
    .select({
      id: priceAdjustments.id,
      priceListCode: priceAdjustments.priceListCode,
      commodityTicker: priceAdjustments.commodityTicker,
      locationId: priceAdjustments.locationId,
      adjustmentType: priceAdjustments.adjustmentType,
      adjustmentValue: priceAdjustments.adjustmentValue,
      priority: priceAdjustments.priority,
      description: priceAdjustments.description,
    })
    .from(priceAdjustments)
    .where(
      and(
        or(
          isNull(priceAdjustments.priceListCode),
          inArray(priceAdjustments.priceListCode, allPriceListCodes)
        ),
        or(
          isNull(priceAdjustments.commodityTicker),
          inArray(priceAdjustments.commodityTicker, allTickers)
        ),
        or(
          isNull(priceAdjustments.locationId),
          inArray(priceAdjustments.locationId, allLocationIds)
        ),
        eq(priceAdjustments.isActive, true),
        or(isNull(priceAdjustments.effectiveFrom), lte(priceAdjustments.effectiveFrom, now)),
        or(isNull(priceAdjustments.effectiveUntil), gt(priceAdjustments.effectiveUntil, now))
      )
    )
    .orderBy(priceAdjustments.priority, priceAdjustments.id)

  // Compute results for each unique request
  for (const req of normalized) {
    const requestKey = `${req.priceListCode}:${req.ticker}:${req.locationId}`
    if (result.has(requestKey)) continue // Already computed (dedup)

    const pl = priceListMap.get(req.priceListCode)
    if (!pl) {
      result.set(requestKey, null)
      continue
    }

    // Try primary location, then fallback
    let baseRecord = basePriceMap.get(requestKey)
    let isFallback = false

    if (!baseRecord && pl.defaultLocationId !== req.locationId) {
      const fallbackKey = `${req.priceListCode}:${req.ticker}:${pl.defaultLocationId}`
      baseRecord = basePriceMap.get(fallbackKey)
      if (baseRecord) isFallback = true
    }

    if (!baseRecord) {
      result.set(requestKey, null)
      continue
    }

    // Filter adjustments matching this specific (priceList, ticker, resolvedLocation)
    const resolvedLocation = baseRecord.locationId
    const matchingAdjustments = allAdjustments.filter(
      adj =>
        (adj.priceListCode === null || adj.priceListCode === req.priceListCode) &&
        (adj.commodityTicker === null || adj.commodityTicker === req.ticker) &&
        (adj.locationId === null || adj.locationId === resolvedLocation)
    )

    const basePrice = parseFloat(baseRecord.price)
    const { finalPrice, appliedAdjustments } = applyAdjustments(basePrice, matchingAdjustments)

    const effectivePrice: EffectivePrice = {
      priceListCode: baseRecord.priceListCode,
      version: baseRecord.version,
      commodityTicker: baseRecord.commodityTicker,
      commodityName: baseRecord.commodityName,
      locationId: baseRecord.locationId,
      locationName: baseRecord.locationName,
      currency: baseRecord.currency,
      basePrice,
      source: baseRecord.source,
      sourceReference: baseRecord.sourceReference,
      adjustments: appliedAdjustments,
      finalPrice,
      exchangeCode: baseRecord.priceListCode,
      ...(isFallback ? { isFallback: true, requestedLocationId: req.locationId } : {}),
    }

    result.set(requestKey, effectivePrice)
  }

  return result
}
