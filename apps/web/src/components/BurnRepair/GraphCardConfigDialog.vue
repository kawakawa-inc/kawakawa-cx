<template>
  <v-dialog v-model="open" max-width="640" persistent scrollable>
    <v-card v-if="draft">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>mdi-chart-line</v-icon>
        Configure graph card
      </v-card-title>

      <v-card-text>
        <!-- Group by -->
        <div class="text-caption text-medium-emphasis mb-1">
          Group by — corp aggregate or per user. Limits which metrics are available.
        </div>
        <v-select
          v-model="draft.groupBy"
          :items="GROUP_BY_OPTIONS"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-3"
        />

        <!-- Y metrics -->
        <div class="text-caption text-medium-emphasis mb-1">Y metrics — pick one or more.</div>
        <v-select
          :model-value="graph.yMetrics"
          :items="yMetricOptions"
          density="compact"
          variant="outlined"
          multiple
          chips
          closable-chips
          hide-details
          class="mb-3"
          @update:model-value="v => updateGraph({ yMetrics: Array.isArray(v) ? v : [] })"
        />

        <!-- Tickers (card-level scope) -->
        <div class="text-caption text-medium-emphasis mb-1">
          Tickers (this card) — overrides the view scope; leave empty to inherit it.
        </div>
        <TickerCategoryInput
          :model-value="graph.tickers ?? []"
          placeholder="e.g. RAT, Consumables…"
          @update:model-value="v => updateGraph({ tickers: v.length > 0 ? v : undefined })"
        />

        <v-row dense class="mt-3">
          <v-col cols="12" md="6">
            <div class="text-caption text-medium-emphasis mb-1">Series by</div>
            <v-select
              :model-value="graph.seriesBy"
              :items="SERIES_BY_OPTIONS"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              @update:model-value="v => updateGraph({ seriesBy: v === 'corp' ? 'corp' : 'user' })"
            />
          </v-col>
          <v-col cols="12" md="6">
            <div class="text-caption text-medium-emphasis mb-1">Series limit</div>
            <v-text-field
              :model-value="graph.seriesLimit"
              type="number"
              min="1"
              max="20"
              density="compact"
              variant="outlined"
              hide-details
              @update:model-value="
                v => updateGraph({ seriesLimit: Math.max(1, Math.min(20, Number(v) || 5)) })
              "
            />
            <v-checkbox
              :model-value="graph.includeOther === true"
              label='Show "Other" rollup for overflow'
              density="compact"
              hide-details
              class="mt-1"
              @update:model-value="v => updateGraph({ includeOther: v === true })"
            />
          </v-col>
        </v-row>

        <div class="text-caption text-medium-emphasis mt-3 mb-1">
          Time range — bucketing is automatic (daily ≤ 90d, weekly ≤ 1y, monthly above).
        </div>
        <v-select
          :model-value="graph.rangePreset"
          :items="RANGE_PRESET_OPTIONS"
          density="compact"
          variant="outlined"
          hide-details
          @update:model-value="v => updateGraph({ rangePreset: v })"
        />

        <div class="text-caption text-medium-emphasis mt-3 mb-1">
          Y axis bounds (optional) — leave empty for auto-scale.
        </div>
        <v-row dense>
          <v-col cols="12" md="6">
            <v-text-field
              :model-value="graph.yMin ?? ''"
              type="number"
              label="Y min"
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
              :model-value="graph.yMax ?? ''"
              type="number"
              label="Y max"
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
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-2">
        <v-btn
          size="small"
          variant="tonal"
          prepend-icon="mdi-table"
          @click="emit('convert-to-table')"
        >
          Convert to table
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="cancel">Cancel</v-btn>
        <v-btn color="primary" :disabled="!isValid" @click="save">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  CorpMetricGroupBy,
  GraphConfig,
  MetricKey,
  SnapshotRangePreset,
  SnapshotSeriesBy,
  ViewCard,
} from '@kawakawa/types'
import { CORP_METRIC_DEFS } from '@kawakawa/types'
import TickerCategoryInput from './TickerCategoryInput.vue'

/**
 * Graph-card configuration dialog. Extracted from the legacy
 * `EditCorpCardDialog` so its 10+ graph-specific fields keep a roomy modal
 * surface; table cards now configure inline via popovers.
 *
 * The dialog is fully controlled — every field edit mutates a local `draft`
 * card and only flushes on Save, mirroring the previous dialog's "Cancel
 * discards everything" behavior. The parent owns the eventual `update:card`
 * patch.
 */
const props = defineProps<{
  modelValue: boolean
  /** Card to edit. Required when the dialog is open; null on first paint. */
  card: ViewCard | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', card: ViewCard): void
  (e: 'convert-to-table'): void
}>()

const open = computed<boolean>({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const DEFAULT_GRAPH: GraphConfig = {
  yMetrics: ['productionDaily'],
  seriesBy: 'corp',
  seriesLimit: 5,
  rangePreset: '90d',
}

function makeDraft(source: ViewCard | null): ViewCard | null {
  if (!source) return null
  return {
    ...source,
    filters: source.filters.map(f => ({ ...f })),
    sortBy: source.sortBy.map(s => ({ ...s })),
    columns: [...source.columns],
    tickers: source.tickers ? [...source.tickers] : undefined,
    graph: source.graph ? { ...source.graph } : { ...DEFAULT_GRAPH },
    type: 'graph',
  }
}

const draft = ref<ViewCard | null>(makeDraft(props.card))

watch(
  () => [props.modelValue, props.card] as const,
  ([modelValue, card]) => {
    if (modelValue) draft.value = makeDraft(card ?? null)
  },
  { immediate: true }
)

/**
 * Trim invalid yMetrics when groupBy changes — `username`-style text metrics
 * shouldn't survive a switch to corp-aggregate, etc. Keeps the draft
 * self-consistent so the parent's save handler doesn't need to clean up.
 */
watch(
  () => draft.value?.groupBy,
  () => {
    if (!draft.value || !draft.value.graph) return
    const valid = new Set(yMetricOptions.value.map(o => o.value))
    const kept = draft.value.graph.yMetrics.filter(m => valid.has(m))
    if (kept.length !== draft.value.graph.yMetrics.length) {
      draft.value.graph = { ...draft.value.graph, yMetrics: kept }
    }
  }
)

const graph = computed<GraphConfig>(() => draft.value?.graph ?? DEFAULT_GRAPH)

function updateGraph(patch: Partial<GraphConfig>): void {
  if (!draft.value || !draft.value.graph) return
  draft.value.graph = { ...draft.value.graph, ...patch }
}

const GROUP_BY_OPTIONS: Array<{ title: string; value: CorpMetricGroupBy }> = [
  { title: 'Corporate aggregate', value: 'ticker' },
  { title: 'Per user', value: 'user-ticker' },
]

const SERIES_BY_OPTIONS: Array<{ title: string; value: SnapshotSeriesBy }> = [
  { title: 'Corporate aggregate', value: 'corp' },
  { title: 'Per user', value: 'user' },
]

const RANGE_PRESET_OPTIONS: Array<{ title: string; value: SnapshotRangePreset }> = [
  { title: 'Last 7 days', value: '7d' },
  { title: 'Last 30 days', value: '30d' },
  { title: 'Last 90 days', value: '90d' },
  { title: 'Last 1 year', value: '1y' },
  { title: 'Last 2 years', value: '2y' },
  { title: 'All time', value: 'all' },
]

/**
 * Available y-metrics for the current draft. Stock + listed-stock derivatives
 * have no per-user notion, so they're hidden when the user picks per-user
 * series — preventing a confusing "always-empty" series.
 */
const yMetricOptions = computed<Array<{ title: string; value: MetricKey }>>(() => {
  const seriesBy = draft.value?.graph?.seriesBy ?? 'corp'
  return Object.values(CORP_METRIC_DEFS)
    .filter(d => d.format !== 'text')
    .filter(d => d.key !== 'repairPerDay')
    .filter(d => {
      if (
        seriesBy === 'user' &&
        (d.key === 'stock' ||
          d.key === 'listedStock' ||
          d.key === 'daysRemaining' ||
          d.key === 'daysListed')
      ) {
        return false
      }
      return true
    })
    .map(d => ({ title: d.label, value: d.key }))
})

const isValid = computed(() => {
  const d = draft.value
  if (!d || !d.graph) return false
  if (d.graph.yMetrics.length === 0) return false
  return true
})

function save(): void {
  if (!draft.value || !isValid.value) return
  emit('save', { ...draft.value })
  open.value = false
}

function cancel(): void {
  open.value = false
}
</script>
