<template>
  <v-container fluid>
    <h1 class="text-h4 mb-1">Invoice Builder</h1>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Select one or more packages and quantities to expand them into a combined material list and
      total price for a customer order. This is just a working calculation — nothing here is saved.
    </p>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Controls -->
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center flex-wrap ga-2">
        <v-select
          v-model="selectedPriceList"
          :items="priceListOptions"
          item-title="title"
          item-value="value"
          label="Price List"
          density="compact"
          hide-details
          :loading="loadingPriceLists"
          style="max-width: 220px"
        />
        <KeyValueAutocomplete
          v-model="selectedLocation"
          :items="locationOptions"
          label="Location"
          density="compact"
          hide-details
          style="max-width: 220px"
        />
        <v-text-field
          v-model.number="selectedVersion"
          label="Version"
          placeholder="Current"
          type="number"
          density="compact"
          hide-details
          clearable
          style="max-width: 140px"
        />
      </v-card-title>
    </v-card>

    <!-- Selected packages -->
    <v-card class="mb-4">
      <v-card-text>
        <div class="d-flex align-center justify-space-between mb-2">
          <span class="text-subtitle-2">Packages</span>
          <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="addRow">
            Add Package
          </v-btn>
        </div>

        <div
          v-if="rows.length > 0"
          class="invoice-header d-flex align-center text-caption text-medium-emphasis mb-1"
        >
          <span class="col-package">Package</span>
          <span class="col-qty text-right">Qty</span>
          <span class="col-price text-right">Unit Price</span>
          <span class="col-total text-right">Line Total</span>
          <span class="col-actions"></span>
        </div>

        <div
          v-for="(row, index) in invoiceRows"
          :key="row.id"
          class="invoice-row d-flex align-center"
        >
          <v-select
            v-model="row.packageId"
            :items="packageOptions"
            item-title="title"
            item-value="value"
            label="Package"
            density="compact"
            hide-details
            variant="outlined"
            class="col-package"
          />
          <v-text-field
            v-model.number="row.quantity"
            label="Qty"
            type="number"
            min="1"
            density="compact"
            hide-details
            variant="outlined"
            class="col-qty"
          />
          <span class="col-price text-right">
            <span v-if="row.unitPrice !== null">{{ formatMoney(row.unitPrice) }}</span>
            <span v-else-if="row.packageId" class="text-warning text-caption">not listed</span>
            <span v-else class="text-medium-emphasis">—</span>
          </span>
          <span class="col-total text-right font-weight-medium">
            <span v-if="row.lineTotal !== null">{{ formatMoney(row.lineTotal) }}</span>
            <span v-else class="text-medium-emphasis">—</span>
          </span>
          <v-btn
            icon
            size="small"
            variant="text"
            color="error"
            class="col-actions"
            :disabled="rows.length <= 1"
            @click="removeRow(index)"
          >
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </div>

        <v-alert
          v-if="unlistedPackageNames.length > 0"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-2"
        >
          {{ unlistedPackageNames.join(', ') }}
          {{ unlistedPackageNames.length > 1 ? 'have' : 'has' }} no listed sale price — the invoice
          total below excludes {{ unlistedPackageNames.length > 1 ? 'them' : 'it' }}.
        </v-alert>
      </v-card-text>
    </v-card>

    <!-- Pick-up location: a flat shipping surcharge for the whole order, not
         any one package (e.g. BEN is free, Proxion costs extra). -->
    <v-card class="mb-4">
      <v-card-text class="d-flex align-center flex-wrap ga-3">
        <KeyValueAutocomplete
          v-model="pickupLocationId"
          :items="locationOptions"
          :favorites="settingsStore.favoritedLocations.value"
          label="Pick-up Location (optional)"
          clearable
          class="pickup-location-select"
          @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
        />
        <template v-if="pickupLocationId">
          <span v-if="pickupCurrencyMismatch" class="text-warning text-body-2">
            Fee is in {{ pickupFeeCurrency }}, invoice is in {{ currency }} — can't combine.
          </span>
          <span v-else class="text-body-2">
            <span class="text-medium-emphasis mr-1">Shipping surcharge:</span>
            <span
              class="font-weight-medium"
              :class="pickupFee !== null && pickupFee > 0 ? '' : 'text-success'"
            >
              {{ pickupFee !== null && pickupFee > 0 ? '+' : '' }}{{ formatMoney(pickupFee ?? 0) }}
              {{ currency }}
            </span>
          </span>
        </template>
        <v-spacer />
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-truck-fast-outline"
          @click="pickupLocationDialog = true"
        >
          Manage Fees
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Combined materials -->
    <v-card class="mb-4">
      <v-card-text>
        <div class="d-flex align-center justify-space-between mb-2">
          <span class="text-subtitle-2">Combined Materials</span>
          <v-btn
            size="small"
            variant="text"
            prepend-icon="mdi-content-copy"
            :disabled="combinedMaterials.length === 0"
            @click="copyMaterials"
          >
            Copy
          </v-btn>
        </div>

        <v-table v-if="combinedMaterials.length > 0" density="compact">
          <thead>
            <tr>
              <th>Material</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in combinedMaterials" :key="line.commodityTicker">
              <td>{{ getCommodityDisplay(line.commodityTicker) }}</td>
              <td class="text-right">{{ line.quantity }}</td>
              <td class="text-right">
                <span v-if="line.unitPrice !== null">{{ formatMoney(line.unitPrice) }}</span>
                <span v-else class="text-warning text-caption">no price</span>
              </td>
              <td class="text-right">
                <span v-if="line.lineTotal !== null">{{ formatMoney(line.lineTotal) }}</span>
                <span v-else class="text-medium-emphasis">—</span>
              </td>
            </tr>
          </tbody>
        </v-table>
        <p v-else class="text-body-2 text-medium-emphasis mb-0">
          Add a package above to see its combined materials here.
        </p>
      </v-card-text>
    </v-card>

    <!-- Summary -->
    <v-card>
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="3">
            <div class="text-caption text-medium-emphasis">Material Cost</div>
            <div class="text-h6">{{ formatMoney(totalMaterialCost) }} {{ currency }}</div>
          </v-col>
          <v-col cols="12" sm="3">
            <div class="text-caption text-medium-emphasis">Pickup Fee</div>
            <div class="text-h6">
              {{ pickupLocationId && !pickupCurrencyMismatch ? formatMoney(pickupFee ?? 0) : '—' }}
              {{ pickupLocationId && !pickupCurrencyMismatch ? currency : '' }}
            </div>
          </v-col>
          <v-col cols="12" sm="3">
            <div class="text-caption text-medium-emphasis">Invoice Total</div>
            <div class="text-h6">{{ formatMoney(grandTotal) }} {{ currency }}</div>
          </v-col>
          <v-col cols="12" sm="3">
            <div class="text-caption text-medium-emphasis">Margin</div>
            <div class="text-h6" :class="totalMargin >= 0 ? 'text-success' : 'text-error'">
              {{ totalMargin >= 0 ? '+' : '' }}{{ formatMoney(totalMargin) }} {{ currency }}
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <PickupLocationEditDialog
      v-model="pickupLocationDialog"
      :existing-fees="pickupLocations"
      :saving="savingPickupLocation"
      :location-options="locationOptions"
      @save="handlePickupLocationSave"
      @delete="handlePickupLocationDelete"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  api,
  type PackagePriceBreakdown,
  type PickupLocationResponse,
  type CreatePickupLocationRequest,
} from '../services/api'
import { locationService } from '../services/locationService'
import { useSnackbar, useDisplayHelpers, useUrlState } from '../composables'
import { useSettingsStore } from '../stores/settings'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import PickupLocationEditDialog from '../components/PickupLocationEditDialog.vue'

const { snackbar, showSnackbar } = useSnackbar()
const { getCommodityDisplay, getLocationDisplay } = useDisplayHelpers()
const settingsStore = useSettingsStore()

// Controls — same price-list/location/version context as the Packages view,
// since a package's listed sale price/materials are only meaningful priced
// against a specific list/version/location.
const selectedPriceList = useUrlState<string | null>({ param: 'priceList', defaultValue: null })
const selectedLocation = useUrlState<string | null>({ param: 'location', defaultValue: null })
const selectedVersion = useUrlState<number | null>({
  param: 'version',
  defaultValue: null,
  transform: {
    toUrl: v => (v == null ? null : String(v)),
    fromUrl: v => (v == null || v === '' ? null : Number(v)),
  },
})

const priceLists = ref<
  { title: string; value: string; currency: string; defaultLocationId: string }[]
>([])
const locations = ref<KeyValueItem[]>([])
const loadingPriceLists = ref(false)

const breakdowns = ref<PackagePriceBreakdown[]>([])

// Pick-up location: a flat shipping surcharge for the whole order (not any
// one package) — a property of the location, shared across every invoice.
const pickupLocations = ref<PickupLocationResponse[]>([])
const pickupLocationId = ref<string | null>(null)
const pickupLocationDialog = ref(false)
const savingPickupLocation = ref(false)

const priceListOptions = computed(() =>
  priceLists.value.map(pl => ({ title: `${pl.title} (${pl.currency})`, value: pl.value }))
)
const locationOptions = computed((): KeyValueItem[] => locations.value)
const currency = computed(
  () => priceLists.value.find(pl => pl.value === selectedPriceList.value)?.currency ?? ''
)

const packageOptions = computed(() =>
  breakdowns.value.map(b => ({
    title: `${b.packageName} (${b.type})`,
    value: b.packageId,
  }))
)

// Invoice rows: one per package + quantity
interface InvoiceRow {
  id: number
  packageId: number | null
  quantity: number
}
let nextRowId = 1
const rows = ref<InvoiceRow[]>([{ id: nextRowId++, packageId: null, quantity: 1 }])

const breakdownById = computed(() => new Map(breakdowns.value.map(b => [b.packageId, b])))

interface InvoiceRowView extends InvoiceRow {
  unitPrice: number | null // the package's own sale price, not material cost
  lineTotal: number | null
}

const invoiceRows = computed((): InvoiceRowView[] =>
  rows.value.map(row => {
    const breakdown = row.packageId !== null ? breakdownById.value.get(row.packageId) : undefined
    const unitPrice = breakdown?.salePrice ?? null
    const lineTotal =
      unitPrice !== null && row.quantity > 0
        ? Math.round(unitPrice * row.quantity * 100) / 100
        : null
    return { ...row, unitPrice, lineTotal }
  })
)

const unlistedPackageNames = computed(() =>
  invoiceRows.value
    .filter(r => r.packageId !== null && r.quantity > 0 && r.unitPrice === null)
    .map(r => breakdownById.value.get(r.packageId as number)?.packageName ?? '')
    .filter(Boolean)
)

interface CombinedLine {
  commodityTicker: string
  quantity: number
  unitPrice: number | null
  lineTotal: number | null
}

const combinedMaterials = computed((): CombinedLine[] => {
  const totals = new Map<string, { quantity: number; unitPrice: number | null }>()
  for (const row of rows.value) {
    if (!row.packageId || row.quantity <= 0) continue
    const breakdown = breakdownById.value.get(row.packageId)
    if (!breakdown) continue
    for (const line of breakdown.lines) {
      const existing = totals.get(line.commodityTicker)
      const addedQty = line.quantity * row.quantity
      if (existing) {
        existing.quantity += addedQty
      } else {
        totals.set(line.commodityTicker, { quantity: addedQty, unitPrice: line.unitPrice })
      }
    }
  }
  return [...totals.entries()]
    .map(([commodityTicker, v]) => ({
      commodityTicker,
      quantity: v.quantity,
      unitPrice: v.unitPrice,
      lineTotal: v.unitPrice !== null ? Math.round(v.unitPrice * v.quantity * 100) / 100 : null,
    }))
    .sort((a, b) => a.commodityTicker.localeCompare(b.commodityTicker))
})

const totalMaterialCost = computed(
  () =>
    Math.round(combinedMaterials.value.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0) * 100) / 100
)

const totalSalePrice = computed(
  () => Math.round(invoiceRows.value.reduce((sum, r) => sum + (r.lineTotal ?? 0), 0) * 100) / 100
)

// Margin is product-only (sale price vs. material cost) — the pickup fee
// covers shipping, not part of what a package "makes", so it's excluded here
// and instead folded into the Invoice Total below.
const totalMargin = computed(
  () => Math.round((totalSalePrice.value - totalMaterialCost.value) * 100) / 100
)

const selectedPickupLocation = computed(
  () => pickupLocations.value.find(p => p.locationId === pickupLocationId.value) ?? null
)
// No configured fee for a location means free (e.g. BEN), not "unknown".
const pickupFee = computed(() => selectedPickupLocation.value?.extraFee ?? 0)
const pickupFeeCurrency = computed(() => selectedPickupLocation.value?.currency ?? null)
const pickupCurrencyMismatch = computed(
  () =>
    pickupFeeCurrency.value !== null &&
    currency.value !== null &&
    pickupFeeCurrency.value !== currency.value
)

const grandTotal = computed(() => {
  if (!pickupLocationId.value || pickupCurrencyMismatch.value) return totalSalePrice.value
  return Math.round((totalSalePrice.value + pickupFee.value) * 100) / 100
})

const formatMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const addRow = () => {
  rows.value.push({ id: nextRowId++, packageId: null, quantity: 1 })
}

const removeRow = (index: number) => {
  if (rows.value.length <= 1) return
  rows.value.splice(index, 1)
}

const copyMaterials = async () => {
  const lines = combinedMaterials.value.map(
    l => `${l.commodityTicker}\t${l.quantity}\t${l.unitPrice ?? ''}\t${l.lineTotal ?? ''}`
  )
  const text = `Ticker\tQty\tUnit Price\tLine Total\n${lines.join('\n')}`
  try {
    await navigator.clipboard.writeText(text)
    showSnackbar('Copied to clipboard')
  } catch (error) {
    console.error('Failed to copy to clipboard', error)
    showSnackbar('Failed to copy to clipboard', 'error')
  }
}

// Loading
const loadPriceLists = async () => {
  try {
    loadingPriceLists.value = true
    const data = await api.priceLists.list()
    priceLists.value = data.map(pl => ({
      title: pl.name,
      value: pl.code,
      currency: pl.currency,
      defaultLocationId: pl.defaultLocationId ?? '',
    }))
    if (priceLists.value.length > 0 && !selectedPriceList.value) {
      selectedPriceList.value = priceLists.value[0].value
    }
  } catch (error) {
    console.error('Failed to load price lists', error)
    showSnackbar('Failed to load price lists', 'error')
  } finally {
    loadingPriceLists.value = false
  }
}

const loadLocations = async () => {
  try {
    const data = await locationService.getAllLocations()
    locations.value = data.map(l => ({
      key: l.id,
      display: getLocationDisplay(l.id),
    }))
    const pl = priceLists.value.find(p => p.value === selectedPriceList.value)
    if (pl?.defaultLocationId && !selectedLocation.value) {
      selectedLocation.value = pl.defaultLocationId
    }
  } catch (error) {
    console.error('Failed to load locations', error)
    showSnackbar('Failed to load locations', 'error')
  }
}

const loadPickupLocations = async () => {
  try {
    pickupLocations.value = await api.pickupLocations.list()
  } catch (error) {
    console.error('Failed to load pickup locations', error)
  }
}

const handlePickupLocationSave = async (payload: CreatePickupLocationRequest) => {
  savingPickupLocation.value = true
  try {
    // createPickupLocation upserts by locationId, so this covers both a
    // brand-new fee and editing an existing one (the dialog itself decides
    // which based on whether the picked location already had a fee).
    await api.pickupLocations.create(payload)
    showSnackbar('Pickup location fee saved', 'success')
    pickupLocationDialog.value = false
    await loadPickupLocations()
  } catch (error) {
    console.error('Failed to save pickup location', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to save pickup location', 'error')
  } finally {
    savingPickupLocation.value = false
  }
}

const handlePickupLocationDelete = async (locationId: string) => {
  savingPickupLocation.value = true
  try {
    await api.pickupLocations.delete(locationId)
    showSnackbar('Pickup location deleted', 'success')
    pickupLocationDialog.value = false
    await loadPickupLocations()
  } catch (error) {
    console.error('Failed to delete pickup location', error)
    showSnackbar('Failed to delete pickup location', 'error')
  } finally {
    savingPickupLocation.value = false
  }
}

const loadPackagePrices = async () => {
  if (!selectedPriceList.value || !selectedLocation.value) {
    breakdowns.value = []
    return
  }
  try {
    breakdowns.value = await api.packages.getAllPrices(selectedPriceList.value, {
      locationId: selectedLocation.value,
      version: selectedVersion.value ?? undefined,
    })
  } catch (error) {
    console.error('Failed to load package prices', error)
    showSnackbar('Failed to load package prices', 'error')
    breakdowns.value = []
  }
}

watch(selectedPriceList, async newCode => {
  const pl = priceLists.value.find(p => p.value === newCode)
  if (pl?.defaultLocationId) {
    selectedLocation.value = pl.defaultLocationId
  }
  await loadPackagePrices()
})
watch([selectedLocation, selectedVersion], loadPackagePrices)

onMounted(async () => {
  await loadPriceLists()
  await Promise.all([loadLocations(), loadPickupLocations()])
  await loadPackagePrices()
})
</script>

<style scoped>
.pickup-location-select {
  min-width: 260px;
  max-width: 320px;
}

.invoice-row {
  gap: 8px;
  padding: 4px 0;
}

.col-package {
  flex: 1 1 auto;
  min-width: 0;
}
.col-qty {
  flex: 0 0 90px;
}
.col-price,
.col-total {
  flex: 0 0 120px;
}
.col-actions {
  flex: 0 0 40px;
}
</style>
