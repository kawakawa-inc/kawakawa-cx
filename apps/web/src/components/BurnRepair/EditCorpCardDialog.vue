<template>
  <v-dialog v-model="open" max-width="860" persistent scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>{{ isNew ? 'mdi-plus-box-outline' : 'mdi-pencil-box-outline' }}</v-icon>
        {{ isNew ? 'Add card' : 'Edit card' }}
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent>
          <!-- ===== Name ===== -->
          <v-text-field
            v-model="draft.name"
            label="Name"
            prepend-inner-icon="mdi-format-text"
            :rules="[v => !!v?.trim() || 'Name is required']"
            required
            density="compact"
            variant="outlined"
            class="mb-3"
          />

          <!-- ===== Type tabs (Table / Graph) ===== -->
          <v-tabs v-model="draft.type" density="compact" class="mb-3" grow>
            <v-tab value="table" prepend-icon="mdi-table">Table</v-tab>
            <v-tab value="graph" prepend-icon="mdi-chart-line">Graph</v-tab>
          </v-tabs>

          <!-- ===== Group by (shared) ===== -->
          <v-select
            v-model="draft.groupBy"
            :items="GROUP_BY_OPTIONS"
            item-title="title"
            item-value="value"
            label="Group by"
            prepend-inner-icon="mdi-format-list-group"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-4"
          >
            <template #selection="{ item }">
              <v-icon size="small" class="mr-2">{{ groupByIcon(item.value) }}</v-icon>
              {{ item.title }}
            </template>
            <template #item="{ item, props: itemProps }">
              <v-list-item v-bind="itemProps" :title="item.title">
                <template #prepend>
                  <v-icon>{{ groupByIcon(item.value) }}</v-icon>
                </template>
                <template #subtitle>
                  {{ item.value === 'ticker' ? 'One row per ticker, summed across users' : 'One row per (user, ticker) pair' }}
                </template>
              </v-list-item>
            </template>
          </v-select>

          <!-- ===== Filters (shared) ===== -->
          <SectionHeader
            icon="mdi-filter-variant"
            title="Filters"
            :count="draft.filters.length"
            empty-label="No filters — all rows qualify."
            action-label="Add filter"
            :warn="hasIssue('filters')"
            :warn-message="issueMessage('filters')"
            @action="addFilter"
          >
            <template #help>
              All filters are AND-combined. Rows with missing data fail every comparison.
            </template>
          </SectionHeader>
          <v-row
            v-for="(filter, idx) in draft.filters"
            :key="`f-${idx}`"
            dense
            align="center"
            class="mb-1"
          >
            <v-col cols="5">
              <v-select
                :model-value="filter.metric"
                :items="filterMetricOptions"
                label="Metric"
                density="compact"
                variant="outlined"
                hide-details
                @update:model-value="v => updateFilter(idx, { metric: v })"
              />
            </v-col>
            <v-col cols="3">
              <v-select
                :model-value="filter.op"
                :items="OP_OPTIONS"
                label="Op"
                density="compact"
                variant="outlined"
                hide-details
                @update:model-value="v => updateFilter(idx, { op: v })"
              />
            </v-col>
            <v-col cols="3">
              <v-text-field
                :model-value="filter.value"
                type="number"
                label="Value"
                density="compact"
                variant="outlined"
                hide-details
                @update:model-value="v => updateFilter(idx, { value: Number(v) || 0 })"
              />
            </v-col>
            <v-col cols="1" class="text-right">
              <v-btn icon variant="text" size="small" color="error" @click="removeFilter(idx)">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-col>
          </v-row>

          <!-- ===== Tab bodies ===== -->
          <v-window v-model="draft.type" class="mt-2">
            <!-- ============ TABLE ============ -->
            <v-window-item value="table">
              <SectionHeader
                icon="mdi-sort"
                title="Sort"
                :count="draft.sortBy.length"
                empty-label="No sort — rows sorted alphabetically by ticker."
                action-label="Add sort"
                @action="addSort"
              >
                <template #help>
                  Applied in order — first criterion wins, later ones break ties. Use the arrows to reorder.
                </template>
              </SectionHeader>
              <v-row
                v-for="(sort, idx) in draft.sortBy"
                :key="`s-${idx}`"
                dense
                align="center"
                class="mb-1"
              >
                <v-col cols="6">
                  <v-select
                    :model-value="sort.metric"
                    :items="sortMetricOptions"
                    label="Metric"
                    density="compact"
                    variant="outlined"
                    hide-details
                    @update:model-value="v => updateSort(idx, { metric: v })"
                  />
                </v-col>
                <v-col cols="4">
                  <v-select
                    :model-value="sort.direction"
                    :items="DIRECTION_OPTIONS"
                    label="Direction"
                    density="compact"
                    variant="outlined"
                    hide-details
                    @update:model-value="v => updateSort(idx, { direction: v })"
                  />
                </v-col>
                <v-col cols="2" class="text-right">
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    :disabled="idx === 0"
                    @click="moveSort(idx, -1)"
                  >
                    <v-icon>mdi-arrow-up</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    :disabled="idx === draft.sortBy.length - 1"
                    @click="moveSort(idx, 1)"
                  >
                    <v-icon>mdi-arrow-down</v-icon>
                  </v-btn>
                  <v-btn icon variant="text" size="small" color="error" @click="removeSort(idx)">
                    <v-icon>mdi-close</v-icon>
                  </v-btn>
                </v-col>
              </v-row>

              <SectionHeader
                icon="mdi-table-column"
                title="Columns"
                class="mt-3"
                :warn="hasIssue('columns')"
                :warn-message="issueMessage('columns')"
              >
                <template #help>
                  Material is always the first column. Pick metrics to display after it — order is preserved.
                </template>
              </SectionHeader>
              <v-select
                v-model="draft.columns"
                :items="columnMetricOptions"
                multiple
                chips
                closable-chips
                density="compact"
                variant="outlined"
                :rules="[
                  v => (Array.isArray(v) && v.length > 0) || 'At least one column is required',
                ]"
              />

              <SectionHeader
                icon="mdi-format-list-numbered"
                title="Row limit"
                class="mt-2"
                :warn="hasIssue('rowLimit')"
                :warn-message="issueMessage('rowLimit')"
              >
                <template #help>
                  Cap the number of rows in the rendered table after filter + sort.
                </template>
              </SectionHeader>
              <v-text-field
                :model-value="draft.limit"
                type="number"
                min="1"
                max="100"
                prepend-inner-icon="mdi-numeric"
                label="Rows"
                density="compact"
                variant="outlined"
                hide-details
                @update:model-value="v => (draft.limit = Math.max(1, Math.min(100, Number(v) || 1)))"
              />

              <SectionHeader
                icon="mdi-tag-multiple"
                title="Tickers (this card)"
                class="mt-3"
                :warn="hasIssue('cardTickers')"
                :warn-message="issueMessage('cardTickers')"
              >
                <template #help>
                  Empty = follow the view's tickers. Narrow to one ticker
                  (e.g. <code>COF</code>) for a "Top Producers of COF" card,
                  or pick a category (<code>Consumables</code>). Categories
                  stay live.
                </template>
              </SectionHeader>
              <TickerCategoryInput
                :model-value="draft.tickers ?? []"
                placeholder="e.g. COF, RAT, Consumables…"
                @update:model-value="
                  v => (draft.tickers = v.length > 0 ? v : undefined)
                "
              />
            </v-window-item>

            <!-- ============ GRAPH ============ -->
            <v-window-item value="graph">
              <template v-if="graphDraft">
                <SectionHeader
                  icon="mdi-chart-line-variant"
                  title="Y metrics"
                  :warn="hasIssue('yMetrics')"
                  :warn-message="issueMessage('yMetrics')"
                >
                  <template #help>
                    Pick one or more metrics to plot. Each becomes a series on the chart.
                  </template>
                </SectionHeader>
                <v-select
                  :model-value="graphDraft.yMetrics"
                  :items="yMetricOptions"
                  density="compact"
                  variant="outlined"
                  multiple
                  chips
                  closable-chips
                  hide-details
                  @update:model-value="v => updateGraph({ yMetrics: Array.isArray(v) ? v : [] })"
                />

                <SectionHeader icon="mdi-tag-multiple" title="Tickers (this card)" class="mt-3">
                  <template #help>
                    Empty = use the view's tickers. Type a ticker (<code>RAT</code>) or category
                    (<code>Consumables</code>) to focus this graph. Categories stay live.
                  </template>
                </SectionHeader>
                <TickerCategoryInput
                  :model-value="graphDraft.tickers ?? []"
                  placeholder="e.g. RAT, Consumables…"
                  @update:model-value="
                    v => updateGraph({ tickers: v.length > 0 ? v : undefined })
                  "
                />

                <v-row dense class="mt-3">
                  <v-col cols="12" md="6">
                    <SectionHeader icon="mdi-account-group-outline" title="Series by">
                      <template #help>
                        Choose how series are split: one per ticker (corp-aggregate) or one per
                        (user, ticker) pair.
                      </template>
                    </SectionHeader>
                    <v-select
                      :model-value="graphDraft.seriesBy"
                      :items="SERIES_BY_OPTIONS"
                      item-title="title"
                      item-value="value"
                      density="compact"
                      variant="outlined"
                      hide-details
                      @update:model-value="
                        v => updateGraph({ seriesBy: v === 'corp' ? 'corp' : 'user' })
                      "
                    >
                      <template #selection="{ item }">
                        <v-icon size="small" class="mr-2">{{ seriesByIcon(item.value) }}</v-icon>
                        {{ item.title }}
                      </template>
                      <template #item="{ item, props: itemProps }">
                        <v-list-item v-bind="itemProps">
                          <template #prepend>
                            <v-icon>{{ seriesByIcon(item.value) }}</v-icon>
                          </template>
                        </v-list-item>
                      </template>
                    </v-select>
                  </v-col>
                  <v-col cols="12" md="6">
                    <SectionHeader icon="mdi-format-list-numbered" title="Series limit">
                      <template #help>
                        Per-metric cap on the number of series drawn.
                      </template>
                    </SectionHeader>
                    <v-text-field
                      :model-value="graphDraft.seriesLimit"
                      type="number"
                      min="1"
                      max="20"
                      prepend-inner-icon="mdi-numeric"
                      density="compact"
                      variant="outlined"
                      hide-details
                      @update:model-value="
                        v =>
                          updateGraph({ seriesLimit: Math.max(1, Math.min(20, Number(v) || 5)) })
                      "
                    />
                    <v-checkbox
                      :model-value="graphDraft.includeOther === true"
                      label='Show "Other" rollup for overflow'
                      density="compact"
                      hide-details
                      class="mt-1"
                      @update:model-value="v => updateGraph({ includeOther: v === true })"
                    />
                  </v-col>
                </v-row>

                <SectionHeader icon="mdi-calendar-range" title="Time range" class="mt-3">
                  <template #help>
                    Bucketing is automatic: daily ≤ 90 days, weekly ≤ 1 year, monthly above.
                  </template>
                </SectionHeader>
                <v-select
                  :model-value="graphDraft.rangePreset"
                  :items="RANGE_PRESET_OPTIONS"
                  density="compact"
                  variant="outlined"
                  hide-details
                  @update:model-value="v => updateGraph({ rangePreset: v })"
                />

                <SectionHeader
                  icon="mdi-arrow-expand-vertical"
                  title="Y axis bounds (optional)"
                  class="mt-3"
                >
                  <template #help>
                    Leave both empty for auto-scale. Set min/max to clip the view at fixed values.
                  </template>
                </SectionHeader>
                <v-row dense>
                  <v-col cols="12" md="6">
                    <v-text-field
                      :model-value="graphDraft.yMin ?? ''"
                      type="number"
                      label="Y min"
                      prepend-inner-icon="mdi-arrow-down"
                      density="compact"
                      variant="outlined"
                      hide-details
                      clearable
                      @update:model-value="
                        v => updateGraph({ yMin: v === '' || v === null ? undefined : Number(v) })
                      "
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      :model-value="graphDraft.yMax ?? ''"
                      type="number"
                      label="Y max"
                      prepend-inner-icon="mdi-arrow-up"
                      density="compact"
                      variant="outlined"
                      hide-details
                      clearable
                      @update:model-value="
                        v => updateGraph({ yMax: v === '' || v === null ? undefined : Number(v) })
                      "
                    />
                  </v-col>
                </v-row>
              </template>
            </v-window-item>
          </v-window>
        </v-form>

        <v-divider class="my-4" />

        <SectionHeader icon="mdi-eye-outline" title="Preview" />
        <v-alert
          v-if="previewError"
          type="warning"
          density="compact"
          variant="tonal"
          class="mb-2"
        >
          {{ previewError }}
        </v-alert>
        <v-alert
          v-else-if="previewIssues.length > 0"
          type="info"
          density="compact"
          variant="tonal"
          class="mb-2"
          icon="mdi-clipboard-list-outline"
        >
          <div class="font-weight-medium mb-1">
            The preview is blank — a few fields still need your attention:
          </div>
          <ul class="ma-0 pl-4">
            <li v-for="issue in previewIssues" :key="issue.section">
              <strong>{{ issue.label }}:</strong> {{ issue.hint }}
            </li>
          </ul>
        </v-alert>
        <v-alert
          v-else-if="previewNote"
          type="info"
          density="compact"
          variant="tonal"
          class="mb-2"
          icon="mdi-information-outline"
        >
          {{ previewNote }}
        </v-alert>
        <template v-if="draft.type === 'table'">
          <v-data-table
            v-if="previewIssues.length === 0"
            :items="previewRows"
            :headers="previewHeaders"
            density="compact"
            :items-per-page="-1"
            hide-default-footer
            no-data-text="No rows match this card's filters with current corp data"
          >
            <template #item.commodityTicker="{ item }">
              <CommodityDisplay :ticker="String(item.commodityTicker)" />
            </template>
            <template
              v-for="metric in draft.columns"
              #[`item.${metric}`]="{ item }"
              :key="metric"
            >
              {{ formatCell(item, metric) }}
            </template>
          </v-data-table>
        </template>
        <template v-else>
          <CorpGraphCard v-if="previewIssues.length === 0" :card="draft" :ticker-set="tickerSet" />
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" prepend-icon="mdi-close" @click="cancel">Cancel</v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-content-save"
          :disabled="!isValid"
          @click="save"
        >
          {{ isNew ? 'Add' : 'Save' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  BurnRepairCorpResponse,
  CorpMetricGroupBy,
  GraphConfig,
  MetricKey,
  SnapshotRangePreset,
  SnapshotSeriesBy,
  ViewCard,
  ViewCardFilter,
  ViewCardSort,
} from '@kawakawa/types'
import { CORP_METRIC_DEFS, FILTER_OPERATORS } from '@kawakawa/types'
import {
  computeTickerRows,
  computeUserTickerRows,
  filterSortAndLimit,
  formatMetric,
  getMetricValue,
  type MetricRow,
} from '../../utils/corpMetrics'
import CommodityDisplay from '../CommodityDisplay.vue'
import { commodityService } from '../../services/commodityService'
import { resolveTickerScope } from '../../utils/tickerScope'
import type { Commodity } from '../../types'
import CorpGraphCard from './CorpGraphCard.vue'
import SectionHeader from './SectionHeader.vue'
import TickerCategoryInput from './TickerCategoryInput.vue'

const props = defineProps<{
  modelValue: boolean
  card: ViewCard | null
  corpData: BurnRepairCorpResponse | null
  tickerSet: Set<string> | null
  repairDays: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', card: ViewCard): void
}>()

const open = computed<boolean>({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const isNew = computed(() => props.card === null)

const DEFAULT_GRAPH: GraphConfig = {
  yMetrics: ['productionDaily'],
  seriesBy: 'user',
  seriesLimit: 5,
  rangePreset: '90d',
}

function makeDraft(source: ViewCard | null): ViewCard {
  if (source) {
    return {
      ...source,
      filters: source.filters.map(f => ({ ...f })),
      sortBy: source.sortBy.map(s => ({ ...s })),
      columns: [...source.columns],
      tickers: source.tickers ? [...source.tickers] : undefined,
      graph: source.graph ? { ...source.graph } : undefined,
    }
  }
  return {
    name: 'New card',
    groupBy: 'ticker',
    type: 'table',
    filters: [],
    sortBy: [],
    columns: ['gap', 'stock'],
    limit: 5,
  }
}

const draft = ref<ViewCard>(makeDraft(props.card))

// Live commodity catalog for resolving card-level `category:` refs in the
// preview — mirrors CorpDashboard / CorpGraphCard.
const commodityCatalog = ref<Commodity[]>([])
void (async () => {
  const cached = commodityService.getAllCommoditiesSync()
  commodityCatalog.value =
    cached.length > 0 ? cached : await commodityService.getAllCommodities()
})()

watch(
  () => [props.modelValue, props.card] as const,
  ([modelValue, card]) => {
    if (modelValue) draft.value = makeDraft(card ?? null)
  },
  { immediate: true }
)

watch(
  () => draft.value.type,
  type => {
    if (type === 'graph' && !draft.value.graph) {
      draft.value.graph = { ...DEFAULT_GRAPH }
    }
  },
  { immediate: true }
)

watch(
  () => draft.value.groupBy,
  groupBy => {
    draft.value.columns = draft.value.columns.filter(c => isColumnValid(c, groupBy))
    draft.value.filters = draft.value.filters.filter(f => isFilterableForGroup(f.metric, groupBy))
    draft.value.sortBy = draft.value.sortBy.filter(s => isColumnValid(s.metric, groupBy))
  }
)

function isColumnValid(key: MetricKey, groupBy: CorpMetricGroupBy): boolean {
  const def = CORP_METRIC_DEFS[key]
  return def !== undefined && def.groupings.includes(groupBy)
}

function isFilterableForGroup(key: MetricKey, groupBy: CorpMetricGroupBy): boolean {
  const def = CORP_METRIC_DEFS[key]
  return def !== undefined && def.groupings.includes(groupBy) && def.format !== 'text'
}

interface MetricOption {
  title: string
  value: MetricKey
}

const filterMetricOptions = computed<MetricOption[]>(() =>
  Object.values(CORP_METRIC_DEFS)
    .filter(d => isFilterableForGroup(d.key, draft.value.groupBy))
    .map(d => ({ title: d.label, value: d.key }))
)

const sortMetricOptions = computed<MetricOption[]>(() =>
  Object.values(CORP_METRIC_DEFS)
    .filter(d => isColumnValid(d.key, draft.value.groupBy))
    .map(d => ({ title: d.label, value: d.key }))
)

const columnMetricOptions = computed<MetricOption[]>(() =>
  Object.values(CORP_METRIC_DEFS)
    .filter(d => isColumnValid(d.key, draft.value.groupBy))
    .map(d => ({ title: d.label, value: d.key }))
)

const yMetricOptions = computed<MetricOption[]>(() => {
  const seriesBy = graphDraft.value?.seriesBy ?? 'corp'
  return Object.values(CORP_METRIC_DEFS)
    .filter(d => d.format !== 'text')
    .filter(d => d.key !== 'repairPerDay')
    .filter(d => {
      if (
        seriesBy === 'user' &&
        (d.key === 'stock' || d.key === 'daysRemaining' || d.key === 'daysOfCover')
      ) {
        return false
      }
      return true
    })
    .map(d => ({ title: d.label, value: d.key }))
})

const OP_OPTIONS = FILTER_OPERATORS.map(op => ({ title: op, value: op }))
const DIRECTION_OPTIONS = [
  { title: 'Desc', value: 'desc' as const },
  { title: 'Asc', value: 'asc' as const },
]

const RANGE_PRESET_OPTIONS: Array<{ title: string; value: SnapshotRangePreset }> = [
  { title: 'Last 7 days', value: '7d' },
  { title: 'Last 30 days', value: '30d' },
  { title: 'Last 90 days', value: '90d' },
  { title: 'Last 1 year', value: '1y' },
  { title: 'Last 2 years', value: '2y' },
  { title: 'All time', value: 'all' },
]

const GROUP_BY_OPTIONS: Array<{ title: string; value: CorpMetricGroupBy }> = [
  { title: 'Corporate Aggregate', value: 'ticker' },
  { title: 'Per User', value: 'user-ticker' },
]

function groupByIcon(value: CorpMetricGroupBy): string {
  return value === 'ticker' ? 'mdi-domain' : 'mdi-account-multiple'
}

const SERIES_BY_OPTIONS: Array<{ title: string; value: SnapshotSeriesBy }> = [
  { title: 'Corporate Aggregate', value: 'corp' },
  { title: 'Per User', value: 'user' },
]

function seriesByIcon(value: SnapshotSeriesBy): string {
  return value === 'corp' ? 'mdi-domain' : 'mdi-account-multiple'
}

const graphDraft = computed<GraphConfig | null>(() => draft.value.graph ?? null)

function updateGraph(patch: Partial<GraphConfig>): void {
  if (!draft.value.graph) return
  draft.value.graph = { ...draft.value.graph, ...patch }
}

watch(
  () => graphDraft.value?.seriesBy,
  () => {
    if (!draft.value.graph) return
    const valid = new Set(yMetricOptions.value.map(o => o.value))
    const kept = draft.value.graph.yMetrics.filter(m => valid.has(m))
    if (kept.length > 0) {
      draft.value.graph.yMetrics = kept
    } else {
      const first = yMetricOptions.value[0]
      if (first) draft.value.graph.yMetrics = [first.value]
    }
  }
)

const isValid = computed(() => {
  if (!draft.value.name.trim()) return false
  if (draft.value.type === 'table') {
    if (draft.value.columns.length === 0) return false
    if (draft.value.limit <= 0) return false
  } else {
    const g = draft.value.graph
    if (!g) return false
    if (g.yMetrics.length === 0) return false
    const valid = new Set(yMetricOptions.value.map(o => o.value))
    if (!g.yMetrics.every(m => valid.has(m))) return false
  }
  return true
})

// -------- Filter row actions --------
function defaultFilterMetric(): MetricKey {
  const first = filterMetricOptions.value[0]
  return first ? first.value : 'gap'
}
function addFilter(): void {
  draft.value.filters.push({ metric: defaultFilterMetric(), op: '>', value: 0 })
}
function updateFilter(idx: number, patch: Partial<ViewCardFilter>): void {
  draft.value.filters[idx] = { ...draft.value.filters[idx], ...patch }
}
function removeFilter(idx: number): void {
  draft.value.filters.splice(idx, 1)
}

// -------- Sort row actions --------
function defaultSortMetric(): MetricKey {
  const first = sortMetricOptions.value[0]
  return first ? first.value : 'gap'
}
function addSort(): void {
  draft.value.sortBy.push({ metric: defaultSortMetric(), direction: 'desc' })
}
function updateSort(idx: number, patch: Partial<ViewCardSort>): void {
  draft.value.sortBy[idx] = { ...draft.value.sortBy[idx], ...patch }
}
function removeSort(idx: number): void {
  draft.value.sortBy.splice(idx, 1)
}
function moveSort(idx: number, delta: number): void {
  const next = idx + delta
  if (next < 0 || next >= draft.value.sortBy.length) return
  const [item] = draft.value.sortBy.splice(idx, 1)
  draft.value.sortBy.splice(next, 0, item)
}

// -------- Table preview --------
const previewError = computed(() => {
  if (!props.corpData) return 'Corp data is still loading — preview will update when ready.'
  return null
})

/**
 * Resolved scope used by the preview, surfaced so the issue computer can tell
 * "you picked tickers but none of them are in the catalog" from "the view
 * scope is empty".
 */
const previewScope = computed<Set<string> | null>(() => {
  if (draft.value.tickers && draft.value.tickers.length > 0) {
    return (
      resolveTickerScope(draft.value.tickers, commodityCatalog.value) ?? props.tickerSet
    )
  }
  return props.tickerSet
})

/** What field is each issue pointing at? Drives the warning-icon highlight. */
type IssueSection =
  | 'name'
  | 'columns'
  | 'filters'
  | 'rowLimit'
  | 'cardTickers'
  | 'yMetrics'

interface PreviewIssue {
  section: IssueSection
  label: string
  hint: string
}

/**
 * Hard configuration issues — the card is misconfigured and the preview
 * cannot render. Each issue points at the exact field to fix so the matching
 * SectionHeader can light up.
 */
const previewIssues = computed<PreviewIssue[]>(() => {
  const issues: PreviewIssue[] = []
  const d = draft.value

  if (!d.name.trim()) {
    issues.push({
      section: 'name',
      label: 'Name',
      hint: 'Give the card a name so it can be recognised in the dashboard.',
    })
  }

  if (d.type === 'table') {
    if (d.columns.length === 0) {
      issues.push({
        section: 'columns',
        label: 'Columns',
        hint: 'Pick at least one metric — the table has nothing to render without a column.',
      })
    }
    if (d.limit <= 0) {
      issues.push({
        section: 'rowLimit',
        label: 'Row limit',
        hint: 'Row limit must be at least 1.',
      })
    }
  } else if (d.type === 'graph') {
    const g = d.graph
    if (!g || g.yMetrics.length === 0) {
      issues.push({
        section: 'yMetrics',
        label: 'Y metrics',
        hint: 'Pick at least one metric to plot — the chart has no series without one.',
      })
    }
  }

  // Card-level tickers are optional — empty inherits the view scope. Only
  // flag when the user *set* them and the entries don't resolve to anything
  // (typo / unknown category).
  if (
    d.tickers &&
    d.tickers.length > 0 &&
    (!previewScope.value || previewScope.value.size === 0)
  ) {
    issues.push({
      section: 'cardTickers',
      label: 'Tickers (this card)',
      hint: 'None of these entries match a known ticker or category. Remove them or fix the spelling.',
    })
  }

  return issues
})

/**
 * Soft empty-state: configuration is valid but the current corp data yields
 * zero rows. Explains *why* without flagging a field as misconfigured, so the
 * user isn't pushed to "fix" something that's working as designed (e.g.
 * a "Top Producers of RAT" card renders empty when no-one is producing RAT
 * right now — the card will come alive the moment someone does).
 */
const previewNote = computed<string | null>(() => {
  if (previewIssues.value.length > 0) return null
  if (!props.corpData) return null
  if (draft.value.type !== 'table') return null
  if (previewRows.value.length > 0) return null

  if (draft.value.filters.length > 0) {
    return 'Filters collapsed the row set to zero with current corp data. This may be the intended behaviour — the card will populate as soon as a row passes the filters.'
  }
  return 'No rows match the current scope right now. The card will populate as corp data catches up — no action needed.'
})

function hasIssue(section: IssueSection): boolean {
  return previewIssues.value.some(i => i.section === section)
}

function issueMessage(section: IssueSection): string | undefined {
  return previewIssues.value.find(i => i.section === section)?.hint
}

interface PreviewHeader {
  title: string
  key: string
  sortable: boolean
  align: 'start' | 'end'
}

const previewHeaders = computed<PreviewHeader[]>(() => {
  const headers: PreviewHeader[] = [
    { title: 'Material', key: 'commodityTicker', sortable: false, align: 'start' },
  ]
  for (const col of draft.value.columns) {
    const def = CORP_METRIC_DEFS[col]
    if (!def) continue
    headers.push({
      title: def.label,
      key: def.key,
      sortable: false,
      align: def.format === 'text' ? 'start' : 'end',
    })
  }
  return headers
})

const previewRows = computed<MetricRow[]>(() => {
  if (!props.corpData) return []
  // Card-level tickers (when set) narrow further than the view scope.
  const scope =
    draft.value.tickers && draft.value.tickers.length > 0
      ? resolveTickerScope(draft.value.tickers, commodityCatalog.value) ?? props.tickerSet
      : props.tickerSet
  const base: MetricRow[] =
    draft.value.groupBy === 'ticker'
      ? computeTickerRows(props.corpData, scope, props.repairDays)
      : computeUserTickerRows(props.corpData, scope, props.repairDays)
  return filterSortAndLimit(base, draft.value.filters, draft.value.sortBy, draft.value.limit)
})

function formatCell(item: unknown, key: MetricKey): string {
  const def = CORP_METRIC_DEFS[key]
  if (!def) return ''
  return formatMetric(getMetricValue(item as MetricRow, key), def.format)
}

function save(): void {
  if (!isValid.value) return
  emit('save', {
    name: draft.value.name.trim(),
    groupBy: draft.value.groupBy,
    type: draft.value.type,
    filters: draft.value.filters.map(f => ({ ...f })),
    sortBy: draft.value.sortBy.map(s => ({ ...s })),
    columns: [...draft.value.columns],
    limit: draft.value.limit,
    tickers:
      draft.value.type === 'table' && draft.value.tickers && draft.value.tickers.length > 0
        ? [...draft.value.tickers]
        : undefined,
    graph:
      draft.value.type === 'graph' && draft.value.graph ? { ...draft.value.graph } : undefined,
  })
  open.value = false
}

function cancel(): void {
  open.value = false
}
</script>
