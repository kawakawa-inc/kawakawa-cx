/**
 * Historical snapshot DTOs for Corp Overview graph cards.
 *
 * `/api/corp-snapshots` serves time-series data computed from the
 * `corp_snapshot_user_ticker` and `corp_snapshot_ticker_stock` tables. The
 * endpoint derives the requested `yMetric` from stored base values (same
 * formulas as the live view), buckets by day/week/month to keep point counts
 * readable, and collapses per-user rows into top-N series with an "Other (N)"
 * overflow when necessary.
 */

import type { MetricKey } from './corp-metrics.js'

export type SnapshotBucket = 'day' | 'week' | 'month'

export type SnapshotRangePreset = '7d' | '30d' | '90d' | '1y' | '2y' | 'all'

export type SnapshotSeriesBy = 'user' | 'corp'

/** A single (time, value) point in a series. `t` is an ISO date. */
export interface SnapshotPoint {
  t: string
  v: number
}

/**
 * One time-series returned by the endpoint. `label` is either `'corp'` for a
 * corp-aggregate series, an FIO/login username for per-user series, or
 * `'Other (N)'` for the rolled-up overflow group.
 */
export interface SnapshotSeries {
  label: string
  points: SnapshotPoint[]
}

export interface SnapshotSeriesResponse {
  bucket: SnapshotBucket
  /** ISO date of the inclusive start of the range that was actually served. */
  from: string
  /** ISO date of the inclusive end of the range that was actually served. */
  to: string
  series: SnapshotSeries[]
}

/**
 * Query parameters for `/api/corp-snapshots`. Either `preset` or the pair
 * `from`+`to` must resolve to a range; when both are set, the explicit range
 * wins. `bucket` is optional — when absent, the endpoint picks one based on
 * the resolved range length (≤90d = day, ≤1y = week, >1y = month).
 */
export interface SnapshotQueryRequest {
  yMetric: MetricKey
  seriesBy: SnapshotSeriesBy
  /** Optional ticker scope. Empty or omitted = every ticker present in range. */
  tickers?: string[]
  from?: string
  to?: string
  preset?: SnapshotRangePreset
  bucket?: SnapshotBucket
  /** Cap on per-user series. Default 5, max 20. Ignored when seriesBy='corp'. */
  seriesLimit?: number
  /**
   * User IDs to additionally exclude on top of the role + FIO-freshness filter.
   * Used by the "Users included" planning dropdown — applies historically too,
   * so trend lines reflect "what the corp would look like without them."
   */
  excludedUserIds?: number[]
  /**
   * When true, series beyond `seriesLimit` collapse into a single
   * `"Other (N)"` trace. Default is off — the summed bucket is rarely more
   * informative than knowing the long tail exists, and muddles the chart
   * legend. Users who want the rollup opt in via the card editor.
   */
  includeOther?: boolean
}
