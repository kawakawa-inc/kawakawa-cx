<template>
  <v-card class="mb-4">
    <v-card-title class="d-flex align-center">
      <FilterMenu
        :filter-types="inventoryFilterTypes"
        :commodity-options="commodityFilterOptions"
        :location-options="locationFilterOptions"
        :category-options="categoryOptions"
        :location-type-options="locationTypeOptions"
        :storage-type-options="storageTypeOptions"
        :active-chips="searchChips"
        :active-category="activeCategory"
        :active-location-type="activeLocationType"
        :active-storage-type="activeStorageType"
        :show-saved="false"
        @select="$emit('filter-select', $event)"
      />
      <TokenSearchInput
        ref="tokenSearchRef"
        :get-commodity-display="getCommodityDisplay"
        :get-location-display="getLocationDisplay"
        :get-commodity-name="getCommodityName"
        :help-tokens="inventoryHelpTokens"
        history-key="inventory"
        placeholder="Search: COF, RAT, Warehouse..."
        class="flex-grow-1"
        @update:chips="onChipsUpdate"
      />
      <v-btn
        v-if="hasActiveFilters"
        variant="text"
        color="primary"
        size="small"
        class="ml-2"
        @click="$emit('clear-filters')"
      >
        Clear Filters
      </v-btn>
    </v-card-title>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SearchChip } from './TokenSearchInput.vue'
import type { FilterTypeConfig } from './FilterMenu.vue'
import type { HelpToken } from './TokenSearchInput.vue'
import FilterMenu from './FilterMenu.vue'
import TokenSearchInput from './TokenSearchInput.vue'
import { useDisplayHelpers } from '../composables'
import type { KeyValueItem } from './KeyValueAutocomplete.vue'

const props = defineProps<{
  commodityOptions: KeyValueItem[]
  locationOptions: KeyValueItem[]
  categoryOptions: { title: string; value: string }[]
  locationTypeOptions: string[]
  storageTypeOptions: string[]
  searchChips: SearchChip[]
  activeCategory: string | null
  activeLocationType: string | null
  activeStorageType: string | null
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{
  'update:chips': [chips: SearchChip[]]
  'filter-select': [payload: { filterType: string; key: string; display: string }]
  'clear-filters': []
}>()

const { getCommodityDisplay, getLocationDisplay, getCommodityName } = useDisplayHelpers()

const inventoryFilterTypes: FilterTypeConfig[] = [
  { key: 'commodity', label: 'Commodities', color: 'primary', icon: 'mdi-cube-outline' },
  { key: 'location', label: 'Locations', color: 'secondary', icon: 'mdi-map-marker-outline' },
  { key: 'category', label: 'Category', icon: 'mdi-tag-outline' },
  { key: 'locationType', label: 'Location Type', icon: 'mdi-map-marker-radius-outline' },
  { key: 'storageType', label: 'Storage Type', icon: 'mdi-warehouse' },
]

const inventoryHelpTokens: HelpToken[] = [
  {
    label: 'Commodity',
    color: 'primary',
    example: 'COF',
    description: 'A ticker or material name.',
  },
  {
    label: 'Location',
    color: 'secondary',
    example: 'Montem',
    description: 'Planet or station name / ID.',
  },
]

const commodityFilterOptions = computed(() =>
  props.commodityOptions.map(item => ({
    value: item.key,
    display: item.display,
  }))
)

const locationFilterOptions = computed(() =>
  props.locationOptions.map(item => ({
    value: item.key,
    display: item.display,
    locationType: item.locationType,
    storageTypes: item.storageTypes,
  }))
)

const tokenSearchRef = ref<InstanceType<typeof TokenSearchInput> | null>(null)

const onChipsUpdate = (chips: SearchChip[]) => {
  emit('update:chips', chips)
}
</script>
