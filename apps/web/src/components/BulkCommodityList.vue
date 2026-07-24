<template>
  <div>
    <div class="d-flex align-center mb-2">
      <v-icon start size="small">mdi-format-list-checkbox</v-icon>
      <span class="text-subtitle-2">Select Commodities</span>
      <v-spacer />
      <v-chip size="x-small" color="primary" variant="tonal"> {{ selectedCount }} selected </v-chip>
    </div>

    <v-divider class="mb-2" />

    <!-- Search and Filter -->
    <div class="d-flex align-center ga-2 mb-2">
      <v-text-field
        v-model="searchQuery"
        prepend-inner-icon="mdi-magnify"
        label="Search commodities"
        density="compact"
        hide-details
        clearable
        class="flex-grow-1"
      />
      <v-menu :close-on-content-click="false">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            variant="outlined"
            size="small"
            :color="selectedCategory ? 'primary' : undefined"
          >
            <v-icon start size="small">mdi-filter-variant</v-icon>
            {{ selectedCategory ? getCategoryDisplay(selectedCategory) : 'Category' }}
          </v-btn>
        </template>
        <v-list density="compact" nav>
          <v-list-item :active="!selectedCategory" @click="selectedCategory = null">
            <v-list-item-title>All Categories</v-list-item-title>
          </v-list-item>
          <v-divider class="my-1" />
          <v-list-item
            v-for="cat in categories"
            :key="cat.value"
            :active="selectedCategory === cat.value"
            @click="selectedCategory = cat.value"
          >
            <v-list-item-title>{{ cat.title }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <!-- Quick actions -->
    <div class="d-flex ga-2 mb-2">
      <v-btn size="x-small" variant="text" @click="selectAllVisible"> Select visible </v-btn>
      <v-btn size="x-small" variant="text" @click="clearSelection"> Clear all </v-btn>
    </div>

    <!-- Commodity list -->
    <v-virtual-scroll :items="filteredCommodities" :height="listHeight" item-height="48">
      <template #default="{ item }">
        <v-list-item
          :key="item.ticker"
          density="compact"
          :class="{ 'bg-primary-darken-3': isSelected(item.ticker) }"
          @click="toggleSelection(item.ticker)"
        >
          <template #prepend>
            <v-checkbox-btn
              :model-value="isSelected(item.ticker)"
              density="compact"
              hide-details
              @click.stop
              @update:model-value="toggleSelection(item.ticker)"
            />
          </template>
          <v-list-item-title>
            <CommodityDisplay :ticker="item.ticker" :icon-size="28" />
          </v-list-item-title>
          <template v-if="!isStanding && isSelected(item.ticker)" #append>
            <v-text-field
              v-model.number="quantities[item.ticker]"
              type="number"
              min="1"
              density="compact"
              hide-details
              hide-spin-buttons
              variant="outlined"
              placeholder="Qty"
              style="max-width: 80px"
              @click.stop
            />
          </template>
        </v-list-item>
      </template>
    </v-virtual-scroll>

    <!-- Summary -->
    <div v-if="selectedCount > 0" class="mt-3 pa-2 bg-grey-darken-3 rounded">
      <div class="d-flex justify-space-between align-center">
        <span class="text-caption">Orders to create:</span>
        <span class="font-weight-bold">{{ selectedCount }}</span>
      </div>
      <div v-if="!isStanding" class="d-flex justify-space-between align-center mt-1">
        <span class="text-caption">Total quantity:</span>
        <span class="font-weight-bold">{{
          totalQuantity !== null ? totalQuantity.toLocaleString() : '--'
        }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import CommodityDisplay from './CommodityDisplay.vue'
import { localizeMaterialCategory } from '../utils/materials'
import type { CommodityCategory } from '@kawakawa/types'

export interface BulkCommoditySelection {
  ticker: string
  quantity: number
}

const props = withDefaults(
  defineProps<{
    /** Whether orders are standing (unlimited quantity) */
    isStanding: boolean
    /** Default quantity for new selections */
    defaultQuantity?: number
    /** Height of the list in pixels */
    listHeight?: number
  }>(),
  {
    defaultQuantity: 100,
    listHeight: 300,
  }
)

const emit = defineEmits<{
  'update:selections': [selections: BulkCommoditySelection[]]
}>()

const userStore = useUserStore()

// State
const allCommodities = ref<{ ticker: string; name: string; category: string }[]>([])
const selectedTickers = ref<Set<string>>(new Set())
const quantities = ref<Record<string, number>>({})
const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)

// Computed
const categories = computed(() => {
  const cats = new Set(allCommodities.value.map(c => c.category).filter(Boolean))
  return Array.from(cats)
    .sort()
    .map(cat => ({
      title: localizeMaterialCategory(cat as CommodityCategory),
      value: cat,
    }))
})

const filteredCommodities = computed(() => {
  let result = allCommodities.value

  if (selectedCategory.value) {
    result = result.filter(c => c.category === selectedCategory.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      c => c.ticker.toLowerCase().includes(query) || c.name.toLowerCase().includes(query)
    )
  }

  return result
})

const selectedCount = computed(() => selectedTickers.value.size)

const totalQuantity = computed((): number | null => {
  if (selectedTickers.value.size === 0) return null
  let total = 0
  let hasAnyQuantity = false
  for (const ticker of selectedTickers.value) {
    const qty = quantities.value[ticker]
    if (qty !== undefined && qty > 0) {
      total += qty
      hasAnyQuantity = true
    }
  }
  return hasAnyQuantity ? total : null
})

// Methods
const getCategoryDisplay = (category: string): string => {
  return localizeMaterialCategory(category as CommodityCategory)
}

const isSelected = (ticker: string): boolean => {
  return selectedTickers.value.has(ticker)
}

const toggleSelection = (ticker: string) => {
  if (selectedTickers.value.has(ticker)) {
    selectedTickers.value.delete(ticker)
    delete quantities.value[ticker]
  } else {
    selectedTickers.value.add(ticker)
    // Don't set default - let user enter quantity
  }
  // Force reactivity
  selectedTickers.value = new Set(selectedTickers.value)
  emitSelections()
}

const selectAllVisible = () => {
  for (const c of filteredCommodities.value) {
    if (!selectedTickers.value.has(c.ticker)) {
      selectedTickers.value.add(c.ticker)
      // Don't set default - let user enter quantity
    }
  }
  selectedTickers.value = new Set(selectedTickers.value)
  emitSelections()
}

const clearSelection = () => {
  selectedTickers.value.clear()
  quantities.value = {}
  selectedTickers.value = new Set(selectedTickers.value)
  emitSelections()
}

const emitSelections = () => {
  const selections: BulkCommoditySelection[] = Array.from(selectedTickers.value).map(ticker => ({
    ticker,
    quantity: props.isStanding ? 0 : quantities.value[ticker] || props.defaultQuantity,
  }))
  emit('update:selections', selections)
}

const reset = () => {
  selectedTickers.value.clear()
  quantities.value = {}
  searchQuery.value = ''
  selectedCategory.value = null
  selectedTickers.value = new Set(selectedTickers.value)
}

const loadCommodities = async () => {
  const commodities = await commodityService.getAllCommodities()
  allCommodities.value = commodities.map(c => ({
    ticker: c.ticker,
    name: commodityService.getCommodityDisplay(c.ticker, userStore.getCommodityDisplayMode()),
    category: c.category ?? '',
  }))
}

// Watch quantity changes
watch(
  quantities,
  () => {
    emitSelections()
  },
  { deep: true }
)

// Watch standing mode changes
watch(
  () => props.isStanding,
  () => {
    emitSelections()
  }
)

onMounted(() => {
  loadCommodities()
})

// Expose for parent
defineExpose({
  selectedCount,
  totalQuantity,
  reset,
})
</script>

<style scoped>
.min-width-0 {
  min-width: 0;
}
</style>
