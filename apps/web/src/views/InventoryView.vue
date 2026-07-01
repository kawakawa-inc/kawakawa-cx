<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <InventorySyncCard
      :last-sync="lastSync"
      :fio-configured="fioConfigured"
      :syncing="syncing"
      :stats="fioStats"
      @sync="syncInventory"
    />

    <InventoryFilterBar
      :commodity-options="commodityOptions"
      :location-options="locationOptions"
      :category-options="categoryOptions"
      :location-type-options="locationTypeOptions"
      :storage-type-options="storageTypeOptions"
      :search-chips="searchChips"
      :active-category="filters.category"
      :active-location-type="filters.locationType"
      :active-storage-type="filters.storageType"
      :has-active-filters="hasActiveFilters"
      @update:chips="onChipsUpdate"
      @filter-select="onFilterMenuSelect"
      @clear-filters="clearFilters"
    />

    <InventoryTable
      v-model:sort-by="pageState.sortBy"
      :items="filteredInventory"
      :loading="loading"
      :sell-orders="sellOrders"
      :buy-orders="buyOrders"
      :can-create-orders="canCreateAnyOrders"
      :has-icons="hasIcons"
      @sell="openSellDialog"
      @view-sell="viewSellOrder"
      @view-buy="viewBuyOrder"
      @edit-sell="editSellOrder"
      @edit-buy="editBuyOrder"
      @delete-sell="confirmDeleteSellOrder"
      @delete-buy="confirmDeleteBuyOrder"
      @filter-commodity="
        onFilterMenuSelect({ filterType: 'commodity', key: $event, display: $event })
      "
      @filter-category="
        onFilterMenuSelect({ filterType: 'category', key: $event, display: $event })
      "
      @filter-location="
        onFilterMenuSelect({ filterType: 'location', key: $event, display: $event })
      "
      @filter-storage-type="
        onFilterMenuSelect({ filterType: 'storageType', key: $event, display: $event })
      "
      @filter-location-type="
        onFilterMenuSelect({ filterType: 'locationType', key: $event, display: $event })
      "
    >
      <template #no-data>
        <div class="text-center py-8">
          <v-icon size="64" color="grey-lighten-1">mdi-package-variant</v-icon>
          <p class="text-h6 mt-4">No inventory items</p>
          <p class="text-body-2 text-medium-emphasis">
            <template v-if="hasActiveFilters">
              No items match your filters.
              <a href="#" @click.prevent="clearFilters">Clear filters</a>
            </template>
            <template v-else-if="!fioConfigured">
              No inventory synced yet.
              <router-link to="/account?tab=fio">Configure FIO</router-link>
              to get started.
            </template>
            <template v-else> Sync your FIO inventory to see your items here </template>
          </p>
          <v-btn
            v-if="!hasActiveFilters && fioConfigured"
            color="primary"
            class="mt-4"
            :disabled="syncing"
            @click="syncInventory"
          >
            <template #prepend>
              <v-icon :class="{ 'spin-icon': syncing }">mdi-sync</v-icon>
            </template>
            FIO Sync
          </v-btn>
          <v-btn
            v-if="!hasActiveFilters && !fioConfigured"
            color="primary"
            class="mt-4"
            prepend-icon="mdi-cog"
            to="/account?tab=fio"
          >
            Configure FIO
          </v-btn>
        </div>
      </template>
    </InventoryTable>

    <!-- Order Dialog -->
    <OrderDialog
      v-model="orderDialog"
      initial-tab="sell"
      :inventory-item="selectedItem"
      @created="onOrderCreated"
    />

    <!-- Order Detail Dialog -->
    <OrderDetailDialog
      v-model="orderDetailDialog"
      :order-type="orderDetailType"
      :order-id="orderDetailId"
      @updated="onOrderUpdated"
      @deleted="onOrderDeleted"
    />

    <!-- Sell Order Edit Dialog -->
    <SellOrderEditDialog v-model="editSellDialog" :order="editingSellOrder" @saved="onEditSaved" />

    <!-- Buy Order Edit Dialog -->
    <BuyOrderEditDialog v-model="editBuyDialog" :order="editingBuyOrder" @saved="onEditSaved" />

    <!-- Delete Confirmation Dialog -->
    <ConfirmationDialog
      v-model="deleteDialog"
      :title="`Delete ${deletingOrderType === 'sell' ? 'Sell' : 'Buy'} Order?`"
      :message="`Are you sure you want to delete this ${deletingOrderType} order? This action cannot be undone.`"
      confirm-text="Delete"
      confirm-color="error"
      icon="mdi-delete-alert"
      icon-color="error"
      :loading="deleting"
      @confirm="executeDelete"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { PERMISSIONS } from '@kawakawa/types'
import type { CommodityCategory } from '@kawakawa/types'
import {
  api,
  type FioInventoryItem,
  type FioStatsResponse,
  type SellOrderResponse,
  type BuyOrderResponse,
} from '../services/api'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useSnackbar, useDisplayHelpers, useUrlFilters, useUrlState } from '../composables'
import { usePageState } from '../composables/usePageState'
import { useDebug } from '../composables/useDebug'
import { syncService } from '../services/syncService'
import type { SearchChip } from '../components/TokenSearchInput.vue'
import InventorySyncCard from '../components/InventorySyncCard.vue'
import InventoryFilterBar from '../components/InventoryFilterBar.vue'
import InventoryTable from '../components/InventoryTable.vue'
import OrderDialog from '../components/OrderDialog.vue'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'
import SellOrderEditDialog from '../components/SellOrderEditDialog.vue'
import BuyOrderEditDialog from '../components/BuyOrderEditDialog.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import { localizeMaterialCategory } from '../utils/materials'
import { locationService } from '../services/locationService'

const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getLocationDisplay, getCommodityDisplay, getCommodityCategory, getCommodityName } =
  useDisplayHelpers()

// Check if FIO is configured
const fioConfigured = computed(() => settingsStore.hasFioCredentials.value)

// Check permissions for order creation
const canCreateInternalOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_INTERNAL)
)
const canCreatePartnerOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_PARTNER)
)
const canCreateAnyOrders = computed(
  () => canCreateInternalOrders.value || canCreatePartnerOrders.value
)

// Check if icons are enabled
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

interface LastSync {
  lastSyncedAt: string | null
  fioUploadedAt: string | null
}

const inventory = ref<FioInventoryItem[]>([])
const loading = ref(false)
const syncing = ref(false)
const lastSync = ref<LastSync>({ lastSyncedAt: null, fioUploadedAt: null })
const lastUpdated = ref<string | null>(null)
const fioStats = ref<FioStatsResponse | null>(null)

// Orders
const sellOrders = ref<SellOrderResponse[]>([])
const buyOrders = ref<BuyOrderResponse[]>([])
const loadingOrders = ref(false)

// Dialog state
const orderDialog = ref(false)
const selectedItem = ref<FioInventoryItem | null>(null)
const orderDetailDialog = ref(false)
const orderDetailType = ref<'sell' | 'buy'>('sell')
const orderDetailId = ref<number>(0)
const editSellDialog = ref(false)
const editingSellOrder = ref<SellOrderResponse | null>(null)
const editBuyDialog = ref(false)
const editingBuyOrder = ref<BuyOrderResponse | null>(null)
const deleteDialog = ref(false)
const deletingOrderType = ref<'sell' | 'buy'>('sell')
const deletingOrderId = ref<number>(0)
const deleting = ref(false)

// Persisted page state (sort, etc.)
const { state: pageState } = usePageState('inventory', {
  sortBy: [
    { key: 'commodityTicker', order: 'asc' },
    { key: 'locationId', order: 'asc' },
  ] as Array<{ key: string; order: 'asc' | 'desc' }>,
})

// Debug context
useDebug('Inventory', () => ({
  'Total items': inventory.value.length,
  'Filtered items': filteredInventory.value.length,
  'Sell orders': sellOrders.value.length,
  'Buy orders': buyOrders.value.length,
  'Last updated': lastUpdated.value ?? 'never',
  'Last FIO sync': lastSync.value.lastSyncedAt ?? 'never',
  'FIO configured': fioConfigured.value,
  'Active filters': hasActiveFilters.value ? JSON.stringify(filters.value) : 'none',
  'Search chips': searchChips.value.length,
  'Page state (sort)': JSON.stringify(pageState.sortBy),
}))

// Filters with URL deep linking
const { filters, hasActiveFilters, clearFilters, setFilter } = useUrlFilters({
  schema: {
    commodity: { type: 'array' },
    location: { type: 'array' },
    category: { type: 'string' },
    locationType: { type: 'string' },
    storageType: { type: 'string' },
  },
})

// Search with URL deep linking
const search = useUrlState<string | null>({
  param: 'search',
  defaultValue: null,
  debounce: 150,
})

// Search chips state (synced with TokenSearchInput)
const searchChips = ref<SearchChip[]>([])

// Sync chips -> filters (for URL deep linking)
const onChipsUpdate = (chips: SearchChip[]) => {
  searchChips.value = chips

  const commodities: string[] = []
  const locations: string[] = []

  for (const chip of chips) {
    if (chip.type === 'commodity') commodities.push(chip.value)
    if (chip.type === 'location') locations.push(chip.value)
  }

  filters.value.commodity = commodities
  filters.value.location = locations
}

// Handle FilterMenu selections (toggles values)
const onFilterMenuSelect = (payload: { filterType: string; key: string; display: string }) => {
  const { filterType, key } = payload

  if (filterType === 'commodity') {
    setFilter('commodity', key)
  } else if (filterType === 'location') {
    setFilter('location', key)
  } else if (filterType === 'category') {
    filters.value.category = filters.value.category === key ? null : key
  } else if (filterType === 'locationType') {
    filters.value.locationType = filters.value.locationType === key ? null : key
  } else if (filterType === 'storageType') {
    filters.value.storageType = filters.value.storageType === key ? null : key
  }
}

// Computed filter options based on inventory data
const commodityOptions = computed(() => {
  const tickers = new Set(inventory.value.map(i => i.commodityTicker))
  return Array.from(tickers).map(ticker => ({
    key: ticker,
    display: getCommodityDisplay(ticker),
    name: getCommodityName(ticker),
    category: getCommodityCategory(ticker) ?? undefined,
  }))
})

const categoryOptions = computed(() => {
  const categories = new Set(
    inventory.value.map(i => i.commodityCategory).filter((c): c is string => !!c)
  )
  return Array.from(categories)
    .sort()
    .map(cat => ({
      title: localizeMaterialCategory(cat as CommodityCategory),
      value: cat,
    }))
})

const locationOptions = computed(() => {
  const locationStorageTypes = new Map<string, Set<string>>()
  for (const item of inventory.value) {
    if (item.locationId) {
      if (!locationStorageTypes.has(item.locationId)) {
        locationStorageTypes.set(item.locationId, new Set())
      }
      if (item.storageType) {
        locationStorageTypes.get(item.locationId)!.add(item.storageType)
      }
    }
  }

  return Array.from(locationStorageTypes.keys()).map(id => ({
    key: id,
    display: getLocationDisplay(id),
    locationType: locationService.getLocationType(id) ?? undefined,
    isUserLocation: true,
    storageTypes: Array.from(locationStorageTypes.get(id) ?? []),
  }))
})

const locationTypeOptions = computed(() => {
  const types = new Set(inventory.value.map(i => i.locationType).filter(Boolean))
  return Array.from(types).sort() as string[]
})

const storageTypeOptions = computed(() => {
  const types = new Set(inventory.value.map(i => i.storageType).filter(Boolean))
  return Array.from(types).sort() as string[]
})

// Filtered inventory
const filteredInventory = computed(() => {
  let result = inventory.value

  if (filters.value.commodity.length > 0) {
    result = result.filter(i => filters.value.commodity.includes(i.commodityTicker))
  }
  if (filters.value.location.length > 0) {
    result = result.filter(i => i.locationId && filters.value.location.includes(i.locationId))
  }
  if (filters.value.category) {
    result = result.filter(i => i.commodityCategory === filters.value.category)
  }
  if (filters.value.locationType) {
    result = result.filter(i => i.locationType === filters.value.locationType)
  }
  if (filters.value.storageType) {
    result = result.filter(i => i.storageType === filters.value.storageType)
  }

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    result = result.filter(
      item =>
        item.commodityTicker.toLowerCase().includes(searchLower) ||
        item.commodityName?.toLowerCase().includes(searchLower) ||
        item.locationId?.toLowerCase().includes(searchLower) ||
        item.locationName?.toLowerCase().includes(searchLower)
    )
  }

  return result
})

// Data loading
const loadInventory = async () => {
  try {
    loading.value = true
    inventory.value = await api.fioInventory.get()
    lastUpdated.value = new Date().toISOString()
  } catch (error) {
    console.error('Failed to load inventory', error)
    showSnackbar('Failed to load inventory', 'error')
  } finally {
    loading.value = false
  }
}

const loadLastSync = async () => {
  try {
    lastSync.value = await api.fioInventory.getLastSync()
  } catch (error) {
    console.error('Failed to load last sync time', error)
  }
}

const loadFioStats = async () => {
  try {
    fioStats.value = await api.fioInventory.getStats()
  } catch (error) {
    console.error('Failed to load FIO stats', error)
  }
}

const loadOrders = async () => {
  try {
    loadingOrders.value = true
    const [sellData, buyData] = await Promise.all([api.sellOrders.list(), api.buyOrders.list()])
    sellOrders.value = sellData
    buyOrders.value = buyData
  } catch (error) {
    console.error('Failed to load orders', error)
  } finally {
    loadingOrders.value = false
  }
}

// Poll for the enqueued inventory job's completion notification so the
// "Queue FIO Sync" button keeps spinning for the actual sync duration,
// not just the (near-instant) enqueue request.
let syncWatchTimer: ReturnType<typeof setInterval> | null = null

const stopSyncWatch = () => {
  if (syncWatchTimer) {
    clearInterval(syncWatchTimer)
    syncWatchTimer = null
  }
}

const watchForSyncCompletion = (jobId: number) => {
  stopSyncWatch()

  const startedAt = Date.now()
  const MAX_WAIT_MS = 3 * 60 * 1000 // safety net in case the notification is missed
  const POLL_MS = 4 * 1000

  syncWatchTimer = setInterval(async () => {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      stopSyncWatch()
      syncing.value = false
      return
    }

    try {
      const recent = await api.notifications.list(20, 0, true)
      const match = recent.find(
        n =>
          (n.type === 'sync_completed' || n.type === 'sync_failed') &&
          (n.data as { jobId?: number } | null)?.jobId === jobId
      )
      if (!match) return

      stopSyncWatch()
      syncing.value = false

      if (match.type === 'sync_failed') {
        showSnackbar(match.message ?? 'FIO sync failed', 'error')
      } else {
        showSnackbar('FIO sync complete')
        loadInventory()
        loadLastSync()
        loadFioStats()
        loadOrders()
      }
    } catch (error) {
      console.error('Failed to check sync status', error)
    }
  }, POLL_MS)
}

const syncInventory = async () => {
  try {
    syncing.value = true
    const { jobIds } = await api.fioSync.startAll()
    showSnackbar("FIO sync queued — you'll be notified when it finishes")
    watchForSyncCompletion(jobIds.inventory)
  } catch (error) {
    console.error('Failed to enqueue FIO sync', error)
    const message = error instanceof Error ? error.message : 'Failed to enqueue FIO sync'
    showSnackbar(message, 'error')
    syncing.value = false
  }
}

// Order dialog handlers
const openSellDialog = (item: FioInventoryItem) => {
  selectedItem.value = item
  orderDialog.value = true
}

const onOrderCreated = (type: 'buy' | 'sell') => {
  showSnackbar(`${type === 'buy' ? 'Buy' : 'Sell'} order created successfully`)
  loadOrders()
}

// Order detail/edit/delete handlers
const viewSellOrder = (order: SellOrderResponse) => {
  orderDetailType.value = 'sell'
  orderDetailId.value = order.id
  orderDetailDialog.value = true
}

const viewBuyOrder = (order: BuyOrderResponse) => {
  orderDetailType.value = 'buy'
  orderDetailId.value = order.id
  orderDetailDialog.value = true
}

const editSellOrder = (order: SellOrderResponse) => {
  editingSellOrder.value = order
  editSellDialog.value = true
}

const editBuyOrder = (order: BuyOrderResponse) => {
  editingBuyOrder.value = order
  editBuyDialog.value = true
}

const onEditSaved = () => {
  showSnackbar('Order updated successfully')
  loadOrders()
}

const confirmDeleteSellOrder = (order: SellOrderResponse) => {
  deletingOrderType.value = 'sell'
  deletingOrderId.value = order.id
  deleteDialog.value = true
}

const confirmDeleteBuyOrder = (order: BuyOrderResponse) => {
  deletingOrderType.value = 'buy'
  deletingOrderId.value = order.id
  deleteDialog.value = true
}

const executeDelete = async () => {
  try {
    deleting.value = true
    if (deletingOrderType.value === 'sell') {
      await api.sellOrders.delete(deletingOrderId.value)
    } else {
      await api.buyOrders.delete(deletingOrderId.value)
    }
    showSnackbar(`${deletingOrderType.value === 'sell' ? 'Sell' : 'Buy'} order deleted`)
    deleteDialog.value = false
    loadOrders()
  } catch (error) {
    console.error('Failed to delete order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete order'
    showSnackbar(message, 'error')
  } finally {
    deleting.value = false
  }
}

const onOrderUpdated = () => loadOrders()
const onOrderDeleted = () => loadOrders()

const handleDataUpdated = (event: Event) => {
  const customEvent = event as CustomEvent<{ updatedKeys: string[] }>
  if (customEvent.detail.updatedKeys.includes('inventory')) {
    loadInventory()
    loadLastSync()
    loadFioStats()
    loadOrders()
  }
}

onMounted(() => {
  loadInventory()
  loadLastSync()
  loadFioStats()
  loadOrders()
  window.addEventListener(syncService.EVENTS.DATA_UPDATED, handleDataUpdated)
})

onUnmounted(() => {
  window.removeEventListener(syncService.EVENTS.DATA_UPDATED, handleDataUpdated)
  stopSyncWatch()
})
</script>

<style scoped>
.spin-icon {
  animation: spin-icon 1s linear infinite;
}

@keyframes spin-icon {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
