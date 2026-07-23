<template>
  <span class="d-inline-flex align-center ga-2">
    <CommodityIcon v-if="iconCommodity" :commodity="iconCommodity" class="pkg-icon" />
    <span class="text-truncate">{{ name }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { commodityService } from '../services/commodityService'
import CommodityIcon from './CommodityIcon.vue'

const props = defineProps<{
  name: string
  /** One of the package's BoM commodity tickers, used as its visual icon. */
  iconCommodityTicker?: string | null
}>()

// Build the minimal Commodity object CommodityIcon needs from the ticker.
const iconCommodity = computed(() => {
  const ticker = props.iconCommodityTicker
  if (!ticker) return null
  const category = commodityService.getCommodityCategory(ticker)
  if (category === null) return null
  return {
    ticker,
    name: commodityService.getCommodityDisplay(ticker, 'name-only'),
    category,
  }
})
</script>

<style scoped>
.pkg-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
</style>
