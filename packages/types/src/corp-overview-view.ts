import type { FilterPrivacy } from './index.js'
import type { CorpMetricGroupBy, FilterOperator, MetricKey } from './corp-metrics.js'

/**
 * Default column set rendered by the panel-level Materials table when a view
 * has no `materialsTableColumns` saved. Mirrors the columns the materials
 * table shipped with before the column-picker landed so existing views keep
 * looking identical without anyone re-saving them.
 */
export const DEFAULT_MATERIALS_TABLE_COLUMNS: MetricKey[] = [
  'burnDaily',
  'inputsDaily',
  'repairTotal',
  'productionDaily',
  'netDailyNoRepair',
  'stock',
  'daysRemaining',
  'listedStock',
  'daysListed',
]
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
  /**
   * Stable per-card identifier. Generated client-side at create time
   * (`crypto.randomUUID()`), preserved verbatim across edits, and used as the
   * key for client-side per-card UI state (page, page size, ad-hoc filters)
   * so that state survives card reorder/delete/insert in the editor. Legacy
   * cards without one are backfilled lazily on read by the server. Built-in
   * view cards use deterministic `builtin:*` strings instead of UUIDs so they
   * stay stable without any persistence.
   */
  clientId: string
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
 * One owner of a view. A view's `owners` is the full set — there are no tiers,
 * any owner has full read/edit/delete/share rights and can add or remove other
 * owners. Last-owner removal is rejected; the only way to drop the last owner
 * is to delete the view itself.
 */
export interface ViewOwner {
  userId: number
  username: string
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
  /**
   * The view's owners. Many-to-many with users; ordered by `addedAt` so the
   * creator surfaces first in displays. An ownerless view (when every owner
   * has been deleted as a user) keeps existing — admins can reassign in a
   * future revision.
   */
  owners: ViewOwner[]
  name: string
  tickers: string[]
  cards: ViewCard[]
  /**
   * Saved baseline of user IDs to exclude from corp aggregation when this view
   * is active. The page UI keeps a separate local working copy so anyone can
   * temporarily filter without mutating the row; only the owner can save the
   * working copy back into this field.
   */
  excludedUserIds: number[]
  /**
   * Columns to render in the panel-level Materials table, in display order.
   * Each entry must be a `ticker`-grouping MetricKey. Empty array falls back
   * to `DEFAULT_MATERIALS_TABLE_COLUMNS` on the client. Useful when a view's
   * scope makes some columns irrelevant — e.g. consumables views can drop
   * Repair to keep the table tidy.
   */
  materialsTableColumns: MetricKey[]
  /**
   * Optional ticker scope for the panel-level Materials table — same mixed-
   * entry shape as the view's `tickers` (bare tickers + `category:` refs).
   * Empty array falls back to no extra constraint; the materials table follows
   * the view's overall scope. Stored on the view in Phase 1; wired through to
   * the table in Phase 2.
   */
  materialsTableTickers: string[]
  privacy: FilterPrivacy
  isPinned: boolean
  createdAt: string
  /**
   * Timestamp of the last server-side mutation. Used by the client-side Local
   * working copy to detect when Saved has moved underneath it (e.g. a co-owner
   * pressed Save) and surface a "reload or keep editing" prompt.
   */
  updatedAt: string
}

export interface CreateCorpOverviewViewRequest {
  name: string
  tickers: string[]
  cards: ViewCard[]
  /** Optional; defaults to empty (no exclusions) when omitted. */
  excludedUserIds?: number[]
  /** Optional; defaults to empty (= use the client's default column set). */
  materialsTableColumns?: MetricKey[]
  /** Optional; defaults to empty (= follow the view's overall ticker scope). */
  materialsTableTickers?: string[]
  privacy: FilterPrivacy
}

export interface UpdateCorpOverviewViewRequest {
  name?: string
  tickers?: string[]
  cards?: ViewCard[]
  excludedUserIds?: number[]
  materialsTableColumns?: MetricKey[]
  materialsTableTickers?: string[]
  privacy?: FilterPrivacy
}

/**
 * Body for `POST /corp-overview-views/{id}/owners`. The path identifies the
 * view; the body identifies the user being added.
 */
export interface AddViewOwnerRequest {
  userId: number
}
