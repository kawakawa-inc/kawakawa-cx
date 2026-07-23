<template>
  <v-container fluid>
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-1">
      <h1 class="text-h4">New Sales Order</h1>
      <v-btn variant="text" size="small" prepend-icon="mdi-format-list-checks" to="/sales-orders">
        View Queue
      </v-btn>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">
      Add packages and quantities, then submit to the team queue so a member with stock can pick it
      up and fulfill it.
    </p>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Pricing context: which price list / version / location the package
         sale prices and materials are computed against. -->
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center flex-wrap ga-2">
        <span class="text-caption text-medium-emphasis">Priced against</span>

        <template v-if="editingPriceList">
          <v-select
            v-model="selectedPriceList"
            :items="priceListOptions"
            item-title="title"
            item-value="value"
            label="Price List"
            density="compact"
            hide-details
            autofocus
            :loading="loadingPriceLists"
            style="max-width: 240px"
            @update:model-value="editingPriceList = false"
            @blur="editingPriceList = false"
          />
        </template>
        <template v-else>
          <v-chip color="indigo" size="small" class="pl-chip">
            <span>{{ selectedPriceListLabel }}</span>
            <v-menu>
              <template #activator="{ props: menuProps }">
                <button
                  type="button"
                  class="pl-chip-version"
                  v-bind="menuProps"
                  @click.stop
                  @mousedown.stop
                >
                  <span class="pl-chip-version-inner">
                    <v-icon size="x-small" start>mdi-source-branch</v-icon>
                    {{ selectedVersionLabel }}
                  </span>
                </button>
              </template>
              <v-list density="compact" min-width="200">
                <v-list-subheader>Price List Version</v-list-subheader>
                <v-list-item :active="selectedVersion === null" @click="selectedVersion = null">
                  <v-list-item-title>Current (latest promoted)</v-list-item-title>
                </v-list-item>
                <v-divider />
                <v-list-item
                  v-for="opt in versionsForSelectedList"
                  :key="opt.value"
                  :active="selectedVersion === Number(opt.value)"
                  @click="selectedVersion = Number(opt.value)"
                >
                  <v-list-item-title>{{ opt.display }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </v-chip>
          <v-btn
            icon="mdi-pencil"
            size="x-small"
            variant="text"
            title="Change price list"
            @click="editingPriceList = true"
          />
        </template>

        <v-divider vertical class="mx-1" />

        <KeyValueAutocomplete
          v-model="selectedLocation"
          :items="locationOptions"
          :favorites="settingsStore.favoritedLocations.value"
          label="Location"
          density="compact"
          hide-details
          style="max-width: 240px"
          @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
        />
      </v-card-title>
    </v-card>

    <!-- Packages: add via a single autocomplete; each add appends an editable
         row. Static label + qty + price + total, matching the package editor. -->
    <v-card class="mb-4">
      <v-card-text>
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
          <span class="text-subtitle-2">Packages</span>
          <KeyValueAutocomplete
            :key="addPackageKey"
            :model-value="null"
            :items="addPackageOptions"
            label="Add a package…"
            density="compact"
            hide-details
            show-icons
            style="min-width: 280px; max-width: 360px"
            :disabled="addPackageOptions.length === 0"
            @update:model-value="onAddPackage"
          />
        </div>

        <div v-if="lineRows.length === 0" class="text-body-2 text-medium-emphasis py-2">
          No packages yet — use “Add a package” above to start the order.
        </div>

        <template v-else>
          <div class="inv-header d-flex align-center text-caption text-medium-emphasis mb-1">
            <span class="col-package">Package</span>
            <span class="col-qty text-right">Qty</span>
            <span class="col-price text-right">Unit Price</span>
            <span class="col-total text-right">Line Total</span>
            <span class="col-actions"></span>
          </div>

          <div v-for="row in lineRows" :key="row.id" class="inv-row d-flex align-center">
            <div class="col-package">
              <PackageLabel
                :name="row.packageName"
                :icon-commodity-ticker="row.iconCommodityTicker"
                class="font-weight-medium"
              />
              <v-chip size="x-small" variant="tonal" class="ml-1">{{ row.type }}</v-chip>
              <v-tooltip v-if="row.unitPrice === null" location="top">
                <template #activator="{ props: tp }">
                  <v-icon v-bind="tp" size="small" color="warning" class="ml-1">
                    mdi-alert-circle
                  </v-icon>
                </template>
                No listed sale price — excluded from the order total.
              </v-tooltip>
            </div>
            <v-text-field
              v-model.number="row.quantity"
              type="number"
              min="1"
              density="compact"
              hide-details
              variant="outlined"
              class="col-qty"
            />
            <span class="col-price text-right">
              <span v-if="row.unitPrice !== null">{{ formatMoney(row.unitPrice) }}</span>
              <span v-else class="text-warning text-caption">not listed</span>
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
              @click="removeRow(row.id)"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </div>
        </template>
      </v-card-text>
    </v-card>

    <!-- Customer / order details -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="customerName"
              label="Customer (optional)"
              placeholder="e.g. Discord handle / corp name"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="notes" label="Notes (optional)" density="compact" hide-details />
          </v-col>
        </v-row>
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
          density="compact"
          hide-details
          clearable
          class="pickup-location-select"
          @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
        />
        <template v-if="pickupLocationId">
          <span v-if="pickupCurrencyMismatch" class="text-warning text-body-2">
            Fee is in {{ pickupFeeCurrency }}, order is in {{ currency }} — can't combine.
          </span>
          <span v-else class="text-body-2">
            <span class="text-medium-emphasis mr-1">Shipping surcharge:</span>
            <span class="font-weight-medium" :class="pickupFee > 0 ? '' : 'text-success'">
              {{ pickupFee > 0 ? '+' : '' }}{{ formatMoney(pickupFee) }} {{ currency }}
            </span>
          </span>
        </template>
        <v-spacer />
        <v-btn
          v-if="canManagePickupFees"
          size="small"
          variant="text"
          prepend-icon="mdi-truck-fast-outline"
          @click="pickupLocationDialog = true"
        >
          Manage Fees
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Summary + submit -->
    <v-card class="mb-4">
      <v-card-text>
        <div class="d-flex align-center justify-space-between mb-3">
          <span class="text-subtitle-2">Order Summary</span>
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-send"
            :loading="submitting"
            :disabled="lineRows.length === 0"
            @click="submitOrder"
          >
            Submit to Queue
          </v-btn>
        </div>

        <v-row dense>
          <v-col cols="6" sm="3">
            <div class="text-caption text-medium-emphasis">Packages Subtotal</div>
            <div class="text-h6">{{ formatMoney(totalSalePrice) }} {{ currency }}</div>
          </v-col>
          <v-col cols="6" sm="3">
            <div class="text-caption text-medium-emphasis">Pickup Fee</div>
            <div class="text-h6">
              <template v-if="pickupLocationId && !pickupCurrencyMismatch">
                {{ formatMoney(pickupFee) }} {{ currency }}
              </template>
              <template v-else>—</template>
            </div>
          </v-col>
          <v-col cols="6" sm="3">
            <div class="text-caption text-medium-emphasis">Order Total</div>
            <div class="text-h6 font-weight-bold">{{ formatMoney(grandTotal) }} {{ currency }}</div>
          </v-col>
          <v-col cols="6" sm="3">
            <div class="text-caption text-medium-emphasis">Est. Margin</div>
            <div
              class="text-h6"
              :class="totalMargin >= 0 ? 'text-success' : 'text-error'"
              :title="'Packages subtotal minus material cost (excludes pickup fee)'"
            >
              {{ totalMargin >= 0 ? '+' : '' }}{{ formatMoney(totalMargin) }} {{ currency }}
            </div>
          </v-col>
        </v-row>

        <v-alert
          v-if="unlistedPackageNames.length > 0"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          {{ unlistedPackageNames.join(', ') }}
          {{ unlistedPackageNames.length > 1 ? 'have' : 'has' }} no listed sale price and
          {{ unlistedPackageNames.length > 1 ? 'are' : 'is' }} excluded from the order total.
        </v-alert>
      </v-card-text>
    </v-card>

    <!-- Combined materials: fulfillment view (what KAWA needs to source). -->
    <v-card>
      <v-card-text>
        <div class="d-flex align-center justify-space-between">
          <div class="d-flex align-center ga-2">
            <v-btn
              :icon="showMaterials ? 'mdi-chevron-down' : 'mdi-chevron-right'"
              size="small"
              variant="text"
              @click="showMaterials = !showMaterials"
            />
            <span class="text-subtitle-2">Combined Materials</span>
            <span v-if="combinedMaterials.length > 0" class="text-caption text-medium-emphasis">
              ({{ combinedMaterials.length }} materials · {{ formatMoney(totalMaterialCost) }}
              {{ currency }})
            </span>
          </div>
          <v-btn
            size="small"
            variant="text"
            prepend-icon="mdi-content-copy"
            :disabled="combinedMaterials.length === 0"
            @click="copyMaterials"
          >
            Copy Materials
          </v-btn>
        </div>

        <v-expand-transition>
          <div v-show="showMaterials">
            <v-table v-if="combinedMaterials.length > 0" density="compact" class="mt-2">
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
            <p v-else class="text-body-2 text-medium-emphasis mt-2 mb-0">
              Add a package above to see its combined materials here.
            </p>
          </div>
        </v-expand-transition>
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
import { useRouter } from 'vue-router'
import { PERMISSIONS } from '@kawakawa/types'
import {
  api,
  type PackagePriceBreakdown,
  type PickupLocationResponse,
  type CreatePickupLocationRequest,
} from '../services/api'
import { locationService } from '../services/locationService'
import { useSnackbar, useDisplayHelpers, useUrlState } from '../composables'
import { useSettingsStore } from '../stores/settings'
import { useUserStore } from '../stores/user'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import PackageLabel from '../components/PackageLabel.vue'
import PickupLocationEditDialog from '../components/PickupLocationEditDialog.vue'
import { commodityService } from '../services/commodityService'

const router = useRouter()
const { snackbar, showSnackbar } = useSnackbar()
const { getCommodityDisplay, getLocationDisplay } = useDisplayHelpers()
const settingsStore = useSettingsStore()
const userStore = useUserStore()

// Managing pick-up locations/fees shares the `packages.manage` permission
// (Team Leads + Administrators) — a plain member can view fees but not
// create/edit/delete them, so hide the entry point entirely for them.
const canManagePickupFees = computed(() => userStore.hasPermission(PERMISSIONS.PACKAGES_MANAGE))

// Customer/order metadata
const customerName = ref('')
const notes = ref('')
const submitting = ref(false)

// Pricing context — URL-synced so a quote can be linked/bookmarked. A
// package's sale price/materials are only meaningful against a specific
// list/version/location.
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
const editingPriceList = ref(false)

const priceLists = ref<
  { title: string; value: string; currency: string; defaultLocationId: string }[]
>([])
const locations = ref<KeyValueItem[]>([])
const versionsForSelectedList = ref<{ value: string; display: string }[]>([])
const loadingPriceLists = ref(false)

const breakdowns = ref<PackagePriceBreakdown[]>([])
const showMaterials = ref(false)

// Pick-up location: a flat shipping surcharge for the whole order (not any
// one package) — a property of the location, shared across every order.
const pickupLocations = ref<PickupLocationResponse[]>([])
const pickupLocationId = ref<string | null>(null)
const pickupLocationDialog = ref(false)
const savingPickupLocation = ref(false)

const priceListOptions = computed(() =>
  priceLists.value.map(pl => ({ title: `${pl.title} (${pl.currency})`, value: pl.value }))
)
const selectedPriceListData = computed(
  () => priceLists.value.find(pl => pl.value === selectedPriceList.value) ?? null
)
const selectedPriceListLabel = computed(() => {
  const pl = selectedPriceListData.value
  return pl ? `${pl.title} (${pl.currency})` : 'None'
})
const selectedVersionLabel = computed(() =>
  selectedVersion.value !== null ? `v${selectedVersion.value}` : 'Current'
)
const locationOptions = computed((): KeyValueItem[] => locations.value)
const currency = computed(() => selectedPriceListData.value?.currency ?? '')

const breakdownById = computed(() => new Map(breakdowns.value.map(b => [b.packageId, b])))

// Options for the "Add a package" box — every package not already on the
// order (a package appears at most once; bump its qty instead).
const addPackageOptions = computed((): KeyValueItem[] => {
  const used = new Set(rows.value.map(r => r.packageId))
  return breakdowns.value
    .filter(b => !used.has(b.packageId))
    .map(b => {
      const category = b.iconCommodityTicker
        ? commodityService.getCommodityCategory(b.iconCommodityTicker)
        : null
      return {
        key: String(b.packageId),
        display: `${b.packageName} (${b.type})`,
        iconTicker: category ? b.iconCommodityTicker! : undefined,
        category: category ?? undefined,
      }
    })
})

// Order rows: one per package + quantity. A package appears at most once.
interface OrderRow {
  id: number
  packageId: number
  quantity: number
}
let nextRowId = 1
const rows = ref<OrderRow[]>([])

// Bump the autocomplete's key to force-clear its selection after each add, so
// it reads "Add a package…" again rather than holding the last pick.
const addPackageKey = ref(0)

const onAddPackage = (value: string | string[] | null) => {
  if (!value || Array.isArray(value)) return
  const packageId = Number(value)
  if (!rows.value.some(r => r.packageId === packageId)) {
    rows.value.push({ id: nextRowId++, packageId, quantity: 1 })
  }
  addPackageKey.value++
}

interface OrderRowView extends OrderRow {
  packageName: string
  type: string
  iconCommodityTicker: string | null
  unitPrice: number | null // the package's own sale price, not material cost
  lineTotal: number | null
}

const lineRows = computed((): OrderRowView[] =>
  rows.value.map(row => {
    const breakdown = breakdownById.value.get(row.packageId)
    const unitPrice = breakdown?.salePrice ?? null
    const qty = row.quantity > 0 ? row.quantity : 0
    const lineTotal = unitPrice !== null ? Math.round(unitPrice * qty * 100) / 100 : null
    return {
      ...row,
      packageName: breakdown?.packageName ?? `#${row.packageId}`,
      type: breakdown?.type ?? '',
      iconCommodityTicker: breakdown?.iconCommodityTicker ?? null,
      unitPrice,
      lineTotal,
    }
  })
)

const unlistedPackageNames = computed(() =>
  lineRows.value.filter(r => r.quantity > 0 && r.unitPrice === null).map(r => r.packageName)
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
    if (row.quantity <= 0) continue
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
  () => Math.round(lineRows.value.reduce((sum, r) => sum + (r.lineTotal ?? 0), 0) * 100) / 100
)

// Margin is product-only (sale price vs. material cost) — the pickup fee
// covers shipping, not part of what a package "makes", so it's excluded here
// and folded into the Order Total instead.
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
    currency.value !== '' &&
    pickupFeeCurrency.value !== currency.value
)

const grandTotal = computed(() => {
  if (!pickupLocationId.value || pickupCurrencyMismatch.value) return totalSalePrice.value
  return Math.round((totalSalePrice.value + pickupFee.value) * 100) / 100
})

const formatMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const removeRow = (id: number) => {
  rows.value = rows.value.filter(r => r.id !== id)
}

// Submit the assembled order to the shared team queue. Prices are re-snapshotted
// server-side from the price list, so we only send package ids + quantities.
const submitOrder = async () => {
  if (!selectedPriceList.value || !selectedLocation.value) {
    showSnackbar('Pick a price list and location first', 'error')
    return
  }
  if (rows.value.length === 0) return
  submitting.value = true
  try {
    const order = await api.salesOrders.create({
      priceListCode: selectedPriceList.value,
      locationId: selectedLocation.value,
      version: selectedVersion.value ?? undefined,
      customerName: customerName.value.trim() || undefined,
      notes: notes.value.trim() || undefined,
      pickupLocationId: pickupLocationId.value ?? undefined,
      items: rows.value.map(r => ({ packageId: r.packageId, quantity: r.quantity })),
    })
    showSnackbar(`Sales order #${order.id} submitted to the queue`, 'success')
    router.push('/sales-orders')
  } catch (error) {
    console.error('Failed to submit sales order', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to submit sales order', 'error')
  } finally {
    submitting.value = false
  }
}

const copyMaterials = async () => {
  const lines = combinedMaterials.value.map(
    l => `${l.commodityTicker}\t${l.quantity}\t${l.unitPrice ?? ''}\t${l.lineTotal ?? ''}`
  )
  const text = `Ticker\tQty\tUnit Price\tLine Total\n${lines.join('\n')}`
  await copyToClipboard(text, 'Materials copied to clipboard')
}

const copyToClipboard = async (text: string, successMsg: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showSnackbar(successMsg)
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
    if (!selectedPriceList.value) {
      const preferred = settingsStore.defaultPriceList.value
      selectedPriceList.value =
        (preferred && priceLists.value.some(pl => pl.value === preferred) ? preferred : null) ??
        priceLists.value[0]?.value ??
        null
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
    locations.value = data.map(l => ({ key: l.id, display: getLocationDisplay(l.id) }))
    const pl = selectedPriceListData.value
    if (pl?.defaultLocationId && !selectedLocation.value) {
      selectedLocation.value = pl.defaultLocationId
    }
  } catch (error) {
    console.error('Failed to load locations', error)
    showSnackbar('Failed to load locations', 'error')
  }
}

const loadVersionsForSelectedList = async () => {
  if (!selectedPriceList.value) {
    versionsForSelectedList.value = []
    return
  }
  try {
    const versions = await api.priceLists.versions.list(selectedPriceList.value)
    versionsForSelectedList.value = versions.map(v => ({
      value: String(v.version),
      display: v.label ? `v${v.version}: ${v.label}` : `v${v.version}`,
    }))
    if (
      selectedVersion.value !== null &&
      !versions.some(v => v.version === selectedVersion.value)
    ) {
      selectedVersion.value = null
    }
  } catch (error) {
    console.error('Failed to load price list versions', error)
    versionsForSelectedList.value = []
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
  await loadVersionsForSelectedList()
  await loadPackagePrices()
})
watch([selectedLocation, selectedVersion], loadPackagePrices)

onMounted(async () => {
  await loadPriceLists()
  await Promise.all([loadLocations(), loadVersionsForSelectedList(), loadPickupLocations()])
  await loadPackagePrices()
})
</script>

<style scoped>
.pickup-location-select {
  min-width: 260px;
  max-width: 320px;
}

.inv-row {
  gap: 8px;
  padding: 4px 0;
}
.inv-row:not(:last-child) {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
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

/* Embedded version dropdown button inside the price-list chip (mirrors the
   Packages screen). Inverted fill so the version text stays legible. */
.pl-chip-version {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 0 6px;
  height: 20px;
  border: none;
  border-radius: 10px;
  background: currentColor;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.pl-chip-version-inner {
  display: inline-flex;
  align-items: center;
  color: rgb(var(--v-theme-surface));
  font-size: 0.75rem;
  font-weight: 500;
}
.pl-chip-version:hover {
  opacity: 0.85;
}
</style>
