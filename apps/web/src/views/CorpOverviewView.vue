<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-chart-box</v-icon>
        Corp Overview
        <v-spacer />
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="loadCorpData"
        >
          Refresh
        </v-btn>
      </v-card-title>
      <v-card-text class="text-caption text-medium-emphasis pt-0">
        Corp-wide workforce burn, production input, and building repair costs, aggregated across
        members. Data is pre-computed during FIO sync.
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <CorpOverviewPanel
      v-model="state.corpOverviewViewId"
      :corp-data="corpData"
      :corp-buildings="corpBuildings"
      :corp-workforce="corpWorkforce"
      :repair-days="repairDays"
      :local-by-view="state.corpOverviewLocalByView"
      @update:excluded-user-ids="onUpdateExcludedUserIds"
      @update:materials-table-tickers="onUpdateMaterialsTableTickers"
      @update:card-state="onCardStateChange"
      @update:cards="onUpdateCards"
      @update:view-name="onUpdateViewName"
      @update:view-privacy="onUpdateViewPrivacy"
      @update:view-tickers="onUpdateViewTickers"
      @update:materials-table-columns="onUpdateMaterialsTableColumns"
      @update:local="onUpdateLocal"
      @copy-csv="onCorpCopyCsv"
      @snackbar="onCorpSnackbar"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { api } from '../services/api'
import { usePageState } from '../composables/usePageState'
import { useSettingsStore } from '../stores/settings'
import CorpOverviewPanel from '../components/BurnRepair/CorpOverviewPanel.vue'
import type {
  BurnRepairCorpResponse,
  BurnRepairCorpBuildingsResponse,
  BurnRepairCorpWorkforceResponse,
  FilterPrivacy,
  MetricKey,
  ViewCard,
} from '@kawakawa/types'
import { CORP_METRIC_DEFS } from '@kawakawa/types'
import { getMetricValue, type TickerRow } from '../utils/corpMetrics'
import type { CardLocalState, LocalViewState } from '../utils/corpOverviewLocal'

// ==================== STATE ====================

const { state } = usePageState('corp-overview', {
  corpOverviewViewId: -1 as number, // -1 = built-in "All" view
  /**
   * Per-view Local working copy of the Corp Overview View. Replaces the
   * previous trio of `corpOverviewExcludedUserIds`, `MaterialsTickerFilter`,
   * and `CardState` keys — all three folded into one structured per-view
   * blob so view-switching keeps each view's state cleanly isolated and the
   * dirty-vs-Saved diff has a single source of truth.
   *
   * Initialized lazily by the panel from the Saved view on first open;
   * subsequent edits to exclusions, the materials-table filter, or per-card
   * pagination/filters mutate this Local entry. The global Save / Save As /
   * Discard buttons flush the savable subset back to Saved.
   */
  corpOverviewLocalByView: {} as Record<number, LocalViewState>,
})

const settingsStore = useSettingsStore()

// Repair Days is set from My Bases but also shapes the corp-wide "with
// repair" metrics here, so we mirror the same user setting rather than
// dupliating a slider — this view doesn't let you change it, just reads it.
const repairDays = ref(0)
watch(
  () => settingsStore.getSetting<number>('burnRepair.repairDays'),
  v => {
    if (typeof v === 'number' && v >= 0) repairDays.value = v
  },
  { immediate: true }
)

const loading = ref(false)

const corpData = ref<BurnRepairCorpResponse | null>(null)
const corpBuildings = ref<BurnRepairCorpBuildingsResponse | null>(null)
const corpWorkforce = ref<BurnRepairCorpWorkforceResponse | null>(null)

const snackbar = reactive({ show: false, message: '', color: 'success' })

// ==================== DATA LOADING ====================

async function loadCorpData() {
  // Pass the (possibly empty) planning-exclusion list. Server treats empty as
  // "include everyone" — same shape as before the feature. The list comes
  // from the active view's Local working copy, so a panel-side toggle of
  // exclusions immediately reshapes the burn/repair aggregate.
  const excluded = state.corpOverviewLocalByView[state.corpOverviewViewId]?.excludedUserIds ?? []
  loading.value = true
  try {
    const [corp, buildings, workforce] = await Promise.all([
      api.burnRepair.corp(excluded),
      api.burnRepair.corpBuildings(excluded),
      api.burnRepair.corpWorkforce(excluded),
    ])
    corpData.value = corp
    corpBuildings.value = buildings
    corpWorkforce.value = workforce
  } catch (e) {
    console.error('Failed to load corp data', e)
  } finally {
    loading.value = false
  }
}

// Refetch corp data whenever the active view's exclusion list changes so all
// three endpoints (materials, buildings, workforce) stay in sync. Watching
// the Local map by viewId picks up both view-switches and in-place edits.
watch(
  () => [
    state.corpOverviewViewId,
    state.corpOverviewLocalByView[state.corpOverviewViewId]?.excludedUserIds,
  ],
  () => {
    void loadCorpData()
  },
  { deep: true }
)

function ensureLocalEntry(viewId: number): LocalViewState {
  let local = state.corpOverviewLocalByView[viewId]
  if (!local) {
    // Empty defaults — the panel will replace this with a properly seeded
    // copy via `update:local` once the Saved view is loaded. A bare entry is
    // a safe placeholder for emits that arrive before init (rare but possible
    // if the user edits state before the views list resolves).
    local = {
      name: '',
      privacy: 'private',
      tickers: [],
      excludedUserIds: [],
      materialsTableColumns: [],
      materialsTableTickers: [],
      cards: [],
      cardState: {},
      baseUpdatedAt: '',
    }
    state.corpOverviewLocalByView[viewId] = local
  }
  return local
}

function onUpdateExcludedUserIds(value: number[]): void {
  ensureLocalEntry(state.corpOverviewViewId).excludedUserIds = value
}

function onUpdateMaterialsTableTickers(value: string[]): void {
  ensureLocalEntry(state.corpOverviewViewId).materialsTableTickers = value
}

/**
 * Patch handler for per-card ephemerals (currently just `page`). After the
 * card-fold, `tickers` and `pageSize` graduated to savable card fields;
 * everything in `CardLocalState` is purely Local now.
 */
function onCardStateChange(payload: { clientId: string; next: CardLocalState }): void {
  ensureLocalEntry(state.corpOverviewViewId).cardState[payload.clientId] = payload.next
}

/**
 * Replace Local's `cards` array. Emitted by the dashboard on any card-level
 * edit (rename, scope, columns, limit, etc.). The savable-diff in
 * `isLocalDirty` picks up the change automatically and surfaces the Save
 * button.
 */
function onUpdateCards(cards: ViewCard[]): void {
  ensureLocalEntry(state.corpOverviewViewId).cards = cards
}

function onUpdateViewName(value: string): void {
  ensureLocalEntry(state.corpOverviewViewId).name = value
}

function onUpdateViewPrivacy(value: FilterPrivacy): void {
  ensureLocalEntry(state.corpOverviewViewId).privacy = value
}

function onUpdateViewTickers(value: string[]): void {
  ensureLocalEntry(state.corpOverviewViewId).tickers = value
}

function onUpdateMaterialsTableColumns(value: MetricKey[]): void {
  ensureLocalEntry(state.corpOverviewViewId).materialsTableColumns = value
}

/**
 * Replace or remove the LocalViewState for a viewId. Used by the panel for
 * first-time initialization (seed Local from Saved), stale-snap (silent
 * resync after Saved moved), unsaved-draft creation (seed empty Local under
 * `UNSAVED_VIEW_ID`), and the post-save promotion path (drop the unsaved
 * entry once it's been written to a real view). Passing `null` deletes the
 * entry; the page-state writer keeps the keyed map clean for both forms.
 */
function onUpdateLocal(payload: { viewId: number; local: LocalViewState | null }): void {
  if (payload.local === null) {
    delete state.corpOverviewLocalByView[payload.viewId]
  } else {
    state.corpOverviewLocalByView[payload.viewId] = payload.local
  }
}

function toCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

async function copyCsv(headers: string[], rows: unknown[][], successLabel = 'CSV'): Promise<void> {
  const lines = [headers.map(toCsvCell).join(','), ...rows.map(r => r.map(toCsvCell).join(','))]
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    snackbar.message = `${successLabel} copied to clipboard`
    snackbar.color = 'success'
  } catch (e) {
    console.error('Clipboard write failed', e)
    snackbar.message = 'Failed to copy to clipboard'
    snackbar.color = 'error'
  }
  snackbar.show = true
}

function onCorpCopyCsv(payload: {
  viewName: string
  rows: TickerRow[]
  columns: MetricKey[]
}): void {
  // Headers + values both flow from the view's saved column order so the CSV
  // mirrors what's on screen — including the local ticker filter (already
  // applied to `rows`) and any column-picker tweaks. Material is always the
  // anchor first column, matching the table itself.
  const headers = ['Material', ...payload.columns.map(k => CORP_METRIC_DEFS[k]?.label ?? k)]
  const rows = payload.rows.map(r => [
    r.commodityTicker,
    ...payload.columns.map(k => getMetricValue(r, k)),
  ])
  void copyCsv(headers, rows, `Corp materials (${payload.viewName})`)
}

function onCorpSnackbar(message: string, color = 'success'): void {
  snackbar.message = message
  snackbar.color = color
  snackbar.show = true
}

// ==================== LIFECYCLE ====================

onMounted(async () => {
  if (!settingsStore.isLoaded.value) {
    settingsStore.loadFromCache()
    await settingsStore.loadSettings()
  }
  await loadCorpData()
})
</script>
