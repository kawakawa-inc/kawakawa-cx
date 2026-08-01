<template>
  <div ref="wrapperRef" class="token-search-wrapper">
    <div class="token-search-container" :class="{ focused: isFocused }" @click="focusInput">
      <v-icon v-if="leadingIcon" size="small" color="grey" class="search-icon">{{
        leadingIcon
      }}</v-icon>
      <kbd v-else class="search-icon search-shortcut" title="Press / to focus search">/</kbd>

      <!-- Chips for parsed tokens. A per-type scoped slot (`chip-<type>`) lets a
           consumer fully customize a chip's rendering; when none is provided
           the default closable chip below is used. -->
      <template v-for="(chip, index) in chips" :key="`${chip.type}-${chip.value}-${index}`">
        <slot
          :name="`chip-${chip.type}`"
          :chip="chip"
          :index="index"
          :remove="() => removeChip(index)"
        >
          <v-chip
            :color="chip.color"
            :prepend-icon="chipIconByType[chip.type]"
            size="small"
            closable
            class="token-chip"
            @click:close="removeChip(index)"
          >
            {{ chip.display }}
          </v-chip>
        </slot>
      </template>

      <!-- Text input for current/unparsed text -->
      <input
        ref="inputRef"
        v-model="inputText"
        type="text"
        class="token-input"
        :placeholder="chips.length === 0 ? placeholder : ''"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="handleKeydown"
        @input="handleInput"
        @paste="handlePaste"
      />

      <!-- Clear button -->
      <v-btn
        v-if="chips.length > 0 || inputText"
        icon="mdi-close-circle"
        variant="text"
        size="x-small"
        class="clear-btn"
        @click.stop="clearAll"
      />
    </div>

    <!-- Autocomplete suggestions dropdown - teleported to body to escape stacking context -->
    <Teleport to="body">
      <div
        v-if="showSuggestions && suggestions.length > 0"
        class="suggestions-dropdown"
        :style="dropdownStyle"
      >
        <div
          v-for="(suggestion, index) in suggestions"
          :key="`${suggestion.type}-${suggestion.value}`"
          class="suggestion-item"
          :class="{ selected: index === selectedIndex }"
          @mousedown.prevent="selectSuggestion(suggestion)"
          @mouseenter="selectedIndex = index"
        >
          <v-chip
            :color="suggestion.color"
            :prepend-icon="chipIconByType[suggestion.type]"
            size="x-small"
            class="suggestion-chip"
          >
            {{ suggestion.typeLabel }}
          </v-chip>
          <span class="suggestion-text">{{ suggestion.display }}</span>
          <span v-if="suggestion.hint" class="suggestion-hint">{{ suggestion.hint }}</span>
        </div>
      </div>
      <div v-else-if="showHelp" class="suggestions-dropdown help-dropdown" :style="dropdownStyle">
        <!-- Favorites: pinned tickers / locations the user has explicitly
             starred. Shown first because they're the most curated set. -->
        <template v-if="favoriteRows.length > 0">
          <div class="history-section">
            <div class="help-title">Favorites</div>
            <div v-for="row in favoriteRows" :key="`fav-${row.type}`" class="history-row">
              <span class="history-row-label">{{ row.label }}</span>
              <div class="history-chips">
                <v-chip
                  v-for="chip in row.chips"
                  :key="`${chip.type}-${chip.value}`"
                  :color="chipColor(chip.type, chip.value)"
                  :prepend-icon="chipIconByType[chip.type]"
                  size="x-small"
                  class="history-chip"
                  @mousedown.prevent="applyHistoryChip(chip)"
                >
                  {{ chip.display }}
                  <!-- Filled star on favorites — click to unstar. mousedown.stop
                       so the chip's apply handler doesn't also fire. -->
                  <v-icon
                    end
                    size="x-small"
                    color="amber"
                    class="favorite-toggle"
                    @mousedown.stop.prevent="onFavoriteToggle(chip)"
                  >
                    mdi-star
                  </v-icon>
                </v-chip>
              </div>
            </div>
          </div>
        </template>

        <!-- History rows: one per chip type the user has used here before.
             Most-recent-first; click a chip to add it to the search. -->
        <template v-if="historyRows.length > 0">
          <v-divider v-if="favoriteRows.length > 0" class="my-2" />
          <div class="history-section">
            <div class="help-title">Recent</div>
            <div v-for="row in historyRows" :key="row.type" class="history-row">
              <span class="history-row-label">{{ row.label }}</span>
              <div class="history-chips">
                <v-chip
                  v-for="chip in row.chips"
                  :key="`${chip.type}-${chip.value}`"
                  :color="chipColor(chip.type, chip.value)"
                  :prepend-icon="chipIconByType[chip.type]"
                  size="x-small"
                  class="history-chip"
                  @mousedown.prevent="applyHistoryChip(chip)"
                >
                  {{ chip.display }}
                  <!-- Outline star on recent (favoritable types only) — click
                       to promote into Favorites. -->
                  <v-icon
                    v-if="searchHistory.canFavorite(chip.type)"
                    end
                    size="x-small"
                    class="favorite-toggle favorite-toggle-empty"
                    @mousedown.stop.prevent="onFavoriteToggle(chip)"
                  >
                    mdi-star-outline
                  </v-icon>
                </v-chip>
              </div>
            </div>
          </div>
          <v-divider v-if="helpTokens.length > 0" class="my-2" />
        </template>

        <div v-if="helpTokens.length > 0" class="help-title">
          Start typing to search. You can add:
        </div>
        <div v-for="(tok, i) in helpTokens" :key="i" class="help-row">
          <v-chip
            :color="tok.color ?? 'grey'"
            :prepend-icon="tok.icon"
            size="x-small"
            class="help-chip"
          >
            {{ tok.label }}
          </v-chip>
          <div class="help-body">
            <code class="help-example">{{ tok.example }}</code>
            <span class="help-desc">{{ tok.description }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { parseShoppingList, isShoppingList } from '@kawakawa/types/shopping-list'
import { commodityService } from '../services/commodityService'
import { locationService } from '../services/locationService'
import { useShoppingListStore } from '../stores/shoppingList'
import { useSearchHistory } from '../composables/useSearchHistory'

export type SearchChipType =
  | 'commodity'
  | 'location'
  | 'source'
  | 'destination'
  | 'user'
  | 'itemType'
  | 'shoppingList'
  | 'category'
  | 'storage'
  | 'priceList'
  | 'packageType'
  | 'orderType'
  | 'pricing'
  | 'availability'

export interface SearchChip {
  type: SearchChipType
  value: string // Actual value (ticker, location ID, username, 'sell'/'buy', category key, storage type)
  display: string // Display text
  color?: string // Chip color — derived from type if not provided
  shoppingListData?: {
    materials: Record<string, number>
    name?: string
    origin?: string // Location ID from XIT origin
  }
}

export interface ExtraSuggestionType {
  type: SearchChipType
  typeLabel: string
  color: string
  options: { value: string; display: string }[]
}

/**
 * One row shown in the empty-state cheat sheet. Pages describe the tokens
 * they understand so the help dropdown stays true to what each search
 * actually accepts.
 */
export interface HelpToken {
  label: string
  color?: string
  example: string
  description: string
  icon?: string
}

// Initialize shopping list store
const shoppingListStore = useShoppingListStore()

// Canonical chip colors by type — single source of truth
const chipColor = (type: SearchChip['type'], value?: string): string => {
  switch (type) {
    case 'commodity':
      return 'primary'
    case 'location':
      return 'secondary'
    case 'source':
      return 'blue'
    case 'destination':
      return 'green'
    case 'user':
      return 'info'
    case 'itemType':
      return value === 'buy' ? 'warning' : 'success'
    case 'shoppingList':
      return 'purple'
    case 'category':
      return 'teal'
    case 'storage':
      return 'orange'
    case 'orderType':
      return 'brown'
    case 'pricing':
      return 'deep-orange'
    case 'availability':
      return 'cyan'
    default:
      // Check extra suggestion types for color
      return props.extraSuggestionTypes?.find(e => e.type === type)?.color ?? 'grey'
  }
}

interface Suggestion {
  type: SearchChipType
  typeLabel: string
  value: string
  display: string
  hint?: string
  color: string
}

interface Props {
  placeholder?: string
  availableUserNames?: string[]
  /** Function to format commodity display (respects user settings) */
  getCommodityDisplay?: (ticker: string) => string
  /** Function to format location display (respects user settings) */
  getLocationDisplay?: (locationId: string) => string
  /** Function to get localized commodity name (for search matching) */
  getCommodityName?: (ticker: string) => string
  /**
   * Optional: a commodity's category, used to narrow commodity suggestions to
   * whatever `category` chips are currently active. When omitted (the default),
   * category chips don't affect commodity suggestions. Lets a single search box
   * act as "filter materials by category, then pick one".
   */
  getCommodityCategory?: (ticker: string) => string | null
  /** Additional suggestion types (e.g., category, storage) */
  extraSuggestionTypes?: ExtraSuggestionType[]
  /**
   * Empty-state cheat sheet shown on focus when the input is blank. Pages
   * declare what tokens they understand so the help stays accurate.
   */
  helpTokens?: HelpToken[]
  /**
   * External chip state — when provided, the input becomes controlled. This
   * is what the BR ticker/category surfaces use so their string[] data model
   * round-trips correctly. When omitted, chips live entirely inside this
   * component (the legacy Market / MyOrders / Logistics use case).
   */
  chips?: SearchChip[]
  /** Optional per-type prepend icon shown on chips (e.g. mdi-folder-outline for category). */
  chipIconByType?: Partial<Record<SearchChipType, string>>
  /**
   * Replaces the default `/` kbd shortcut leading icon with an MDI icon. Pass
   * e.g. `"mdi-tag-multiple"` for the BR ticker filter.
   */
  leadingIcon?: string
  /**
   * When set, pasting multi-token text (split on whitespace/comma/semicolon)
   * creates one chip of this type per token instead of dropping into the
   * input as raw text. BR uses this to accept comma-separated ticker lists.
   */
  pasteSplitTo?: SearchChipType
  /**
   * When set, pressing Enter on a non-empty input that doesn't match any
   * suggestion creates a chip of this type from the typed text. Lets BR
   * accept arbitrary tickers that aren't in the catalog.
   */
  enterCreatesType?: SearchChipType
  /**
   * Stable id for client-side search history (localStorage). When set, the
   * empty-state dropdown surfaces a per-type "Recent" row above the help
   * cheat sheet. Use a unique key per surface (e.g. "market", "burn-repair").
   */
  historyKey?: string
  /**
   * When set, restricts suggestions and the autocomplete dropdown to these
   * chip types. BR uses this to keep ticker/category-only filtering free of
   * locations, users, and buy/sell keywords from the catch-all branches.
   */
  allowedSuggestionTypes?: SearchChipType[]
  /**
   * Chip types that replace any existing chip of the same type when a new
   * one is picked, instead of accumulating alongside it (e.g. a package can
   * only be priced against one Price List at a time). Defaults to the
   * original hardcoded set (`itemType`, `category`) so existing surfaces are
   * unaffected; pass a longer list to make additional types (including your
   * own via `extraSuggestionTypes`) single-select too.
   */
  singularTypes?: SearchChipType[]
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Search market...',
  availableUserNames: () => [],
  getCommodityDisplay: (ticker: string) => ticker,
  getLocationDisplay: (locationId: string) => locationId,
  getCommodityName: (ticker: string) => ticker,
  getCommodityCategory: undefined,
  extraSuggestionTypes: () => [],
  helpTokens: () => [],
  chips: undefined,
  chipIconByType: () => ({}),
  leadingIcon: undefined,
  pasteSplitTo: undefined,
  enterCreatesType: undefined,
  historyKey: undefined,
  allowedSuggestionTypes: undefined,
  singularTypes: () => ['itemType', 'category'],
})

// Whether chips of this type should replace (not accumulate alongside) any
// existing chip of the same type — see `singularTypes` prop.
const isSingularType = (type: SearchChipType): boolean => props.singularTypes.includes(type)

// Per-surface search history (no-op when historyKey is undefined). Records on
// every chip add and surfaces "Recent" rows in the empty-state dropdown.
const searchHistory = useSearchHistory(props.historyKey)

// Empty-state dropdown shows the cheat sheet, the per-type history rows, the
// favorites rows, or any combination. Hide entirely when none of the three
// have content (matches legacy behavior on surfaces without helpTokens).
const showHelp = computed(() => {
  if (!isFocused.value) return false
  if (inputText.value.trim().length !== 0) return false
  return (
    props.helpTokens.length > 0 || historyRows.value.length > 0 || favoriteRows.value.length > 0
  )
})

interface HistoryRow {
  type: SearchChipType
  label: string
  chips: SearchChip[]
}

// Pluralized labels per chip type. Falls back to the type name when missing —
// extra chip types brought in by `extraSuggestionTypes` get a plain "Recent
// {type}" treatment without us having to teach the composable about them.
const HISTORY_TYPE_LABELS: Partial<Record<SearchChipType, string>> = {
  commodity: 'Commodities',
  location: 'Locations',
  user: 'Users',
  itemType: 'Type',
  category: 'Categories',
  storage: 'Storage',
  source: 'Source',
  destination: 'Destination',
  priceList: 'Price Lists',
  packageType: 'Type',
}

// Canonical type order for history/favorites rendering — keeps surfaces
// consistent so a user's eye lands on Commodities first regardless of which
// page they're on.
const HISTORY_TYPE_ORDER: SearchChipType[] = [
  'commodity',
  'category',
  'location',
  'source',
  'destination',
  'storage',
  'user',
  'itemType',
  'priceList',
  'packageType',
]

// Build per-type rows from a chip map, optionally hiding entries that pass
// the `excludeIf` filter. Used by both Recent (excludes favorited) and
// Favorites (no exclusion).
function buildRows(
  map: Partial<Record<SearchChipType, SearchChip[]>>,
  excludeIf?: (chip: SearchChip) => boolean
): HistoryRow[] {
  const out: HistoryRow[] = []
  const seen = new Set<string>()
  const pushRow = (type: SearchChipType): void => {
    // Respect the field's allowlist: don't surface history/favorites for chip
    // types this surface doesn't accept (mirrors how suggestions are gated).
    if (props.allowedSuggestionTypes && !props.allowedSuggestionTypes.includes(type)) return
    const all = map[type]
    if (!all) return
    const chips = excludeIf ? all.filter(c => !excludeIf(c)) : all
    if (chips.length === 0) return
    out.push({ type, label: HISTORY_TYPE_LABELS[type] ?? type, chips })
    seen.add(type)
  }
  for (const type of HISTORY_TYPE_ORDER) pushRow(type)
  // Catch extra types (e.g. category-like things from extraSuggestionTypes
  // that aren't in the canonical order).
  for (const type of Object.keys(map) as SearchChipType[]) {
    if (seen.has(type)) continue
    pushRow(type)
  }
  return out
}

// Recent excludes anything currently in Favorites — no point showing the
// same chip twice.
const historyRows = computed<HistoryRow[]>(() =>
  buildRows(searchHistory.historyByType.value, chip =>
    searchHistory.isFavorite(chip.type, chip.value)
  )
)

const favoriteRows = computed<HistoryRow[]>(() => buildRows(searchHistory.favoritesByType.value))

// Click a recent chip to apply it. Dedups against current chips and routes
// through the same singular-type-replacement logic as suggestion picks.
function applyHistoryChip(chip: SearchChip): void {
  if (chips.value.find(c => c.type === chip.type && c.value === chip.value)) return
  if (isSingularType(chip.type)) {
    chips.value = chips.value.filter(c => c.type !== chip.type)
  }
  chips.value.push({ ...chip, color: chipColor(chip.type, chip.value) })
  // Push to front of history so re-clicked items stay sticky.
  searchHistory.record(chip)
  emitChanges()
  nextTick(() => focusInput())
}

// Star/unstar handler. The composable filters non-favoritable types itself,
// so we don't need to gate at the UI layer beyond the v-if on the icon.
function onFavoriteToggle(chip: SearchChip): void {
  searchHistory.toggleFavorite(chip)
}

const emit = defineEmits<{
  (e: 'update:chips', chips: SearchChip[]): void
  (e: 'update:freeText', text: string): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const wrapperRef = ref<HTMLElement | null>(null)
const isFocused = ref(false)
const inputText = ref('')
// Internal chip state. When `props.chips` is provided we mirror it here so the
// rest of the component can keep using the same ref; the watcher below pushes
// external updates in, and emitChanges pushes our changes out.
const chips = ref<SearchChip[]>(props.chips ? [...props.chips] : [])
const selectedIndex = ref(0)
const showSuggestions = ref(false)

// Mirror external chip state into the internal ref. Guarded so emit-then-prop
// round-trips don't bounce: if the incoming prop already matches our state
// (same length and ids in order), skip the assignment.
watch(
  () => props.chips,
  next => {
    if (!next) return
    const same =
      next.length === chips.value.length &&
      next.every((c, i) => c.type === chips.value[i].type && c.value === chips.value[i].value)
    if (!same) {
      chips.value = [...next]
    }
  },
  { deep: true }
)

// Dropdown positioning (for teleported dropdown)
const dropdownPosition = ref({ top: 0, left: 0, width: 0 })

const updateDropdownPosition = () => {
  if (wrapperRef.value) {
    const rect = wrapperRef.value.getBoundingClientRect()
    dropdownPosition.value = {
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
    }
  }
}

const dropdownStyle = computed(() => ({
  position: 'absolute' as const,
  top: `${dropdownPosition.value.top}px`,
  left: `${dropdownPosition.value.left}px`,
  width: `${dropdownPosition.value.width}px`,
}))

// Focus the input when clicking the container
const focusInput = () => {
  inputRef.value?.focus()
}

const onFocus = () => {
  isFocused.value = true
  updateDropdownPosition()
  showSuggestions.value = true
}

const onBlur = () => {
  isFocused.value = false
  // Delay hiding to allow click on suggestion
  setTimeout(() => {
    showSuggestions.value = false
  }, 150)
}

// Parse XIT origin string to find location
// Strips " Warehouse" suffix and matches against known locations
const parseXitOrigin = (origin: string): string | null => {
  if (!origin) return null

  const locations = locationService.getAllLocationsSync()

  // Try exact match first
  const exactMatch = locations.find(l => l.name.toLowerCase() === origin.toLowerCase())
  if (exactMatch) return exactMatch.id

  // Strip common suffixes and try again
  const suffixes = [' Warehouse', ' Storage', ' Base']
  for (const suffix of suffixes) {
    if (origin.toLowerCase().endsWith(suffix.toLowerCase())) {
      const stripped = origin.slice(0, -suffix.length)
      const match = locations.find(l => l.name.toLowerCase() === stripped.toLowerCase())
      if (match) return match.id
    }
  }

  // Try partial match (location name is prefix of origin)
  const partialMatch = locations.find(l => origin.toLowerCase().startsWith(l.name.toLowerCase()))
  if (partialMatch) return partialMatch.id

  return null
}

// Get suggestions based on current input
// Active category chips narrow which commodities can be suggested (only when
// the consumer supplies getCommodityCategory). Empty set = no restriction.
const activeCategoryFilter = computed(() => {
  if (!props.getCommodityCategory) return null
  const cats = chips.value.filter(c => c.type === 'category').map(c => c.value)
  return cats.length > 0 ? new Set(cats) : null
})

const commodityMatchesCategory = (ticker: string): boolean => {
  const filter = activeCategoryFilter.value
  if (!filter) return true
  const cat = props.getCommodityCategory?.(ticker) ?? null
  return cat !== null && filter.has(cat)
}

const suggestions = computed((): Suggestion[] => {
  const currentWord = getCurrentWord()
  if (!currentWord || currentWord.length < 1) return []

  const results: Suggestion[] = []
  const lowerWord = currentWord.toLowerCase()
  const upperWord = currentWord.toUpperCase()

  // Check for prefixes first
  if (currentWord.toLowerCase().startsWith('commodity:')) {
    const query = currentWord.slice('commodity:'.length).toLowerCase()
    if (query) {
      const commodities = commodityService.getAllCommoditiesSync()
      for (const c of commodities) {
        const localizedName = props.getCommodityName(c.ticker).toLowerCase()
        if (
          (c.ticker.toLowerCase().includes(query) ||
            c.name.toLowerCase().includes(query) ||
            localizedName.includes(query)) &&
          commodityMatchesCategory(c.ticker)
        ) {
          results.push({
            type: 'commodity',
            typeLabel: 'Commodity',
            value: c.ticker,
            display: c.ticker,
            hint: props.getCommodityName(c.ticker),
            color: chipColor('commodity'),
          })
          if (results.length >= 8) break
        }
      }
    }
    return results
  }

  if (currentWord.toLowerCase().startsWith('location:')) {
    const query = currentWord.slice('location:'.length).toLowerCase()
    if (query) {
      const locations = locationService.getAllLocationsSync()
      for (const l of locations) {
        if (l.id.toLowerCase().includes(query) || l.name.toLowerCase().includes(query)) {
          results.push({
            type: 'location',
            typeLabel: 'Location',
            value: l.id,
            display: l.name,
            hint: l.id,
            color: chipColor('location'),
          })
          if (results.length >= 8) break
        }
      }
    }
    return results
  }

  if (currentWord.toLowerCase().startsWith('user:')) {
    const query = currentWord.slice('user:'.length).toLowerCase()
    if (query) {
      for (const u of props.availableUserNames) {
        if (u.toLowerCase().includes(query)) {
          results.push({
            type: 'user',
            typeLabel: 'User',
            value: u,
            display: u,
            color: chipColor('user'),
          })
          if (results.length >= 8) break
        }
      }
    }
    return results
  }

  // Buy/Sell keywords
  if ('buy'.startsWith(lowerWord)) {
    results.push({
      type: 'itemType',
      typeLabel: 'Type',
      value: 'buy',
      display: 'Buy',
      hint: 'Show buy orders',
      color: chipColor('itemType', 'buy'),
    })
  }
  if ('sell'.startsWith(lowerWord)) {
    results.push({
      type: 'itemType',
      typeLabel: 'Type',
      value: 'sell',
      display: 'Sell',
      hint: 'Show sell orders',
      color: chipColor('itemType', 'sell'),
    })
  }

  // Commodities - match by ticker, internal name, or localized name
  const commodities = commodityService.getAllCommoditiesSync()

  // Always include exact ticker match first (so early break doesn't skip it)
  const exactTickerMatch = commodities.find(
    c => c.ticker.toUpperCase() === upperWord && commodityMatchesCategory(c.ticker)
  )
  if (exactTickerMatch) {
    results.push({
      type: 'commodity',
      typeLabel: 'Commodity',
      value: exactTickerMatch.ticker,
      display: exactTickerMatch.ticker,
      hint: props.getCommodityName(exactTickerMatch.ticker),
      color: chipColor('commodity'),
    })
  }

  for (const c of commodities) {
    const localizedName = props.getCommodityName(c.ticker).toLowerCase()
    if (
      (c.ticker.toUpperCase() === upperWord ||
        c.ticker.toLowerCase().startsWith(lowerWord) ||
        c.name.toLowerCase().startsWith(lowerWord) ||
        c.name.toLowerCase().includes(lowerWord) ||
        localizedName.startsWith(lowerWord) ||
        localizedName.includes(lowerWord)) &&
      commodityMatchesCategory(c.ticker)
    ) {
      // Avoid duplicates (including exact match added above)
      if (!results.find(r => r.type === 'commodity' && r.value === c.ticker)) {
        results.push({
          type: 'commodity',
          typeLabel: 'Commodity',
          value: c.ticker,
          display: c.ticker,
          hint: props.getCommodityName(c.ticker),
          color: chipColor('commodity'),
        })
      }
    }
    if (results.length >= 10) break
  }

  // Locations - match by ID or name
  const locations = locationService.getAllLocationsSync()
  for (const l of locations) {
    if (
      l.id.toLowerCase().startsWith(lowerWord) ||
      l.name.toLowerCase().startsWith(lowerWord) ||
      l.name.toLowerCase().includes(lowerWord)
    ) {
      // Avoid duplicates
      if (!results.find(r => r.type === 'location' && r.value === l.id)) {
        results.push({
          type: 'location',
          typeLabel: 'Location',
          value: l.id,
          display: l.name,
          hint: l.id,
          color: chipColor('location'),
        })
      }
    }
    if (results.length >= 12) break
  }

  // Users
  for (const u of props.availableUserNames) {
    if (u.toLowerCase().startsWith(lowerWord) || u.toLowerCase().includes(lowerWord)) {
      if (!results.find(r => r.type === 'user' && r.value === u)) {
        results.push({
          type: 'user',
          typeLabel: 'User',
          value: u,
          display: u,
          color: chipColor('user'),
        })
      }
    }
    if (results.length >= 15) break
  }

  // Extra suggestion types (category, storage, etc.)
  for (const extra of props.extraSuggestionTypes) {
    for (const opt of extra.options) {
      if (
        opt.value.toLowerCase().startsWith(lowerWord) ||
        opt.display.toLowerCase().startsWith(lowerWord) ||
        opt.display.toLowerCase().includes(lowerWord)
      ) {
        if (!results.find(r => r.type === extra.type && r.value === opt.value)) {
          results.push({
            type: extra.type,
            typeLabel: extra.typeLabel,
            value: opt.value,
            display: opt.display,
            color: extra.color,
          })
        }
      }
      if (results.length >= 15) break
    }
  }

  // Sort: by type (Commodity > Location > User > ItemType > extras), then by match quality
  const typeOrder: Record<string, number> = {
    commodity: 0,
    location: 1,
    category: 2,
    storage: 3,
    user: 4,
    itemType: 5,
    priceList: 6,
    packageType: 7,
  }
  results.sort((a, b) => {
    // First sort by type
    const typeCompare = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99)
    if (typeCompare !== 0) return typeCompare

    // Then by match quality: exact > starts-with > contains
    // Also include hint (localized name) in matching
    const aExact =
      a.value.toLowerCase() === lowerWord ||
      a.display.toLowerCase() === lowerWord ||
      a.hint?.toLowerCase() === lowerWord
    const bExact =
      b.value.toLowerCase() === lowerWord ||
      b.display.toLowerCase() === lowerWord ||
      b.hint?.toLowerCase() === lowerWord
    if (aExact && !bExact) return -1
    if (!aExact && bExact) return 1

    const aStarts =
      a.value.toLowerCase().startsWith(lowerWord) ||
      a.display.toLowerCase().startsWith(lowerWord) ||
      a.hint?.toLowerCase().startsWith(lowerWord)
    const bStarts =
      b.value.toLowerCase().startsWith(lowerWord) ||
      b.display.toLowerCase().startsWith(lowerWord) ||
      b.hint?.toLowerCase().startsWith(lowerWord)
    if (aStarts && !bStarts) return -1
    if (!aStarts && bStarts) return 1

    return 0
  })

  // Optional consumer-side gate: when allowedSuggestionTypes is set, drop any
  // result outside that allowlist. Keeps BR's ticker/category surface from
  // surfacing locations/users/buy-sell from the catch-all matchers.
  const filtered = props.allowedSuggestionTypes
    ? results.filter(r => props.allowedSuggestionTypes!.includes(r.type))
    : results

  return filtered.slice(0, 8)
})

// Get the current word being typed (last word in input)
const getCurrentWord = (): string => {
  const text = inputText.value
  if (!text) return ''
  const words = text.split(/\s+/)
  return words[words.length - 1] || ''
}

// Select a suggestion and create a chip
const selectSuggestion = (suggestion: Suggestion) => {
  const chip = createChipFromSuggestion(suggestion)
  if (chip) {
    // Remove existing chip of same type for singular types
    if (isSingularType(chip.type)) {
      chips.value = chips.value.filter(c => c.type !== chip.type)
    }

    chips.value.push(chip)
    searchHistory.record(chip)

    // Keep any previous words, remove the current one
    const words = inputText.value.split(/\s+/)
    words.pop()
    inputText.value = words.length > 0 ? words.join(' ') + ' ' : ''

    emitChanges()
    selectedIndex.value = 0
    nextTick(() => focusInput())
  }
}

// Create a chip from a suggestion
const createChipFromSuggestion = (suggestion: Suggestion): SearchChip | null => {
  switch (suggestion.type) {
    case 'commodity':
      return {
        type: 'commodity',
        value: suggestion.value,
        display: props.getCommodityDisplay(suggestion.value),
        color: chipColor('commodity'),
      }
    case 'location':
      return {
        type: 'location',
        value: suggestion.value,
        display: props.getLocationDisplay(suggestion.value),
        color: chipColor('location'),
      }
    case 'user':
      return {
        type: 'user',
        value: suggestion.value,
        display: suggestion.value,
        color: chipColor('user'),
      }
    case 'itemType':
      return {
        type: 'itemType',
        value: suggestion.value,
        display: suggestion.value === 'buy' ? 'Buy' : 'Sell',
        color: chipColor('itemType', suggestion.value),
      }
    default: {
      // Extra suggestion types (category, storage, etc.)
      const extra = props.extraSuggestionTypes.find(e => e.type === suggestion.type)
      if (extra) {
        return {
          type: suggestion.type,
          value: suggestion.value,
          display: suggestion.display,
          color: extra.color,
        }
      }
    }
  }
  return null
}

// Extract JSON from input and return remaining text
const extractJsonToken = (input: string): { json: string; remainder: string } | null => {
  if (!input.includes('{')) return null

  const startIdx = input.indexOf('{')
  const jsonPart = input.slice(startIdx)

  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < jsonPart.length; i++) {
    const char = jsonPart[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        return {
          json: jsonPart.slice(0, i + 1),
          remainder: input.slice(0, startIdx) + jsonPart.slice(i + 1),
        }
      }
    }
  }

  return null // Incomplete JSON
}

// Try to parse a shopping list (XIT JSON, CSV, or simple format) and create chips
const tryParseShoppingList = (input: string): SearchChip[] => {
  const result = parseShoppingList(input)
  if (!result.success) return []

  const newChips: SearchChip[] = []

  // For XIT format, try to extract origin from actions
  let originLocationId: string | undefined
  if (result.format === 'xit') {
    try {
      const parsed = JSON.parse(input)
      if (parsed.actions && Array.isArray(parsed.actions)) {
        for (const action of parsed.actions) {
          if (action.origin && typeof action.origin === 'string') {
            const locationId = parseXitOrigin(action.origin)
            if (locationId) {
              originLocationId = locationId
              break
            }
          }
        }
      }
    } catch {
      // Ignore JSON parse errors for origin extraction
    }
  }

  // Create shopping list chip with display based on format
  let displayText: string
  if (result.name) {
    displayText = `List: ${result.name}`
  } else {
    const itemCount = Object.keys(result.materials).length
    displayText = `List (${itemCount} items)`
  }

  newChips.push({
    type: 'shoppingList',
    value: 'shoppingList',
    display: displayText,
    color: chipColor('shoppingList'),
    shoppingListData: {
      materials: result.materials,
      name: result.name,
      origin: originLocationId,
    },
  })

  // Store materials in the shopping list store
  shoppingListStore.setMaterials(result.materials, result.name)

  // Create location chip from origin if found
  if (originLocationId) {
    newChips.push({
      type: 'location',
      value: originLocationId,
      display: props.getLocationDisplay(originLocationId),
      color: chipColor('location'),
    })
  }

  return newChips
}

// Handle input changes - check for shopping list (JSON or CSV/simple formats)
const handleInput = () => {
  selectedIndex.value = 0
  // Ensure suggestions dropdown updates on each keystroke
  updateDropdownPosition()
  if (getCurrentWord().length >= 1) {
    showSuggestions.value = true
  }

  // First check for XIT JSON (needs complete JSON object)
  const extracted = extractJsonToken(inputText.value)
  if (extracted) {
    const listChips = tryParseShoppingList(extracted.json)
    if (listChips.length > 0) {
      // Remove any existing shopping list and location chips that will be replaced
      chips.value = chips.value.filter(c => {
        if (c.type === 'shoppingList') return false
        // Remove location chip if list has origin
        if (c.type === 'location' && listChips.some(lc => lc.type === 'location')) return false
        return true
      })
      chips.value.push(...listChips)
      inputText.value = extracted.remainder.trim()
      emitChanges()
      return
    }
  }

  // Check for CSV/simple format (not JSON)
  // Only try this when input doesn't start with '{' and has a potential shopping list pattern
  const trimmedInput = inputText.value.trim()
  if (!trimmedInput.startsWith('{') && isShoppingList(trimmedInput)) {
    const listChips = tryParseShoppingList(trimmedInput)
    if (listChips.length > 0) {
      // Remove any existing shopping list chips
      chips.value = chips.value.filter(c => c.type !== 'shoppingList')
      chips.value.push(...listChips)
      inputText.value = ''
      emitChanges()
      return
    }
  }
}

// Handle keydown events
const handleKeydown = (event: globalThis.KeyboardEvent) => {
  // Arrow keys for suggestion navigation
  if (showSuggestions.value && suggestions.value.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex.value =
        (selectedIndex.value - 1 + suggestions.value.length) % suggestions.value.length
      return
    }

    // Tab or Enter to select suggestion
    if (event.key === 'Tab' || event.key === 'Enter') {
      if (suggestions.value.length > 0) {
        event.preventDefault()
        selectSuggestion(suggestions.value[selectedIndex.value])
        return
      }
    }
  }

  // Space - try to parse current token (if no suggestions or explicit space)
  if (event.key === ' ') {
    const currentText = inputText.value.trim()

    // Don't process if we're in the middle of JSON
    if (currentText.includes('{') && !currentText.includes('}')) {
      return // Let JSON continue
    }

    // If there's a selected suggestion and input matches, use it
    if (suggestions.value.length > 0) {
      const suggestion = suggestions.value[selectedIndex.value]
      const currentWord = getCurrentWord().toLowerCase()
      // Only auto-select if the word is a decent match
      if (
        suggestion.value.toLowerCase() === currentWord ||
        suggestion.display.toLowerCase() === currentWord ||
        suggestion.value.toLowerCase().startsWith(currentWord)
      ) {
        event.preventDefault()
        selectSuggestion(suggestion)
        return
      }
    }
  }

  // Enter without matching suggestions: when the consumer wants free-form
  // input (e.g. BR ticker filter accepts arbitrary tickers not yet in the
  // catalog), commit the typed text as a chip of the configured type.
  if (event.key === 'Enter') {
    event.preventDefault()
    if (props.enterCreatesType) {
      const trimmed = inputText.value.trim()
      if (trimmed) {
        addChipFromRawToken(trimmed, props.enterCreatesType)
        inputText.value = ''
        showSuggestions.value = false
      }
    }
  }

  // Escape - blur input (Shift+Escape clears everything)
  if (event.key === 'Escape') {
    event.preventDefault()
    if (event.shiftKey) {
      // Shift+Escape: clear everything and blur
      clearAll()
    }
    // Always blur on Escape
    inputRef.value?.blur()
  }

  // Backspace at start of input - delete last chip
  if (event.key === 'Backspace' && inputText.value === '' && chips.value.length > 0) {
    event.preventDefault()
    chips.value.pop()
    emitChanges()
  }
}

// Split a pasted/typed buffer on whitespace, commas, semicolons, newlines.
// Used by `pasteSplitTo` and `enterCreatesType` paths to handle pasted lists.
const splitPastedTokens = (raw: string): string[] =>
  raw
    .split(/[\s,;]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)

// Build a `display` string for a chip created from an arbitrary token. We
// route through the consumer's display formatters when relevant so chip text
// matches how the rest of the page renders that type.
const formatChipDisplay = (type: SearchChipType, value: string): string => {
  switch (type) {
    case 'commodity':
      return props.getCommodityDisplay(value)
    case 'location':
      return props.getLocationDisplay(value)
    default:
      return value
  }
}

// Normalize the raw token into a stored value. Tickers are uppercased so
// dedup matches regardless of the user's case. Other types pass through.
const normalizeTokenValue = (type: SearchChipType, raw: string): string => {
  if (type === 'commodity') return raw.toUpperCase()
  return raw
}

// Append a chip from a raw token (typed text or pasted token). Dedups against
// existing chips of the same type+value. Singular types (itemType, category)
// replace the prior chip of that type.
const addChipFromRawToken = (raw: string, type: SearchChipType) => {
  const value = normalizeTokenValue(type, raw)
  if (!value) return
  if (chips.value.some(c => c.type === type && c.value === value)) return
  if (isSingularType(type)) {
    chips.value = chips.value.filter(c => c.type !== type)
  }
  const chip: SearchChip = {
    type,
    value,
    display: formatChipDisplay(type, value),
    color: chipColor(type, value),
  }
  chips.value.push(chip)
  searchHistory.record(chip)
  emitChanges()
}

// Paste handler — when `pasteSplitTo` is set and the paste contains multiple
// tokens, intercept and create chips for each. Single tokens fall through to
// the default paste behavior so the user can still tweak before committing.
const handlePaste = (event: ClipboardEvent) => {
  if (!props.pasteSplitTo) return
  const text = event.clipboardData?.getData('text') ?? ''
  const tokens = splitPastedTokens(text)
  if (tokens.length <= 1) return
  event.preventDefault()
  for (const token of tokens) {
    addChipFromRawToken(token, props.pasteSplitTo)
  }
  inputText.value = ''
  showSuggestions.value = false
}

// Remove a chip by index
const removeChip = (index: number) => {
  chips.value.splice(index, 1)
  emitChanges()
  nextTick(() => focusInput())
}

// Clear all chips and text
const clearAll = () => {
  chips.value = []
  inputText.value = ''
  emitChanges()
  nextTick(() => focusInput())
}

// Emit changes to parent
const emitChanges = () => {
  emit('update:chips', [...chips.value])
  emit('update:freeText', inputText.value.trim())
}

// Watch for inputText changes to emit free text
watch(inputText, () => {
  emit('update:freeText', inputText.value.trim())
})

// Expose methods for parent component
defineExpose({
  clear: clearAll,
  focus: focusInput,
  setChips: (newChips: SearchChip[]) => {
    chips.value = newChips.map(c => ({ ...c, color: c.color ?? chipColor(c.type, c.value) }))
    emitChanges()
  },
  addChip: (chip: SearchChip) => {
    // Deduplicate: skip if same type+value already exists
    if (chips.value.find(c => c.type === chip.type && c.value === chip.value)) return
    // Replace existing chip for singular types
    if (isSingularType(chip.type)) {
      chips.value = chips.value.filter(c => c.type !== chip.type)
    }
    const decorated = { ...chip, color: chipColor(chip.type, chip.value) }
    chips.value.push(decorated)
    searchHistory.record(decorated)
    emitChanges()
  },
  removeChipByTypeValue: (type: SearchChip['type'], value: string) => {
    chips.value = chips.value.filter(c => !(c.type === type && c.value === value))
    emitChanges()
  },
})
</script>

<style scoped>
.token-search-wrapper {
  position: relative;
}

.token-search-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  padding: 4px 8px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
  cursor: text;
  transition: border-color 0.2s;
}

.token-search-container.focused {
  border-color: rgb(var(--v-theme-primary));
  outline: none;
}

.search-icon {
  margin-right: 6px;
  flex-shrink: 0;
}

.search-shortcut {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.5);
  background: rgba(var(--v-theme-on-surface), 0.07);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 4px;
  cursor: default;
  user-select: none;
}

.token-chip {
  flex-shrink: 0;
}

.token-input {
  flex: 1 1 100px;
  min-width: 100px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: rgb(var(--v-theme-on-surface));
  padding: 4px 0;
}

.token-input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.clear-btn {
  flex-shrink: 0;
  margin-left: auto;
  opacity: 0.6;
}

.clear-btn:hover {
  opacity: 1;
}
</style>

<!-- Unscoped styles for teleported dropdown -->
<style>
.suggestions-dropdown {
  z-index: 9999;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  max-height: 300px;
  overflow-y: auto;
}

.suggestions-dropdown .suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.suggestions-dropdown .suggestion-item:hover,
.suggestions-dropdown .suggestion-item.selected {
  background-color: rgba(var(--v-theme-primary), 0.1);
}

.suggestions-dropdown .suggestion-chip {
  flex-shrink: 0;
  font-size: 10px;
  min-width: 70px;
  justify-content: center;
}

.suggestions-dropdown .suggestion-text {
  font-weight: 500;
  color: rgb(var(--v-theme-on-surface));
}

.suggestions-dropdown .suggestion-hint {
  margin-left: auto;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.suggestions-dropdown.help-dropdown {
  padding: 10px 12px;
}

.help-dropdown .help-title {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin-bottom: 8px;
}

.help-dropdown .help-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
}

.help-dropdown .help-chip {
  flex-shrink: 0;
  margin-top: 2px;
  min-width: 80px;
  justify-content: center;
}

.help-dropdown .help-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.help-dropdown .help-example {
  font-family: ui-monospace, monospace;
  background: rgba(var(--v-theme-on-surface), 0.08);
  padding: 1px 6px;
  border-radius: 3px;
  align-self: flex-start;
  color: rgb(var(--v-theme-on-surface));
}

.help-dropdown .help-desc {
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.help-dropdown .history-section {
  margin-bottom: 4px;
}

.help-dropdown .history-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  flex-wrap: wrap;
}

.help-dropdown .history-row-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  min-width: 80px;
}

.help-dropdown .history-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.help-dropdown .history-chip {
  cursor: pointer;
}

.help-dropdown .favorite-toggle {
  cursor: pointer;
  margin-left: 4px;
  opacity: 0.85;
}

.help-dropdown .favorite-toggle:hover {
  opacity: 1;
}

.help-dropdown .favorite-toggle-empty {
  opacity: 0.4;
}

.help-dropdown .favorite-toggle-empty:hover {
  opacity: 0.9;
  color: rgb(var(--v-theme-amber, 255 193 7));
}
</style>
