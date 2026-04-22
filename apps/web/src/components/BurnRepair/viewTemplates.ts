/**
 * Frontend-only fixtures for Corp Overview Views.
 *
 * `BUILT_IN_ALL_VIEW` is the "no view selected" fallback — always present in
 * the View selector, can't be edited or deleted, sourced client-side so it
 * doesn't need a system user in the DB.
 *
 * `VIEW_TEMPLATES` are starting points surfaced in the Create-View dialog.
 * Picking one seeds the form; nothing gets persisted until the user saves.
 */

import type {
  CorpOverviewView,
  MetricKey,
  ViewCard,
  ViewCardFilter,
  ViewCardSort,
} from '@kawakawa/types'

/** Sentinel id for the built-in view. Real rows always have positive IDs. */
export const BUILT_IN_VIEW_ID = -1

/**
 * Standard cards reused across templates. The four non-Fab-specific cards
 * match the original sub-tab "Other" card set: Gaps, Surplus, Producers,
 * Consumers.
 */
const TOP_GAPS: ViewCard = {
  name: 'Top Gaps',
  groupBy: 'ticker',
  filters: [{ metric: 'gap', op: '>', value: 0 }],
  sortBy: [{ metric: 'gap', direction: 'desc' }],
  columns: ['gap', 'stock', 'daysRemaining', 'daysOfCover'],
  limit: 5,
}

const TOP_SURPLUS: ViewCard = {
  name: 'Top Surplus',
  groupBy: 'ticker',
  filters: [{ metric: 'netDailyNoRepair', op: '>', value: 0 }],
  sortBy: [{ metric: 'netDailyNoRepair', direction: 'desc' }],
  columns: ['netDailyNoRepair', 'stock', 'daysOfCover'],
  limit: 5,
}

const TOP_PRODUCERS: ViewCard = {
  name: 'Top Producers',
  groupBy: 'user-ticker',
  filters: [{ metric: 'productionDaily', op: '>', value: 0 }],
  sortBy: [{ metric: 'productionDaily', direction: 'desc' }],
  columns: ['username', 'productionDaily'],
  limit: 5,
}

const TOP_CONSUMERS: ViewCard = {
  name: 'Top Consumers',
  groupBy: 'user-ticker',
  filters: [{ metric: 'consumptionDaily', op: '>', value: 0 }],
  sortBy: [{ metric: 'consumptionDaily', direction: 'desc' }],
  columns: ['username', 'consumptionDaily'],
  limit: 5,
}

const TOP_REPAIR_NEEDS: ViewCard = {
  name: 'Top Repair Needs',
  groupBy: 'ticker',
  filters: [{ metric: 'repairPerDay', op: '>', value: 0 }],
  sortBy: [{ metric: 'repairPerDay', direction: 'desc' }],
  columns: ['repairPerDay', 'repairTotal', 'stock'],
  limit: 5,
}

const TOP_INPUT_NEEDS: ViewCard = {
  name: 'Top Input Needs',
  groupBy: 'ticker',
  filters: [{ metric: 'inputGap', op: '>', value: 0 }],
  sortBy: [{ metric: 'inputGap', direction: 'desc' }],
  columns: ['productionDaily', 'consumptionDaily', 'inputGap', 'stock', 'daysRemaining'],
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

export interface ViewTemplate {
  /** Dropdown label shown in the "Start from template" menu. */
  label: string
  description: string
  /** Everything except id/userId/userName/createdAt — those come from the save. */
  view: Pick<CorpOverviewView, 'name' | 'tickers' | 'cards' | 'privacy' | 'isPinned'>
}

export const VIEW_TEMPLATES: ViewTemplate[] = [
  {
    label: 'All materials',
    description: 'Mirrors the built-in All view — no ticker filter, four summary cards.',
    view: {
      name: 'All materials',
      tickers: [],
      cards: [TOP_GAPS, TOP_SURPLUS, TOP_PRODUCERS, TOP_CONSUMERS],
      privacy: 'private',
      isPinned: false,
    },
  },
  {
    label: 'Consumables',
    description: 'Workforce-burn focus. Seeded with no tickers — add your consumable set.',
    view: {
      name: 'Consumables',
      tickers: [],
      cards: [TOP_GAPS, TOP_SURPLUS, TOP_PRODUCERS, TOP_CONSUMERS],
      privacy: 'private',
      isPinned: false,
    },
  },
  {
    label: 'Fabs',
    description: 'Repair and production-input focus. Seeded with no tickers — add fab materials.',
    view: {
      name: 'Fabs',
      tickers: [],
      cards: [TOP_REPAIR_NEEDS, TOP_INPUT_NEEDS, TOP_PRODUCERS, TOP_CONSUMERS],
      privacy: 'private',
      isPinned: false,
    },
  },
  {
    label: 'Empty',
    description: 'Blank view — add tickers and cards from scratch.',
    view: {
      name: 'New view',
      tickers: [],
      cards: [],
      privacy: 'private',
      isPinned: false,
    },
  },
]

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
  const raw = card as Partial<ViewCard> & { primaryMetric?: MetricKey }
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
  return {
    name: typeof raw.name === 'string' ? raw.name : 'Card',
    groupBy,
    filters,
    sortBy,
    columns: Array.isArray(raw.columns) ? raw.columns : [],
    limit: typeof raw.limit === 'number' ? raw.limit : 5,
  }
}
