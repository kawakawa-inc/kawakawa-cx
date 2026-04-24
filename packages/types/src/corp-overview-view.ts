import type { FilterPrivacy } from './index.js'
import type { CorpMetricGroupBy, FilterOperator, MetricKey } from './corp-metrics.js'
import type { SnapshotRangePreset, SnapshotSeriesBy } from './corp-snapshots.js'

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
 * Graph-specific config for a card with `type: 'graph'`.
 *
 * `yMetrics` lets a single card plot several metrics at once (e.g. production,
 * consumption, and net for one ticker). Each (metric, ticker, user?) combo
 * becomes one series on the chart.
 *
 * `tickers` is an optional *card-level* override: when non-empty, the graph
 * restricts itself to these tickers regardless of the view's ticker scope. On
 * empty / undefined, the card falls back to the view's `tickers` list. Table
 * cards continue to follow the view scope only — this knob is graph-specific
 * because trend graphs typically want a tighter ticker focus than the view
 * overall.
 */
export interface GraphConfig {
  yMetrics: MetricKey[]
  /**
   * Optional card-level ticker filter. Same mixed-entry shape as
   * `CorpOverviewView.tickers` — bare tickers (`"RAT"`) and live category
   * references (`"category:Consumables"`) intermix. When non-empty, overrides
   * the view's `tickers`.
   */
  tickers?: string[]
  seriesBy: SnapshotSeriesBy
  /** Max number of series per metric. Extras collapse into "Other (N)". 1–20. */
  seriesLimit: number
  /** Time range preset. Ignored when `rangeFrom`/`rangeTo` are both set. */
  rangePreset: SnapshotRangePreset
  /** Optional explicit ISO-date lower bound — overrides `rangePreset`. */
  rangeFrom?: string
  /** Optional explicit ISO-date upper bound — overrides `rangePreset`. */
  rangeTo?: string
  /** Optional manual Y-axis floor. Omit for auto-scale. */
  yMin?: number
  /** Optional manual Y-axis ceiling. Omit for auto-scale. */
  yMax?: number
  /**
   * When true, any series beyond `seriesLimit` collapse into a single
   * `"Other (N)"` trace. Default is off — that summed trace rarely tells you
   * anything the top-N doesn't, and it clutters the legend.
   */
  includeOther?: boolean
}

export type ViewCardType = 'table' | 'graph'

/**
 * A single dashboard card within a Corp Overview View.
 *
 * - `type` discriminates between a table rendering (columns/sortBy/limit) and
 *   a time-series graph rendering (graph config). Missing `type` is normalized
 *   to `'table'` for backward compatibility with pre-histogram cards.
 * - `filters: []` means no filter — every row in scope is eligible.
 * - `sortBy: []` falls back to sorting by ticker ascending (table only).
 * - `graph` is required when `type === 'graph'`.
 */
export interface ViewCard {
  name: string
  groupBy: CorpMetricGroupBy
  filters: ViewCardFilter[]
  type: ViewCardType
  /** Ordered list of metric keys to render as columns. Ignored for graph cards. */
  columns: MetricKey[]
  sortBy: ViewCardSort[]
  /** Row cap after filter + sort; default 5. Ignored for graph cards. */
  limit: number
  /**
   * Optional card-level ticker filter — same mixed-entry shape as
   * `CorpOverviewView.tickers` (bare tickers + `category:` refs). When
   * non-empty, overrides the view's scope for this card only; enables patterns
   * like a "Top Producers of COF" card sharing a view with "Top Producers of
   * RAT". On empty / undefined, the card follows the view's scope. Graph cards
   * read this through `graph.tickers` (kept separate for historical reasons).
   */
  tickers?: string[]
  /** Required when `type === 'graph'`; undefined for table cards. */
  graph?: GraphConfig
}

/**
 * A named, shareable configuration of the Corp Overview page.
 *
 * **`tickers` shape**: an array of mixed entries. Each entry is either:
 * - A bare ticker (e.g. `"RAT"`), included as-is in the scope.
 * - A live category reference of the form `"category:Name"` (e.g.
 *   `"category:Consumables"`), expanded to its current member tickers at
 *   render time. New commodities added to the category later automatically
 *   flow into views using the reference.
 *
 * Empty array = no ticker filter (every corp ticker is in scope).
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
