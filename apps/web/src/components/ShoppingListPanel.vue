<template>
  <div class="shopping-list-panel">
    <!-- Empty State -->
    <div v-if="!hasWorkingList && !showAddInput" class="empty-state">
      <v-icon size="48" color="grey-darken-1" class="mb-3">mdi-cart-outline</v-icon>
      <div class="text-body-1 text-grey-darken-1 mb-2">No Shopping List</div>
      <div class="text-caption text-grey mb-4 text-center px-4">
        Create a new list or paste one in the search bar
      </div>
      <div class="empty-state-buttons">
        <v-btn variant="elevated" color="primary" size="small" @click="startNewList">
          <v-icon start size="small">mdi-plus</v-icon>
          New List
        </v-btn>
        <v-btn v-if="isLoggedIn" variant="outlined" size="small" @click="openListDialog = true">
          <v-icon start size="small">mdi-folder-open</v-icon>
          Open Saved
        </v-btn>
      </div>
    </div>

    <!-- List Content -->
    <div v-else class="list-content">
      <!-- Header -->
      <div class="list-header">
        <div class="list-title-row">
          <div class="list-title">
            <v-icon size="small" class="mr-1">mdi-cart</v-icon>
            {{ listName }}
            <v-btn
              v-if="sortedListStatus.length > 0"
              icon
              size="x-small"
              variant="text"
              color="primary"
              title="Filter market by list items"
              class="filter-btn"
              @click="emit('filter-by-list')"
            >
              <v-icon size="small">mdi-filter</v-icon>
            </v-btn>
          </div>
          <!-- Auto-update toggle (lock/unlock icon) -->
          <v-tooltip v-if="isLoggedIn" location="top">
            <template #activator="{ props: tooltipProps }">
              <v-btn
                v-bind="tooltipProps"
                icon
                size="x-small"
                variant="text"
                :color="autoUpdateEnabled ? 'primary' : 'grey'"
                @click="autoUpdateEnabled = !autoUpdateEnabled"
              >
                <v-icon size="small">
                  {{ autoUpdateEnabled ? 'mdi-lock-open-variant' : 'mdi-lock' }}
                </v-icon>
              </v-btn>
            </template>
            {{
              autoUpdateEnabled
                ? 'List auto-updates on invoice submit'
                : 'List locked (no auto-updates)'
            }}
          </v-tooltip>
        </div>
        <div class="list-meta-row">
          <div class="list-meta text-caption">
            <v-icon
              size="x-small"
              class="mr-1"
              :color="fulfilledCount === itemCount ? 'success' : 'grey'"
            >
              {{
                fulfilledCount === itemCount
                  ? 'mdi-check-circle'
                  : 'mdi-checkbox-blank-circle-outline'
              }}
            </v-icon>
            {{ fulfilledCount }}/{{ itemCount }} fulfilled
          </div>
          <!-- Use Own Orders Toggle -->
          <v-checkbox
            v-if="hasAnyOwnOrders"
            v-model="useOwnOrders"
            density="compact"
            hide-details
            class="own-orders-checkbox"
          >
            <template #label>
              <span class="text-caption">Own orders</span>
            </template>
          </v-checkbox>
        </div>
      </div>

      <!-- Status List (CSS Grid table) -->
      <div class="status-list">
        <template v-if="sortedListStatus.length > 0">
          <div
            v-for="item in sortedListStatus"
            :key="item.ticker"
            class="status-item"
            :class="`status-${getEffectiveStatusClass(item)}`"
          >
            <!-- Column 1: Status indicator (checkmark or order count badge) -->
            <div class="item-indicator">
              <v-icon v-if="item.status === 'fulfilled'" size="x-small" color="success">
                mdi-check
              </v-icon>
              <v-tooltip v-else-if="getOrderCountBadge(item)" location="top">
                <template #activator="{ props: tooltipProps }">
                  <span
                    v-bind="tooltipProps"
                    class="order-count-badge"
                    :class="{ 'badge-warning': !item.canFillCompletely }"
                  >
                    {{ getOrderCountBadge(item) }}
                  </span>
                </template>
                {{ getOrderCountTooltip(item) }}
              </v-tooltip>
            </div>
            <!-- Column 2: Quantity (editable in edit mode) -->
            <div class="item-quantity">
              <template v-if="editingTicker === item.ticker">
                <input
                  ref="editQuantityInputRef"
                  v-model.number="editQuantityValue"
                  type="number"
                  min="1"
                  class="edit-quantity-input"
                  @keydown.enter.prevent="saveEdit"
                  @keydown.esc.prevent="cancelEdit"
                />
              </template>
              <template v-else-if="item.status === 'fulfilled'">{{ item.needed }}</template>
              <template v-else>{{ item.available }} / {{ item.needed }}</template>
            </div>
            <!-- Column 3: Commodity (editable in edit mode) -->
            <div class="item-commodity">
              <KeyValueAutocomplete
                v-if="editingTicker === item.ticker"
                ref="editCommodityInputRef"
                v-model="editCommodityValue"
                :items="commodityOptions"
                :favorites="favoritedCommodities"
                label=""
                density="compact"
                hide-details
                show-icons
                class="edit-commodity-select"
                @keydown="onEditCommodityKeydown"
              />
              <CommodityDisplay
                v-else
                :ticker="item.ticker"
                :icon-size="28"
                :max-name-length="20"
              />
            </div>
            <!-- Column 4: Edit/Save and Remove/Cancel buttons -->
            <div class="item-actions-cell">
              <template v-if="editingTicker === item.ticker">
                <!-- Save button -->
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  color="success"
                  class="item-save"
                  @click="saveEdit"
                >
                  <v-icon size="small">mdi-check</v-icon>
                </v-btn>
                <!-- Cancel button -->
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  color="grey"
                  class="item-cancel"
                  @click="cancelEdit"
                >
                  <v-icon size="small">mdi-close</v-icon>
                </v-btn>
              </template>
              <template v-else>
                <!-- Edit button -->
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  color="primary"
                  class="item-edit"
                  @click="startEdit(item.ticker, item.needed)"
                >
                  <v-icon size="small">mdi-pencil</v-icon>
                </v-btn>
                <!-- Remove button -->
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  color="error"
                  class="item-remove"
                  @click="removeItem(item.ticker)"
                >
                  <v-icon size="small">mdi-close</v-icon>
                </v-btn>
              </template>
            </div>
          </div>
        </template>
      </div>

      <!-- Add Item Row (toggled via footer button) -->
      <div v-if="showAddInput" class="add-item-row">
        <v-text-field
          ref="quantityInputRef"
          v-model.number="newItemQuantity"
          type="number"
          placeholder="Qty"
          density="compact"
          variant="outlined"
          hide-details
          min="1"
          class="quantity-input"
          @keydown.enter="addItem"
          @keydown.tab="onQuantityTab"
        />
        <KeyValueAutocomplete
          ref="commodityInputRef"
          v-model="newItemTicker"
          :items="commodityOptions"
          :favorites="favoritedCommodities"
          label="Commodity"
          density="compact"
          hide-details
          show-icons
          class="commodity-select"
          @update:model-value="onCommoditySelect($event)"
          @update:favorites="settingsStore.updateSetting('market.favoritedCommodities', $event)"
          @keydown="onCommodityKeydown"
        />
        <v-btn
          size="x-small"
          variant="elevated"
          color="primary"
          :disabled="!canAddItem"
          class="add-item-btn"
          @click="addItem"
        >
          <v-icon size="small" start>mdi-plus</v-icon>
          Add
        </v-btn>
      </div>

      <!-- Legend with Add button -->
      <div v-if="hasWorkingList || showAddInput" class="legend">
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-dot fulfilled"></span>
            <span class="legend-label">Fulfilled</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot available"></span>
            <span class="legend-label">Available</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot partial"></span>
            <span class="legend-label">Partial</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot unavailable"></span>
            <span class="legend-label">None</span>
          </div>
        </div>
        <v-btn
          size="x-small"
          :variant="showAddInput ? 'tonal' : 'text'"
          :color="showAddInput ? 'primary' : undefined"
          class="add-toggle-btn"
          @click="toggleAddInput"
        >
          <v-icon size="small" start>{{ showAddInput ? 'mdi-chevron-up' : 'mdi-plus' }}</v-icon>
          {{ showAddInput ? 'Hide' : 'Add' }}
        </v-btn>
      </div>
    </div>

    <!-- Action Buttons -->
    <div v-if="hasWorkingList || isLoggedIn || showAddInput" class="action-buttons">
      <v-btn v-if="isLoggedIn" variant="text" size="small" @click="openListDialog = true">
        <v-icon start size="small">mdi-folder-open</v-icon>
        Open
      </v-btn>
      <v-btn
        v-if="hasWorkingList && isLoggedIn"
        variant="text"
        size="small"
        @click="saveListDialog = true"
      >
        <v-icon start size="small">mdi-content-save</v-icon>
        Save
      </v-btn>
      <v-btn v-if="hasWorkingList" variant="text" size="small" @click="copyList">
        <v-icon start size="small">mdi-content-copy</v-icon>
        Copy
      </v-btn>
      <v-btn
        v-if="hasWorkingList || showAddInput"
        variant="text"
        size="small"
        color="error"
        @click="handleClear"
      >
        <v-icon start size="small">mdi-close</v-icon>
        Clear
      </v-btn>
    </div>

    <!-- Open List Dialog -->
    <OpenListDialog v-model="openListDialog" @select="handleOpenList" />

    <!-- Save List Dialog -->
    <SaveListDialog
      v-model="saveListDialog"
      :current-name="workingName"
      :is-update="isFromSavedList"
      @save="handleSaveList"
    />

    <!-- New List Dialog -->
    <NewListDialog
      v-model="newListDialog"
      @create-empty="handleCreateEmpty"
      @create-from-paste="handleCreateFromPaste"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, watch } from 'vue'
import { useShoppingListStore } from '../stores/shoppingList'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { commodityService } from '../services/commodityService'
import { localizeMaterial } from '../utils/materials'
import { parseShoppingList } from '@kawakawa/types/shopping-list'
import OpenListDialog from './OpenListDialog.vue'
import SaveListDialog from './SaveListDialog.vue'
import NewListDialog from './NewListDialog.vue'
import KeyValueAutocomplete from './KeyValueAutocomplete.vue'
import CommodityDisplay from './CommodityDisplay.vue'
import type { Commodity } from '../types'

export interface ListItemStatus {
  ticker: string
  needed: number
  available: number
  /** Quantity available from user's own sell orders */
  ownOrderQuantity?: number
  /** Minimum number of orders needed to fill the demand (or all if can't fill) */
  ordersNeeded?: number
  /** Whether available orders can completely fill the remaining need */
  canFillCompletely?: boolean
  status: 'fulfilled' | 'available' | 'partial' | 'unavailable'
}

interface Props {
  /** Shopping list status data from parent (calculated from market data) */
  listStatus?: ListItemStatus[]
  /** Function to format commodity display (respects user settings) */
  getCommodityDisplay?: (ticker: string) => string
}

const props = withDefaults(defineProps<Props>(), {
  listStatus: () => [],
  getCommodityDisplay: (ticker: string) => ticker,
})

const emit = defineEmits<{
  (e: 'clear'): void
  (e: 'add', ticker: string, quantity: number): void
  (e: 'filter-by-list'): void
}>()

const shoppingListStore = useShoppingListStore()
const userStore = useUserStore()
const settingsStore = useSettingsStore()

// Favorited commodities from settings
const favoritedCommodities = computed(() => {
  const favorites = settingsStore.getSetting('market.favoritedCommodities')
  return Array.isArray(favorites) ? favorites : []
})

// Commodities for dropdown
const commodities = ref<Commodity[]>([])

onMounted(async () => {
  commodities.value = commodityService.getAllCommoditiesSync()
  if (commodities.value.length === 0) {
    commodities.value = await commodityService.getAllCommodities()
  }
  // Show add input if there's already a working list (loaded from localStorage)
  if (shoppingListStore.hasWorkingList.value) {
    showAddInput.value = true
  }
})

const openListDialog = ref(false)
const saveListDialog = ref(false)
const newListDialog = ref(false)
const showAddInput = ref(false)
const toggleAddInput = () => {
  showAddInput.value = !showAddInput.value
  if (showAddInput.value) {
    nextTick(() => {
      quantityInputRef.value?.focus()
    })
  }
}
const useOwnOrders = ref(true) // Include own orders when calculating fulfillment
const newItemTicker = ref<string | null>(null)
const newItemQuantity = ref<number | null>(null)
const quantityInputRef = ref<{ focus: () => void } | null>(null)
const commodityInputRef = ref<{ focus: () => void } | null>(null)

// Inline edit state
const editingTicker = ref<string | null>(null)
const editQuantityValue = ref<number | null>(null)
const editCommodityValue = ref<string | null>(null)
const editQuantityInputRef = ref<HTMLInputElement | null>(null)
const editCommodityInputRef = ref<{ focus: () => void } | null>(null)

// Store computed values
const isLoggedIn = computed(() => userStore.getUser() !== null)
const hasWorkingList = computed(() => shoppingListStore.hasWorkingList.value)
const workingName = computed(() => shoppingListStore.workingName.value)
const isFromSavedList = computed(() => shoppingListStore.isFromSavedList.value)
const itemCount = computed(() => shoppingListStore.itemCount.value)

// Count fulfilled items from listStatus
const fulfilledCount = computed(() => {
  return props.listStatus.filter(item => item.status === 'fulfilled').length
})

// Check if any items have own orders available
const hasAnyOwnOrders = computed(() => {
  return props.listStatus.some(item => (item.ownOrderQuantity ?? 0) > 0)
})

// Auto-update shopping list setting
const autoUpdateEnabled = computed({
  get: () => settingsStore.getSetting<boolean | null>('market.updateShoppingList') ?? false,
  set: value => settingsStore.updateSetting('market.updateShoppingList', value),
})

// Sort items based on effective status (considering own orders when enabled)
// Unfulfilled first (unavailable, partial, available), then fulfilled/own-order-satisfied
const sortedListStatus = computed(() => {
  const statusOrder: Record<ListItemStatus['status'], number> = {
    unavailable: 0,
    partial: 1,
    available: 2,
    fulfilled: 3,
  }
  const getEffectiveSortOrder = (item: ListItemStatus): number => {
    // If own orders enabled and own order can satisfy the remaining need, sort with fulfilled
    if (useOwnOrders.value) {
      const remaining = item.needed - item.available
      if ((item.ownOrderQuantity ?? 0) >= remaining) return statusOrder.fulfilled
    }
    return statusOrder[item.status]
  }
  return [...props.listStatus].sort((a, b) => getEffectiveSortOrder(a) - getEffectiveSortOrder(b))
})

// List name display
const listName = computed(() => {
  if (workingName.value) {
    return workingName.value
  }
  return 'Shopping List'
})

// Commodity options for the autocomplete (with localized names)
const commodityOptions = computed(() => {
  return commodities.value.map((c: Commodity) => ({
    key: c.ticker,
    display: `${c.ticker} - ${localizeMaterial(c.name)}`,
    name: localizeMaterial(c.name),
    category: c.category,
  }))
})

// Can add item (has ticker and quantity)
const canAddItem = computed(() => {
  return newItemTicker.value && newItemQuantity.value !== null && newItemQuantity.value > 0
})

// Start a new list (open dialog)
const startNewList = () => {
  newListDialog.value = true
}

// Handle creating an empty list from the dialog
const handleCreateEmpty = () => {
  showAddInput.value = true
  focusQuantity()
}

// Handle creating a list from pasted content
const handleCreateFromPaste = (text: string) => {
  const result = parseShoppingList(text)
  if (result.success && Object.keys(result.materials).length > 0) {
    shoppingListStore.setMaterials(result.materials, result.name)
    showAddInput.value = true
  } else {
    // If parsing failed, still show empty list
    showAddInput.value = true
    focusQuantity()
  }
}

// Focus quantity input (first field)
const focusQuantity = () => {
  nextTick(() => {
    quantityInputRef.value?.focus()
  })
}

// Focus commodity input after entering quantity
const focusCommodity = () => {
  nextTick(() => {
    commodityInputRef.value?.focus()
  })
}

// Handle Tab key on quantity input - move to commodity
const onQuantityTab = (event: globalThis.KeyboardEvent) => {
  if (newItemQuantity.value && newItemQuantity.value > 0) {
    event.preventDefault()
    focusCommodity()
  }
}

// Handle commodity selection - add item if quantity is set
// Called when user selects from dropdown (click or Enter selects item)
const onCommoditySelect = (value: string | string[] | null) => {
  // Use nextTick to ensure Vue has processed the model update
  const selectedValue = Array.isArray(value) ? value[0] : value
  nextTick(() => {
    if (selectedValue && newItemQuantity.value !== null && newItemQuantity.value > 0) {
      addItem()
    }
  })
}

// Handle keydown on commodity input - add item on Tab if ready
// Note: Enter is handled by the autocomplete selecting the item, which triggers onCommoditySelect
const onCommodityKeydown = (event: globalThis.KeyboardEvent) => {
  // Handle Tab - add item if ready (Enter is handled by autocomplete selection -> onCommoditySelect)
  if (event.key === 'Tab' && canAddItem.value) {
    event.preventDefault()
    addItem()
  }
}

// Add item to the list
const addItem = () => {
  if (!newItemTicker.value || newItemQuantity.value === null || newItemQuantity.value <= 0) return

  const ticker = newItemTicker.value
  const quantity = newItemQuantity.value

  // Get current materials or start fresh
  const currentMaterials = shoppingListStore.getMaterials() ?? {}

  // Add or update the commodity
  const newMaterials = {
    ...currentMaterials,
    [ticker]: (currentMaterials[ticker] ?? 0) + quantity,
  }

  // Update shopping list store
  shoppingListStore.setMaterials(newMaterials)

  // Emit event for parent
  emit('add', ticker, quantity)

  // Reset input for next item and focus quantity (first field)
  newItemTicker.value = null
  newItemQuantity.value = null
  focusQuantity()
}

// Remove item from the list
const removeItem = (ticker: string) => {
  const currentMaterials = shoppingListStore.getMaterials() ?? {}
  const { [ticker]: _, ...remaining } = currentMaterials

  if (Object.keys(remaining).length === 0) {
    shoppingListStore.clearList()
    showAddInput.value = false
    emit('clear')
  } else {
    shoppingListStore.setMaterials(remaining)
  }
}

// Start editing an item (both quantity and commodity)
const startEdit = (ticker: string, currentQuantity: number) => {
  editingTicker.value = ticker
  editQuantityValue.value = currentQuantity
  editCommodityValue.value = ticker
}

// Watch for editing to start and focus the quantity input
watch(editingTicker, newTicker => {
  if (newTicker) {
    nextTick(() => {
      const input = editQuantityInputRef.value
      if (input) {
        input.focus()
        input.select()
      }
    })
  }
})

// Handle keydown in edit commodity input
const onEditCommodityKeydown = (event: globalThis.KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveEdit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  }
}

// Save the edited item (quantity and/or commodity change)
const saveEdit = () => {
  if (!editingTicker.value || editQuantityValue.value === null || !editCommodityValue.value) {
    cancelEdit()
    return
  }

  const originalTicker = editingTicker.value
  const newTicker = editCommodityValue.value
  const newQuantity = editQuantityValue.value

  if (newQuantity > 0) {
    const currentMaterials = shoppingListStore.getMaterials() ?? {}

    if (originalTicker === newTicker) {
      // Just update quantity
      const newMaterials = {
        ...currentMaterials,
        [newTicker]: newQuantity,
      }
      shoppingListStore.setMaterials(newMaterials)
    } else {
      // Commodity changed - remove old, add new
      const { [originalTicker]: _, ...remaining } = currentMaterials
      const newMaterials = {
        ...remaining,
        [newTicker]: newQuantity,
      }
      shoppingListStore.setMaterials(newMaterials)
    }
  }

  editingTicker.value = null
  editQuantityValue.value = null
  editCommodityValue.value = null
}

// Cancel editing and discard changes
const cancelEdit = () => {
  editingTicker.value = null
  editQuantityValue.value = null
  editCommodityValue.value = null
}

// Check if item is satisfied (by market orders, own orders, or already fulfilled)
const isItemSatisfied = (item: ListItemStatus): boolean => {
  if (item.status === 'fulfilled' || item.status === 'available') return true
  // Check if own order can satisfy the remaining need (when enabled)
  if (useOwnOrders.value) {
    const remaining = item.needed - item.available
    return (item.ownOrderQuantity ?? 0) >= remaining
  }
  return false
}

// Get effective status class for row styling (considers own orders when enabled)
const getEffectiveStatusClass = (item: ListItemStatus): string => {
  if (isItemSatisfied(item)) return 'fulfilled'
  return item.status
}

// Get order count badge text (shows when multiple orders needed)
// Returns: null (no badge), "2", "3", ... (exact count), or "N+" (can't fill completely)
const getOrderCountBadge = (item: ListItemStatus): string | null => {
  // No badge for fulfilled items
  if (item.status === 'fulfilled') return null

  const ordersNeeded = item.ordersNeeded ?? 0

  // No badge if only 1 or 0 orders needed
  if (ordersNeeded <= 1) return null

  // If can't fill completely, show "N+"
  if (!item.canFillCompletely) {
    return `${ordersNeeded}+`
  }

  // Show exact count
  return `${ordersNeeded}`
}

// Get tooltip for order count badge
const getOrderCountTooltip = (item: ListItemStatus): string => {
  const ordersNeeded = item.ordersNeeded ?? 0

  if (!item.canFillCompletely) {
    return `${ordersNeeded} orders available, but not enough to fill completely`
  }

  return `Requires ${ordersNeeded} orders to fill`
}

// Handle open list selection
const handleOpenList = async (listId: number) => {
  await shoppingListStore.openList(listId)
  openListDialog.value = false
  showAddInput.value = true // Show add input after loading
}

// Handle save list
const handleSaveList = async (name: string, notes?: string) => {
  await shoppingListStore.saveList(name, notes)
  saveListDialog.value = false
}

// Copy list to clipboard in simple format: TICKER QUANTITY per line
const copyList = async () => {
  const materials = shoppingListStore.getMaterials()
  if (!materials) return

  const lines = Object.entries(materials)
    .map(([ticker, quantity]) => `${ticker} ${quantity}`)
    .join('\n')

  try {
    await navigator.clipboard.writeText(lines)
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = lines
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

// Handle clear
const handleClear = () => {
  shoppingListStore.clearList()
  showAddInput.value = false
  newItemTicker.value = null
  newItemQuantity.value = null
  emit('clear')
}
</script>

<style scoped>
.shopping-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgb(var(--v-theme-surface));
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.empty-state-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.list-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.list-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.list-title {
  display: flex;
  align-items: center;
  font-weight: 500;
  gap: 4px;
}

.filter-btn {
  margin-left: 2px;
}

.list-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
}

.list-meta {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.own-orders-checkbox {
  flex-shrink: 0;
  margin: 0;
  padding: 0;
}

.own-orders-checkbox :deep(.v-label) {
  font-size: 11px;
  opacity: 0.7;
}

.own-orders-checkbox :deep(.v-selection-control) {
  min-height: unset;
}

/* CSS Grid table layout for aligned columns across all rows */
.status-list {
  overflow-y: auto;
  padding: 8px 0;
  display: grid;
  grid-template-columns: auto auto 1fr auto;
}

/* Each status-item spans all columns and uses subgrid for alignment */
.status-item {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;
  min-height: 44px;
  max-height: 48px;
  padding: 4px 0;
}

/* Cell styles */
.status-item > * {
  display: flex;
  align-items: center;
  padding: 4px;
}

/* First and last column padding adjustments */
.status-item > *:first-child {
  padding-left: 12px;
}

.status-item > *:last-child {
  padding-right: 12px;
}

/* Row backgrounds by status */
.status-item.status-fulfilled {
  background: rgba(var(--v-theme-success), 0.08);
}

.status-item.status-available {
  background: rgba(var(--v-theme-success), 0.05);
}

.status-item.status-partial {
  background: rgba(var(--v-theme-warning), 0.08);
}

.status-item.status-unavailable {
  background: rgba(var(--v-theme-error), 0.08);
}

/* Column 1: Status indicator (checkmark or order count badge) */
.item-indicator {
  justify-content: center;
  min-width: 24px;
}

.order-count-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  background-color: rgb(var(--v-theme-primary));
  color: white;
  border-radius: 9px;
}

.order-count-badge.badge-warning {
  background-color: rgb(var(--v-theme-warning));
  color: white;
}

/* Column 2: Quantity */
.item-quantity {
  justify-content: flex-end;
  font-size: 12px;
  font-weight: 500;
  font-family: monospace;
  text-align: right;
  color: rgba(var(--v-theme-on-surface), 0.8);
  border-radius: 4px;
}

.edit-quantity-input {
  width: 6ch;
  max-width: 8ch;
  padding: 2px 4px;
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  border: 1px solid rgb(var(--v-theme-primary));
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  outline: none;
}

.edit-quantity-input:focus {
  box-shadow: 0 0 0 2px rgba(var(--v-theme-primary), 0.2);
}

/* Hide number input spinners */
.edit-quantity-input::-webkit-outer-spin-button,
.edit-quantity-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.edit-quantity-input[type='number'] {
  -moz-appearance: textfield;
}

/* Column 3: Commodity */
.item-commodity {
  justify-content: flex-start;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
}

.item-commodity :deep(.commodity-display) {
  max-width: 100%;
}

.item-commodity :deep(.commodity-text) {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

.edit-commodity-select {
  min-width: 0;
  flex: 1;
}

.edit-commodity-select :deep(.v-field) {
  font-size: 12px;
}

.edit-commodity-select :deep(.v-field__input) {
  font-size: 12px;
  min-height: 28px;
  padding: 4px 8px;
}

/* Column 4: Action buttons */
.item-actions-cell {
  display: flex;
  gap: 0;
}

.item-edit,
.item-remove {
  flex-shrink: 0;
}

.add-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(var(--v-theme-primary), 0.05);
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.add-item-row :deep(.v-field) {
  font-size: 12px;
}

.add-item-row :deep(.v-field__input) {
  font-size: 12px;
  min-height: 28px;
  padding: 4px 8px;
}

.add-item-row :deep(.v-field--variant-outlined .v-field__outline) {
  --v-field-border-opacity: 0.3;
}

.commodity-select {
  flex: 1;
  min-width: 0;
}

.quantity-input {
  min-width: 0;
  max-width: 8ch;
}

.add-item-btn {
  flex-shrink: 0;
}

.legend {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 12px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.legend-items {
  display: flex;
  gap: 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.add-toggle-btn {
  flex-shrink: 0;
}

.legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.legend-dot.fulfilled {
  background: rgb(var(--v-theme-success));
}

.legend-dot.available {
  background: rgba(var(--v-theme-success), 0.6);
}

.legend-dot.partial {
  background: rgb(var(--v-theme-warning));
}

.legend-dot.unavailable {
  background: rgb(var(--v-theme-error));
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
