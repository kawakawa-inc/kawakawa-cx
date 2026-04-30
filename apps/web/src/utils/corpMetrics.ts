/**
 * Corp Overview metric computation + formatting.
 *
 * Pure functions so the dashboard and the card editor's live preview can share
 * them. All derived values (gap, netDaily, daysRemaining, daysListed, etc.)
 * flow from two inputs only: the `/burn-repair/corp` response and the
 * user-configured `repairDays`. No global refs, no Pinia.
 */

import type {
  BurnRepairCorpMaterial,
  BurnRepairCorpPerUserRow,
  BurnRepairCorpResponse,
  CorpMetricFormat,
  MetricKey,
  ViewCardFilter,
  ViewCardSort,
} from '@kawakawa/types'

/** One row per ticker (aggregated across all included users). */
export interface TickerRow {
  commodityTicker: string
  burnDaily: number
  inputsDaily: number
  repairTotal: number
  repairPerDay: number
  productionDaily: number
  consumptionDaily: number
  netDailyNoRepair: number
  netDaily: number
  gap: number
  inputGap: number
  /** Corp-wide on-hand inventory across every active member's storages. */
  stock: number
  /** Sum of remaining sell-order quantities (FIO-aware). */
  listedStock: number
  /** null when there is no deficit (production covers consumption). */
  daysRemaining: number | null
  /**
   * `listedStock / consumptionDaily` — how many days of consumption the corp
   * currently has listed for sale. Null when consumption is zero (the metric
   * has no meaning without a denominator).
   */
  daysListed: number | null
}

/** One row per (user, ticker). */
export interface UserTickerRow {
  userId: number
  username: string
  commodityTicker: string
  /** ISO timestamp of the user's oldest FIO upload; null if they've never uploaded. */
  fioDataAge: string | null
  burnDaily: number
  inputsDaily: number
  repairTotal: number
  repairPerDay: number
  productionDaily: number
  consumptionDaily: number
  netDailyNoRepair: number
  netDaily: number
  gap: number
  inputGap: number
}

export type MetricRow = TickerRow | UserTickerRow

function repairPerDayFrom(repairTotal: number, repairDays: number): number {
  return repairDays > 0 ? repairTotal / repairDays : repairTotal
}

function buildTickerRow(
  m: BurnRepairCorpMaterial,
  stock: number,
  listedStock: number,
  repairDays: number
): TickerRow {
  const repairPerDay = repairPerDayFrom(m.repairTotal, repairDays)
  const consumptionDaily = m.burnDaily + m.inputsDaily
  const netDailyNoRepair = m.productionDaily - consumptionDaily
  const netDaily = netDailyNoRepair - repairPerDay
  const gap = consumptionDaily - m.productionDaily
  const daysRemaining = gap > 0 ? (stock > 0 ? stock / gap : 0) : null
  // daysListed: how long the corp's currently-listed stock would cover
  // consumption. Uses listedStock (sell-order remaining qty), not on-hand —
  // pairs with `daysRemaining` so users can see "how long until we run out"
  // alongside "how much of that demand is already on the market."
  const daysListed = consumptionDaily > 0 ? listedStock / consumptionDaily : null

  return {
    commodityTicker: m.commodityTicker,
    burnDaily: m.burnDaily,
    inputsDaily: m.inputsDaily,
    repairTotal: m.repairTotal,
    repairPerDay,
    productionDaily: m.productionDaily,
    consumptionDaily,
    netDailyNoRepair,
    netDaily,
    gap,
    inputGap: gap,
    stock,
    listedStock,
    daysRemaining,
    daysListed,
  }
}

function buildUserTickerRow(r: BurnRepairCorpPerUserRow, repairDays: number): UserTickerRow {
  const repairPerDay = repairPerDayFrom(r.repairTotal, repairDays)
  const consumptionDaily = r.burnDaily + r.inputsDaily
  const netDailyNoRepair = r.productionDaily - consumptionDaily
  const netDaily = netDailyNoRepair - repairPerDay
  const gap = consumptionDaily - r.productionDaily

  return {
    userId: r.userId,
    username: r.username,
    commodityTicker: r.commodityTicker,
    fioDataAge: r.fioDataAge,
    burnDaily: r.burnDaily,
    inputsDaily: r.inputsDaily,
    repairTotal: r.repairTotal,
    repairPerDay,
    productionDaily: r.productionDaily,
    consumptionDaily,
    netDailyNoRepair,
    netDaily,
    gap,
    inputGap: gap,
  }
}

/**
 * Compute per-ticker rows from a corp response.
 *
 * `tickerSet` is optional — pass null to keep all tickers in the response.
 */
export function computeTickerRows(
  corp: BurnRepairCorpResponse,
  tickerSet: Set<string> | null,
  repairDays: number
): TickerRow[] {
  const surplus = corp.availableSurplus ?? {}
  const listed = corp.listedStock ?? {}
  const rows: TickerRow[] = []
  for (const m of corp.materials) {
    if (tickerSet && !tickerSet.has(m.commodityTicker)) continue
    rows.push(
      buildTickerRow(m, surplus[m.commodityTicker] ?? 0, listed[m.commodityTicker] ?? 0, repairDays)
    )
  }
  return rows
}

/**
 * Compute per-(user, ticker) rows from a corp response.
 */
export function computeUserTickerRows(
  corp: BurnRepairCorpResponse,
  tickerSet: Set<string> | null,
  repairDays: number
): UserTickerRow[] {
  const rows: UserTickerRow[] = []
  for (const r of corp.perUser) {
    if (tickerSet && !tickerSet.has(r.commodityTicker)) continue
    rows.push(buildUserTickerRow(r, repairDays))
  }
  return rows
}

/**
 * Read a metric value from a row.
 *
 * Returns a number for numeric metrics, a string for `username`, and
 * null for `daysRemaining` / `daysListed` when undefined. The caller decides
 * how each shape renders — see `formatMetric`.
 */
export function getMetricValue(row: MetricRow, key: MetricKey): number | string | null {
  switch (key) {
    case 'username':
      return 'username' in row ? row.username : ''
    case 'daysRemaining':
      return 'daysRemaining' in row ? row.daysRemaining : null
    case 'daysListed':
      return 'daysListed' in row ? row.daysListed : null
    case 'stock':
      return 'stock' in row ? row.stock : 0
    case 'listedStock':
      return 'listedStock' in row ? row.listedStock : 0
    case 'burnDaily':
      return row.burnDaily
    case 'inputsDaily':
      return row.inputsDaily
    case 'repairTotal':
      return row.repairTotal
    case 'repairPerDay':
      return row.repairPerDay
    case 'productionDaily':
      return row.productionDaily
    case 'consumptionDaily':
      return row.consumptionDaily
    case 'netDailyNoRepair':
      return row.netDailyNoRepair
    case 'netDaily':
      return row.netDaily
    case 'gap':
      return row.gap
    case 'inputGap':
      return row.inputGap
  }
}

/**
 * Format a metric value according to its declared format.
 */
export function formatMetric(
  value: number | string | null | undefined,
  format: CorpMetricFormat
): string {
  if (value === null || value === undefined) return '—'
  if (format === 'text') return String(value)

  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'

  if (format === 'int') {
    if (n === 0) return '-'
    return Math.round(n).toLocaleString()
  }
  if (format === 'decimal') {
    if (n === 0) return '-'
    return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2)
  }
  if (format === 'days') {
    if (!Number.isFinite(n)) return '—'
    return n % 1 === 0 ? n.toLocaleString() : n.toFixed(1)
  }
  return String(value)
}

/**
 * Apply one filter clause to a row's metric value. Nullish metric values fail
 * every comparison — there's no meaningful numeric comparison against "no
 * data", and falling silent matches user expectations ("show me items where X
 * > 5" shouldn't surface items without an X reading).
 */
function rowPassesFilter(row: MetricRow, filter: ViewCardFilter): boolean {
  const v = getMetricValue(row, filter.metric)
  if (typeof v !== 'number' || !Number.isFinite(v)) return false
  switch (filter.op) {
    case '<':
      return v < filter.value
    case '<=':
      return v <= filter.value
    case '=':
      return v === filter.value
    case '!=':
      return v !== filter.value
    case '>=':
      return v >= filter.value
    case '>':
      return v > filter.value
  }
}

/**
 * Compare two rows on a single sort criterion.
 *
 * Null metric values always sort last (regardless of direction), so they don't
 * muscle to the top when a user sorts `daysRemaining desc` on a surplus-heavy
 * view.
 */
function compareBy(a: MetricRow, b: MetricRow, sort: ViewCardSort): number {
  const av = getMetricValue(a, sort.metric)
  const bv = getMetricValue(b, sort.metric)

  const aNull = av === null || av === undefined
  const bNull = bv === null || bv === undefined
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1

  let cmp = 0
  if (typeof av === 'number' && typeof bv === 'number') {
    cmp = av - bv
  } else {
    cmp = String(av).localeCompare(String(bv))
  }
  return sort.direction === 'asc' ? cmp : -cmp
}

/**
 * Apply a card's filters (all AND'd) and multi-column sort, returning the
 * full sorted-and-filtered list. Pagination / row-capping is the caller's
 * responsibility — table cards now slice by page size in their footer rather
 * than dropping rows here.
 *
 * When `sortBy` is empty, rows are ordered by ticker ascending so output is
 * stable and obvious. When `filters` is empty, every row in scope qualifies.
 */
export function filterAndSort<T extends MetricRow>(
  rows: T[],
  filters: ViewCardFilter[],
  sortBy: ViewCardSort[]
): T[] {
  const kept =
    filters.length === 0
      ? rows.slice()
      : rows.filter(r => filters.every(f => rowPassesFilter(r, f)))

  if (sortBy.length === 0) {
    // Default: commodity ticker ascending — stable and obvious.
    kept.sort((a, b) => a.commodityTicker.localeCompare(b.commodityTicker))
  } else {
    kept.sort((a, b) => {
      for (const c of sortBy) {
        const cmp = compareBy(a, b, c)
        if (cmp !== 0) return cmp
      }
      return 0
    })
  }

  return kept
}
