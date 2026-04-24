<template>
  <v-card class="mb-4">
    <v-card-title class="d-flex align-center text-subtitle-1">
      {{ title }}
      <v-chip size="x-small" class="ml-2" variant="tonal">{{ materials.length }}</v-chip>
      <v-spacer />
      <v-btn variant="tonal" size="small" prepend-icon="mdi-content-copy" @click="emit('copy-csv')">
        Copy CSV
      </v-btn>
    </v-card-title>
    <v-data-table :items="materials" :headers="headers" density="compact" :items-per-page="25">
      <template #item.commodityTicker="{ item }">
        <CommodityDisplay :ticker="item.commodityTicker" />
      </template>
      <template #item.burnDaily="{ item }">
        {{ formatNumber(item.burnDaily) }}
      </template>
      <template #item.inputsDaily="{ item }">
        {{ formatNumber(item.inputsDaily) }}
      </template>
      <template #item.repairTotal="{ item }">
        {{ formatNumber(item.repairTotal) }}
      </template>
      <template #item.productionDaily="{ item }">
        <span v-if="item.productionDaily > 0" class="text-success">
          {{ formatNumber(item.productionDaily) }}
        </span>
        <span v-else>-</span>
      </template>
      <template #item.netDaily="{ item }">
        <span
          class="font-weight-medium"
          :class="
            item.productionDaily - item.burnDaily - item.inputsDaily >= 0
              ? 'text-success'
              : 'text-error'
          "
        >
          {{ formatNumber(item.productionDaily - item.burnDaily - item.inputsDaily) }}
        </span>
      </template>
      <template #item.available="{ item }">
        {{ formatNumber(availableFor(item.commodityTicker)) }}
      </template>
      <template #item.daysRemaining="{ item }">
        <span v-if="daysRemainingFor(item) === null" class="text-medium-emphasis">—</span>
        <span v-else>{{ formatNumber(daysRemainingFor(item)!) }}</span>
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
import CommodityDisplay from '../CommodityDisplay.vue'
import { formatNumber } from '../../utils/burnRepairFormat'
import type { BurnRepairCorpMaterial } from '@kawakawa/types'

const props = defineProps<{
  title: string
  materials: BurnRepairCorpMaterial[]
  availableSurplus: Record<string, number>
}>()

const emit = defineEmits<(e: 'copy-csv') => void>()

const headers = [
  { title: 'Material', key: 'commodityTicker', sortable: false },
  { title: 'Burn/Day', key: 'burnDaily', sortable: false, align: 'center' as const },
  { title: 'Inputs/Day', key: 'inputsDaily', sortable: false, align: 'center' as const },
  { title: 'Repair', key: 'repairTotal', sortable: false, align: 'center' as const },
  { title: 'Production/Day', key: 'productionDaily', sortable: false, align: 'center' as const },
  { title: 'Net/Day', key: 'netDaily', sortable: false, align: 'center' as const },
  { title: 'Available', key: 'available', sortable: false, align: 'center' as const },
  { title: 'Days Remaining', key: 'daysRemaining', sortable: false, align: 'center' as const },
]

function availableFor(ticker: string): number {
  return props.availableSurplus[ticker] ?? 0
}

function daysRemainingFor(m: BurnRepairCorpMaterial): number | null {
  const deficit = m.burnDaily + m.inputsDaily - m.productionDaily
  if (deficit <= 0) return null
  const avail = availableFor(m.commodityTicker)
  if (avail <= 0) return 0
  return avail / deficit
}
</script>
