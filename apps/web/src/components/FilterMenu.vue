<template>
  <v-menu v-model="isOpen" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        variant="outlined"
        size="small"
        prepend-icon="mdi-filter-variant"
        class="mr-2"
      >
        Filter
      </v-btn>
    </template>

    <v-card class="filter-menu-card">
      <div class="d-flex" style="max-height: 400px">
        <!-- Left: filter type categories -->
        <v-list
          density="compact"
          nav
          class="pa-1 flex-shrink-0"
          style="width: 190px; overflow-y: hidden"
        >
          <v-list-item
            v-for="type in filterTypes"
            :key="type.key"
            :active="activeType === type.key"
            :color="type.color"
            :prepend-icon="type.icon"
            :title="type.label"
            rounded="lg"
            @click="activeType = type.key"
          />
          <template v-if="showSaved">
            <v-divider class="my-1" />
            <v-list-item
              :active="activeType === 'saved'"
              :color="activeType === 'saved' ? 'primary' : undefined"
              prepend-icon="mdi-bookmark-multiple-outline"
              title="Saved Filters"
              rounded="lg"
              @click="onHoverSaved"
            />
            <v-list-item
              :active="activeType === 'browse'"
              :color="activeType === 'browse' ? 'primary' : undefined"
              prepend-icon="mdi-earth"
              title="Browse"
              rounded="lg"
              @click="onHoverBrowse"
            />
          </template>
        </v-list>

        <v-divider vertical />

        <!-- Right: values for selected type -->
        <div style="width: 380px; overflow-y: auto">
          <v-list density="compact" nav class="pa-1">
            <!-- Commodities -->
            <template v-if="activeType === 'commodity'">
              <v-list-item
                v-for="opt in commodityOptions"
                :key="opt.value"
                :color="isActive('commodity', opt.value) ? 'primary' : undefined"
                rounded="lg"
                @click="onSelect('commodity', opt.value, opt.display)"
              >
                <template v-if="isActive('commodity', opt.value)" #prepend>
                  <v-icon color="primary" size="small" class="mr-2">mdi-check</v-icon>
                </template>
                <v-list-item-title>
                  <CommodityDisplay
                    :ticker="opt.value"
                    :icon-size="24"
                    :show-icon="!isActive('commodity', opt.value)"
                  />
                </v-list-item-title>
              </v-list-item>
            </template>

            <!-- Locations -->
            <template v-else-if="activeType === 'location'">
              <v-list-item
                v-for="opt in locationOptions"
                :key="opt.value"
                :color="isActive('location', opt.value) ? 'secondary' : undefined"
                rounded="lg"
                @click="onSelect('location', opt.value, opt.display)"
              >
                <template #prepend>
                  <v-icon
                    v-if="isActive('location', opt.value)"
                    color="secondary"
                    size="small"
                    class="mr-2"
                    >mdi-check</v-icon
                  >
                  <span v-else class="location-emoji mr-2">
                    {{ getLocationPrimaryEmoji(opt.locationType, opt.storageTypes)
                    }}{{ getLocationWarehouseEmoji(opt.storageTypes) }}
                  </span>
                </template>
                <v-list-item-title class="text-body-2">{{ opt.display }}</v-list-item-title>
              </v-list-item>
            </template>

            <!-- Users -->
            <template v-else-if="activeType === 'user'">
              <v-list-item
                v-for="userName in userOptions"
                :key="userName"
                :title="userName"
                :color="isActive('user', userName) ? 'info' : undefined"
                rounded="lg"
                @click="onSelect('user', userName, userName)"
              >
                <template v-if="isActive('user', userName)" #prepend>
                  <v-icon color="info" size="small" class="mr-1">mdi-check</v-icon>
                </template>
              </v-list-item>
            </template>

            <!-- Buy / Sell -->
            <template v-else-if="activeType === 'itemType'">
              <v-list-item
                title="Buy"
                color="warning"
                prepend-icon="mdi-cart-arrow-down"
                rounded="lg"
                @click="onSelect('itemType', 'buy', 'Buy')"
              >
                <template v-if="isActive('itemType', 'buy')" #prepend>
                  <v-icon color="warning" size="small" class="mr-1">mdi-check</v-icon>
                </template>
              </v-list-item>
              <v-list-item
                title="Sell"
                color="success"
                prepend-icon="mdi-package-variant"
                rounded="lg"
                @click="onSelect('itemType', 'sell', 'Sell')"
              >
                <template v-if="isActive('itemType', 'sell')" #prepend>
                  <v-icon color="success" size="small" class="mr-1">mdi-check</v-icon>
                </template>
              </v-list-item>
            </template>

            <!-- Category -->
            <template v-else-if="activeType === 'category'">
              <v-list-item
                v-for="opt in categoryOptions"
                :key="opt.value"
                :title="opt.title"
                :color="isActive('category', opt.value) ? 'primary' : undefined"
                rounded="lg"
                @click="onSelect('category', opt.value, opt.title)"
              >
                <template v-if="isActive('category', opt.value)" #prepend>
                  <v-icon color="primary" size="small" class="mr-1">mdi-check</v-icon>
                </template>
              </v-list-item>
            </template>

            <!-- Pricing -->
            <template v-else-if="activeType === 'pricing'">
              <v-list-item
                v-for="opt in pricingOptions"
                :key="opt.value"
                :title="opt.title"
                :color="isActive('pricing', opt.value) ? 'primary' : undefined"
                rounded="lg"
                @click="onSelect('pricing', opt.value, opt.title)"
              >
                <template v-if="isActive('pricing', opt.value)" #prepend>
                  <v-icon color="primary" size="small" class="mr-1">mdi-check</v-icon>
                </template>
              </v-list-item>
            </template>

            <!-- Visibility (order type) -->
            <template v-else-if="activeType === 'orderType'">
              <v-list-item
                v-for="opt in orderTypeOptions"
                :key="opt.value"
                :title="opt.title"
                :color="isActive('orderType', opt.value) ? 'primary' : undefined"
                rounded="lg"
                @click="onSelect('orderType', opt.value, opt.title)"
              >
                <template v-if="isActive('orderType', opt.value)" #prepend>
                  <v-icon color="primary" size="small" class="mr-1">mdi-check</v-icon>
                </template>
              </v-list-item>
            </template>

            <!-- Availability -->
            <template v-else-if="activeType === 'availability'">
              <v-list-item
                v-for="opt in availabilityOptions"
                :key="opt.value"
                :prepend-icon="opt.icon"
                :title="opt.title"
                :subtitle="opt.subtitle"
                :color="isActive('availability', opt.value) ? 'primary' : undefined"
                rounded="lg"
                @click="onSelect('availability', opt.value, opt.title)"
              >
                <template v-if="isActive('availability', opt.value)" #append>
                  <v-icon color="primary" size="small">mdi-check</v-icon>
                </template>
              </v-list-item>
            </template>

            <!-- Location Type -->
            <template v-else-if="activeType === 'locationType'">
              <v-list-item
                v-for="opt in locationTypeOptions"
                :key="opt"
                :title="opt"
                :color="isActive('locationType', opt) ? 'primary' : undefined"
                rounded="lg"
                @click="onSelect('locationType', opt, opt)"
              >
                <template v-if="isActive('locationType', opt)" #prepend>
                  <v-icon color="primary" size="small" class="mr-1">mdi-check</v-icon>
                </template>
              </v-list-item>
            </template>

            <!-- Storage Type -->
            <template v-else-if="activeType === 'storageType'">
              <v-list-item
                v-for="opt in storageTypeOptions"
                :key="opt"
                :title="formatStorageType(opt)"
                :color="isActive('storageType', opt) ? 'primary' : undefined"
                rounded="lg"
                @click="onSelect('storageType', opt, formatStorageType(opt))"
              >
                <template v-if="isActive('storageType', opt)" #prepend>
                  <v-icon color="primary" size="small" class="mr-1">mdi-check</v-icon>
                </template>
              </v-list-item>
            </template>

            <!-- Saved Filters -->
            <template v-else-if="activeType === 'saved'">
              <div v-if="loadingSavedFilters" class="d-flex justify-center pa-4">
                <v-progress-circular indeterminate size="24" />
              </div>
              <div
                v-else-if="savedFilters.length === 0"
                class="text-center pa-4 text-medium-emphasis text-body-2"
              >
                No saved filters yet.
              </div>
              <v-list-item
                v-for="sf in savedFilters"
                v-else
                :key="sf.id"
                rounded="lg"
                class="pr-1"
                @click="applyFilter(sf)"
              >
                <template #prepend>
                  <v-icon size="small" class="mr-1" :color="getPrivacyColor(sf.privacy)">
                    {{ getPrivacyIcon(sf.privacy) }}
                  </v-icon>
                </template>
                <v-list-item-title class="text-body-2">{{ sf.name }}</v-list-item-title>
                <v-list-item-subtitle v-if="sf.userName !== currentUsername" class="text-caption">
                  by {{ sf.userName }}
                </v-list-item-subtitle>
                <template #append>
                  <div class="d-flex ga-1 align-center" @click.stop @mousedown.stop>
                    <v-chip v-if="sf.isPinned" size="x-small" color="purple" variant="tonal">
                      pinned
                    </v-chip>
                    <v-btn
                      size="x-small"
                      variant="text"
                      color="grey"
                      icon="mdi-link-variant"
                      title="Copy shareable link"
                      @click="$emit('copy-link', sf.id)"
                    />
                    <template v-if="sf.userName === currentUsername">
                      <v-btn
                        size="x-small"
                        variant="text"
                        color="grey"
                        icon="mdi-pencil"
                        title="Edit"
                        @click="editFilter(sf)"
                      />
                      <v-btn
                        size="x-small"
                        variant="text"
                        color="error"
                        icon="mdi-delete"
                        title="Delete"
                        @click="openDeleteFilter(sf)"
                      />
                    </template>
                    <v-btn
                      v-if="canPin && sf.privacy === 'public'"
                      size="x-small"
                      variant="text"
                      :color="sf.isPinned ? 'purple' : 'grey'"
                      :icon="sf.isPinned ? 'mdi-pin' : 'mdi-pin-outline'"
                      :title="sf.isPinned ? 'Unpin' : 'Pin globally'"
                      @click="togglePin(sf)"
                    />
                  </div>
                </template>
              </v-list-item>
            </template>

            <!-- Browse -->
            <template v-else-if="activeType === 'browse'">
              <div class="pa-2 pb-0">
                <v-text-field
                  v-model="browseSearch"
                  density="compact"
                  prepend-inner-icon="mdi-magnify"
                  placeholder="Search public filters..."
                  clearable
                  hide-details
                  variant="outlined"
                />
              </div>
              <div v-if="loadingBrowseFilters" class="d-flex justify-center pa-4">
                <v-progress-circular indeterminate size="24" />
              </div>
              <div
                v-else-if="browseFilters.length === 0"
                class="text-center pa-4 text-medium-emphasis text-body-2"
              >
                {{
                  browseSearch
                    ? 'No filters match your search.'
                    : 'No public filters available yet.'
                }}
              </div>
              <template v-else>
                <v-list-item
                  v-for="bf in browseFilters"
                  :key="bf.id"
                  rounded="lg"
                  class="pr-1"
                  @click="applyFilter(bf)"
                >
                  <template #prepend>
                    <v-icon size="small" class="mr-1" color="green">mdi-earth</v-icon>
                  </template>
                  <v-list-item-title class="text-body-2">{{ bf.name }}</v-list-item-title>
                  <v-list-item-subtitle class="text-caption">
                    by {{ bf.userName }} &middot; {{ describeFilter(bf) }}
                  </v-list-item-subtitle>
                  <template #append>
                    <div class="d-flex ga-1 align-center" @click.stop @mousedown.stop>
                      <v-btn
                        size="x-small"
                        variant="text"
                        color="grey"
                        icon="mdi-link-variant"
                        title="Copy shareable link"
                        @click="$emit('copy-link', bf.id)"
                      />
                      <v-btn
                        v-if="canPin && bf.privacy === 'public'"
                        size="x-small"
                        variant="text"
                        :color="bf.isPinned ? 'purple' : 'grey'"
                        :icon="bf.isPinned ? 'mdi-pin' : 'mdi-pin-outline'"
                        :title="bf.isPinned ? 'Unpin' : 'Pin globally'"
                        @click="toggleBrowsePin(bf)"
                      />
                    </div>
                  </template>
                </v-list-item>
              </template>
              <div v-if="browseHasMore" class="text-center pa-2">
                <v-btn
                  variant="text"
                  size="small"
                  :loading="browseLoadingMore"
                  @click="loadMoreBrowse"
                >
                  Load more
                </v-btn>
              </div>
            </template>
          </v-list>
        </div>
      </div>
    </v-card>
  </v-menu>

  <!-- Edit dialog -->
  <SaveFilterDialog
    v-if="showSaved && currentFilterData"
    v-model="showEditDialog"
    :filter-data="currentFilterData"
    :existing-filter="editingFilter"
    @saved="onFilterSaved"
  />

  <!-- Delete confirmation -->
  <ConfirmationDialog
    v-if="showSaved"
    v-model="showDeleteDialog"
    title="Delete Saved Filter"
    :loading="deleting"
    confirm-text="Delete"
    confirm-color="error"
    @confirm="confirmDelete"
  >
    Delete <strong>{{ deletingFilter?.name }}</strong
    >? This cannot be undone.
  </ConfirmationDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { SavedMarketFilter, SavedFilterData } from '@kawakawa/types'
import type { SearchChip } from './TokenSearchInput.vue'
import { api } from '../services/api'
import { useUserStore } from '../stores/user'
import SaveFilterDialog from './SaveFilterDialog.vue'
import ConfirmationDialog from './ConfirmationDialog.vue'
import CommodityDisplay from './CommodityDisplay.vue'
import {
  getLocationPrimaryEmoji,
  getLocationWarehouseEmoji,
  formatStorageType,
} from '../utils/locationUtils'

interface FilterOption {
  value: string
  display: string
}

interface LocationFilterOption extends FilterOption {
  locationType?: string
  storageTypes?: string[]
}

export interface FilterTypeConfig {
  key: string
  label: string
  color?: string
  icon: string
}

const props = withDefaults(
  defineProps<{
    commodityOptions: FilterOption[]
    locationOptions: LocationFilterOption[]
    categoryOptions?: { title: string; value: string }[]
    activeChips: SearchChip[]
    activeCategory?: string | null
    currentFilterData?: SavedFilterData | null
    canPin?: boolean
    /** Override which filter types appear in the left panel. Defaults to Market types. */
    filterTypes?: FilterTypeConfig[]
    /** Show Saved Filters and Browse sections in the left panel. */
    showSaved?: boolean
    // Market-only optional props
    userOptions?: string[]
    pricingOptions?: { title: string; value: string }[]
    orderTypeOptions?: { title: string; value: string }[]
    activePricing?: string | null
    activeOrderType?: string | null
    activeAvailability?: string | null
    // Inventory-only optional props
    locationTypeOptions?: string[]
    storageTypeOptions?: string[]
    activeLocationType?: string | null
    activeStorageType?: string | null
  }>(),
  {
    categoryOptions: () => [],
    currentFilterData: null,
    canPin: false,
    filterTypes: () => [
      { key: 'commodity', label: 'Commodities', color: 'primary', icon: 'mdi-cube-outline' },
      { key: 'location', label: 'Locations', color: 'secondary', icon: 'mdi-map-marker-outline' },
      { key: 'user', label: 'Users', color: 'info', icon: 'mdi-account-outline' },
      { key: 'itemType', label: 'Buy / Sell', icon: 'mdi-swap-horizontal' },
      { key: 'category', label: 'Category', icon: 'mdi-tag-outline' },
      { key: 'pricing', label: 'Pricing', icon: 'mdi-currency-usd' },
      { key: 'orderType', label: 'Visibility', icon: 'mdi-eye-outline' },
      { key: 'availability', label: 'Availability', icon: 'mdi-package-variant' },
    ],
    showSaved: true,
    activeCategory: null,
    userOptions: () => [],
    pricingOptions: () => [],
    orderTypeOptions: () => [],
    activePricing: null,
    activeOrderType: null,
    activeAvailability: null,
    locationTypeOptions: () => [],
    storageTypeOptions: () => [],
    activeLocationType: null,
    activeStorageType: null,
  }
)

const emit = defineEmits<{
  select: [payload: { filterType: string; key: string; display: string }]
  apply: [filter: SavedMarketFilter]
  'copy-link': [id: number]
  saved: [filter: SavedMarketFilter]
  pinned: [filter: SavedMarketFilter]
}>()

const userStore = useUserStore()
const currentUsername = computed(() => userStore.getUser()?.username ?? '')

const isOpen = ref(false)
const activeType = ref<string>(props.filterTypes[0]?.key ?? 'commodity')

const availabilityOptions = [
  {
    value: 'available',
    title: 'Available',
    subtitle: 'In stock or standing orders',
    icon: 'mdi-package-check',
  },
  {
    value: 'standing',
    title: 'Standing',
    subtitle: 'Storefronts with unlimited quantity',
    icon: 'mdi-infinity',
  },
  {
    value: 'one-time',
    title: 'One-time',
    subtitle: 'Finite orders with remaining stock',
    icon: 'mdi-counter',
  },
]

// Saved filters state
const savedFilters = ref<SavedMarketFilter[]>([])
const loadingSavedFilters = ref(false)
const showEditDialog = ref(false)
const editingFilter = ref<SavedMarketFilter | null>(null)
const showDeleteDialog = ref(false)
const deletingFilter = ref<SavedMarketFilter | null>(null)
const deleting = ref(false)

const filterTypes = computed(() => props.filterTypes)

const isActive = (filterType: string, value: string): boolean => {
  if (filterType === 'commodity')
    return props.activeChips.some(c => c.type === 'commodity' && c.value === value)
  if (filterType === 'location')
    return props.activeChips.some(c => c.type === 'location' && c.value === value)
  if (filterType === 'user')
    return props.activeChips.some(c => c.type === 'user' && c.value === value)
  if (filterType === 'itemType')
    return props.activeChips.some(c => c.type === 'itemType' && c.value === value)
  if (filterType === 'category') return props.activeCategory === value
  if (filterType === 'pricing') return props.activePricing === value
  if (filterType === 'orderType') return props.activeOrderType === value
  if (filterType === 'availability') return props.activeAvailability === value
  if (filterType === 'locationType') return props.activeLocationType === value
  if (filterType === 'storageType') return props.activeStorageType === value
  return false
}

const onSelect = (filterType: string, key: string, display: string) => {
  emit('select', { filterType, key, display })
}

const loadSavedFilters = async () => {
  loadingSavedFilters.value = true
  try {
    savedFilters.value = await api.savedFilters.list()
  } catch {
    // Silently ignore
  } finally {
    loadingSavedFilters.value = false
  }
}

const onHoverSaved = () => {
  if (activeType.value !== 'saved') {
    activeType.value = 'saved'
    loadSavedFilters()
  }
}

const applyFilter = (filter: SavedMarketFilter) => {
  emit('apply', filter)
  isOpen.value = false
}

const editFilter = (filter: SavedMarketFilter) => {
  editingFilter.value = filter
  showEditDialog.value = true
}

const openDeleteFilter = (filter: SavedMarketFilter) => {
  deletingFilter.value = filter
  showDeleteDialog.value = true
}

const confirmDelete = async () => {
  if (!deletingFilter.value) return
  deleting.value = true
  try {
    await api.savedFilters.delete(deletingFilter.value.id)
    savedFilters.value = savedFilters.value.filter(f => f.id !== deletingFilter.value!.id)
    showDeleteDialog.value = false
  } catch {
    // Silently ignore
  } finally {
    deleting.value = false
  }
}

const togglePin = async (filter: SavedMarketFilter) => {
  try {
    const updated = await api.savedFilters.togglePin(filter.id)
    const idx = savedFilters.value.findIndex(f => f.id === filter.id)
    if (idx !== -1) savedFilters.value[idx] = updated
    emit('pinned', updated)
  } catch {
    // Silently ignore
  }
}

const onFilterSaved = (saved: SavedMarketFilter) => {
  const idx = savedFilters.value.findIndex(f => f.id === saved.id)
  if (idx !== -1) {
    savedFilters.value[idx] = saved
  } else {
    savedFilters.value.unshift(saved)
  }
  emit('saved', saved)
}

const onHoverBrowse = () => {
  activeType.value = 'browse'
}

// Browse state
const browseFilters = ref<SavedMarketFilter[]>([])
const loadingBrowseFilters = ref(false)
const browseLoadingMore = ref(false)
const browseHasMore = ref(false)
const browseSearch = ref('')
const browsePage = ref(1)
const browseLoaded = ref(false)

const describeFilter = (filter: SavedMarketFilter): string => {
  const parts: string[] = []
  const fd = filter.filterData
  if (fd.itemType) parts.push(fd.itemType === 'sell' ? 'Sell' : 'Buy')
  if (fd.commodity?.length) parts.push(`${fd.commodity.length} commodity`)
  if (fd.location?.length) parts.push(`${fd.location.length} location`)
  if (fd.category) parts.push(fd.category)
  if (fd.orderType) parts.push(fd.orderType)
  return parts.join(', ') || 'All orders'
}

const loadBrowseFilters = async (page = 1, append = false) => {
  if (page === 1) loadingBrowseFilters.value = true
  else browseLoadingMore.value = true

  try {
    const results = await api.savedFilters.browse(browseSearch.value || undefined, page)
    if (append) {
      browseFilters.value.push(...results)
    } else {
      browseFilters.value = results
    }
    browseHasMore.value = results.length === 20
    browsePage.value = page
  } catch {
    // Silently ignore
  } finally {
    loadingBrowseFilters.value = false
    browseLoadingMore.value = false
  }
}

const loadMoreBrowse = () => {
  loadBrowseFilters(browsePage.value + 1, true)
}

const toggleBrowsePin = async (filter: SavedMarketFilter) => {
  try {
    const updated = await api.savedFilters.togglePin(filter.id)
    const idx = browseFilters.value.findIndex(f => f.id === filter.id)
    if (idx !== -1) browseFilters.value[idx] = updated
    emit('pinned', updated)
  } catch {
    // Silently ignore
  }
}

// Load browse filters on first hover/click, debounce search
watch(
  () => activeType.value,
  type => {
    if (type === 'browse' && !browseLoaded.value) {
      browseLoaded.value = true
      loadBrowseFilters()
    }
  }
)

let browseSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(browseSearch, () => {
  if (browseSearchTimer) clearTimeout(browseSearchTimer)
  browseSearchTimer = setTimeout(() => loadBrowseFilters(1, false), 300)
})

const getPrivacyIcon = (privacy: string) => {
  if (privacy === 'private') return 'mdi-lock'
  if (privacy === 'unlisted') return 'mdi-link-variant'
  return 'mdi-earth'
}

const getPrivacyColor = (privacy: string) => {
  if (privacy === 'private') return 'grey'
  if (privacy === 'unlisted') return 'blue'
  return 'green'
}
</script>
