/**
 * Frontend-only fixtures for Corp Overview Views.
 *
 * `BUILT_IN_ALL_VIEW` is the "no view selected" fallback — always present in
 * the View selector, can't be edited or deleted, sourced client-side so it
 * doesn't need a system user in the DB.
 */

import type {
  CorpOverviewView,
  GraphConfig,
  MetricKey,
  ViewCard,
  ViewCardFilter,
  ViewCardSort,
  ViewCardType,
} from '@kawakawa/types'

/** Sentinel id for the built-in view. Real rows always have positive IDs. */
export const BUILT_IN_VIEW_ID = -1

const TOP_GAPS: ViewCard = {
  name: 'Top Gaps',
  groupBy: 'ticker',
  type: 'table',
  filters: [{ metric: 'gap', op: '>', value: 0 }],
  sortBy: [{ metric: 'gap', direction: 'desc' }],
  columns: ['gap', 'stock', 'daysRemaining', 'daysOfCover'],
  limit: 5,
}

const TOP_SURPLUS: ViewCard = {
  name: 'Top Surplus',
  groupBy: 'ticker',
  type: 'table',
  filters: [{ metric: 'netDailyNoRepair', op: '>', value: 0 }],
  sortBy: [{ metric: 'netDailyNoRepair', direction: 'desc' }],
  columns: ['netDailyNoRepair', 'stock', 'daysOfCover'],
  limit: 5,
}

const TOP_PRODUCERS: ViewCard = {
  name: 'Top Producers',
  groupBy: 'user-ticker',
  type: 'table',
  filters: [{ metric: 'productionDaily', op: '>', value: 0 }],
  sortBy: [{ metric: 'productionDaily', direction: 'desc' }],
  columns: ['username', 'productionDaily'],
  limit: 5,
}

const TOP_CONSUMERS: ViewCard = {
  name: 'Top Consumers',
  groupBy: 'user-ticker',
  type: 'table',
  filters: [{ metric: 'consumptionDaily', op: '>', value: 0 }],
  sortBy: [{ metric: 'consumptionDaily', direction: 'desc' }],
  columns: ['username', 'consumptionDaily'],
  limit: 5,
}

/**
 * The built-in view. Renders as a fully-formed CorpOverviewView so the panel
 * can consume it the same way as any DB-backed view.
 */
export const BUILT_IN_ALL_VIEW: CorpOverviewView = {
  id: BUILT_IN_VIEW_ID,
  userId: BUILT_IN_VIEW_ID,
  userName: 'built-in',
  name: 'All (built-in)',
  tickers: [], // empty = include every corp ticker
  cards: [TOP_GAPS, TOP_SURPLUS, TOP_PRODUCERS, TOP_CONSUMERS],
  privacy: 'public',
  isPinned: false,
  createdAt: '',
}

/** True iff the given id refers to the built-in (non-DB) view. */
export function isBuiltInViewId(id: number): boolean {
  return id === BUILT_IN_VIEW_ID
}

/**
 * Coerce a view loaded from the API into the current ViewCard shape.
 *
 * Legacy cards saved before the filter/sort refactor have `primaryMetric`
 * but no `filters`/`sortBy`. Rather than force users to manually re-save, we
 * map the old shape onto the new one at read time: `primaryMetric` becomes
 * one `> 0` filter plus a descending sort. Users can adjust or clear these
 * in the editor; re-saving persists the new shape.
 */
export function normalizeView(view: CorpOverviewView): CorpOverviewView {
  return {
    ...view,
    cards: view.cards.map(card => normalizeCard(card)),
  }
}

function normalizeCard(card: unknown): ViewCard {
  const raw = card as Partial<ViewCard> & {
    primaryMetric?: MetricKey
    type?: ViewCardType
    graph?: GraphConfig
  }
  const groupBy: ViewCard['groupBy'] = raw.groupBy === 'user-ticker' ? 'user-ticker' : 'ticker'
  const legacyPrimary = typeof raw.primaryMetric === 'string' ? raw.primaryMetric : null
  const filters: ViewCardFilter[] = Array.isArray(raw.filters)
    ? raw.filters
    : legacyPrimary
      ? [{ metric: legacyPrimary, op: '>', value: 0 }]
      : []
  const sortBy: ViewCardSort[] = Array.isArray(raw.sortBy)
    ? raw.sortBy
    : legacyPrimary
      ? [{ metric: legacyPrimary, direction: 'desc' }]
      : []
  const type: ViewCardType = raw.type === 'graph' ? 'graph' : 'table'
  const tickers =
    Array.isArray(raw.tickers) && raw.tickers.every(t => typeof t === 'string')
      ? (raw.tickers as string[])
      : undefined
  return {
    name: typeof raw.name === 'string' ? raw.name : 'Card',
    groupBy,
    type,
    filters,
    sortBy,
    columns: Array.isArray(raw.columns) ? raw.columns : [],
    limit: typeof raw.limit === 'number' ? raw.limit : 5,
    tickers: tickers && tickers.length > 0 ? tickers : undefined,
    graph: type === 'graph' ? normalizeGraph(raw.graph) : undefined,
  }
}

/**
 * Coerce a GraphConfig from its stored shape into the current one.
 *
 * Handles the yMetric → yMetrics[] split: any legacy card saved with a single
 * `yMetric` gets promoted to a one-element `yMetrics` array. Cards saved under
 * the new shape pass through unchanged.
 */
function normalizeGraph(raw: unknown): GraphConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const g = raw as Partial<GraphConfig> & { yMetric?: MetricKey }

  const yMetrics: MetricKey[] = Array.isArray(g.yMetrics)
    ? g.yMetrics
    : g.yMetric
      ? [g.yMetric]
      : []

  return {
    yMetrics,
    tickers: Array.isArray(g.tickers) ? g.tickers : undefined,
    seriesBy: g.seriesBy === 'user' ? 'user' : 'corp',
    seriesLimit: typeof g.seriesLimit === 'number' ? g.seriesLimit : 5,
    rangePreset: g.rangePreset ?? '90d',
    rangeFrom: g.rangeFrom,
    rangeTo: g.rangeTo,
    yMin: g.yMin,
    yMax: g.yMax,
    includeOther: g.includeOther === true,
  }
}
