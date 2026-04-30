<template>
  <VueDraggable
    :model-value="cards"
    :animation="180"
    handle=".card-drag-handle"
    tag="div"
    class="v-row v-row--dense mb-4"
    @update:model-value="onReorder"
  >
    <v-col v-for="(card, idx) in cards" :key="card.clientId" cols="12" md="6">
      <template v-if="card.type === 'graph'">
        <CorpGraphCard
          :card="card"
          :ticker-set="tickerSet"
          :excluded-user-ids="excludedUserIds"
          :user-tickers="userTickersFor(card.clientId)"
          @update:user-tickers="v => onUserTickersChange(card, v)"
          @rename="onRequestRename(card)"
          @configure="emit('configure-graph', card)"
          @duplicate="onDuplicate(card)"
          @delete="onRequestDelete(card)"
        />
      </template>
      <v-card v-else height="100%" class="d-flex flex-column">
        <v-card-title class="text-subtitle-2 d-flex align-center pa-2 px-3 ga-2 card-drag-handle">
          <span class="title-text text-truncate">{{ card.name }}</span>

          <!-- Single Filters popover — covers both ticker scope and metric
               filters in one menu (no more split between scope + metric
               filters). -->
          <CardFiltersPopover
            :tickers="userTickersFor(card.clientId)"
            :filters="card.filters"
            :group-by="card.groupBy"
            @update:tickers="v => onUserTickersChange(card, v)"
            @update:filters="v => patchCard(card.clientId, { filters: v })"
          />

          <v-spacer />

          <!-- Single ⋯ menu — combines the legacy Configure popover with the
               actions menu so table cards have one trigger for everything. -->
          <CardActionsMenu
            :card="card"
            @patch="patch => patchCard(card.clientId, patch)"
            @convert-to-graph="onConvertToGraph(card)"
            @rename="onRequestRename(card)"
            @duplicate="onDuplicate(card)"
            @delete="onRequestDelete(card)"
          />
        </v-card-title>

        <v-data-table
          :items="pagedRowsByCard[idx]"
          :headers="headersByCard[idx]"
          density="compact"
          :items-per-page="-1"
          hide-default-footer
          hover
          multi-sort
          :sort-by="vuetifySortByForCard(idx)"
          :no-data-text="emptyMessageFor(card)"
          class="dashboard-card-table flex-grow-1"
          :class="{ 'multi-sort-active': card.sortBy.length > 1 }"
          @click:row="onRowClick"
          @update:sort-by="v => onSortByChange(card, v)"
        >
          <template #item.commodityTicker="{ item }">
            <CommodityDisplay :ticker="String(item.commodityTicker)" />
          </template>
          <template #item.fioDataAge="{ item }">
            <FioAgeChip :fio-uploaded-at="readFioDataAge(item)" size="x-small" />
          </template>
          <template
            v-for="metric in metricColumnsByCard[idx]"
            #[`item.${metric}`]="{ item }"
            :key="metric"
          >
            {{ formatCell(item, metric) }}
          </template>
          <template #no-data>
            <div class="text-caption pa-3">
              {{ emptyMessageFor(card) }}
              <a
                v-if="userTickersFor(card.clientId).length > 0"
                href="#"
                class="ml-1"
                @click.prevent="onUserTickersChange(card, [])"
                >Clear scope</a
              >
            </div>
          </template>
        </v-data-table>

        <CardPaginationFooter
          v-if="totalRowsByCard[idx] > pageSizeFor(card.clientId)"
          :total="totalRowsByCard[idx]"
          :page-size="pageSizeFor(card.clientId)"
          :page="pageFor(card.clientId)"
          @update:page-size="v => onPageSizeChange(card, v)"
          @update:page="v => onPageChange(card, v)"
        />
      </v-card>
    </v-col>

    <!-- Add-card affordance — sits at the end of the grid, scaled to match a
         card cell. Two icon-buttons let the user choose card type up front so
         we don't need a follow-up popover. -->
    <v-col cols="12" md="6">
      <v-card
        height="100%"
        min-height="120"
        variant="outlined"
        class="d-flex align-center justify-center ga-3 add-card-tile"
      >
        <v-btn variant="tonal" prepend-icon="mdi-table" size="small" @click="onAddCard('table')">
          + table
        </v-btn>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-chart-line"
          size="small"
          @click="onAddCard('graph')"
        >
          + graph
        </v-btn>
      </v-card>
    </v-col>
  </VueDraggable>

  <!-- Rename dialog — shared across all cards. The active card is captured on
       open so the v-text-field can two-way-bind to the draft, with Save/Cancel
       wired below. -->
  <v-dialog v-model="renameOpen" max-width="420">
    <v-card>
      <v-card-title>Rename card</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="renameDraft"
          label="Name"
          density="compact"
          variant="outlined"
          autofocus
          @keyup.enter="confirmRename"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="renameOpen = false">Cancel</v-btn>
        <v-btn color="primary" :disabled="!renameDraft.trim()" @click="confirmRename">
          Rename
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Delete confirmation — uses the project-wide ConfirmationDialog so the
       look matches view-level deletes. -->
  <ConfirmationDialog
    v-model="deleteOpen"
    title="Delete card?"
    :message="
      deletingCard
        ? `'${deletingCard.name}' will be removed from this view's local copy. Save the view to make it permanent.`
        : ''
    "
    confirm-text="Delete"
    confirm-color="error"
    @confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type {
  BurnRepairCorpResponse,
  MetricKey,
  ViewCard,
  MetricDef,
  ViewCardSort,
} from '@kawakawa/types'
import { CORP_METRIC_DEFS } from '@kawakawa/types'
import {
  computeTickerRows,
  computeUserTickerRows,
  filterAndSort,
  formatMetric,
  getMetricValue,
  type MetricRow,
} from '../../utils/corpMetrics'
import { VueDraggable } from 'vue-draggable-plus'
import CommodityDisplay from '../CommodityDisplay.vue'
import FioAgeChip from '../FioAgeChip.vue'
import CorpGraphCard from './CorpGraphCard.vue'
import CardPaginationFooter from './CardPaginationFooter.vue'
import CardActionsMenu from './CardActionsMenu.vue'
import CardFiltersPopover from './CardFiltersPopover.vue'
import ConfirmationDialog from '../ConfirmationDialog.vue'
import { commodityService } from '../../services/commodityService'
import { resolveTickerScope } from '../../utils/tickerScope'
import type { Commodity } from '../../types'
import { generateCardClientId } from './viewTemplates'

/**
 * Local-only per-card state. Just the page number now — page size folded into
 * `card.limit` and the per-card user filter folded into `card.tickers` when
 * inline card editing landed (PR 6a).
 */
interface CardUserState {
  page: number
}

const props = defineProps<{
  cards: ViewCard[]
  corpData: BurnRepairCorpResponse
  tickerSet: Set<string> | null
  repairDays: number
  /** Forwarded to graph cards so historical queries respect the planning exclusion. */
  excludedUserIds: number[]
  /** Per-card pagination state for the active view, keyed by `card.clientId`. */
  cardState: Record<string, CardUserState>
}>()

const emit = defineEmits<{
  (e: 'inspect', ticker: string): void
  (e: 'update:cardState', payload: { clientId: string; next: CardUserState }): void
  /**
   * Replace the full cards array. Emitted on any savable card edit — title-bar
   * scope, page size, rename, duplicate, delete, drag-reorder, add. We send
   * the whole array so the parent stays oblivious to which card changed.
   */
  (e: 'update:cards', cards: ViewCard[]): void
  /**
   * Open the panel-owned graph configuration dialog for this card. Graph
   * cards keep a dialog because of their 10+ fields; table cards configure
   * inline via the unified ⋯ menu.
   */
  (e: 'configure-graph', card: ViewCard): void
}>()

/**
 * Card rows always carry `commodityTicker` (both ticker and user-ticker
 * groupings), so the click handler can be shared. We swallow the row event
 * itself and just hand the ticker up to the parent panel, which owns the
 * single modal instance.
 */
function onRowClick(_event: unknown, ctx: { item: MetricRow }): void {
  const ticker = ctx.item.commodityTicker
  if (typeof ticker === 'string' && ticker.length > 0) emit('inspect', ticker)
}

// Card-level ticker overrides may contain `category:` refs — keep the live
// catalog so resolution stays consistent with the view-level scope.
const commodityCatalog = ref<Commodity[]>([])
onMounted(async () => {
  const cached = commodityService.getAllCommoditiesSync()
  commodityCatalog.value = cached.length > 0 ? cached : await commodityService.getAllCommodities()
})

// -------------- Per-card state helpers --------------

/**
 * Card-level scope for the title-bar indicator + flyout. Reads `card.tickers`
 * directly — no longer a separate ephemeral overlay (PR 6a folded the per-card
 * user filter into the card itself).
 */
function userTickersFor(clientId: string): string[] {
  const card = props.cards.find(c => c.clientId === clientId)
  return card?.tickers ?? []
}

/** Page-size selector value reads `card.limit` directly. */
function pageSizeFor(clientId: string): number {
  const card = props.cards.find(c => c.clientId === clientId)
  return card?.limit ?? 5
}

function pageFor(clientId: string): number {
  return props.cardState[clientId]?.page ?? 1
}

/**
 * Patch a single card and emit the full updated array. Centralizes the
 * pattern so callers stay focused on the field they're changing.
 */
function patchCard(clientId: string, patch: Partial<ViewCard>): void {
  emit(
    'update:cards',
    props.cards.map(c => (c.clientId === clientId ? { ...c, ...patch } : c))
  )
}

function onUserTickersChange(card: ViewCard, tickers: string[]): void {
  // The card's saved `tickers` is undefined when empty (compact storage); the
  // editor passes a non-empty array on add and `[]` on Clear. Normalize to
  // `undefined` for empty so a "no scope" card round-trips identically across
  // saves.
  patchCard(card.clientId, { tickers: tickers.length > 0 ? tickers : undefined })
  // Snap back to page 1 — the previous page index almost certainly doesn't
  // make sense for the new (smaller) result set.
  emit('update:cardState', { clientId: card.clientId, next: { page: 1 } })
}

function onPageSizeChange(card: ViewCard, pageSize: number): void {
  patchCard(card.clientId, { limit: pageSize })
  emit('update:cardState', { clientId: card.clientId, next: { page: 1 } })
}

function onPageChange(card: ViewCard, page: number): void {
  emit('update:cardState', { clientId: card.clientId, next: { page } })
}

// -------------- Reorder / Add / Duplicate / Rename / Delete --------------

/**
 * VueDraggable hands us the freshly-ordered array on drop. We forward it
 * verbatim — clientIds preserve identity so per-card pagination stays
 * attached to the right card.
 */
function onReorder(next: ViewCard[]): void {
  emit('update:cards', next)
}

/**
 * Default skeleton for a new card. The user picks a sensible default per type
 * so they don't land on a blank "(no metric)" graph or columnless table; PR 6c
 * lets them tune the rest inline.
 */
function makeDefaultCard(type: 'table' | 'graph'): ViewCard {
  const base: ViewCard = {
    clientId: generateCardClientId(),
    name: type === 'table' ? 'New table' : 'New graph',
    groupBy: 'ticker',
    type,
    filters: [],
    sortBy: [],
    columns: type === 'table' ? ['gap', 'stock'] : [],
    limit: 5,
  }
  if (type === 'graph') {
    base.graph = {
      yMetrics: ['productionDaily'],
      seriesBy: 'corp',
      seriesLimit: 5,
      rangePreset: '90d',
    }
  }
  return base
}

function onAddCard(type: 'table' | 'graph'): void {
  emit('update:cards', [...props.cards, makeDefaultCard(type)])
}

/**
 * Convert a table card to a graph card in place. Preserves common fields
 * (name, scope, groupBy, filters, sortBy) so the user keeps their context;
 * `columns`/`limit` are graph-irrelevant and get default-filled. The user
 * can fine-tune the graph in the dialog right after the swap.
 */
function onConvertToGraph(card: ViewCard): void {
  const next: ViewCard = {
    ...card,
    type: 'graph',
    graph: card.graph ?? {
      yMetrics: ['productionDaily'],
      seriesBy: 'corp',
      seriesLimit: 5,
      rangePreset: '90d',
    },
  }
  patchCard(card.clientId, next)
}

function onDuplicate(card: ViewCard): void {
  // Fresh clientId so per-card pagination doesn't bleed in from the source,
  // and so the new card's identity is independent for any future drags.
  const dup: ViewCard = {
    ...card,
    clientId: generateCardClientId(),
    name: `${card.name} (copy)`,
    filters: card.filters.map(f => ({ ...f })),
    sortBy: card.sortBy.map(s => ({ ...s })),
    columns: [...card.columns],
    tickers: card.tickers ? [...card.tickers] : undefined,
    graph: card.graph ? { ...card.graph } : undefined,
  }
  // Insert immediately after the source card so the duplicate is visually
  // adjacent — easier to compare side-by-side while tweaking.
  const idx = props.cards.findIndex(c => c.clientId === card.clientId)
  const next = [...props.cards]
  next.splice(idx + 1, 0, dup)
  emit('update:cards', next)
}

const renameOpen = ref(false)
const renameDraft = ref('')
const renamingClientId = ref<string | null>(null)

function onRequestRename(card: ViewCard): void {
  renamingClientId.value = card.clientId
  renameDraft.value = card.name
  renameOpen.value = true
}

function confirmRename(): void {
  const clientId = renamingClientId.value
  const name = renameDraft.value.trim()
  if (!clientId || !name) return
  patchCard(clientId, { name })
  renameOpen.value = false
  renamingClientId.value = null
}

const deleteOpen = ref(false)
const deletingCard = ref<ViewCard | null>(null)

function onRequestDelete(card: ViewCard): void {
  deletingCard.value = card
  deleteOpen.value = true
}

function confirmDelete(): void {
  const card = deletingCard.value
  if (!card) return
  emit(
    'update:cards',
    props.cards.filter(c => c.clientId !== card.clientId)
  )
  deleteOpen.value = false
  deletingCard.value = null
}

// -------------- Scope + row computation --------------

/**
 * Effective ticker set for a card: view scope ∩ card-level scope (if any).
 * Each layer can independently be "no filter" (null set), in which case it
 * doesn't constrain. With WYSIWYG, the per-card user filter and the saved
 * card scope are the same field — a single `card.tickers` array — so this
 * collapses to two layers.
 */
function effectiveTickerSet(card: ViewCard): Set<string> | null {
  const layers: (Set<string> | null)[] = []
  // View-level scope
  layers.push(props.tickerSet)
  // Card-level scope (table cards only — graph cards read it differently
  // through GraphConfig.tickers, handled inside CorpGraphCard).
  if (card.tickers && card.tickers.length > 0) {
    layers.push(resolveTickerScope(card.tickers, commodityCatalog.value))
  }
  return intersectScopes(layers)
}

function intersectScopes(layers: (Set<string> | null)[]): Set<string> | null {
  // Drop "no constraint" layers; if none remain we're unconstrained.
  const constraining = layers.filter((s): s is Set<string> => s !== null)
  if (constraining.length === 0) return null
  let acc = new Set(constraining[0])
  for (let i = 1; i < constraining.length; i++) {
    const next = new Set<string>()
    for (const t of acc) if (constraining[i].has(t)) next.add(t)
    acc = next
  }
  return acc
}

interface TableHeader {
  title: string
  key: string
  sortable: boolean
  align?: 'start' | 'center' | 'end'
  /** Vuetify forwards these onto each <td> in the column. */
  cellProps?: { class?: string }
  /** Same shape, applied to the <th>. */
  headerProps?: { class?: string }
}

const TICKER_HEADER: TableHeader = {
  title: 'Material',
  key: 'commodityTicker',
  sortable: false,
}
const FIO_AGE_HEADER: TableHeader = {
  title: 'Data Age',
  key: 'fioDataAge',
  sortable: false,
  align: 'end',
}

function metricHeader(def: MetricDef, isSorted: boolean): TableHeader {
  return {
    title: def.label,
    key: def.key,
    // Sort lives on the column headers themselves now — clicking a metric
    // column toggles its sort, multi-sort lets the user pile criteria.
    sortable: true,
    align: def.format === 'text' ? 'start' : 'end',
    // Tag header + cells of actively-sorted columns so a CSS rule can tint
    // the whole column. This is what visually couples the sort indicator to
    // the data underneath it — `aria-sort` only lights up the th.
    headerProps: isSorted ? { class: 'sorted-column' } : undefined,
    cellProps: isSorted ? { class: 'sorted-column' } : undefined,
  }
}

const headersByCard = computed<TableHeader[][]>(() =>
  props.cards.map(card => {
    const sortedKeys = new Set(card.sortBy.map(s => s.metric))
    const headers: TableHeader[] = [TICKER_HEADER]
    for (const col of card.columns) {
      const def = CORP_METRIC_DEFS[col]
      if (def) headers.push(metricHeader(def, sortedKeys.has(col)))
    }
    if (card.groupBy === 'user-ticker') {
      headers.push(FIO_AGE_HEADER)
    }
    return headers
  })
)

const metricColumnsByCard = computed<MetricKey[][]>(() =>
  props.cards.map(card => [...card.columns])
)

/**
 * Sorted-and-filtered rows per card (no slice). Pagination happens after, so
 * footer page nav can know the total without rerunning the filter pipeline.
 */
const sortedRowsByCard = computed<MetricRow[][]>(() =>
  props.cards.map(card => {
    const scope = effectiveTickerSet(card)
    const base: MetricRow[] =
      card.groupBy === 'ticker'
        ? computeTickerRows(props.corpData, scope, props.repairDays)
        : computeUserTickerRows(props.corpData, scope, props.repairDays)
    return filterAndSort(base, card.filters, card.sortBy)
  })
)

const totalRowsByCard = computed<number[]>(() => sortedRowsByCard.value.map(r => r.length))

const pagedRowsByCard = computed<MetricRow[][]>(() =>
  props.cards.map((card, idx) => {
    const rows = sortedRowsByCard.value[idx]
    const pageSize = pageSizeFor(card.clientId)
    const page = pageFor(card.clientId)
    const start = (page - 1) * pageSize
    return rows.slice(start, start + pageSize)
  })
)

// -------------- Sort via column-header clicks --------------

/**
 * Project the card's saved `sortBy` into Vuetify's `[{ key, order }]` shape so
 * the column headers reflect the active sort. Vuetify's `'asc'` / `'desc'`
 * matches our `direction` 1:1.
 */
interface VuetifySortItem {
  key: string
  order: 'asc' | 'desc'
}

function vuetifySortByForCard(idx: number): VuetifySortItem[] {
  return props.cards[idx].sortBy.map(s => ({ key: s.metric, order: s.direction }))
}

/**
 * Vuetify hands us the new sort array on column-header click; we round-trip it
 * back into our `ViewCardSort[]` shape. Boolean `order` (Vuetify's "neutral"
 * state) shouldn't appear in `multi-sort` mode, but we filter it defensively
 * so a stray entry doesn't break the type contract.
 */
function onSortByChange(card: ViewCard, next: readonly { key: string; order: unknown }[]): void {
  const converted: ViewCardSort[] = next
    .filter(
      (s): s is { key: string; order: 'asc' | 'desc' } => s.order === 'asc' || s.order === 'desc'
    )
    .map(s => ({ metric: s.key as MetricKey, direction: s.order }))
  patchCard(card.clientId, { sortBy: converted })
}

// -------------- Title-bar helpers --------------

function emptyMessageFor(card: ViewCard): string {
  if (userTickersFor(card.clientId).length > 0 || card.filters.length > 0) {
    return 'No rows match this card’s filters.'
  }
  return 'No rows.'
}

// -------------- Cell formatting --------------

function formatCell(item: unknown, key: MetricKey): string {
  const def = CORP_METRIC_DEFS[key]
  if (!def) return ''
  const value = getMetricValue(item as MetricRow, key)
  return formatMetric(value, def.format)
}

function readFioDataAge(item: unknown): string | null {
  const r = item as { fioDataAge?: string | null }
  return r.fioDataAge ?? null
}
</script>

<style scoped>
:deep(.dashboard-card-table tbody tr) {
  cursor: pointer;
}

/* The whole title bar acts as the drag handle; cursor cue makes it
   discoverable. The cursor stays as a grab even when the user starts
   dragging — the active grabbing cursor switches via :active. */
.card-drag-handle {
  cursor: grab;
}
.card-drag-handle:active {
  cursor: grabbing;
}

/* Make the +card tile look like a placeholder rather than a real card so
   users don't confuse it with empty state of an actual table card. */
.add-card-tile {
  border-style: dashed;
  opacity: 0.85;
}
.add-card-tile:hover {
  opacity: 1;
}

/* Sort arrow placement: Vuetify defaults `flex-direction: row-reverse` for
 * end-aligned headers, which pushes the sort arrow to the LEFT of the title.
 * Override back to natural order (title → arrow) and right-align the whole
 * group so the arrow sits tight against the column edge. */
:deep(.dashboard-card-table thead th .v-data-table-header__content) {
  flex-direction: row;
  gap: 2px;
}
:deep(.dashboard-card-table thead th.text-end .v-data-table-header__content) {
  justify-content: flex-end;
}
/* Sort arrow: hidden when the column is in a neutral state, shown when the
 * column is actively sorted (aria-sort set by Vuetify) OR on hover so the
 * user gets an affordance preview before clicking. */
:deep(.dashboard-card-table thead th .v-data-table-header__sort) {
  margin-inline: 0;
  padding-inline: 0;
  opacity: 0;
  transition: opacity 120ms ease;
}
:deep(.dashboard-card-table thead th:hover .v-data-table-header__sort),
:deep(.dashboard-card-table thead th[aria-sort='ascending'] .v-data-table-header__sort),
:deep(.dashboard-card-table thead th[aria-sort='descending'] .v-data-table-header__sort) {
  opacity: 1;
}

/* Highlight active sort columns so the arrow ties back to its column visually.
 * Vuetify forwards `headerProps`/`cellProps` from the headers config onto each
 * th and td, so we just tint anything tagged `.sorted-column`. */
:deep(.dashboard-card-table thead th) {
  transition: background-color 120ms ease;
}
:deep(.dashboard-card-table thead th.sorted-column) {
  background-color: rgba(var(--v-theme-primary), 0.14);
}
/* Layer the tint on top of the row's existing background so zebra-striped
 * rows still read through. `background-image` paints over `background-color`,
 * so a flat-color gradient gives us a translucent overlay that composes with
 * whatever the row underneath is wearing. */
:deep(.dashboard-card-table tbody td.sorted-column) {
  background-image: linear-gradient(
    rgba(var(--v-theme-primary), 0.1),
    rgba(var(--v-theme-primary), 0.1)
  );
}
:deep(.dashboard-card-table thead th.v-data-table__th--sortable:hover) {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

/* Multi-sort priority badge — Vuetify renders it next to every sorted column
 * even when only one is active, which reads as noise. Default styling is also
 * larger than it needs to be. Shrink it, and hide it entirely unless the card
 * has more than one sort criterion (the `multi-sort-active` class). */
:deep(.dashboard-card-table .v-data-table-header__sort-badge) {
  font-size: 9px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
}
.dashboard-card-table:not(.multi-sort-active) :deep(.v-data-table-header__sort-badge) {
  display: none;
}

.title-text {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
}
</style>
