<template>
  <v-container fluid>
    <h1 class="text-h4 mb-4">Pricing Calculator</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Controls Card -->
    <v-card class="calculator-card mb-4">
      <v-card-text>
        <v-row dense align="center">
          <v-col cols="12" sm="4" md="3">
            <v-select
              v-model="selectedPriceList"
              :items="priceListOptions"
              item-title="title"
              item-value="value"
              label="Price List"
              density="compact"
              hide-details
              :loading="loadingPriceLists"
            />
          </v-col>
          <v-col cols="12" sm="4" md="3">
            <KeyValueAutocomplete
              v-model="selectedLocation"
              :items="locationOptions"
              :favorites="settingsStore.favoritedLocations.value"
              label="Location"
              density="compact"
              hide-details
              @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
            />
          </v-col>
          <v-col v-if="hasFallbackPrices" cols="12" sm="4" md="6">
            <v-chip color="info" size="small" variant="tonal" prepend-icon="mdi-information">
              Some prices from {{ fallbackLocationDisplay }}
            </v-chip>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Cargo Hold Card -->
    <v-card class="calculator-card mb-4">
      <v-card-text class="cargo-hold-bar">
        <div class="cargo-hold-select">
          <v-select
            v-model="selectedShip"
            :items="shipOptions"
            item-title="title"
            item-value="value"
            :label="selectedShip ? undefined : 'Cargo Bay'"
            :placeholder="selectedShip ? undefined : 'Cargo Bay'"
            density="compact"
            hide-details
            clearable
            @update:menu="
              (open: boolean) => {
                if (!open) hoveredShip = null
              }
            "
          >
            <template #item="{ item, props: itemProps }">
              <v-list-item
                v-bind="itemProps"
                :title="undefined"
                @mouseenter="hoveredShip = item.raw.value === 'CUSTOM' ? null : item.raw.value"
                @mouseleave="hoveredShip = null"
              >
                <template #prepend>
                  <CommodityIcon
                    v-if="item.raw.icon"
                    :commodity="item.raw.icon"
                    class="cargo-icon mr-2"
                  />
                </template>
                <v-list-item-title>{{ item.title }}</v-list-item-title>
              </v-list-item>
            </template>
            <template #selection="{ item }">
              <div class="d-flex align-center">
                <CommodityIcon
                  v-if="item.raw.icon"
                  :commodity="item.raw.icon"
                  class="cargo-icon-sm mr-2"
                />
                <span>{{ item.title }}</span>
              </div>
            </template>
          </v-select>
        </div>
        <div class="cargo-hold-capacity">
          <v-text-field
            v-model.number="displayWeight"
            type="number"
            min="1"
            label="Wt (t)"
            density="compact"
            hide-details
            variant="outlined"
            :class="['capacity-input', { 'capacity-preview': isHoverPreview }]"
            :disabled="!isCustomEditable && !isHoverPreview"
            :readonly="isHoverPreview"
            @update:model-value="onCustomWeightChange"
          />
        </div>
        <div class="cargo-hold-capacity">
          <v-text-field
            v-model.number="displayVolume"
            type="number"
            min="1"
            label="Vol (m³)"
            density="compact"
            hide-details
            variant="outlined"
            :class="['capacity-input', { 'capacity-preview': isHoverPreview }]"
            :disabled="!isCustomEditable && !isHoverPreview"
            :readonly="isHoverPreview"
            @update:model-value="onCustomVolumeChange"
          />
        </div>
        <div v-if="hasFilledRows" class="cargo-hold-stats">
          <span class="text-caption text-medium-emphasis">Wt:</span>
          <span class="font-weight-medium">{{ totalWeight.toFixed(1) }}t</span>
          <span v-if="cargoCapacity" class="font-weight-medium" :class="weightFillColor">
            ({{ weightFillPercent.toFixed(0) }}%)
          </span>
          <span class="mx-2 text-medium-emphasis">|</span>
          <span class="text-caption text-medium-emphasis">Vol:</span>
          <span class="font-weight-medium">{{ totalVolume.toFixed(1) }}m3</span>
          <span v-if="cargoCapacity" class="font-weight-medium" :class="volumeFillColor">
            ({{ volumeFillPercent.toFixed(0) }}%)
          </span>
          <template v-if="cargoCapacity">
            <span class="mx-2 text-medium-emphasis">|</span>
            <span class="text-caption text-medium-emphasis">Trips:</span>
            <v-chip
              :color="tripsNeeded > 1 ? 'warning' : 'success'"
              size="small"
              variant="tonal"
              class="ml-1 font-weight-bold"
            >
              {{ tripsNeeded }}
            </v-chip>
          </template>
        </div>
        <div class="cargo-hold-spacer" />
      </v-card-text>
    </v-card>

    <!-- Calculator Table Card -->
    <v-card class="calculator-card">
      <v-card-text class="pa-4">
        <!-- Header -->
        <div class="calc-header d-flex align-center text-caption text-medium-emphasis mb-2">
          <div class="col-icon"></div>
          <div class="col-material">Material</div>
          <div class="col-amount text-right">Amount</div>
          <div class="col-wt text-right">Wt</div>
          <div class="col-vol text-right">Vol</div>
          <div v-if="cargoCapacity" class="col-ratio text-right">Ratio</div>
          <div class="col-price text-right">Unit Price</div>
          <div class="col-total text-right">Total</div>
          <div class="col-actions"></div>
        </div>

        <!-- Rows -->
        <div v-for="(row, index) in rows" :key="row.id" class="calc-row d-flex align-center">
          <div class="col-icon">
            <CommodityIcon
              v-if="row.commodityTicker && getCommodity(row.commodityTicker)"
              :commodity="getCommodity(row.commodityTicker)!"
              class="row-icon"
            />
          </div>
          <div class="col-material">
            <KeyValueAutocomplete
              :ref="el => setMaterialRef(index, el as FocusableComponent | null)"
              v-model="row.commodityTicker"
              :items="commodityOptions"
              :favorites="settingsStore.favoritedCommodities.value"
              :show-icons="hasIcons"
              label=""
              density="compact"
              hide-details
              variant="outlined"
              @update:favorites="settingsStore.updateSetting('market.favoritedCommodities', $event)"
              @update:model-value="onMaterialChange(index)"
              @keydown.tab="onMaterialTab($event, index)"
            />
          </div>
          <div class="col-amount">
            <v-text-field
              :ref="el => setAmountRef(index, el as FocusableComponent | null)"
              v-model.number="row.amount"
              type="number"
              min="0"
              placeholder="0"
              density="compact"
              hide-details
              variant="outlined"
              class="amount-input"
              @update:model-value="onAmountChange(index)"
              @keydown.tab="onAmountTab($event, index)"
              @focus="selectOnFocus"
            />
          </div>
          <div class="col-wt text-right">
            <span v-if="getRowWeight(row) !== null" class="text-caption">
              {{ getRowWeight(row)!.toFixed(2) }}t
            </span>
          </div>
          <div class="col-vol text-right">
            <span v-if="getRowVolume(row) !== null" class="text-caption">
              {{ getRowVolume(row)!.toFixed(2) }}m3
            </span>
          </div>
          <div v-if="cargoCapacity" class="col-ratio text-right">
            <v-text-field
              v-if="row.commodityTicker"
              :ref="el => setRatioRef(index, el as FocusableComponent | null)"
              :model-value="getRowRatio(row)?.toFixed(1) ?? ''"
              type="number"
              min="0"
              max="100"
              step="1"
              suffix="%"
              density="compact"
              hide-details
              variant="outlined"
              class="ratio-input"
              @update:model-value="onRatioChange(index, $event)"
              @keydown.tab="onRatioTab($event, index)"
              @focus="selectOnFocus"
            />
          </div>
          <div class="col-price text-right">
            <span v-if="getUnitPrice(row.commodityTicker) !== null" class="font-weight-medium">
              {{
                getUnitPrice(row.commodityTicker)!.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              }}
              <span class="text-caption text-medium-emphasis ml-1">{{ currency }}</span>
            </span>
            <span v-else-if="row.commodityTicker" class="text-medium-emphasis">N/A</span>
          </div>
          <div class="col-total text-right">
            <span v-if="getRowTotal(row) !== null" class="font-weight-medium">
              {{
                getRowTotal(row)!.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              }}
              <span class="text-caption text-medium-emphasis ml-1">{{ currency }}</span>
            </span>
          </div>
          <div class="col-actions">
            <v-btn
              v-if="rows.length > 1 && index < rows.length - 1"
              icon
              size="x-small"
              variant="text"
              color="error"
              @click="removeRow(index)"
            >
              <v-icon size="small">mdi-close</v-icon>
            </v-btn>
          </div>
        </div>

        <!-- Total -->
        <v-divider class="my-3" />
        <div class="calc-total d-flex align-center justify-end">
          <span class="font-weight-bold mr-4">Total:</span>
          <span class="font-weight-bold text-h6">
            {{
              grandTotal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }}
            <span class="text-caption text-medium-emphasis ml-1">{{ currency }}</span>
          </span>
        </div>
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-btn variant="outlined" prepend-icon="mdi-plus" @click="addRow"> Add Row </v-btn>
        <v-btn
          variant="outlined"
          prepend-icon="mdi-delete-outline"
          :disabled="!hasFilledRows"
          @click="clearAll"
        >
          Clear
        </v-btn>
        <v-menu>
          <template #activator="{ props: menuProps }">
            <v-btn variant="outlined" prepend-icon="mdi-import" v-bind="menuProps"> Import </v-btn>
          </template>
          <v-list density="compact">
            <v-list-item
              prepend-icon="mdi-clipboard-list"
              title="From Shopping List"
              @click="showListPickerDialog = true"
            />
            <v-list-item
              prepend-icon="mdi-clipboard-text"
              title="From Clipboard"
              @click="showPasteDialog = true"
            />
          </v-list>
        </v-menu>
        <v-spacer />
        <v-btn
          variant="tonal"
          prepend-icon="mdi-content-copy"
          :disabled="!hasFilledRows"
          @click="copyAmounts"
        >
          Copy Amounts
        </v-btn>
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-content-copy"
          :disabled="!hasFilledRows"
          @click="copyAll"
        >
          Copy All
        </v-btn>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-content-save"
          :disabled="!hasFilledRows"
          @click="showSaveDialog = true"
        >
          Save as List
        </v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          prepend-icon="mdi-send"
          :disabled="!hasFilledRows"
          @click="sendToMarket"
        >
          Send to Market
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- Import dialogs -->
    <ImportPasteDialog v-model="showPasteDialog" @import="handleImportFromPaste" />
    <ImportFromListDialog v-model="showListPickerDialog" @import="handleImportFromList" />

    <!-- Save as shopping list dialog -->
    <SaveListDialog
      v-model="showSaveDialog"
      :current-name="importedListName"
      :is-update="!!importedListId"
      @save="handleSaveAsList"
    />

    <!-- Replace confirmation dialog -->
    <v-dialog v-model="showReplaceConfirm" max-width="350">
      <v-card>
        <v-card-title>Replace existing rows?</v-card-title>
        <v-card-text>
          This will replace your {{ filledRowCount }} existing rows with the imported materials.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelImport">Cancel</v-btn>
          <v-btn color="primary" variant="flat" @click="confirmImport">Replace</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import type { Currency } from '@kawakawa/types'
import { api, type EffectivePrice } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useSnackbar, useDisplayHelpers, useCargoHold, useCalculatorImport } from '../composables'
import type { CargoHoldRow } from '../composables'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import CommodityIcon from '../components/CommodityIcon.vue'
import ImportPasteDialog from '../components/ImportPasteDialog.vue'
import ImportFromListDialog from '../components/ImportFromListDialog.vue'
import SaveListDialog from '../components/SaveListDialog.vue'

interface CalculatorRow extends CargoHoldRow {
  id: number
}

interface PriceListOption {
  title: string
  value: string
  currency: Currency
  defaultLocationId: string | null
}

const router = useRouter()
const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getLocationDisplay, getCommodityDisplay } = useDisplayHelpers()

// Get commodity object for icon display
const getCommodity = (ticker: string) => {
  const category = commodityService.getCommodityCategory(ticker)
  if (category === null) return null
  return {
    ticker,
    name: commodityService.getCommodityDisplay(ticker, 'name-only'),
    category,
  }
}

// Check if commodity icons are enabled
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

// Price list state
const loadingPriceLists = ref(false)
const priceLists = ref<PriceListOption[]>([])
const selectedPriceList = ref<string | null>(null)

// Location state
const loadingLocations = ref(false)
const locations = ref<KeyValueItem[]>([])
const selectedLocation = ref<string | null>(null)

// Effective prices state
const loadingPrices = ref(false)
const effectivePrices = ref<EffectivePrice[]>([])

// LocalStorage key
const STORAGE_KEY = 'kawakawa-calculator-rows'

// Calculator rows
const nextRowId = { value: 1 }
const rows = ref<CalculatorRow[]>(loadRowsFromStorage())

function loadRowsFromStorage(): CalculatorRow[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as CalculatorRow[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Update nextRowId to be higher than any existing id
        nextRowId.value = Math.max(...parsed.map(r => r.id)) + 1
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return [{ id: nextRowId.value++, commodityTicker: null, amount: null }]
}

function saveRowsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.value))
  } catch {
    // Ignore storage errors
  }
}

// Refs for focus management - using ComponentPublicInstance for template refs
interface FocusableComponent {
  focus?: () => void
}
const materialRefs = ref<Record<number, FocusableComponent | null>>({})
const amountRefs = ref<Record<number, FocusableComponent | null>>({})
const ratioRefs = ref<Record<number, FocusableComponent | null>>({})

const setMaterialRef = (index: number, el: FocusableComponent | null) => {
  materialRefs.value[index] = el
}

const setAmountRef = (index: number, el: FocusableComponent | null) => {
  amountRefs.value[index] = el
}

const setRatioRef = (index: number, el: FocusableComponent | null) => {
  ratioRefs.value[index] = el
}

// Select input value on focus for easy type-over
const selectOnFocus = (event: FocusEvent) => {
  const input = (event.target as HTMLElement)?.querySelector?.('input') ?? (event.target as HTMLInputElement)
  input?.select?.()
}

// Computed values
const priceListOptions = computed(() =>
  priceLists.value.map(pl => ({
    title: `${pl.title} (${pl.currency})`,
    value: pl.value,
  }))
)

const locationOptions = computed((): KeyValueItem[] => locations.value)

const commodityOptions = computed((): KeyValueItem[] => {
  const commodities = commodityService.getAllCommoditiesSync()
  return commodities.map(c => ({
    key: c.ticker,
    display: getCommodityDisplay(c.ticker),
    name: c.name,
    category: c.category,
  }))
})

const selectedPriceListData = computed(() =>
  priceLists.value.find(pl => pl.value === selectedPriceList.value)
)

const currency = computed(() => selectedPriceListData.value?.currency ?? 'CIS')

const hasFallbackPrices = computed(() => effectivePrices.value.some(p => p.isFallback))

const fallbackLocationDisplay = computed(() => {
  const defaultLocId = selectedPriceListData.value?.defaultLocationId
  return defaultLocId ? getLocationDisplay(defaultLocId) : 'default location'
})

const priceMap = computed(() => {
  const map = new Map<string, number>()
  for (const price of effectivePrices.value) {
    map.set(price.commodityTicker, price.finalPrice)
  }
  return map
})

const getUnitPrice = (ticker: string | null): number | null => {
  if (!ticker) return null
  return priceMap.value.get(ticker) ?? null
}

const getRowTotal = (row: CalculatorRow): number | null => {
  const price = getUnitPrice(row.commodityTicker)
  if (price === null || !row.amount) return null
  return price * row.amount
}

const grandTotal = computed(() => {
  let total = 0
  for (const row of rows.value) {
    const rowTotal = getRowTotal(row)
    if (rowTotal !== null) {
      total += rowTotal
    }
  }
  return total
})

const hasFilledRows = computed(() =>
  rows.value.some(r => r.commodityTicker && r.amount && r.amount > 0)
)

// Cargo hold composable
const {
  selectedShip,
  hoveredShip,
  isCustomEditable,
  isHoverPreview,
  shipOptions,
  displayWeight,
  displayVolume,
  onCustomWeightChange,
  onCustomVolumeChange,
  cargoCapacity,
  getRowWeight,
  getRowVolume,
  getRowRatio,
  calculateAmountFromRatio,
  totalWeight,
  totalVolume,
  weightFillPercent,
  volumeFillPercent,
  weightFillColor,
  volumeFillColor,
  tripsNeeded,
} = useCargoHold(rows)

// Ratio input: back-calculate quantity from a target ratio %
const onRatioChange = (index: number, value: string | number | null) => {
  const row = rows.value[index]
  const ratio = typeof value === 'string' ? parseFloat(value) : value
  if (!row.commodityTicker || !ratio || ratio <= 0) return
  const amount = calculateAmountFromRatio(row.commodityTicker, ratio)
  if (amount !== null) row.amount = amount
  if (index === rows.value.length - 1) ensureEmptyLastRow()
}

// Load price lists
const loadPriceLists = async () => {
  try {
    loadingPriceLists.value = true
    const data = await api.priceLists.list()
    priceLists.value = data.map(pl => ({
      title: pl.name,
      value: pl.code,
      currency: pl.currency,
      defaultLocationId: pl.defaultLocationId,
    }))

    // Set default from user settings
    const defaultPriceList = settingsStore.defaultPriceList.value
    if (defaultPriceList && priceLists.value.some(pl => pl.value === defaultPriceList)) {
      selectedPriceList.value = defaultPriceList
    } else if (priceLists.value.length > 0) {
      selectedPriceList.value = priceLists.value[0].value
    }
  } catch (error) {
    console.error('Failed to load price lists', error)
    showSnackbar('Failed to load price lists', 'error')
  } finally {
    loadingPriceLists.value = false
  }
}

// Load locations
const loadLocations = async () => {
  try {
    loadingLocations.value = true
    const [data] = await Promise.all([
      locationService.getAllLocations(),
      locationService.loadUserLocations(),
    ])
    locations.value = data.map(l => ({
      key: l.id,
      display: locationService.getLocationDisplay(l.id, userStore.getLocationDisplayMode()),
      locationType: l.type,
      isUserLocation: locationService.isUserLocation(l.id),
      storageTypes: locationService.getStorageTypes(l.id),
    }))

    // Set default location from price list's default
    if (selectedPriceListData.value?.defaultLocationId) {
      selectedLocation.value = selectedPriceListData.value.defaultLocationId
    } else if (locations.value.length > 0) {
      selectedLocation.value = locations.value[0].key
    }
  } catch (error) {
    console.error('Failed to load locations', error)
    showSnackbar('Failed to load locations', 'error')
  } finally {
    loadingLocations.value = false
  }
}

// Load effective prices
const loadEffectivePrices = async () => {
  if (!selectedPriceList.value || !selectedLocation.value) {
    effectivePrices.value = []
    return
  }

  try {
    loadingPrices.value = true
    effectivePrices.value = await api.prices.getEffective(
      selectedPriceList.value,
      selectedLocation.value,
      currency.value
    )
  } catch (error) {
    console.error('Failed to load effective prices', error)
    showSnackbar('Failed to load prices', 'error')
    effectivePrices.value = []
  } finally {
    loadingPrices.value = false
  }
}

// Row management
const addRow = () => {
  rows.value.push({ id: nextRowId.value++, commodityTicker: null, amount: null })
  // Focus the new row's material field
  nextTick(() => {
    const newIndex = rows.value.length - 1
    materialRefs.value[newIndex]?.focus?.()
  })
}

const removeRow = (index: number) => {
  rows.value.splice(index, 1)
}

const ensureEmptyLastRow = () => {
  const lastRow = rows.value[rows.value.length - 1]
  if (lastRow.commodityTicker || (lastRow.amount && lastRow.amount > 0)) {
    rows.value.push({ id: nextRowId.value++, commodityTicker: null, amount: null })
  }
}

const onMaterialChange = (index: number) => {
  if (index === rows.value.length - 1) {
    ensureEmptyLastRow()
  }
  // Focus the amount field after selecting a commodity
  nextTick(() => {
    amountRefs.value[index]?.focus?.()
  })
}

const onAmountChange = (index: number) => {
  if (index === rows.value.length - 1) {
    ensureEmptyLastRow()
  }
}

// Focus material field in next row, or wrap to top if last row is empty
const focusNextRowMaterial = (currentIndex: number) => {
  const nextIndex = currentIndex + 1
  const lastRow = rows.value[rows.value.length - 1]
  const lastRowIsEmpty = !lastRow.commodityTicker && (!lastRow.amount || lastRow.amount <= 0)

  if (nextIndex >= rows.value.length) {
    if (lastRowIsEmpty) {
      // Wrap to the first row
      nextTick(() => {
        materialRefs.value[0]?.focus?.()
      })
    } else {
      addRow()
    }
  } else {
    nextTick(() => {
      materialRefs.value[nextIndex]?.focus?.()
    })
  }
}

const onMaterialTab = (event: globalThis.KeyboardEvent, index: number) => {
  if (!event.shiftKey) {
    // Forward tab: focus amount field in same row
    event.preventDefault()
    nextTick(() => {
      amountRefs.value[index]?.focus?.()
    })
  }
}

const onAmountTab = (event: globalThis.KeyboardEvent, index: number) => {
  if (!event.shiftKey) {
    const row = rows.value[index]
    // If ratio field is visible for this row, tab into it
    if (cargoCapacity.value && row.commodityTicker) {
      event.preventDefault()
      nextTick(() => {
        ratioRefs.value[index]?.focus?.()
      })
      return
    }
    event.preventDefault()
    focusNextRowMaterial(index)
  }
}

const onRatioTab = (event: globalThis.KeyboardEvent, index: number) => {
  if (!event.shiftKey) {
    event.preventDefault()
    focusNextRowMaterial(index)
  }
}

// Copy amounts only (space-separated: "TIC 100")
const copyAmounts = async () => {
  const text = rows.value
    .filter(r => r.commodityTicker && r.amount && r.amount > 0)
    .map(r => `${r.commodityTicker} ${r.amount}`)
    .join('\n')

  try {
    await navigator.clipboard.writeText(text)
    showSnackbar('Copied to clipboard')
  } catch (error) {
    console.error('Failed to copy to clipboard', error)
    showSnackbar('Failed to copy to clipboard', 'error')
  }
}

// Copy all data (CSV with ticker, amount, unit price, total)
const copyAll = async () => {
  const filledRows = rows.value.filter(r => r.commodityTicker && r.amount && r.amount > 0)
  const lines = filledRows.map(r => {
    const unitPrice = getUnitPrice(r.commodityTicker)
    const total = getRowTotal(r)
    return `${r.commodityTicker},${r.amount},${unitPrice ?? ''},${total ?? ''}`
  })
  const csv = `Ticker,Amount,Unit Price,Total\n${lines.join('\n')}\nTotal,,,${grandTotal.value}`

  try {
    await navigator.clipboard.writeText(csv)
    showSnackbar('Copied to clipboard')
  } catch (error) {
    console.error('Failed to copy to clipboard', error)
    showSnackbar('Failed to copy to clipboard', 'error')
  }
}

// Clear all rows
const clearAll = () => {
  rows.value = [{ id: nextRowId.value++, commodityTicker: null, amount: null }]
  clearImportSource()
  saveRowsToStorage()
}

// Import/save composable
const {
  showPasteDialog,
  showListPickerDialog,
  showSaveDialog,
  showReplaceConfirm,
  importedListName,
  importedListId,
  filledRowCount,
  handleImportFromPaste,
  handleImportFromList,
  confirmImport,
  cancelImport,
  handleSaveAsList,
  sendToMarket,
  clearImportSource,
} = useCalculatorImport(rows, hasFilledRows, nextRowId, showSnackbar, router)

// Watch for price list changes to update default location
watch(selectedPriceList, newPriceList => {
  if (newPriceList) {
    const priceListData = priceLists.value.find(pl => pl.value === newPriceList)
    if (priceListData?.defaultLocationId) {
      selectedLocation.value = priceListData.defaultLocationId
    }
  }
})

// Watch for price list or location changes to reload prices
watch([selectedPriceList, selectedLocation], () => {
  loadEffectivePrices()
})

// Watch rows to persist to localStorage
watch(
  rows,
  () => {
    saveRowsToStorage()
  },
  { deep: true }
)

onMounted(async () => {
  await Promise.all([loadPriceLists(), loadLocations(), commodityService.prefetch()])
})
</script>

<style scoped>
/* Card responsive width and centering */
.calculator-card {
  width: 100%;
  margin-inline: auto;
}

@media (min-width: 1280px) {
  .calculator-card {
    width: 80%;
  }
}

@media (min-width: 1920px) {
  .calculator-card {
    width: 60%;
  }
}

/* Flex row layout */
.calc-header,
.calc-row {
  gap: 0.75rem;
}

.calc-row {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.calc-row:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

/* Column flex sizing */
.col-icon {
  flex: 0 0 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.col-material {
  flex: 1 1 auto;
  min-width: 0;
}

.col-amount {
  flex: 0 0 10rem;
}

.col-wt,
.col-vol {
  flex: 0 0 5rem;
}

.col-ratio {
  flex: 0 0 5rem;
}

.col-price,
.col-total {
  flex: 0 0 10rem;
}

.col-actions {
  flex: 0 0 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Icon styling */
.row-icon {
  width: 28px;
  height: 28px;
}

/* Cargo Hold bar layout */
.cargo-hold-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem !important;
}

.cargo-hold-select {
  flex: 0 0 22rem;
  min-width: 14rem;
}

.cargo-hold-capacity {
  flex: 0 0 6rem;
}

.cargo-hold-stats {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
  font-size: 0.85rem;
}

.cargo-hold-spacer {
  flex: 1 1 auto;
}

.cargo-hold-ratio {
  flex: 0 0 auto;
}

.cargo-icon {
  width: 28px;
  height: 28px;
}

.cargo-icon-sm {
  width: 20px;
  height: 20px;
}

/* Capacity inputs */
.capacity-input :deep(.v-field__input) {
  text-align: right;
  font-size: 0.85rem;
  padding-top: 4px;
  padding-bottom: 4px;
}

/* Hover preview: subtle highlight to indicate values are temporary */
.capacity-preview :deep(.v-field) {
  border-color: rgba(var(--v-theme-primary), 0.5);
}

.capacity-preview :deep(.v-field__input) {
  color: rgb(var(--v-theme-primary));
}

/* Input styling */
.amount-input :deep(.v-field__input),
.ratio-input :deep(.v-field__input) {
  text-align: right;
}

/* Remove number input spinners */
.amount-input :deep(input[type='number']),
.ratio-input :deep(input[type='number']),
.capacity-input :deep(input[type='number']) {
  -moz-appearance: textfield;
}

.amount-input :deep(input[type='number']::-webkit-outer-spin-button),
.amount-input :deep(input[type='number']::-webkit-inner-spin-button),
.ratio-input :deep(input[type='number']::-webkit-outer-spin-button),
.ratio-input :deep(input[type='number']::-webkit-inner-spin-button),
.capacity-input :deep(input[type='number']::-webkit-outer-spin-button),
.capacity-input :deep(input[type='number']::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .col-price,
  .col-wt,
  .col-vol,
  .col-ratio {
    display: none;
  }

  .col-amount,
  .col-total {
    flex-basis: 4.5rem;
  }
}
</style>
