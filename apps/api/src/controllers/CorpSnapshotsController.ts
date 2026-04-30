import { Controller, Get, Query, Route, Security, Tags, Request } from 'tsoa'
import type {
  MetricKey,
  SnapshotBucket,
  SnapshotRangePreset,
  SnapshotSeriesBy,
  SnapshotSeriesResponse,
  SnapshotSeries,
} from '@kawakawa/types'
import { corpSnapshotTickerStock, corpSnapshotUserTicker, db } from '../db/index.js'
import { and, between, inArray, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { resolveActiveMembers, resolveDisplayUsernames } from '@kawakawa/services/supply'
import { applyExclusion } from './BurnRepairController.js'
import { BadRequest } from '../utils/errors.js'

/**
 * Historical-view endpoint for Corp Overview graph cards.
 *
 * Aggregates daily snapshot rows into bucketed time-series. Each request picks
 * one `yMetric` (derived from stored base rates), one grouping (`seriesBy`),
 * and a range; the server buckets by day/week/month, runs the requested
 * derivation per bucket, and caps the series count with a top-N + "Other (N)"
 * rollup to keep graphs readable.
 */
@Route('corp-snapshots')
@Tags('Corp Snapshots')
@Security('jwt')
export class CorpSnapshotsController extends Controller {
  @Get()
  public async query(
    @Request() request: { user: JwtPayload },
    @Query() yMetric: MetricKey,
    @Query() seriesBy: SnapshotSeriesBy,
    @Query() preset?: SnapshotRangePreset,
    @Query() from?: string,
    @Query() to?: string,
    @Query() bucket?: SnapshotBucket,
    @Query() tickers?: string,
    @Query() seriesLimit?: number,
    @Query() excludedUserIds?: string,
    @Query() includeOther?: boolean
  ): Promise<SnapshotSeriesResponse> {
    validateYMetric(yMetric, seriesBy)
    if (seriesBy !== 'user' && seriesBy !== 'corp') {
      throw BadRequest(`seriesBy must be 'user' or 'corp'`)
    }

    const range = resolveRange({ preset, from, to })
    const resolvedBucket = bucket ?? autoBucket(range)
    const tickerList = parseTickers(tickers)
    const limit = clampSeriesLimit(seriesLimit)

    const resolved = await resolveActiveMembers(request.user.userId)
    // Same exclusion semantics as the live corp endpoint — applied
    // historically too, so a card showing "what if these members weren't
    // around" projects backward as well as forward.
    const activeUserIds = applyExclusion(resolved.activeUserIds, excludedUserIds)
    if (activeUserIds.length === 0) {
      return { bucket: resolvedBucket, from: range.from, to: range.to, series: [] }
    }

    // Per-(bucket, user, ticker) base rates averaged across days in the bucket.
    const userTickerRows = await fetchUserTickerBuckets(
      activeUserIds,
      tickerList,
      range,
      resolvedBucket
    )

    // Corp-wide stock per (bucket, ticker) for stock-dependent metrics.
    const needsStock = metricNeedsStock(yMetric)
    const stockRows = needsStock ? await fetchStockBuckets(tickerList, range, resolvedBucket) : []
    const stockByBucketTicker = indexStock(stockRows)

    const usernameMap =
      seriesBy === 'user' ? await resolveDisplayUsernames(activeUserIds) : new Map<number, string>()

    const series = buildSeries({
      userTickerRows,
      stockByBucketTicker,
      usernameMap,
      yMetric,
      seriesBy,
      limit,
      tickerScope: tickerList,
      includeOther: includeOther === true,
    })

    return { bucket: resolvedBucket, from: range.from, to: range.to, series }
  }
}

// ========================================================================
// Validation
// ========================================================================

/** Metrics that come from the ticker-stock snapshot, not the user-ticker one. */
const STOCK_METRICS: ReadonlySet<MetricKey> = new Set(['stock', 'daysRemaining'])

/** Metrics we never graph historically. */
const UNGRAPHABLE_METRICS: ReadonlySet<MetricKey> = new Set<MetricKey>([
  // repairDays isn't stored per snapshot, so per-day repair amortization is ambiguous.
  'repairPerDay',
  // username is a display dimension, not a numeric axis.
  'username',
  // listedStock has no historical snapshot column yet — punt until we decide
  // whether to backfill or just start logging it forward. Same goes for the
  // metric derived from it.
  'listedStock',
  'daysListed',
])

function metricNeedsStock(y: MetricKey): boolean {
  return STOCK_METRICS.has(y)
}

function validateYMetric(y: MetricKey, seriesBy: SnapshotSeriesBy): void {
  if (UNGRAPHABLE_METRICS.has(y)) {
    throw BadRequest(`yMetric '${y}' is not supported in historical graphs`)
  }
  if (seriesBy === 'user' && STOCK_METRICS.has(y)) {
    // Stock is a corp-wide sell-order rollup, not a per-user property.
    throw BadRequest(`yMetric '${y}' requires seriesBy='corp'`)
  }
}

function clampSeriesLimit(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return 5
  const int = Math.round(n)
  if (int < 1) return 1
  if (int > 20) return 20
  return int
}

function parseTickers(raw: string | undefined): string[] | null {
  if (!raw) return null
  const list = raw
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(t => t.length > 0)
  return list.length > 0 ? list : null
}

// ========================================================================
// Range + bucket resolution
// ========================================================================

interface Range {
  from: string // YYYY-MM-DD
  to: string
}

const PRESET_DAYS: Record<SnapshotRangePreset, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  '2y': 730,
  all: 3650, // 10 years; effectively "all" for our retention horizon
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function resolveRange(opts: { preset?: SnapshotRangePreset; from?: string; to?: string }): Range {
  if (opts.from && opts.to) {
    return { from: opts.from, to: opts.to }
  }
  const preset: SnapshotRangePreset = opts.preset ?? '90d'
  const days = PRESET_DAYS[preset] ?? PRESET_DAYS['90d']
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - days)
  return { from: isoDate(start), to: isoDate(end) }
}

function daysBetween(range: Range): number {
  const a = new Date(range.from)
  const b = new Date(range.to)
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000))
}

function autoBucket(range: Range): SnapshotBucket {
  const days = daysBetween(range)
  if (days <= 90) return 'day'
  if (days <= 365) return 'week'
  return 'month'
}

// ========================================================================
// DB reads
// ========================================================================

interface UserTickerBucketRow {
  t: Date
  userId: number
  commodityTicker: string
  burnDaily: number
  inputsDaily: number
  productionDaily: number
  repairTotal: number
}

async function fetchUserTickerBuckets(
  activeUserIds: number[],
  tickers: string[] | null,
  range: Range,
  bucket: SnapshotBucket
): Promise<UserTickerBucketRow[]> {
  const whereClauses = [
    inArray(corpSnapshotUserTicker.userId, activeUserIds),
    between(corpSnapshotUserTicker.snapshotAt, range.from, range.to),
  ]
  if (tickers) whereClauses.push(inArray(corpSnapshotUserTicker.commodityTicker, tickers))

  // `bucket` is already validated to one of three literal strings; inline it
  // via sql.raw so the same expression appears verbatim in SELECT/GROUP BY/
  // ORDER BY. (Passing it as a drizzle param made each reference a separate
  // placeholder, and Postgres refused the GROUP BY match.)
  const bucketExpr = sql<Date>`date_trunc(${sql.raw(`'${bucket}'`)}, ${corpSnapshotUserTicker.snapshotAt}::timestamp)`
  const rows = await db
    .select({
      t: bucketExpr,
      userId: corpSnapshotUserTicker.userId,
      commodityTicker: corpSnapshotUserTicker.commodityTicker,
      burnDaily: sql<string>`AVG(${corpSnapshotUserTicker.burnDaily})`,
      inputsDaily: sql<string>`AVG(${corpSnapshotUserTicker.inputsDaily})`,
      productionDaily: sql<string>`AVG(${corpSnapshotUserTicker.productionDaily})`,
      repairTotal: sql<string>`AVG(${corpSnapshotUserTicker.repairTotal})`,
    })
    .from(corpSnapshotUserTicker)
    .where(and(...whereClauses))
    .groupBy(bucketExpr, corpSnapshotUserTicker.userId, corpSnapshotUserTicker.commodityTicker)
    .orderBy(bucketExpr)

  return rows.map(r => ({
    t: r.t instanceof Date ? r.t : new Date(r.t),
    userId: r.userId,
    commodityTicker: r.commodityTicker,
    burnDaily: Number(r.burnDaily),
    inputsDaily: Number(r.inputsDaily),
    productionDaily: Number(r.productionDaily),
    repairTotal: Number(r.repairTotal),
  }))
}

interface StockBucketRow {
  t: Date
  commodityTicker: string
  stock: number
}

async function fetchStockBuckets(
  tickers: string[] | null,
  range: Range,
  bucket: SnapshotBucket
): Promise<StockBucketRow[]> {
  const whereClauses = [between(corpSnapshotTickerStock.snapshotAt, range.from, range.to)]
  if (tickers) whereClauses.push(inArray(corpSnapshotTickerStock.commodityTicker, tickers))

  // Same reason as fetchUserTickerBuckets — inline the bucket literal so the
  // expression is identical in SELECT and GROUP BY.
  const bucketExpr = sql<Date>`date_trunc(${sql.raw(`'${bucket}'`)}, ${corpSnapshotTickerStock.snapshotAt}::timestamp)`
  const rows = await db
    .select({
      t: bucketExpr,
      commodityTicker: corpSnapshotTickerStock.commodityTicker,
      stock: sql<string>`AVG(${corpSnapshotTickerStock.stock})`,
    })
    .from(corpSnapshotTickerStock)
    .where(and(...whereClauses))
    .groupBy(bucketExpr, corpSnapshotTickerStock.commodityTicker)
    .orderBy(bucketExpr)

  return rows.map(r => ({
    t: r.t instanceof Date ? r.t : new Date(r.t),
    commodityTicker: r.commodityTicker,
    stock: Number(r.stock),
  }))
}

function indexStock(rows: StockBucketRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) map.set(`${r.t.toISOString()}|${r.commodityTicker}`, r.stock)
  return map
}

// ========================================================================
// Series assembly
// ========================================================================

interface BuildSeriesInput {
  userTickerRows: UserTickerBucketRow[]
  stockByBucketTicker: Map<string, number>
  usernameMap: Map<number, string>
  yMetric: MetricKey
  seriesBy: SnapshotSeriesBy
  limit: number
  tickerScope: string[] | null
  /** When true, emit an "Other (N)" rollup for series beyond `limit`. */
  includeOther: boolean
}

/**
 * Compute the requested `yMetric` from the aggregated base rates at a single
 * bucket. `stock` comes from the parallel ticker-stock lookup when needed.
 */
function deriveMetricValue(
  row: {
    burnDaily: number
    inputsDaily: number
    productionDaily: number
    repairTotal: number
  },
  stock: number,
  metric: MetricKey
): number {
  const burn = row.burnDaily
  const inputs = row.inputsDaily
  const prod = row.productionDaily
  const consumption = burn + inputs
  const gap = consumption - prod
  switch (metric) {
    case 'burnDaily':
      return burn
    case 'inputsDaily':
      return inputs
    case 'productionDaily':
      return prod
    case 'consumptionDaily':
      return consumption
    case 'repairTotal':
      return row.repairTotal
    case 'netDailyNoRepair':
      return prod - consumption
    case 'netDaily':
      // We don't snapshot repairDays, so netDaily treats repairTotal as "today's
      // owed amount" — equivalent to netDailyNoRepair minus repairTotal charged
      // at once. Matches the "as-of-snapshot" semantic the capture path uses.
      return prod - consumption - row.repairTotal
    case 'gap':
    case 'inputGap':
      return gap
    case 'stock':
      return stock
    case 'daysRemaining':
      return gap > 0 ? (stock > 0 ? stock / gap : 0) : 0
    case 'repairPerDay':
    case 'username':
    case 'listedStock':
    case 'daysListed':
      // Gated at validate time; unreachable here.
      return 0
  }
}

function buildSeries(input: BuildSeriesInput): SnapshotSeries[] {
  const {
    userTickerRows,
    stockByBucketTicker,
    usernameMap,
    yMetric,
    seriesBy,
    limit,
    tickerScope,
    includeOther,
  } = input

  const multiTicker = !tickerScope || tickerScope.length !== 1

  // Key each series by its (user, ticker) or (ticker) identity, then collect
  // points into it.
  const seriesMap = new Map<string, { label: string; rank: number; points: Map<string, number> }>()

  function labelFor(userId: number | null, ticker: string): string {
    if (seriesBy === 'corp') return ticker
    const username = userId !== null ? (usernameMap.get(userId) ?? `user:${userId}`) : 'unknown'
    return multiTicker ? `${username} · ${ticker}` : username
  }

  function keyFor(userId: number | null, ticker: string): string {
    return seriesBy === 'corp' ? `corp|${ticker}` : `${userId}|${ticker}`
  }

  // When seriesBy === 'corp', sum base rates across users per (bucket, ticker)
  // before deriving the metric — "what is the corp total for this metric".
  // When seriesBy === 'user', keep per-user rows distinct.
  const aggregated = seriesBy === 'corp' ? sumAcrossUsers(userTickerRows) : userTickerRows

  for (const row of aggregated) {
    const stock = stockByBucketTicker.get(`${row.t.toISOString()}|${row.commodityTicker}`) ?? 0
    const value = deriveMetricValue(row, stock, yMetric)

    const userId = seriesBy === 'corp' ? null : row.userId
    const key = keyFor(userId, row.commodityTicker)
    const label = labelFor(userId, row.commodityTicker)

    let entry = seriesMap.get(key)
    if (!entry) {
      entry = { label, rank: 0, points: new Map() }
      seriesMap.set(key, entry)
    }
    entry.points.set(row.t.toISOString(), value)
    entry.rank += value
  }

  // Stock-only metrics against seriesBy='corp' with no user-ticker rows still
  // need series built from the stock data alone.
  if (seriesBy === 'corp' && STOCK_METRICS.has(yMetric) && seriesMap.size === 0) {
    const stockOnlyRows: UserTickerBucketRow[] = []
    for (const [k, stock] of stockByBucketTicker.entries()) {
      const [tIso, ticker] = k.split('|')
      stockOnlyRows.push({
        t: new Date(tIso),
        userId: 0,
        commodityTicker: ticker,
        burnDaily: 0,
        inputsDaily: 0,
        productionDaily: 0,
        repairTotal: 0,
      })
      const value = yMetric === 'stock' ? stock : 0
      const key = keyFor(null, ticker)
      let entry = seriesMap.get(key)
      if (!entry) {
        entry = { label: ticker, rank: 0, points: new Map() }
        seriesMap.set(key, entry)
      }
      entry.points.set(new Date(tIso).toISOString(), value)
      entry.rank += value
    }
  }

  // Rank by accumulated Y value over the range — highlights the series that
  // most shape the graph.
  const sorted = [...seriesMap.values()].sort((a, b) => b.rank - a.rank)

  const kept = sorted.slice(0, limit)
  const overflow = sorted.slice(limit)

  const result: SnapshotSeries[] = kept.map(s => ({
    label: s.label,
    points: [...s.points.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([t, v]) => ({ t, v })),
  }))

  if (overflow.length > 0 && includeOther) {
    const merged = new Map<string, number>()
    for (const s of overflow) {
      for (const [t, v] of s.points) {
        merged.set(t, (merged.get(t) ?? 0) + v)
      }
    }
    result.push({
      label: `Other (${overflow.length})`,
      points: [...merged.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([t, v]) => ({ t, v })),
    })
  }

  return result
}

function sumAcrossUsers(rows: UserTickerBucketRow[]): UserTickerBucketRow[] {
  // Collapse (t, user, ticker) → (t, ticker), summing each base rate. userId
  // is set to 0 as a sentinel since it's unused downstream for corp series.
  const acc = new Map<string, UserTickerBucketRow>()
  for (const r of rows) {
    const k = `${r.t.toISOString()}|${r.commodityTicker}`
    const existing = acc.get(k)
    if (existing) {
      existing.burnDaily += r.burnDaily
      existing.inputsDaily += r.inputsDaily
      existing.productionDaily += r.productionDaily
      existing.repairTotal += r.repairTotal
    } else {
      acc.set(k, { ...r, userId: 0 })
    }
  }
  return [...acc.values()]
}
