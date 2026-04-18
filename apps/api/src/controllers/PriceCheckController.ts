import { Controller, Get, Path, Query, Route, Tags } from 'tsoa'
import { db, fioCommodities, fioLocations } from '../db/index.js'
import { eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { NotFound, BadRequest } from '../utils/errors.js'
import { resolveVersionContext } from '../services/price-version.js'
import { calculateEffectivePrice } from '../services/price-calculator.js'
import { apiNameFromLocalized, localizeMaterial } from '@kawakawa/types/materials'
import type { Currency } from '@kawakawa/types'

interface PriceCheckResult {
  /** Echo of the input `material` value so callers can match results back to inputs */
  query: string
  ticker: string | null
  /** API name (camelCase), e.g., 'drinkingWater' */
  name: string | null
  /** Localized display name, e.g., 'Drinking Water' (en-US only for now) */
  localizedName: string | null
  /** Final price after adjustments, in the price list's currency */
  price: number | null
  /** True if no price exists at the requested location and we used the version's default location */
  isFallback: boolean
  /** Set when the material couldn't be resolved or no price was found */
  error?: 'material_not_found' | 'price_not_found'
}

interface PriceCheckResponse {
  priceListCode: string
  version: number
  currency: Currency
  locationId: string
  locationName: string | null
  results: PriceCheckResult[]
}

/**
 * Lookup-friendly price API for external consumers (Tampermonkey, integrations, etc.).
 *
 * Materials may be referenced by ticker (`DW`), API name (`drinkingWater`), or
 * localized name (`Drinking Water`). Location may be omitted to use the price
 * list version's default location, or specified by natural ID (`BEN`) or
 * display name (`Etherwind`).
 *
 * Public — no authentication required.
 */
@Route('price-check')
@Tags('Pricing')
export class PriceCheckController extends Controller {
  /**
   * Look up effective prices for one or more materials at a location.
   *
   * Example: `/price-check/KAWA?material=DW&material=Drinking%20Water&material=rations`
   *
   * @param priceListCode The price list code (e.g., 'KAWA', 'CI1')
   * @param material Repeatable. Each value resolved as ticker, API name, or localized name.
   * @param location Optional. Natural ID or display name. Defaults to the version's default location.
   * @param version Optional. Specific version to query. Defaults to the current promoted version.
   */
  @Get('{priceListCode}')
  public async checkPrices(
    @Path() priceListCode: string,
    @Query() material: string[],
    @Query() location?: string,
    @Query() version?: number
  ): Promise<PriceCheckResponse> {
    if (!material || material.length === 0) {
      throw BadRequest('At least one `material` query parameter is required')
    }

    let context: { version: number; defaultLocationId: string; currency: Currency }
    try {
      context = await resolveVersionContext(priceListCode, version)
    } catch {
      throw NotFound(`Price list '${priceListCode.toUpperCase()}' not found`)
    }

    // Resolve location
    const resolvedLocation = await resolveLocation(location, context.defaultLocationId)
    if (!resolvedLocation) {
      throw BadRequest(`Location '${location}' not found`)
    }

    // Resolve every material in one batch query, then look up effective prices
    const resolved = await resolveMaterials(material)

    const results: PriceCheckResult[] = []
    for (const r of resolved) {
      if (!r.ticker) {
        results.push({
          query: r.query,
          ticker: null,
          name: null,
          localizedName: null,
          price: null,
          isFallback: false,
          error: 'material_not_found',
        })
        continue
      }

      // First try the requested location
      let effective = await calculateEffectivePrice(
        priceListCode,
        r.ticker,
        resolvedLocation.naturalId,
        context.currency,
        context.version
      )
      let isFallback = false

      // Fallback to the version's default location if different
      if (!effective && resolvedLocation.naturalId !== context.defaultLocationId) {
        effective = await calculateEffectivePrice(
          priceListCode,
          r.ticker,
          context.defaultLocationId,
          context.currency,
          context.version
        )
        if (effective) isFallback = true
      }

      results.push({
        query: r.query,
        ticker: r.ticker,
        name: r.name,
        localizedName: r.name ? localizeMaterial(r.name) : null,
        price: effective ? effective.finalPrice : null,
        isFallback,
        ...(effective ? {} : { error: 'price_not_found' as const }),
      })
    }

    return {
      priceListCode: priceListCode.toUpperCase(),
      version: context.version,
      currency: context.currency,
      locationId: resolvedLocation.naturalId,
      locationName: resolvedLocation.name,
      results,
    }
  }
}

/**
 * Resolve the location query: natural ID or display name (case-insensitive).
 * Falls back to the version's default location when no query is given.
 */
async function resolveLocation(
  query: string | undefined,
  defaultLocationId: string
): Promise<{ naturalId: string; name: string } | null> {
  if (!query || query.trim() === '') {
    const row = await db
      .select({ naturalId: fioLocations.naturalId, name: fioLocations.name })
      .from(fioLocations)
      .where(eq(fioLocations.naturalId, defaultLocationId))
      .limit(1)
    return row[0] ?? { naturalId: defaultLocationId, name: defaultLocationId }
  }

  const trimmed = query.trim()
  const row = await db
    .select({ naturalId: fioLocations.naturalId, name: fioLocations.name })
    .from(fioLocations)
    .where(or(ilike(fioLocations.naturalId, trimmed), ilike(fioLocations.name, trimmed)))
    .limit(1)

  return row[0] ?? null
}

/**
 * Resolve each material query string to a commodity row using:
 *   1) ticker (exact, uppercased)
 *   2) API name (case-insensitive, e.g., 'drinkingWater')
 *   3) localized name (e.g., 'Drinking Water') → reverse-mapped to API name
 *
 * Two batch queries: one for tickers, one for names (covers paths 2 & 3).
 */
async function resolveMaterials(
  queries: string[]
): Promise<{ query: string; ticker: string | null; name: string | null }[]> {
  // Step 1: try ticker lookup for everything (uppercase)
  const tickerCandidates = queries.map(q => q.trim().toUpperCase())
  const uniqueTickerCandidates = [...new Set(tickerCandidates)]

  const tickerRows =
    uniqueTickerCandidates.length > 0
      ? await db
          .select({ ticker: fioCommodities.ticker, name: fioCommodities.name })
          .from(fioCommodities)
          .where(inArray(fioCommodities.ticker, uniqueTickerCandidates))
      : []
  const byTicker = new Map(tickerRows.map(r => [r.ticker, r]))

  // Step 2: for queries that didn't match a ticker, try by name.
  // Convert localized → API name when applicable, then case-insensitive match.
  const nameQueries: { query: string; apiName: string }[] = []
  for (const q of queries) {
    const upper = q.trim().toUpperCase()
    if (byTicker.has(upper)) continue
    const apiName = apiNameFromLocalized(q.trim()) ?? q.trim()
    nameQueries.push({ query: q, apiName })
  }

  const uniqueApiNames = [...new Set(nameQueries.map(n => n.apiName.toLowerCase()))]
  const nameRows =
    uniqueApiNames.length > 0
      ? await db
          .select({ ticker: fioCommodities.ticker, name: fioCommodities.name })
          .from(fioCommodities)
          .where(inArray(sql`lower(${fioCommodities.name})`, uniqueApiNames))
      : []
  const byName = new Map(nameRows.map(r => [r.name.toLowerCase(), r]))

  // Step 3: build the result list preserving input order
  return queries.map(q => {
    const upper = q.trim().toUpperCase()
    const tickerHit = byTicker.get(upper)
    if (tickerHit) {
      return { query: q, ticker: tickerHit.ticker, name: tickerHit.name }
    }
    const apiName = (apiNameFromLocalized(q.trim()) ?? q.trim()).toLowerCase()
    const nameHit = byName.get(apiName)
    if (nameHit) {
      return { query: q, ticker: nameHit.ticker, name: nameHit.name }
    }
    return { query: q, ticker: null, name: null }
  })
}
