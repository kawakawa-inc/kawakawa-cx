import { computed, ref, watch, type ComputedRef } from 'vue'
import type { SearchChip, SearchChipType } from '../components/TokenSearchInput.vue'
import { useSettingsStore } from '../stores/settings'
import { commodityService } from '../services/commodityService'
import { locationService } from '../services/locationService'

/**
 * Per-surface, per-type LRU search history backed by `localStorage`. The
 * `TokenSearchInput` component uses this to surface a "Recent" row for each
 * chip type the surface accepts. We keep history client-side because:
 *
 * - it's small and personal; the server doesn't need to fan it out;
 * - it works offline / without auth;
 * - it can grow asymmetrically per surface (the Burn & Repair user might
 *   accumulate a lot of recent tickers without that bleeding into Market).
 *
 * Storage shape under `kawakawa:search-history:<key>`:
 *
 *   { [chipType]: SearchChip[] }
 *
 * Each entry list is bounded by {@link HISTORY_PER_TYPE_CAP} and ordered
 * most-recent-first. Chips with payloads (currently `shoppingListData`) are
 * intentionally skipped — they're transient pasted blobs, not search terms.
 */

const STORAGE_PREFIX = 'kawakawa:search-history:'
const HISTORY_PER_TYPE_CAP = 5

// Which chip types may be favorited. Tickers and locations are the durable,
// reusable terms a user accumulates — buy/sell or shopping-list pastes are
// transient or singular and don't make sense to pin. These also map to the
// existing user-settings keys (market.favoritedCommodities / favoritedLocations),
// so a star here flows through to all the other places those settings are read
// (KeyValueAutocomplete pickers in OrderDialog, FlowEditDialog, etc.).
const FAVORITABLE_TYPES: ReadonlyArray<SearchChipType> = ['commodity', 'location']

type HistoryMap = Partial<Record<SearchChipType, SearchChip[]>>

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`
}

// Generic safe-loader — used by both history and favorites since the storage
// shape (per-type chip lists) is identical.
function loadHistoryMap(rawKey: string): HistoryMap {
  try {
    const raw = localStorage.getItem(rawKey)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    // Defensive: drop any malformed entries so a corrupt key can't crash the
    // input on first focus.
    const out: HistoryMap = {}
    for (const [type, chips] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(chips)) continue
      const valid = chips.filter(
        (c): c is SearchChip =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as SearchChip).type === 'string' &&
          typeof (c as SearchChip).value === 'string' &&
          typeof (c as SearchChip).display === 'string'
      )
      if (valid.length > 0) out[type as SearchChipType] = valid
    }
    return out
  } catch {
    return {}
  }
}

function saveHistoryMap(rawKey: string, map: HistoryMap): void {
  try {
    localStorage.setItem(rawKey, JSON.stringify(map))
  } catch {
    // Quota exceeded or storage disabled — silently drop. History is a
    // convenience, not a correctness requirement.
  }
}

export interface SearchHistory {
  /** Reactive history map. Use `historyByType.value[chipType]` to read. */
  historyByType: ComputedRef<HistoryMap>
  /**
   * Record a chip into history. Chips with payloads are skipped. Existing
   * entries for the same type+value are moved to the front (LRU). The list
   * for that type is capped at 5.
   */
  record: (chip: SearchChip) => void
  /** Clear all history under this key. */
  clear: () => void
  /** Clear a single chip from history (e.g. user removes "RAT" from Recent). */
  remove: (type: SearchChipType, value: string) => void

  // -------- Favorites --------
  /** Reactive favorites map (commodity + location only). */
  favoritesByType: ComputedRef<HistoryMap>
  /** Whether a chip is currently favorited. */
  isFavorite: (type: SearchChipType, value: string) => boolean
  /** Whether a chip type is allowed to be favorited at all. */
  canFavorite: (type: SearchChipType) => boolean
  /**
   * Toggle a chip's favorite state. No-op for chip types outside the
   * favoritable allowlist (currently commodity + location).
   */
  toggleFavorite: (chip: SearchChip) => void
}

/**
 * @param historyKey  Stable per-surface id (e.g. `"market"`, `"burn-repair"`).
 *                    A null/empty key disables persistence — the composable
 *                    becomes a no-op so the consumer doesn't need conditional
 *                    wiring.
 */
export function useSearchHistory(historyKey: string | undefined | null): SearchHistory {
  const enabled = !!historyKey
  const history = ref<HistoryMap>(enabled ? loadHistoryMap(storageKey(historyKey!)) : {})

  // Favorites are user-global, server-persisted via the settings store —
  // the same source `KeyValueAutocomplete` already reads from. Keeping a
  // single source of truth means a ticker starred in Market also shows up
  // as starred in OrderDialog, ShoppingListPanel, and Burn & Repair.
  const settingsStore = useSettingsStore()

  // Build SearchChip-shaped favorites from the bare ticker/location IDs the
  // settings store stores. Display strings reflect the user's display-mode
  // preferences (handled by the existing services).
  const favoritesByType = computed<HistoryMap>(() => {
    const out: HistoryMap = {}
    const tickers = settingsStore.favoritedCommodities.value ?? []
    if (tickers.length > 0) {
      out.commodity = tickers.map(value => ({
        type: 'commodity' as const,
        value,
        display: commodityService.getCommodityDisplay(
          value,
          settingsStore.commodityDisplayMode.value
        ),
      }))
    }
    const locationIds = settingsStore.favoritedLocations.value ?? []
    if (locationIds.length > 0) {
      out.location = locationIds.map(value => ({
        type: 'location' as const,
        value,
        display: locationService.getLocationDisplay(value, settingsStore.locationDisplayMode.value),
      }))
    }
    return out
  })

  const historyByType = computed(() => history.value)

  function record(chip: SearchChip): void {
    if (!enabled) return
    // Don't record chips that carry transient payloads — pasted shopping
    // lists aren't searchable terms and would bloat history.
    if (chip.shoppingListData) return

    const list = (history.value[chip.type] ?? []).slice()
    const dupIdx = list.findIndex(c => c.value === chip.value)
    if (dupIdx >= 0) list.splice(dupIdx, 1)

    // Strip color so we re-derive it on render — color is a visual concern
    // owned by the consuming component, not the persisted record. shoppingListData
    // is excluded by the early-return above, so we never persist it.
    const { color: _color, shoppingListData: _payload, ...rest } = chip
    list.unshift(rest)
    history.value = {
      ...history.value,
      [chip.type]: list.slice(0, HISTORY_PER_TYPE_CAP),
    }
  }

  function remove(type: SearchChipType, value: string): void {
    if (!enabled) return
    const list = history.value[type]
    if (!list) return
    const next = list.filter(c => c.value !== value)
    if (next.length === list.length) return
    if (next.length === 0) {
      const { [type]: _dropped, ...rest } = history.value
      history.value = rest
    } else {
      history.value = { ...history.value, [type]: next }
    }
  }

  function clear(): void {
    if (!enabled) return
    history.value = {}
  }

  function canFavorite(type: SearchChipType): boolean {
    return FAVORITABLE_TYPES.includes(type)
  }

  function isFavorite(type: SearchChipType, value: string): boolean {
    if (!canFavorite(type)) return false
    if (type === 'commodity') {
      return (settingsStore.favoritedCommodities.value ?? []).includes(value)
    }
    return (settingsStore.favoritedLocations.value ?? []).includes(value)
  }

  function toggleFavorite(chip: SearchChip): void {
    if (!canFavorite(chip.type)) return
    if (chip.type === 'commodity') {
      const current = settingsStore.favoritedCommodities.value ?? []
      const idx = current.indexOf(chip.value)
      const next = idx >= 0 ? current.filter(v => v !== chip.value) : [...current, chip.value]
      settingsStore.updateSetting('market.favoritedCommodities', next)
      return
    }
    if (chip.type === 'location') {
      const current = settingsStore.favoritedLocations.value ?? []
      const idx = current.indexOf(chip.value)
      const next = idx >= 0 ? current.filter(v => v !== chip.value) : [...current, chip.value]
      settingsStore.updateSetting('market.favoritedLocations', next)
    }
  }

  // Persist history on every change. Cheap (single localStorage write per chip
  // add) and easier to reason about than debouncing. Favorites are persisted
  // by the settings store on update — no watcher needed here.
  watch(history, value => {
    if (!enabled) return
    saveHistoryMap(storageKey(historyKey!), value)
  })

  return {
    historyByType,
    record,
    clear,
    remove,
    favoritesByType,
    isFavorite,
    canFavorite,
    toggleFavorite,
  }
}
