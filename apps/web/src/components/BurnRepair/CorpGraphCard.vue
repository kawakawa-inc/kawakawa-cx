<template>
  <v-card class="mb-4" height="360">
    <v-card-title class="text-subtitle-2 d-flex align-center">
      {{ card.name }}
      <v-chip size="x-small" class="ml-2" variant="tonal">
        {{ metricLabel }}
      </v-chip>
      <v-chip size="x-small" class="ml-1" variant="tonal">
        {{ rangeLabel }}
      </v-chip>
      <v-spacer />
      <v-progress-circular v-if="loading" indeterminate size="14" width="2" />
    </v-card-title>
    <v-card-text class="pa-2 position-relative" style="height: calc(100% - 48px)">
      <template v-if="error">
        <v-alert type="warning" density="compact" variant="tonal">{{ error }}</v-alert>
      </template>
      <template v-else-if="!loading && series.length === 0">
        <div class="text-caption text-medium-emphasis text-center pa-4">
          No data in the selected range.
        </div>
      </template>
      <Line v-else :data="chartData" :options="chartOptions" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { useTheme } from 'vuetify'
import type {
  MetricKey,
  SnapshotSeries,
  SnapshotSeriesResponse,
  ViewCard,
} from '@kawakawa/types'
import { CORP_METRIC_DEFS } from '@kawakawa/types'
import { api } from '../../services/api'
import { commodityService } from '../../services/commodityService'
import type { Commodity } from '../../types'
import { resolveTickerScope } from '../../utils/tickerScope'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const props = defineProps<{
  card: ViewCard
  tickerSet: Set<string> | null
  /** Planning-exclusion applied historically — hides these users' contribution. */
  excludedUserIds?: number[]
}>()

const theme = useTheme()

const loading = ref(false)
const error = ref<string | null>(null)
/** One response per yMetric — preserved so labels can include the metric name. */
const responsesByMetric = ref<Array<{ metric: MetricKey; response: SnapshotSeriesResponse }>>([])

// Live commodity catalog drives `category:Name` expansion in card-level scope.
const commodities = ref<Commodity[]>([])
async function loadCommodities(): Promise<void> {
  const cached = commodityService.getAllCommoditiesSync()
  commodities.value = cached.length > 0 ? cached : await commodityService.getAllCommodities()
}
void loadCommodities()

/**
 * Merge per-metric responses into a single flat series list for the chart.
 *
 * When the card picks multiple metrics, each series gets a metric-prefixed
 * label so users can disambiguate ("RAT · Production/Day" vs "RAT ·
 * Consumption/Day"). Single-metric cards keep the server's label verbatim
 * so the existing layouts (per-user usernames, per-ticker tickers) render
 * unchanged.
 */
const series = computed<SnapshotSeries[]>(() => {
  const entries = responsesByMetric.value
  if (entries.length === 0) return []
  if (entries.length === 1) return entries[0].response.series
  return entries.flatMap(({ metric, response }) => {
    const label = CORP_METRIC_DEFS[metric]?.label ?? metric
    return response.series.map(s => ({
      label: `${s.label} · ${label}`,
      points: s.points,
    }))
  })
})

const metricLabel = computed(() => {
  const metrics = props.card.graph?.yMetrics ?? []
  if (metrics.length === 0) return '—'
  if (metrics.length === 1) {
    return CORP_METRIC_DEFS[metrics[0]]?.label ?? metrics[0]
  }
  return `${metrics.length} metrics`
})

const rangeLabel = computed(() => {
  if (!props.card.graph) return ''
  const p = props.card.graph.rangePreset
  if (props.card.graph.rangeFrom && props.card.graph.rangeTo) {
    return `${props.card.graph.rangeFrom} → ${props.card.graph.rangeTo}`
  }
  return p
})

/**
 * A stable palette pulled from Vuetify theme tokens. Chart.js can absorb any
 * color string; this keeps graphs on-brand and dark-theme legible. If a view
 * has more series than entries here they cycle — acceptable noise on a card
 * that's already bounded by seriesLimit.
 */
const palette = computed<string[]>(() => {
  const colors = theme.current.value.colors
  return [
    colors.primary,
    colors.secondary,
    colors.success ?? '#66bb6a',
    colors.warning ?? '#ffa726',
    colors.error ?? '#ef5350',
    colors.info ?? '#42a5f5',
    '#ab47bc',
    '#ffca28',
  ]
})

/**
 * Turn `SnapshotSeries` rows into Chart.js's expected `{ labels, datasets }`
 * shape. Uses the union of all `t` values across series as the x-axis; any
 * series missing a specific bucket contributes `null` there, which Chart.js
 * renders as a gap (better than fabricating a 0 that isn't real data).
 */
const chartData = computed<ChartData<'line', (number | null)[], string>>(() => {
  const labels = new Set<string>()
  for (const s of series.value) for (const p of s.points) labels.add(p.t)
  const sortedLabels = [...labels].sort()

  return {
    labels: sortedLabels.map(formatLabel),
    datasets: series.value.map((s, idx) => {
      const pointsByT = new Map(s.points.map(p => [p.t, p.v]))
      const color = palette.value[idx % palette.value.length]
      return {
        label: s.label,
        data: sortedLabels.map(t => pointsByT.get(t) ?? null),
        borderColor: color,
        backgroundColor: color,
        tension: 0.2,
        spanGaps: true,
        pointRadius: 2,
        borderWidth: 2,
      }
    }),
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => {
  const onSurface = theme.current.value.colors['on-surface'] ?? '#afafaf'
  const gridColor = hexToRgba(onSurface, 0.12)

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: onSurface, boxWidth: 10, boxHeight: 10 },
      },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: {
        ticks: { color: onSurface, maxRotation: 0, autoSkip: true },
        grid: { color: gridColor },
      },
      y: {
        min: props.card.graph?.yMin,
        max: props.card.graph?.yMax,
        ticks: { color: onSurface },
        grid: { color: gridColor },
      },
    },
  }
})

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(175, 175, 175, ${alpha})`
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatLabel(iso: string): string {
  // iso may be `2026-04-22` or a full timestamp; take the date portion only.
  return iso.slice(0, 10)
}

/**
 * Card-level tickers (graph-only) override the view's ticker scope when set.
 * Empty / undefined → fall back to whatever the view scope is.
 */
function effectiveTickers(): string[] | undefined {
  // Card-level scope wins when set; otherwise fall back to the view's already-
  // resolved scope. Card-level scope may itself contain `category:Name` refs,
  // so we run it through the resolver against the live commodity catalog.
  const cardTickers = props.card.graph?.tickers
  if (cardTickers && cardTickers.length > 0) {
    const resolved = resolveTickerScope(cardTickers, commodities.value)
    return resolved && resolved.size > 0 ? [...resolved] : undefined
  }
  if (props.tickerSet && props.tickerSet.size > 0) return [...props.tickerSet]
  return undefined
}

async function load(): Promise<void> {
  const g = props.card.graph
  if (!g) {
    error.value = 'Graph card is missing its configuration.'
    return
  }
  if (g.yMetrics.length === 0) {
    error.value = 'Pick at least one Y metric.'
    responsesByMetric.value = []
    return
  }

  loading.value = true
  error.value = null
  try {
    const tickers = effectiveTickers()
    // Fan out per metric in parallel — the endpoint is single-metric by
    // design. Keeping the server simple beats introducing a multi-metric
    // response shape, and three concurrent fetches are cheaper than round-
    // tripping a merged-label payload.
    const results = await Promise.all(
      g.yMetrics.map(async metric => ({
        metric,
        response: await api.corpSnapshots.query({
          yMetric: metric,
          seriesBy: g.seriesBy,
          seriesLimit: g.seriesLimit,
          preset: g.rangeFrom && g.rangeTo ? undefined : g.rangePreset,
          from: g.rangeFrom,
          to: g.rangeTo,
          tickers,
          excludedUserIds: props.excludedUserIds,
          includeOther: g.includeOther === true,
        }),
      }))
    )
    responsesByMetric.value = results
  } catch (e) {
    error.value = (e as Error).message || 'Failed to load graph data.'
    responsesByMetric.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

// Re-query when the card's graph config or ticker scope changes — the panel
// swaps ticker sets when views change; the editor mutates graph config live.
watch(
  () => [props.card, props.tickerSet, props.excludedUserIds] as const,
  () => {
    void load()
  },
  { deep: true }
)
</script>
