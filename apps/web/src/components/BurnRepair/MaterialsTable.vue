<template>
  <v-card class="mb-4">
    <v-card-title class="d-flex align-center text-subtitle-1 ga-2">
      {{ title }}
      <v-chip size="x-small" variant="tonal">{{ rows.length }}</v-chip>
      <v-spacer />
      <v-btn variant="tonal" size="small" prepend-icon="mdi-content-copy" @click="onCopyCsv">
        Copy CSV
      </v-btn>

      <!-- Column picker — popover triggered next to Copy CSV. Reuses
           `DraggableMetricChips` so the chip-strip behaves identically to
           card-level column pickers. Empty selection falls back to the shared
           defaults. -->
      <v-menu :close-on-content-click="false" location="bottom end" max-width="540">
        <template #activator="{ props: menuProps }">
          <v-btn v-bind="menuProps" variant="tonal" size="small" prepend-icon="mdi-table-column">
            Columns
          </v-btn>
        </template>
        <v-card width="540">
          <v-card-text class="pa-3">
            <div class="text-caption text-medium-emphasis mb-2">
              Pick which columns the table renders, drag chips to reorder. Empty = defaults ({{
                defaultColumnsLabel
              }}).
            </div>
            <DraggableMetricChips
              :model-value="columns"
              :available="columnOptions"
              add-label="Add column"
              :empty-hint="`Empty = defaults (${defaultColumnsLabel}).`"
              @update:model-value="v => emit('update:columns', v)"
            />
          </v-card-text>
        </v-card>
      </v-menu>
    </v-card-title>

    <v-data-table
      v-model:sort-by="sortBy"
      :items="rows"
      :headers="headers"
      density="compact"
      :items-per-page="25"
      hover
      multi-sort
      class="materials-table-clickable"
      :class="{ 'multi-sort-active': sortBy.length > 1 }"
      @click:row="onRowClick"
    >
      <template #item.commodityTicker="{ item }">
        <CommodityDisplay :ticker="item.commodityTicker" />
      </template>
      <template v-for="metric in metricColumns" #[`item.${metric}`]="{ item }" :key="metric">
        <span v-if="metric === 'productionDaily'">
          <span v-if="(item as TickerRow).productionDaily > 0" class="text-success">
            {{ formatCell(item as TickerRow, metric) }}
          </span>
          <span v-else>-</span>
        </span>
        <span
          v-else-if="metric === 'netDaily' || metric === 'netDailyNoRepair'"
          class="font-weight-medium"
          :class="
            (getMetricValue(item as TickerRow, metric) as number) >= 0
              ? 'text-success'
              : 'text-error'
          "
        >
          {{ formatCell(item as TickerRow, metric) }}
        </span>
        <span v-else>
          {{ formatCell(item as TickerRow, metric) }}
        </span>
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import CommodityDisplay from '../CommodityDisplay.vue'
import DraggableMetricChips from './DraggableMetricChips.vue'
import {
  computeTickerRows,
  formatMetric,
  getMetricValue,
  type TickerRow,
} from '../../utils/corpMetrics'
import type { BurnRepairCorpResponse, MetricKey } from '@kawakawa/types'
import { CORP_METRIC_DEFS, DEFAULT_MATERIALS_TABLE_COLUMNS } from '@kawakawa/types'

const props = defineProps<{
  title: string
  /** Full corp response — needed because most metrics derive from stock + per-ticker data. */
  corpData: BurnRepairCorpResponse
  /** Combined view scope + local ticker filter; null means no filtering. */
  tickerSet: Set<string> | null
  repairDays: number
  /** View-configured columns. Empty falls back to `DEFAULT_MATERIALS_TABLE_COLUMNS`. */
  columns: MetricKey[]
  /** Every metric the column picker is allowed to offer (parent already filters by groupBy). */
  columnOptions: Array<{ title: string; value: MetricKey }>
  /** Comma-joined default column labels — shown in the picker's empty-state hint. */
  defaultColumnsLabel: string
}>()

const emit = defineEmits<{
  (e: 'copy-csv', payload: { rows: TickerRow[]; columns: MetricKey[] }): void
  (e: 'inspect', ticker: string): void
  (e: 'update:columns', value: MetricKey[]): void
}>()

/**
 * Hand the parent the rendered rows plus the active column order so the CSV
 * built upstream matches exactly what the user sees in the table — including
 * the local ticker filter (already applied to `rows`) and the view's saved
 * column choice. CSV header labels and per-cell formatting live in the view
 * layer to keep this component focused on rendering.
 */
function onCopyCsv(): void {
  emit('copy-csv', { rows: rows.value, columns: metricColumns.value })
}

/**
 * Vuetify's `click:row` fires `(event, { item })`. Loose typing on the second
 * arg avoids brittle coupling to the exact tuple shape Vuetify exposes.
 */
function onRowClick(_event: unknown, ctx: { item: TickerRow }): void {
  emit('inspect', ctx.item.commodityTicker)
}

const rows = computed<TickerRow[]>(() =>
  computeTickerRows(props.corpData, props.tickerSet, props.repairDays)
)

/**
 * Effective column list: caller-configured columns when present, otherwise the
 * shared default. Metric defs back-stop unknown keys so a malformed view
 * doesn't crash the table.
 */
const metricColumns = computed<MetricKey[]>(() => {
  const source = props.columns.length > 0 ? props.columns : DEFAULT_MATERIALS_TABLE_COLUMNS
  return source.filter(k => CORP_METRIC_DEFS[k] !== undefined)
})

interface TableHeader {
  title: string
  key: string
  sortable: boolean
  align?: 'start' | 'center' | 'end'
  cellProps?: { class?: string }
  headerProps?: { class?: string }
}

/**
 * Vuetify-managed sort state. Session-only — not persisted on the view, so a
 * page reload resets to alphabetical. `multi-sort` lets users layer criteria;
 * the priority badge only shows when more than one is active.
 */
interface SortItem {
  key: string
  order: 'asc' | 'desc'
}
const sortBy = ref<SortItem[]>([])

const headers = computed<TableHeader[]>(() => {
  const sortedKeys = new Set(sortBy.value.map(s => s.key))
  const out: TableHeader[] = [{ title: 'Material', key: 'commodityTicker', sortable: false }]
  for (const key of metricColumns.value) {
    const def = CORP_METRIC_DEFS[key]
    if (!def) continue
    const isSorted = sortedKeys.has(key)
    out.push({
      title: def.label,
      key,
      // Sort lives on the column headers themselves — clicking a metric column
      // toggles its sort, multi-sort lets the user pile criteria.
      sortable: true,
      align: def.format === 'text' ? 'start' : 'end',
      // Tag header + cells of actively-sorted columns so the CSS rule below
      // can tint the whole column, tying the arrow to the data underneath.
      headerProps: isSorted ? { class: 'sorted-column' } : undefined,
      cellProps: isSorted ? { class: 'sorted-column' } : undefined,
    })
  }
  return out
})

function formatCell(row: TickerRow, key: MetricKey): string {
  const def = CORP_METRIC_DEFS[key]
  if (!def) return ''
  return formatMetric(getMetricValue(row, key), def.format)
}
</script>

<style scoped>
:deep(.materials-table-clickable tbody tr) {
  cursor: pointer;
}

/* Sort arrow placement: title → arrow, hugging the right edge for numeric
 * columns. Vuetify defaults `flex-direction: row-reverse` for end-aligned
 * headers, which puts the arrow on the LEFT of the title; flip it back. */
:deep(.materials-table-clickable thead th .v-data-table-header__content) {
  flex-direction: row;
  gap: 2px;
}
:deep(.materials-table-clickable thead th.text-end .v-data-table-header__content) {
  justify-content: flex-end;
}

/* Sort arrow visibility: hidden on neutral columns, shown when actively sorted
 * (Vuetify sets `aria-sort`) or while the header is hovered. */
:deep(.materials-table-clickable thead th .v-data-table-header__sort) {
  margin-inline: 0;
  padding-inline: 0;
  opacity: 0;
  transition: opacity 120ms ease;
}
:deep(.materials-table-clickable thead th:hover .v-data-table-header__sort),
:deep(.materials-table-clickable thead th[aria-sort='ascending'] .v-data-table-header__sort),
:deep(.materials-table-clickable thead th[aria-sort='descending'] .v-data-table-header__sort) {
  opacity: 1;
}

/* Highlight active sort columns so the arrow ties back to its column visually.
 * Uses a translucent overlay via `background-image` so zebra-striped rows
 * still read through (`background-color` would be replaced by row stripes). */
:deep(.materials-table-clickable thead th) {
  transition: background-color 120ms ease;
}
:deep(.materials-table-clickable thead th.sorted-column) {
  background-color: rgba(var(--v-theme-primary), 0.14);
}
:deep(.materials-table-clickable tbody td.sorted-column) {
  background-image: linear-gradient(
    rgba(var(--v-theme-primary), 0.1),
    rgba(var(--v-theme-primary), 0.1)
  );
}
:deep(.materials-table-clickable thead th.v-data-table__th--sortable:hover) {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

/* Multi-sort priority badge — Vuetify renders it next to every sorted column
 * even when only one is active; shrink it and hide unless we're really
 * multi-sorting. */
:deep(.materials-table-clickable .v-data-table-header__sort-badge) {
  font-size: 9px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
}
.materials-table-clickable:not(.multi-sort-active) :deep(.v-data-table-header__sort-badge) {
  display: none;
}
</style>
