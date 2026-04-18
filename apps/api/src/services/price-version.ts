import { db, prices, priceLists, priceListVersions } from '../db/index.js'
import { eq, and, sql } from 'drizzle-orm'
import type { Currency } from '@kawakawa/types'

/**
 * Resolve a version parameter to a concrete version number for a price list.
 *
 * - undefined → uses priceLists.currentVersion
 * - number → uses that version directly
 * - 'latest' → max(prices.version) for the price list, falls back to currentVersion
 */
export async function resolveVersion(
  priceListCode: string,
  versionParam?: number | 'latest'
): Promise<number> {
  if (typeof versionParam === 'number') return versionParam

  const priceList = await db
    .select({ currentVersion: priceLists.currentVersion })
    .from(priceLists)
    .where(eq(priceLists.code, priceListCode.toUpperCase()))
    .limit(1)

  const currentVersion = priceList[0]?.currentVersion ?? 1

  if (versionParam === 'latest') {
    const result = await db
      .select({ maxVersion: sql<number>`max(${prices.version})` })
      .from(prices)
      .where(eq(prices.priceListCode, priceListCode.toUpperCase()))

    return result[0]?.maxVersion ?? currentVersion
  }

  return currentVersion
}

/**
 * Resolve a version parameter to a full version context: version number,
 * the version's required default location, and the price list's currency.
 *
 * Throws if the price list or the resolved version doesn't exist.
 */
export async function resolveVersionContext(
  priceListCode: string,
  versionParam?: number | 'latest'
): Promise<{ version: number; defaultLocationId: string; currency: Currency }> {
  const code = priceListCode.toUpperCase()
  const version = await resolveVersion(code, versionParam)

  const rows = await db
    .select({
      currency: priceLists.currency,
      defaultLocationId: priceListVersions.defaultLocationId,
    })
    .from(priceLists)
    .innerJoin(
      priceListVersions,
      and(
        eq(priceListVersions.priceListCode, priceLists.code),
        eq(priceListVersions.version, version)
      )
    )
    .where(eq(priceLists.code, code))
    .limit(1)

  if (rows.length === 0) {
    throw new Error(`Price list '${code}' version ${version} not found`)
  }

  return {
    version,
    defaultLocationId: rows[0].defaultLocationId,
    currency: rows[0].currency as Currency,
  }
}
