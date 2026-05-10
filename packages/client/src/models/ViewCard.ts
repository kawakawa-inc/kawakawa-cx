/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CorpMetricGroupBy } from './CorpMetricGroupBy'
import type { GraphConfig } from './GraphConfig'
import type { MetricKey } from './MetricKey'
import type { ViewCardFilter } from './ViewCardFilter'
import type { ViewCardSort } from './ViewCardSort'
import type { ViewCardType } from './ViewCardType'
/**
 * A single dashboard card within a Corp Overview View.
 *
 * - `type` discriminates between a table rendering (columns/sortBy/limit) and
 * a time-series graph rendering (graph config). Missing `type` is normalized
 * to `'table'` for backward compatibility with pre-histogram cards.
 * - `filters: []` means no filter — every row in scope is eligible.
 * - `sortBy: []` falls back to sorting by ticker ascending (table only).
 * - `graph` is required when `type === 'graph'`.
 */
export type ViewCard = {
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
  filters: Array<ViewCardFilter>
  type: ViewCardType
  /**
   * Ordered list of metric keys to render as columns. Ignored for graph cards.
   */
  columns: Array<MetricKey>
  sortBy: Array<ViewCardSort>
  /**
   * Row cap after filter + sort; default 5. Ignored for graph cards.
   */
  limit: number
  /**
   * Optional card-level ticker filter — same mixed-entry shape as
   * `CorpOverviewView.tickers` (bare tickers + `category:` refs). When
   * non-empty, overrides the view's scope for this card only; enables patterns
   * like a "Top Producers of COF" card sharing a view with "Top Producers of
   * RAT". On empty / undefined, the card follows the view's scope. Graph cards
   * read this through `graph.tickers` (kept separate for historical reasons).
   */
  tickers?: Array<string>
  /**
   * Required when `type === 'graph'`; undefined for table cards.
   */
  graph?: GraphConfig
}
