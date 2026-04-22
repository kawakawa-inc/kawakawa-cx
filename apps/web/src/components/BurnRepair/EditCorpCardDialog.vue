<template>
  <v-dialog v-model="open" max-width="820" persistent scrollable>
    <v-card>
      <v-card-title>{{ isNew ? 'Add card' : 'Edit card' }}</v-card-title>
      <v-card-text>
        <v-form ref="formRef" @submit.prevent>
          <v-text-field
            v-model="draft.name"
            label="Name"
            :rules="[v => !!v?.trim() || 'Name is required']"
            required
            density="compact"
            variant="outlined"
            class="mb-3"
          />

          <v-row dense>
            <v-col cols="12" md="9">
              <v-label class="text-caption">Group by</v-label>
              <v-radio-group v-model="draft.groupBy" inline density="compact" hide-details>
                <v-radio label="Ticker (aggregate)" value="ticker" />
                <v-radio label="User &amp; ticker" value="user-ticker" />
              </v-radio-group>
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field
                :model-value="draft.limit"
                type="number"
                label="Limit"
                min="1"
                max="100"
                density="compact"
                variant="outlined"
                hide-details
                @update:model-value="v => (draft.limit = Math.max(1, Math.min(100, Number(v) || 1)))"
              />
            </v-col>
          </v-row>

          <div class="d-flex align-center mt-4 mb-2">
            <span class="text-subtitle-2">Filters</span>
            <v-chip size="x-small" class="ml-2" variant="tonal">{{ draft.filters.length }}</v-chip>
            <v-spacer />
            <v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addFilter">
              Add filter
            </v-btn>
          </div>
          <p class="text-caption text-medium-emphasis mb-2">
            All filters are AND-combined. Rows with missing data fail every comparison.
          </p>
          <template v-if="draft.filters.length === 0">
            <p class="text-caption text-medium-emphasis">No filters — all rows qualify.</p>
          </template>
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

          <div class="d-flex align-center mt-4 mb-2">
            <span class="text-subtitle-2">Sort</span>
            <v-chip size="x-small" class="ml-2" variant="tonal">{{ draft.sortBy.length }}</v-chip>
            <v-spacer />
            <v-btn size="x-small" variant="tonal" prepend-icon="mdi-plus" @click="addSort">
              Add sort
            </v-btn>
          </div>
          <p class="text-caption text-medium-emphasis mb-2">
            Applied in order — drag the arrows to reorder. No sort = alphabetical by ticker.
          </p>
          <template v-if="draft.sortBy.length === 0">
            <p class="text-caption text-medium-emphasis">No sort — rows sorted alphabetically.</p>
          </template>
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

          <div class="mt-4">
            <v-label class="text-caption">Columns</v-label>
            <p class="text-caption text-medium-emphasis mb-2">
              Material is always shown first. Pick metrics to display after it — order is preserved.
            </p>
            <v-select
              v-model="draft.columns"
              :items="columnMetricOptions"
              multiple
              chips
              closable-chips
              density="compact"
              variant="outlined"
              :rules="[v => (Array.isArray(v) && v.length > 0) || 'At least one column is required']"
            />
          </div>
        </v-form>

        <v-divider class="my-4" />

        <div class="text-subtitle-2 mb-2">Preview</div>
        <template v-if="previewError">
          <v-alert type="warning" density="compact" variant="tonal">{{ previewError }}</v-alert>
        </template>
        <template v-else>
          <v-data-table
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
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="cancel">Cancel</v-btn>
        <v-btn color="primary" :disabled="!isValid" @click="save">
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
  MetricKey,
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

function makeDraft(source: ViewCard | null): ViewCard {
  if (source) {
    return {
      ...source,
      filters: source.filters.map(f => ({ ...f })),
      sortBy: source.sortBy.map(s => ({ ...s })),
      columns: [...source.columns],
    }
  }
  return {
    name: 'New card',
    groupBy: 'ticker',
    filters: [],
    sortBy: [],
    columns: ['gap', 'stock'],
    limit: 5,
  }
}

const draft = ref<ViewCard>(makeDraft(props.card))

watch(
  () => [props.modelValue, props.card] as const,
  ([modelValue, card]) => {
    if (modelValue) draft.value = makeDraft(card ?? null)
  },
  { immediate: true }
)

// When groupBy changes, drop anything that no longer applies.
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

const OP_OPTIONS = FILTER_OPERATORS.map(op => ({ title: op, value: op }))
const DIRECTION_OPTIONS = [
  { title: 'Desc', value: 'desc' as const },
  { title: 'Asc', value: 'asc' as const },
]

const isValid = computed(() => {
  if (!draft.value.name.trim()) return false
  if (draft.value.columns.length === 0) return false
  if (draft.value.limit <= 0) return false
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

// -------- Preview (mirrors dashboard) --------
const previewError = computed(() => {
  if (!props.corpData) return 'Corp data is still loading — preview will update when ready.'
  return null
})

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
  const base: MetricRow[] =
    draft.value.groupBy === 'ticker'
      ? computeTickerRows(props.corpData, props.tickerSet, props.repairDays)
      : computeUserTickerRows(props.corpData, props.tickerSet, props.repairDays)
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
    filters: draft.value.filters.map(f => ({ ...f })),
    sortBy: draft.value.sortBy.map(s => ({ ...s })),
    columns: [...draft.value.columns],
    limit: draft.value.limit,
  })
  open.value = false
}

function cancel(): void {
  open.value = false
}
</script>
