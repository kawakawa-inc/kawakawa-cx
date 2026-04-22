import type { FilterPrivacy } from './index.js'
import type { CorpMetricGroupBy, FilterOperator, MetricKey } from './corp-metrics.js'

/**
 * One row-level filter on a card. Filters are AND-combined; a row passes only
 * when every filter matches. Null-valued metrics (e.g. daysRemaining when
 * there is no deficit) always fail numeric comparisons.
 */
export interface ViewCardFilter {
  metric: MetricKey
  op: FilterOperator
  value: number
}

/** One sort criterion on a card. `sortBy` applies these in array order. */
export interface ViewCardSort {
  metric: MetricKey
  direction: 'asc' | 'desc'
}

/**
 * A single dashboard card within a Corp Overview View.
 *
 * - `filters: []` means no filter — every row in scope is eligible.
 * - `sortBy: []` falls back to sorting by ticker ascending.
 */
export interface ViewCard {
  name: string
  groupBy: CorpMetricGroupBy
  filters: ViewCardFilter[]
  sortBy: ViewCardSort[]
  /** Ordered list of metric keys to render as columns. */
  columns: MetricKey[]
  /** Row cap after filter + sort; default 5. */
  limit: number
}

/**
 * A named, shareable configuration of the Corp Overview page.
 *
 * `tickers: []` is the "all corp tickers" sentinel — do not filter by ticker.
 */
export interface CorpOverviewView {
  id: number
  userId: number
  userName: string
  name: string
  tickers: string[]
  cards: ViewCard[]
  privacy: FilterPrivacy
  isPinned: boolean
  createdAt: string
}

export interface CreateCorpOverviewViewRequest {
  name: string
  tickers: string[]
  cards: ViewCard[]
  privacy: FilterPrivacy
}

export interface UpdateCorpOverviewViewRequest {
  name?: string
  tickers?: string[]
  cards?: ViewCard[]
  privacy?: FilterPrivacy
}
