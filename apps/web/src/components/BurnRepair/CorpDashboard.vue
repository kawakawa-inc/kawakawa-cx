<template>
  <v-row dense class="mb-4">
    <v-col v-for="card in cards" :key="card.title" cols="12" md="6">
      <v-card height="100%">
        <v-card-title class="text-subtitle-2">{{ card.title }}</v-card-title>
        <v-data-table
          :items="card.rows"
          :headers="card.headers"
          density="compact"
          :items-per-page="-1"
          hide-default-footer
          :no-data-text="card.emptyText"
        >
          <template #item.commodityTicker="{ item }">
            <CommodityDisplay :ticker="String(item.commodityTicker)" />
          </template>
          <template #item.dataAge="{ item }">
            <FioAgeChip :fio-uploaded-at="(item.fioDataAge as string | null) ?? null" size="x-small" />
          </template>
          <template #item.daysRemaining="{ item }">
            <span v-if="item.daysRemaining === null" class="text-medium-emphasis">—</span>
            <span v-else>{{ formatNumber(Number(item.daysRemaining)) }}</span>
          </template>
          <template v-for="col in numericColumns" #[`item.${col}`]="{ item }" :key="col">
            {{ formatNumber(Number(item[col] ?? 0)) }}
          </template>
        </v-data-table>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CommodityDisplay from '../CommodityDisplay.vue'
import FioAgeChip from '../FioAgeChip.vue'
import { formatNumber, repairDaily } from '../../utils/burnRepairFormat'
import type { BurnRepairCorpMaterial, BurnRepairCorpPerUserRow } from '@kawakawa/types'

const props = defineProps<{
  mode: 'consumables' | 'fabs' | 'other'
  materials: BurnRepairCorpMaterial[]
  perUser: BurnRepairCorpPerUserRow[]
  availableSurplus: Record<string, number>
  repairDays: number
  /** Tickers this tab scopes to. Anything not in this set is filtered out. */
  tickerSet: Set<string>
}>()

const TOP_N = 5

const numericColumns = [
  'perDayGap',
  'perDayNetProd',
  'stock',
  'repairPerDay',
  'currentNeed',
  'productionDay',
  'inputDay',
  'gap',
  'dailyProduction',
  'dailyConsumption',
]

interface TableHeader {
  title: string
  key: string
  sortable?: boolean
  align?: 'start' | 'center' | 'end'
}

interface DashboardCard {
  title: string
  headers: TableHeader[]
  rows: Record<string, unknown>[]
  emptyText: string
}

function stockFor(ticker: string): number {
  return props.availableSurplus[ticker] ?? 0
}

function daysRemainingFor(gap: number, stock: number): number | null {
  if (gap <= 0) return null
  if (stock <= 0) return 0
  return stock / gap
}

const scopedMaterials = computed<BurnRepairCorpMaterial[]>(() =>
  props.materials.filter(m => props.tickerSet.has(m.commodityTicker))
)

const scopedPerUser = computed<BurnRepairCorpPerUserRow[]>(() =>
  props.perUser.filter(r => props.tickerSet.has(r.commodityTicker))
)

/**
 * Aggregate producers (productionDaily > 0) per (user, ticker), top N by daily production.
 */
const topProducers = computed(() =>
  scopedPerUser.value
    .filter(r => r.productionDaily > 0)
    .map(r => ({
      commodityTicker: r.commodityTicker,
      username: r.username,
      dailyProduction: r.productionDaily,
      fioDataAge: r.fioDataAge,
    }))
    .sort((a, b) => b.dailyProduction - a.dailyProduction)
    .slice(0, TOP_N)
)

/**
 * Aggregate consumers (burn+inputs > 0) per (user, ticker). Excludes repair so
 * this card stays comparable across Consumables/Fabs tabs (Fabs has its own
 * repair card).
 */
const topConsumers = computed(() =>
  scopedPerUser.value
    .map(r => ({
      commodityTicker: r.commodityTicker,
      username: r.username,
      dailyConsumption: r.burnDaily + r.inputsDaily,
      fioDataAge: r.fioDataAge,
    }))
    .filter(r => r.dailyConsumption > 0)
    .sort((a, b) => b.dailyConsumption - a.dailyConsumption)
    .slice(0, TOP_N)
)

const topGaps = computed(() =>
  scopedMaterials.value
    .map(m => {
      const perDayGap = m.burnDaily + m.inputsDaily - m.productionDaily
      const stock = stockFor(m.commodityTicker)
      return {
        commodityTicker: m.commodityTicker,
        perDayGap,
        stock,
        daysRemaining: daysRemainingFor(perDayGap, stock),
      }
    })
    .filter(r => r.perDayGap > 0)
    .sort((a, b) => b.perDayGap - a.perDayGap)
    .slice(0, TOP_N)
)

const topSurplus = computed(() =>
  scopedMaterials.value
    .map(m => ({
      commodityTicker: m.commodityTicker,
      perDayNetProd: m.productionDaily - m.burnDaily - m.inputsDaily,
      stock: stockFor(m.commodityTicker),
    }))
    .filter(r => r.perDayNetProd > 0)
    .sort((a, b) => b.perDayNetProd - a.perDayNetProd)
    .slice(0, TOP_N)
)

const topRepairNeeds = computed(() =>
  scopedMaterials.value
    .map(m => ({
      commodityTicker: m.commodityTicker,
      repairPerDay: repairDaily(m, props.repairDays),
      currentNeed: m.repairTotal,
      stock: stockFor(m.commodityTicker),
    }))
    .filter(r => r.repairPerDay > 0)
    .sort((a, b) => b.repairPerDay - a.repairPerDay)
    .slice(0, TOP_N)
)

const topInputNeeds = computed(() =>
  scopedMaterials.value
    .map(m => {
      const productionDay = m.productionDaily
      const inputDay = m.burnDaily + m.inputsDaily
      const gap = inputDay - productionDay
      const stock = stockFor(m.commodityTicker)
      return {
        commodityTicker: m.commodityTicker,
        productionDay,
        inputDay,
        gap,
        stock,
        daysRemaining: daysRemainingFor(gap, stock),
      }
    })
    .filter(r => r.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, TOP_N)
)

const baseProducerHeaders: TableHeader[] = [
  { title: 'Material', key: 'commodityTicker', sortable: false },
  { title: 'User', key: 'username', sortable: false },
  { title: 'Production/Day', key: 'dailyProduction', sortable: false, align: 'end' },
  { title: 'Data Age', key: 'dataAge', sortable: false, align: 'end' },
]

const baseConsumerHeaders: TableHeader[] = [
  { title: 'Material', key: 'commodityTicker', sortable: false },
  { title: 'User', key: 'username', sortable: false },
  { title: 'Consumption/Day', key: 'dailyConsumption', sortable: false, align: 'end' },
  { title: 'Data Age', key: 'dataAge', sortable: false, align: 'end' },
]

const gapHeaders: TableHeader[] = [
  { title: 'Material', key: 'commodityTicker', sortable: false },
  { title: 'Gap/Day', key: 'perDayGap', sortable: false, align: 'end' },
  { title: 'Stock', key: 'stock', sortable: false, align: 'end' },
  { title: 'Days Left', key: 'daysRemaining', sortable: false, align: 'end' },
]

const surplusHeaders: TableHeader[] = [
  { title: 'Material', key: 'commodityTicker', sortable: false },
  { title: 'Net Prod/Day', key: 'perDayNetProd', sortable: false, align: 'end' },
  { title: 'Stock', key: 'stock', sortable: false, align: 'end' },
]

const repairHeaders: TableHeader[] = [
  { title: 'Material', key: 'commodityTicker', sortable: false },
  { title: 'Repair/Day', key: 'repairPerDay', sortable: false, align: 'end' },
  { title: 'Current Need', key: 'currentNeed', sortable: false, align: 'end' },
  { title: 'Stock', key: 'stock', sortable: false, align: 'end' },
]

const inputHeaders: TableHeader[] = [
  { title: 'Material', key: 'commodityTicker', sortable: false },
  { title: 'Prod/Day', key: 'productionDay', sortable: false, align: 'end' },
  { title: 'In/Day', key: 'inputDay', sortable: false, align: 'end' },
  { title: 'Gap/Day', key: 'gap', sortable: false, align: 'end' },
  { title: 'Stock', key: 'stock', sortable: false, align: 'end' },
  { title: 'Days Left', key: 'daysRemaining', sortable: false, align: 'end' },
]

const cards = computed<DashboardCard[]>(() => {
  if (props.mode === 'fabs') {
    return [
      {
        title: 'Top Repair Needs',
        headers: repairHeaders,
        rows: topRepairNeeds.value,
        emptyText: 'No repair needs in scope',
      },
      {
        title: 'Top Input Needs',
        headers: inputHeaders,
        rows: topInputNeeds.value,
        emptyText: 'No input gaps in scope',
      },
      {
        title: 'Top Producers',
        headers: baseProducerHeaders,
        rows: topProducers.value,
        emptyText: 'No producers in scope',
      },
      {
        title: 'Top Consumers',
        headers: baseConsumerHeaders,
        rows: topConsumers.value,
        emptyText: 'No consumers in scope',
      },
    ]
  }

  return [
    {
      title: 'Top Gaps',
      headers: gapHeaders,
      rows: topGaps.value,
      emptyText: 'No gaps in scope',
    },
    {
      title: 'Top Surplus',
      headers: surplusHeaders,
      rows: topSurplus.value,
      emptyText: 'No surplus in scope',
    },
    {
      title: 'Top Producers',
      headers: baseProducerHeaders,
      rows: topProducers.value,
      emptyText: 'No producers in scope',
    },
    {
      title: 'Top Consumers',
      headers: baseConsumerHeaders,
      rows: topConsumers.value,
      emptyText: 'No consumers in scope',
    },
  ]
})
</script>
