/**
 * Resolve a Corp Overview ticker scope (mixed bare tickers + live category refs)
 * into the flat set of tickers that should pass the view's filter at render time.
 *
 * Entry conventions:
 *   - `"RAT"`               — a bare ticker, included as-is.
 *   - `"category:Foo"`      — a live category reference, expanded to whatever
 *                             commodities currently belong to that category.
 *
 * Returning `null` means "no filter — every ticker is in scope" (the empty-
 * scope sentinel used by views and graph cards alike).
 */

import type { Commodity } from '../types'
import type { SearchChip } from '../components/TokenSearchInput.vue'

const CATEGORY_PREFIX = 'category:'

/** Build a tag chip-style classification of an entry without parsing twice. */
export interface ParsedScopeEntry {
  raw: string
  kind: 'ticker' | 'category'
  /** For tickers: the ticker symbol (uppercased). For categories: the bare name. */
  value: string
}

export function parseScopeEntry(raw: string): ParsedScopeEntry {
  // Case-insensitive on the prefix because the server normalizes stored
  // tickers to uppercase, which turns `category:Foo` into `CATEGORY:FOO`.
  if (raw.toLowerCase().startsWith(CATEGORY_PREFIX)) {
    return { raw, kind: 'category', value: raw.slice(CATEGORY_PREFIX.length) }
  }
  return { raw, kind: 'ticker', value: raw.toUpperCase() }
}

export function makeCategoryEntry(category: string): string {
  return `${CATEGORY_PREFIX}${category}`
}

/**
 * Convert BR's raw scope entries (`string[]`) into the SearchChip array shape
 * that TokenSearchInput expects. Existing entries pass through their original
 * conventions: bare uppercase tickers become `commodity` chips, `category:Foo`
 * becomes a `category` chip. The `tickerDisplay` argument lets the caller
 * inject the user's commodity-display preference (ticker / name / both).
 */
export function scopeEntriesToChips(
  entries: string[],
  tickerDisplay: (ticker: string) => string
): SearchChip[] {
  return entries.map(raw => {
    const parsed = parseScopeEntry(raw)
    if (parsed.kind === 'category') {
      return { type: 'category', value: parsed.value, display: parsed.value }
    }
    return { type: 'commodity', value: parsed.value, display: tickerDisplay(parsed.value) }
  })
}

/**
 * Inverse of {@link scopeEntriesToChips} — when TokenSearchInput emits its
 * `update:chips`, BR consumers convert back to the raw `string[]` model so
 * downstream code (resolveTickerScope, view persistence, etc.) keeps working
 * unchanged. Non-ticker / non-category chips are dropped, since BR surfaces
 * are configured to only allow those two types in the first place.
 */
export function chipsToScopeEntries(chips: SearchChip[]): string[] {
  const out: string[] = []
  for (const chip of chips) {
    if (chip.type === 'category') {
      out.push(makeCategoryEntry(chip.value))
    } else if (chip.type === 'commodity') {
      out.push(chip.value)
    }
  }
  return out
}

/**
 * Expand a scope into the resolved ticker set, or null if the scope is empty
 * (== no filter). Categories are looked up against the supplied commodity
 * list — pass the latest snapshot so category membership stays live.
 *
 * If the scope contains category refs but the commodity catalog hasn't loaded
 * yet (empty array), we return null rather than an empty Set. Returning empty
 * would filter every material out during catalog hydration; null defers the
 * filter until we can actually resolve the categories. Once the catalog
 * arrives, the computed re-evaluates and the filter applies.
 */
export function resolveTickerScope(scope: string[], commodities: Commodity[]): Set<string> | null {
  if (!scope || scope.length === 0) return null

  const hasCategoryRef = scope.some(e => e.startsWith(CATEGORY_PREFIX))
  if (hasCategoryRef && commodities.length === 0) return null

  const tickersByCategory = indexCommoditiesByCategory(commodities)
  const out = new Set<string>()
  for (const raw of scope) {
    const parsed = parseScopeEntry(raw)
    if (parsed.kind === 'ticker') {
      out.add(parsed.value)
    } else {
      const tickers = tickersByCategory.get(parsed.value.toLowerCase())
      if (tickers) for (const t of tickers) out.add(t)
    }
  }
  return out
}

function indexCommoditiesByCategory(commodities: Commodity[]): Map<string, string[]> {
  // Lowercase keys so category lookups stay case-insensitive — guards against
  // any future drift between the picker's display (raw category string) and
  // the resolver's match.
  const map = new Map<string, string[]>()
  for (const c of commodities) {
    if (!c.category) continue
    const key = c.category.toLowerCase()
    const arr = map.get(key) ?? []
    arr.push(c.ticker)
    map.set(key, arr)
  }
  return map
}
