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
import { isMetricValidFor } from '@kawakawa/types'

/** Sentinel id for the built-in view. Real rows always have positive IDs. */
export const BUILT_IN_VIEW_ID = -1

const TOP_GAPS: ViewCard = {
  clientId: 'builtin:top-gaps',
  name: 'Top Gaps',
  groupBy: 'ticker',
  type: 'table',
  filters: [{ metric: 'gap', op: '>', value: 0 }],
  // Sort by Days Remaining ascending so the most urgent shortfalls — the ones
  // about to run out — surface at the top of the list, regardless of raw gap
  // size.
  sortBy: [{ metric: 'daysRemaining', direction: 'asc' }],
  columns: ['gap', 'stock', 'daysRemaining', 'listedStock', 'daysListed'],
  limit: 5,
}

const TOP_SURPLUS: ViewCard = {
  clientId: 'builtin:top-surplus',
  name: 'Top Surplus',
  groupBy: 'ticker',
  type: 'table',
  filters: [{ metric: 'netDailyNoRepair', op: '>', value: 0 }],
  // Sort by Listed Stock so the top of the list is "what we have most of on
  // the market right now" — most useful surplus framing for buyers.
  sortBy: [{ metric: 'listedStock', direction: 'desc' }],
  columns: ['netDailyNoRepair', 'stock', 'daysRemaining', 'listedStock', 'daysListed'],
  limit: 5,
}

const TOP_PRODUCERS: ViewCard = {
  clientId: 'builtin:top-producers',
  name: 'Top Producers',
  groupBy: 'user-ticker',
  type: 'table',
  filters: [{ metric: 'productionDaily', op: '>', value: 0 }],
  sortBy: [{ metric: 'productionDaily', direction: 'desc' }],
  columns: ['username', 'productionDaily'],
  limit: 5,
}

const TOP_CONSUMERS: ViewCard = {
  clientId: 'builtin:top-consumers',
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
 * can consume it the same way as any DB-backed view. Ownerless by design —
 * the membership check `owners.some(o => o.userId === currentUserId)` will
 * never match, so the edit affordances stay hidden.
 */
export const BUILT_IN_ALL_VIEW: CorpOverviewView = {
  id: BUILT_IN_VIEW_ID,
  owners: [],
  name: 'All Materials',
  tickers: [], // empty = include every corp ticker
  cards: [TOP_GAPS, TOP_SURPLUS, TOP_PRODUCERS, TOP_CONSUMERS],
  excludedUserIds: [],
  // Empty = client-side default column set; the built-in view doesn't pin
  // columns so users see whatever the panel currently considers default.
  materialsTableColumns: [],
  materialsTableTickers: [],
  privacy: 'public',
  isPinned: false,
  createdAt: '',
  updatedAt: '',
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
  // Defensive: legacy rows from before the column existed (or buggy clients)
  // may surface excludedUserIds as undefined. Coerce to [] so the rest of the
  // UI can compare arrays without nullish-checks everywhere.
  const excludedUserIds = Array.isArray(view.excludedUserIds)
    ? view.excludedUserIds.filter((v): v is number => typeof v === 'number')
    : []
  // Materials-table columns: rewrite renamed keys, then drop anything that
  // isn't a ticker-grouping metric. Server enforces validity on write; the
  // filter here keeps the UI safe if a metric gets removed entirely and old
  // rows still mention it. We widen to `unknown[]` first because the static
  // type claims MetricKey but DB rows can still contain legacy keys like
  // `daysOfCover`.
  const materialsTableColumns = Array.isArray(view.materialsTableColumns)
    ? (view.materialsTableColumns as unknown[])
        .filter((v): v is string => typeof v === 'string')
        .map(v => migrateMetricKey(v))
        .filter(v => isMetricValidFor(v, 'ticker'))
    : []
  // Materials-table ticker overrides: same mixed scope-entry shape as the
  // view's `tickers`. Defensive against legacy rows where the field is missing.
  const materialsTableTickers = Array.isArray(view.materialsTableTickers)
    ? view.materialsTableTickers.filter((v): v is string => typeof v === 'string')
    : []
  return {
    ...view,
    cards: view.cards.map(card => normalizeCard(card)),
    excludedUserIds,
    materialsTableColumns,
    materialsTableTickers,
  }
}

/**
 * Rewrite renamed metric keys on read so cards saved under old names keep
 * working without forcing users to re-edit them. Add new entries here when
 * a metric gets renamed; remove only if you're confident no DB rows still
 * reference the old key.
 */
const METRIC_KEY_RENAMES: Record<string, MetricKey> = {
  daysOfCover: 'daysListed',
}

function migrateMetricKey(k: string): MetricKey {
  return (METRIC_KEY_RENAMES[k] ?? k) as MetricKey
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
    ? raw.filters.map(f => ({ ...f, metric: migrateMetricKey(f.metric) }))
    : legacyPrimary
      ? [{ metric: migrateMetricKey(legacyPrimary), op: '>', value: 0 }]
      : []
  const sortBy: ViewCardSort[] = Array.isArray(raw.sortBy)
    ? raw.sortBy.map(s => ({ ...s, metric: migrateMetricKey(s.metric) }))
    : legacyPrimary
      ? [{ metric: migrateMetricKey(legacyPrimary), direction: 'desc' }]
      : []
  const type: ViewCardType = raw.type === 'graph' ? 'graph' : 'table'
  const tickers =
    Array.isArray(raw.tickers) && raw.tickers.every(t => typeof t === 'string')
      ? (raw.tickers as string[])
      : undefined
  const columns = Array.isArray(raw.columns)
    ? (raw.columns.map(c => migrateMetricKey(c as string)) as MetricKey[])
    : []
  // The server backfills `clientId` for legacy cards before responding, so the
  // local random fallback should only fire when something has gone weird (a
  // legacy row mid-migration, or a buggy client). Stable IDs from the server
  // are what keeps per-card pageState attached to the right card across
  // reorders/deletes — the random fallback gives up that property until the
  // next save cycle, which is acceptable as a transient.
  const clientId =
    typeof raw.clientId === 'string' && raw.clientId.length > 0
      ? raw.clientId
      : generateCardClientId()
  return {
    clientId,
    name: typeof raw.name === 'string' ? raw.name : 'Card',
    groupBy,
    type,
    filters,
    sortBy,
    columns,
    limit: typeof raw.limit === 'number' ? raw.limit : 5,
    tickers: tickers && tickers.length > 0 ? tickers : undefined,
    graph: type === 'graph' ? normalizeGraph(raw.graph) : undefined,
  }
}

/**
 * Generate a fresh stable client ID for a brand-new card. Use `crypto.randomUUID()`
 * so two clients adding cards offline don't collide if their work later merges.
 */
export function generateCardClientId(): string {
  return crypto.randomUUID()
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
    ? (g.yMetrics.map(m => migrateMetricKey(m as string)) as MetricKey[])
    : g.yMetric
      ? [migrateMetricKey(g.yMetric)]
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
