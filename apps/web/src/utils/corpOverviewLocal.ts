import type { CorpOverviewView, FilterPrivacy, MetricKey, ViewCard } from '@kawakawa/types'

/**
 * Sentinel viewId used for an in-progress "+ New view" before it lands on the
 * server. The sentinel keeps unsaved drafts inside the same `localByView` map
 * as real views, so view-switching, persistence across reloads, and Save/
 * Discard plumbing all work uniformly. Real view ids are positive integers,
 * `-1` is the built-in, so `-2` is the next free spot.
 */
export const UNSAVED_VIEW_ID = -2

export function isUnsavedViewId(id: number): boolean {
  return id === UNSAVED_VIEW_ID
}

/**
 * Per-card Local-only ephemeral state. Key is the card's stable `clientId`.
 *
 * Just `page` after PR 6 — the previous `tickers` (per-card user filter
 * overlay) and `pageSize` (transient page-size override) folded into the
 * card's saved `tickers` and `limit` fields under WYSIWYG. Persisted
 * localStorage entries from before the fold may carry the extra keys; reads
 * ignore them and the next save flushes them out.
 */
export interface CardLocalState {
  page: number
}

/**
 * Local working copy of a Corp Overview View. Mirrors the savable subset of
 * the Saved view: editing any of these in the dashboard marks Local dirty
 * and surfaces the Save button.
 *
 * `cardState` holds Local-only ephemerals (page numbers) — never part of
 * what gets persisted, so editing those never dirties the view.
 */
export interface LocalViewState {
  /**
   * Working copies of every field the user can edit inline on the dashboard.
   * Mirror Saved when clean; the Save button picks up any divergence.
   */
  name: string
  privacy: FilterPrivacy
  tickers: string[]
  excludedUserIds: number[]
  materialsTableColumns: MetricKey[]
  materialsTableTickers: string[]
  /**
   * Working copy of the view's cards. Mirrors `saved.cards` when clean.
   * Card-level edits — name, columns, filters, sort, scope, limit, type —
   * mutate this array; the Save button picks up any divergence from Saved.
   * Cards keep their stable `clientId` across edits so per-card pagination
   * stays attached.
   */
  cards: ViewCard[]
  cardState: Record<string, CardLocalState>
  /**
   * Saved.updatedAt at the moment Local was last in sync with the server.
   * Compared on view load to detect a stale Local against an updated Saved
   * (e.g. a co-owner saved while we were editing). ISO timestamp; the empty
   * string is reserved for the built-in view (no persisted state) and for
   * unsaved-draft views (no server counterpart yet) — `isLocalStale`
   * shortcircuits both.
   */
  baseUpdatedAt: string
}

/**
 * Deep-clone a card so mutations on Local don't bleed back into the Saved
 * snapshot. JSON round-trip is fine here — `ViewCard` is plain data with
 * arrays of primitives + nested objects of primitives, no functions or
 * Date instances to lose.
 */
function cloneCard(card: ViewCard): ViewCard {
  return JSON.parse(JSON.stringify(card)) as ViewCard
}

/** Build a fresh Local seeded from a Saved view. Used on first open and on Discard. */
export function initLocal(saved: CorpOverviewView): LocalViewState {
  return {
    name: saved.name,
    privacy: saved.privacy,
    tickers: [...saved.tickers],
    excludedUserIds: [...saved.excludedUserIds],
    materialsTableColumns: [...saved.materialsTableColumns],
    materialsTableTickers: [...saved.materialsTableTickers],
    cards: saved.cards.map(cloneCard),
    cardState: {},
    baseUpdatedAt: saved.updatedAt,
  }
}

/**
 * Build a fresh Local for an unsaved-draft view. Sensible defaults so the
 * dashboard renders something coherent until the user fills things in; first
 * Save promotes this into a real view via POST.
 */
export function initUnsavedLocal(): LocalViewState {
  return {
    name: 'Untitled view',
    privacy: 'private',
    tickers: [],
    excludedUserIds: [],
    materialsTableColumns: [],
    materialsTableTickers: [],
    cards: [],
    cardState: {},
    baseUpdatedAt: '',
  }
}

function sameNumberSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y)
  const sb = [...b].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}

/**
 * Order-preserving equality on a string list. Used for `materialsTableTickers`
 * and similar scope arrays where the user's chosen order is meaningful for
 * downstream display (chip ordering in the editor).
 */
function sameStringList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

/**
 * Deep-compare two card arrays via JSON serialization. Adequate because cards
 * are pure data (no Date / function fields) and we control both sides — they
 * always come from the same code paths so key ordering is stable.
 */
function sameCards(a: ViewCard[], b: ViewCard[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * True iff any savable field on Local differs from Saved. Drives the "is the
 * Save button visible" decision and the Discard button. Per-card ephemerals
 * (pagination) are intentionally excluded — they aren't part of what gets
 * persisted.
 */
export function isLocalDirty(local: LocalViewState, saved: CorpOverviewView): boolean {
  if (local.name !== saved.name) return true
  if (local.privacy !== saved.privacy) return true
  if (!sameStringList(local.tickers, saved.tickers)) return true
  if (!sameNumberSet(local.excludedUserIds, saved.excludedUserIds)) return true
  if (!sameStringList(local.materialsTableColumns, saved.materialsTableColumns)) return true
  if (!sameStringList(local.materialsTableTickers, saved.materialsTableTickers)) return true
  if (!sameCards(local.cards, saved.cards)) return true
  return false
}

/**
 * True iff Saved has been updated since Local was last in sync — i.e. someone
 * else saved while we were editing. Empty `baseUpdatedAt` (built-in view or
 * brand-new Local) means "no recorded sync point" and is treated as not-stale.
 */
export function isLocalStale(local: LocalViewState, saved: CorpOverviewView): boolean {
  if (!local.baseUpdatedAt) return false
  if (!saved.updatedAt) return false
  return saved.updatedAt > local.baseUpdatedAt
}

/**
 * Snap Local's savable subset back to Saved while preserving Local-only
 * ephemerals — per-card pagination, ad-hoc card filters, etc. Used by both
 * Discard (user-initiated reset) and silent stale-snap (Saved moved while
 * Local was clean).
 *
 * Distinct from `initLocal`: that builds a brand-new Local with empty
 * `cardState`, which is the right behavior on first-open but would wipe
 * the user's pagination on Discard.
 */
export function resetLocalToSaved(local: LocalViewState, saved: CorpOverviewView): LocalViewState {
  return {
    name: saved.name,
    privacy: saved.privacy,
    tickers: [...saved.tickers],
    excludedUserIds: [...saved.excludedUserIds],
    materialsTableColumns: [...saved.materialsTableColumns],
    materialsTableTickers: [...saved.materialsTableTickers],
    cards: saved.cards.map(cloneCard),
    cardState: local.cardState,
    baseUpdatedAt: saved.updatedAt,
  }
}
