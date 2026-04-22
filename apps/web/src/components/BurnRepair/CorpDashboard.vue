<template>
  <v-row dense class="mb-4">
    <v-col v-for="(card, idx) in cards" :key="card.name + idx" cols="12" md="6">
      <v-card height="100%">
        <v-card-title class="text-subtitle-2 d-flex align-center">
          {{ card.name }}
          <v-chip size="x-small" class="ml-2" variant="tonal">{{ rowsByCard[idx].length }}</v-chip>
        </v-card-title>
        <v-data-table
          :items="rowsByCard[idx]"
          :headers="headersByCard[idx]"
          density="compact"
          :items-per-page="-1"
          hide-default-footer
          no-data-text="No rows match the card's filter"
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
        </v-data-table>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type {
  BurnRepairCorpResponse,
  MetricKey,
  ViewCard,
  MetricDef,
} from '@kawakawa/types'
import { CORP_METRIC_DEFS } from '@kawakawa/types'
import {
  computeTickerRows,
  computeUserTickerRows,
  filterSortAndLimit,
  formatMetric,
  getMetricValue,
  type MetricRow,
} from '../../utils/corpMetrics'
import CommodityDisplay from '../CommodityDisplay.vue'
import FioAgeChip from '../FioAgeChip.vue'

const props = defineProps<{
  cards: ViewCard[]
  corpData: BurnRepairCorpResponse
  tickerSet: Set<string> | null
  repairDays: number
}>()

interface TableHeader {
  title: string
  key: string
  sortable: boolean
  align?: 'start' | 'center' | 'end'
}

// Ticker is rendered via an always-present first column; user-ticker cards
// also get a FIO Data Age chip at the end so you can spot stale producers.
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

function metricHeader(def: MetricDef): TableHeader {
  return {
    title: def.label,
    key: def.key,
    sortable: false,
    align: def.format === 'text' ? 'start' : 'end',
  }
}

const headersByCard = computed<TableHeader[][]>(() =>
  props.cards.map(card => {
    const headers: TableHeader[] = [TICKER_HEADER]
    for (const col of card.columns) {
      const def = CORP_METRIC_DEFS[col]
      if (def) headers.push(metricHeader(def))
    }
    if (card.groupBy === 'user-ticker') {
      headers.push(FIO_AGE_HEADER)
    }
    return headers
  })
)

/** The metric keys we need to register #item slots for, per card. */
const metricColumnsByCard = computed<MetricKey[][]>(() =>
  props.cards.map(card => [...card.columns])
)

const rowsByCard = computed<MetricRow[][]>(() =>
  props.cards.map(card => {
    const base: MetricRow[] =
      card.groupBy === 'ticker'
        ? computeTickerRows(props.corpData, props.tickerSet, props.repairDays)
        : computeUserTickerRows(props.corpData, props.tickerSet, props.repairDays)
    return filterSortAndLimit(base, card.filters, card.sortBy, card.limit)
  })
)

function formatCell(item: unknown, key: MetricKey): string {
  const def = CORP_METRIC_DEFS[key]
  if (!def) return ''
  const value = getMetricValue(item as MetricRow, key)
  return formatMetric(value, def.format)
}

function readFioDataAge(item: unknown): string | null {
  // Only user-ticker rows have this field; template narrowing is opaque here.
  const r = item as { fioDataAge?: string | null }
  return r.fioDataAge ?? null
}
</script>
