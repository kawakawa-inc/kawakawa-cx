<template>
  <v-container fluid>
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
        <v-select
          v-model="typeFilter"
          :items="typeFilterOptions"
          label="Type"
          density="compact"
          hide-details
          style="max-width: 140px"
        />
        <v-spacer />
        <span class="text-body-2 text-medium-emphasis"> {{ breakdowns.length }} package(s) </span>
        <v-btn v-if="canManagePackages" color="primary" size="small" @click="openCreateDialog">
          <v-icon start>mdi-plus</v-icon>
          New Package
        </v-btn>
      </v-card-title>
    </v-card>

    <!-- Comparison table -->
    <v-card>
      <v-data-table
        v-model:expanded="expandedRows"
        :headers="headers"
        :items="breakdowns"
        :loading="loading"
        :items-per-page="25"
        :row-props="getRowProps"
        item-value="packageId"
        show-expand
        class="elevation-0"
      >
        <template #item.data-table-expand="{ internalItem, isExpanded, toggleExpand }">
          <v-btn icon variant="text" size="small" @click.stop="toggleExpand(internalItem)">
            <v-icon>{{
              isExpanded(internalItem) ? 'mdi-chevron-down' : 'mdi-chevron-right'
            }}</v-icon>
          </v-btn>
        </template>

        <template #item.packageName="{ item }">
          <div class="d-flex align-center" style="gap: 6px">
            <span class="font-weight-medium">{{ item.packageName }}</span>
            <v-chip size="x-small" variant="tonal">{{ item.type }}</v-chip>
            <v-chip
              v-if="item.pricingMode === 'margin' && item.marginMultiplier !== null"
              size="x-small"
              variant="tonal"
              color="info"
            >
              ×{{ item.marginMultiplier.toFixed(2) }} margin
            </v-chip>
            <v-tooltip v-if="item.missingPriceTickers.length > 0" location="top">
              <template #activator="{ props: tooltipProps }">
                <v-icon v-bind="tooltipProps" size="small" color="warning">
                  mdi-alert-circle
                </v-icon>
              </template>
              Missing price for: {{ item.missingPriceTickers.join(', ') }}
            </v-tooltip>
            <v-tooltip v-if="item.currencyMismatch" location="top">
              <template #activator="{ props: tooltipProps }">
                <v-icon v-bind="tooltipProps" size="small" color="warning">
                  mdi-currency-usd-off
                </v-icon>
              </template>
              Sale price is in {{ item.saleCurrency }}, price list is in {{ item.currency }}
            </v-tooltip>
          </div>
        </template>

        <template #item.materialCost="{ item }">
          {{ formatMoney(item.materialCost) }} {{ item.currency }}
        </template>

        <template #item.salePrice="{ item }">
          <span v-if="item.salePrice !== null">
            {{ formatMoney(item.salePrice) }} {{ item.saleCurrency }}
          </span>
          <span v-else class="text-medium-emphasis">— not listed —</span>
        </template>

        <template #item.margin="{ item }">
          <span
            v-if="item.margin !== null"
            :class="item.margin >= 0 ? 'text-success' : 'text-error'"
          >
            {{ item.margin >= 0 ? '+' : '' }}{{ formatMoney(item.margin) }}
          </span>
          <span v-else class="text-medium-emphasis">—</span>
        </template>

        <template #item.marginPercent="{ item }">
          <span
            v-if="item.marginPercent !== null"
            :class="item.marginPercent >= 0 ? 'text-success' : 'text-error'"
          >
            {{ item.marginPercent >= 0 ? '+' : '' }}{{ item.marginPercent.toFixed(1) }}%
          </span>
          <span v-else class="text-medium-emphasis">—</span>
        </template>

        <template #item.actions="{ item }">
          <v-btn icon size="small" variant="text" @click="openEditDialog(item.packageId)">
            <v-icon size="small">mdi-pencil</v-icon>
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            color="error"
            @click="confirmDelete(item.packageId, item.packageName)"
          >
            <v-icon size="small">mdi-delete</v-icon>
          </v-btn>
        </template>

        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="pa-0">
              <v-table density="compact" class="bg-grey-darken-4">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th class="text-right">Qty</th>
                    <th class="text-right">Unit Price</th>
                    <th class="text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in item.lines" :key="line.commodityTicker">
                    <td>
                      {{ getCommodityDisplay(line.commodityTicker) }}
                      <v-chip v-if="line.isFallback" size="x-small" class="ml-1" variant="tonal">
                        fallback
                      </v-chip>
                    </td>
                    <td class="text-right">{{ line.quantity }}</td>
                    <td class="text-right">
                      <span v-if="line.unitPrice !== null">{{ formatMoney(line.unitPrice) }}</span>
                      <span v-else class="text-warning">no price</span>
                    </td>
                    <td class="text-right">
                      <span v-if="line.lineTotal !== null">{{ formatMoney(line.lineTotal) }}</span>
                      <span v-else class="text-medium-emphasis">—</span>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </td>
          </tr>
        </template>

        <template #no-data>
          <div class="text-center py-8">
            <v-icon size="64" color="grey-lighten-1">mdi-rocket-launch-outline</v-icon>
            <p class="text-h6 mt-4">No packages</p>
            <p class="text-body-2 text-medium-emphasis">
              <template v-if="typeFilter">
                No {{ typeFilter }} packages exist yet.
                <a v-if="canManagePackages" href="#" @click.prevent="openCreateDialog"
                  >Create one</a
                >
              </template>
              <template v-else>
                No packages exist yet.
                <a v-if="canManagePackages" href="#" @click.prevent="openCreateDialog"
                  >Create one</a
                >
              </template>
            </p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <PackageEditDialog
      v-model="editDialog"
      :package="editingPackage"
      :saving="saving"
      :default-price-list-code="selectedPriceList"
      @save="handleSave"
    />

    <ConfirmationDialog
      v-model="deleteDialog"
      title="Delete Package"
      icon="mdi-alert"
      icon-color="error"
      confirm-text="Delete"
      confirm-color="error"
      :loading="deleting"
      @confirm="handleDelete"
    >
      Are you sure you want to delete <strong>{{ deletingPackageName }}</strong
      >? This cannot be undone.
    </ConfirmationDialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { PERMISSIONS } from '@kawakawa/types'
import {
  api,
  type PackagePriceBreakdown,
  type PackageResponse,
  type PackageType,
  type CreatePackageRequest,
  type UpdatePackageRequest,
} from '../services/api'
import { locationService } from '../services/locationService'
import { useUserStore } from '../stores/user'
import { useSnackbar, useDisplayHelpers, useUrlState } from '../composables'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import PackageEditDialog from '../components/PackageEditDialog.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'

const userStore = useUserStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getCommodityDisplay, getLocationDisplay } = useDisplayHelpers()

const canManagePackages = computed(() => userStore.hasPermission(PERMISSIONS.PACKAGES_MANAGE))

// Controls — URL-synced like Market/Inventory's filters, so a specific
// price list/location/version/type combination can be linked/bookmarked.
// (Not `useUrlFilters`: these select *which* data to load rather than narrow
// an already-loaded list, so there's no "clear filters" affordance here.)
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
const typeFilter = useUrlState<PackageType | null>({ param: 'type', defaultValue: 'ship' })

const priceLists = ref<
  { title: string; value: string; currency: string; defaultLocationId: string }[]
>([])
const locations = ref<KeyValueItem[]>([])

const loadingPriceLists = ref(false)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)

const breakdowns = ref<PackagePriceBreakdown[]>([])
const expandedRows = ref<string[]>([])

const priceListOptions = computed(() =>
  priceLists.value.map(pl => ({ title: `${pl.title} (${pl.currency})`, value: pl.value }))
)
const locationOptions = computed((): KeyValueItem[] => locations.value)

const typeFilterOptions = [
  { title: 'Ship', value: 'ship' },
  { title: 'Building', value: 'building' },
  { title: 'All', value: null },
]

const headers = computed(() => {
  const base = [
    { title: 'Package', key: 'packageName', sortable: true },
    { title: 'Sale Price', key: 'salePrice', sortable: true },
    { title: 'Material Cost', key: 'materialCost', sortable: true },
    { title: 'Margin', key: 'margin', sortable: true },
    { title: 'Margin %', key: 'marginPercent', sortable: true },
  ]
  if (canManagePackages.value) {
    base.push({ title: '', key: 'actions', sortable: false })
  }
  return base
})

const formatMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Zebra-stripe alternating rows, matching Market/Inventory's table styling
const getRowProps = ({ index }: { index: number }) => ({
  class: index % 2 === 1 ? 'alt-row' : '',
})

// Dialogs
const editDialog = ref(false)
const editingPackage = ref<PackageResponse | null>(null)
const deleteDialog = ref(false)
const deletingPackageId = ref<number | null>(null)
const deletingPackageName = ref('')

const openCreateDialog = () => {
  editingPackage.value = null
  editDialog.value = true
}

const openEditDialog = async (id: number) => {
  try {
    editingPackage.value = await api.packages.get(id)
    editDialog.value = true
  } catch (error) {
    console.error('Failed to load package', error)
    showSnackbar('Failed to load package', 'error')
  }
}

const handleSave = async (payload: CreatePackageRequest | UpdatePackageRequest) => {
  saving.value = true
  try {
    if (editingPackage.value) {
      await api.packages.update(editingPackage.value.id, payload)
      showSnackbar('Package updated', 'success')
    } else {
      await api.packages.create(payload as CreatePackageRequest)
      showSnackbar('Package created', 'success')
    }
    editDialog.value = false
    await loadPrices()
  } catch (error) {
    console.error('Failed to save package', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to save package', 'error')
  } finally {
    saving.value = false
  }
}

const confirmDelete = (id: number, name: string) => {
  deletingPackageId.value = id
  deletingPackageName.value = name
  deleteDialog.value = true
}

const handleDelete = async () => {
  if (deletingPackageId.value === null) return
  deleting.value = true
  try {
    await api.packages.delete(deletingPackageId.value)
    showSnackbar('Package deleted', 'success')
    deleteDialog.value = false
    await loadPrices()
  } catch (error) {
    console.error('Failed to delete package', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to delete package', 'error')
  } finally {
    deleting.value = false
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

const loadPrices = async () => {
  if (!selectedPriceList.value || !selectedLocation.value) {
    breakdowns.value = []
    return
  }
  try {
    loading.value = true
    breakdowns.value = await api.packages.getAllPrices(selectedPriceList.value, {
      locationId: selectedLocation.value,
      version: selectedVersion.value ?? undefined,
      type: typeFilter.value ?? undefined,
    })
  } catch (error) {
    console.error('Failed to load package prices', error)
    showSnackbar('Failed to load package prices', 'error')
    breakdowns.value = []
  } finally {
    loading.value = false
  }
}

watch(selectedPriceList, async newCode => {
  const pl = priceLists.value.find(p => p.value === newCode)
  if (pl?.defaultLocationId) {
    selectedLocation.value = pl.defaultLocationId
  }
  await loadPrices()
})
watch([selectedLocation, selectedVersion, typeFilter], loadPrices)

onMounted(async () => {
  await loadPriceLists()
  await loadLocations()
  await loadPrices()
})
</script>

<style scoped>
.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
}
</style>
