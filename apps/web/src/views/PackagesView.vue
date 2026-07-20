<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Controls -->
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center ga-2">
        <FilterMenu
          :commodity-options="commodityFilterOptions"
          :location-options="locationFilterOptions"
          :price-list-options="priceListFilterOptions"
          :price-list-version-options="priceListVersionFilterOptions"
          :package-type-options="packageTypeOptions"
          :filter-types="packageFilterTypes"
          :show-saved="false"
          :active-chips="chips"
          :active-price-list="selectedPriceList"
          :active-price-list-version="selectedVersion !== null ? String(selectedVersion) : null"
          :active-package-type="typeFilter"
          @select="onFilterMenuSelect"
        />
        <TokenSearchInput
          ref="tokenSearchRef"
          class="flex-grow-1"
          :get-commodity-display="getCommodityDisplay"
          :get-location-display="getLocationDisplay"
          :extra-suggestion-types="extraSuggestionTypes"
          :chip-icon-by-type="chipIconByType"
          :singular-types="['location', 'priceList', 'priceListVersion', 'packageType']"
          :help-tokens="packagesHelpTokens"
          history-key="packages"
          placeholder="Search: KAWA, v3, ship, RAT (materials search inside BOMs)..."
          @update:chips="onChipsUpdate"
        />
        <span class="text-body-2 text-medium-emphasis text-no-wrap">
          {{ breakdowns.length }} package(s)
        </span>
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
              <template v-if="hasActiveFilters"> No packages match the current search. </template>
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
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useSnackbar, useDisplayHelpers, useUrlState } from '../composables'
import type { KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import TokenSearchInput, {
  type SearchChip,
  type ExtraSuggestionType,
  type HelpToken,
} from '../components/TokenSearchInput.vue'
import FilterMenu, { type FilterTypeConfig } from '../components/FilterMenu.vue'
import PackageEditDialog from '../components/PackageEditDialog.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'

const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getCommodityDisplay, getLocationDisplay } = useDisplayHelpers()

const canManagePackages = computed(() => userStore.hasPermission(PERMISSIONS.PACKAGES_MANAGE))

// Controls — URL-synced so a specific price list/location/version/type
// combination can be linked/bookmarked. These are the source of truth;
// `chips` (below) is just how they're rendered/edited in the search bar.
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
const materialTickers = ref<string[]>([])

const priceLists = ref<
  { title: string; value: string; currency: string; defaultLocationId: string }[]
>([])
const locations = ref<KeyValueItem[]>([])
const versionsForSelectedList = ref<{ value: string; display: string }[]>([])

const loadingPriceLists = ref(false)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)

const breakdowns = ref<PackagePriceBreakdown[]>([])
const allBreakdowns = ref<PackagePriceBreakdown[]>([])
const expandedRows = ref<string[]>([])

const priceListFilterOptions = computed(() =>
  priceLists.value.map(pl => ({ value: pl.value, display: `${pl.title} (${pl.currency})` }))
)
const priceListVersionFilterOptions = computed(() => versionsForSelectedList.value)
const packageTypeOptions = [
  { title: 'Ship', value: 'ship' },
  { title: 'Building', value: 'building' },
]

const commodityFilterOptions = computed(() =>
  commodityService.getAllCommoditiesSync().map(c => ({
    value: c.ticker,
    display: getCommodityDisplay(c.ticker),
  }))
)
const locationFilterOptions = computed(() =>
  locations.value.map(l => ({ value: l.key, display: l.display }))
)

const packageFilterTypes: FilterTypeConfig[] = [
  { key: 'commodity', label: 'Material', color: 'primary', icon: 'mdi-cube-outline' },
  { key: 'location', label: 'Location', color: 'secondary', icon: 'mdi-map-marker-outline' },
  { key: 'priceList', label: 'Price List', icon: 'mdi-tag-multiple-outline' },
  { key: 'priceListVersion', label: 'Version', icon: 'mdi-numeric' },
  { key: 'packageType', label: 'Type', icon: 'mdi-shape-outline' },
]

const extraSuggestionTypes = computed((): ExtraSuggestionType[] => [
  {
    type: 'priceList',
    typeLabel: 'Price List',
    color: 'indigo',
    options: priceListFilterOptions.value,
  },
  {
    type: 'priceListVersion',
    typeLabel: 'Version',
    color: 'deep-purple',
    options: priceListVersionFilterOptions.value,
  },
  {
    type: 'packageType',
    typeLabel: 'Type',
    color: 'brown',
    options: packageTypeOptions.map(o => ({ value: o.value, display: o.title })),
  },
])

const chipIconByType = {
  // A price list + pinned version render as one chip (see onChipsUpdate) —
  // the branching icon reads naturally either way ("main" vs. a specific
  // version, much like a git branch/tag).
  priceList: 'mdi-source-branch',
  priceListVersion: 'mdi-source-branch',
  packageType: 'mdi-shape-outline',
}

const packagesHelpTokens: HelpToken[] = [
  {
    label: 'Material',
    color: 'primary',
    example: 'RAT',
    description: 'Only ships/buildings whose BOM contains this material',
  },
  {
    label: 'Location',
    color: 'secondary',
    example: 'BEN',
    description: 'Price materials at this location',
  },
  {
    label: 'Price List',
    color: 'indigo',
    example: 'KAWA',
    description: 'Which price list to price against',
  },
  {
    label: 'Version',
    color: 'deep-purple',
    example: 'v3',
    description: 'A specific price list version (defaults to current)',
  },
  { label: 'Type', color: 'brown', example: 'ship', description: 'Ship or building packages' },
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

// Search bar chips — mirrors selectedPriceList/selectedLocation/selectedVersion/
// typeFilter/materialTickers above (those remain the URL-synced source of
// truth); this is just how the current state renders/edits in the search bar.
const tokenSearchRef = ref<InstanceType<typeof TokenSearchInput> | null>(null)
const chips = ref<SearchChip[]>([])

const hasActiveFilters = computed(() => chips.value.length > 0)

// Price List and Version are rendered as a single chip (they're meaningless
// apart from each other — a version only exists within its price list). The
// chip's `value` encodes both: "KAWA" (no pinned version) or "KAWA:3"
// (pinned to v3); the display renders the version as a "[v3]" suffix.
const buildPriceListChip = (code: string, version: number | null): SearchChip => {
  const pl = priceLists.value.find(p => p.value === code)
  const base = pl ? `${pl.title} (${pl.currency})` : code
  return {
    type: 'priceList',
    value: version !== null ? `${code}:${version}` : code,
    display: version !== null ? `${base} [v${version}]` : base,
    color: 'indigo',
  }
}

const onChipsUpdate = (newChips: SearchChip[]) => {
  const rawPriceList = newChips.find(c => c.type === 'priceList')
  const rawVersion = newChips.find(c => c.type === 'priceListVersion')

  // Picking a version alongside an already-selected price list produces two
  // separate chips from TokenSearchInput's generic chip mechanics — collapse
  // them into one merged chip and let the resulting re-emit finish the job.
  if (rawPriceList && rawVersion) {
    const code = rawPriceList.value.split(':')[0]
    const merged = buildPriceListChip(code, Number(rawVersion.value))
    tokenSearchRef.value?.setChips([
      ...newChips.filter(c => c !== rawPriceList && c !== rawVersion),
      merged,
    ])
    return
  }

  chips.value = newChips

  const locationValue = newChips.find(c => c.type === 'location')?.value ?? null
  const typeValue = (newChips.find(c => c.type === 'packageType')?.value as PackageType) ?? null
  materialTickers.value = newChips.filter(c => c.type === 'commodity').map(c => c.value)

  if (rawPriceList) {
    const [code, versionStr] = rawPriceList.value.split(':')
    if (code !== selectedPriceList.value) {
      selectedPriceList.value = code
    }
    selectedVersion.value = versionStr !== undefined ? Number(versionStr) : null
  }
  selectedLocation.value = locationValue
  typeFilter.value = typeValue
}

// Filter Menu clicks route through the same chip system as typed/pasted
// tokens — priceList/priceListVersion/location/packageType are singular (see
// `singular-types` on TokenSearchInput), so addChip replaces any existing
// chip of that type; commodity (material) toggles on/off.
const onFilterMenuSelect = ({
  filterType,
  key,
  display,
}: {
  filterType: string
  key: string
  display: string
}) => {
  if (filterType === 'commodity') {
    if (chips.value.some(c => c.type === 'commodity' && c.value === key)) {
      tokenSearchRef.value?.removeChipByTypeValue('commodity', key)
    } else {
      tokenSearchRef.value?.addChip({ type: 'commodity', value: key, display })
    }
    return
  }
  if (
    filterType === 'location' ||
    filterType === 'priceList' ||
    filterType === 'priceListVersion' ||
    filterType === 'packageType'
  ) {
    tokenSearchRef.value?.addChip({ type: filterType, value: key, display })
  }
}

// Materials filter: show only packages whose BOM contains at least one of the
// selected materials (OR across multiple, matching how Market's multi-value
// chips of the same type combine).
const applyMaterialFilter = (rows: PackagePriceBreakdown[]): PackagePriceBreakdown[] => {
  if (materialTickers.value.length === 0) return rows
  const wanted = new Set(materialTickers.value)
  return rows.filter(r => r.lines.some(l => wanted.has(l.commodityTicker)))
}

watch([allBreakdowns, materialTickers], () => {
  breakdowns.value = applyMaterialFilter(allBreakdowns.value)
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
    if (!selectedPriceList.value) {
      const defaultPriceList = settingsStore.defaultPriceList.value
      selectedPriceList.value =
        (defaultPriceList && priceLists.value.some(pl => pl.value === defaultPriceList)
          ? defaultPriceList
          : null) ??
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
    // Selected version no longer exists on the new list (e.g. switched price
    // lists) — fall back to "current" rather than a stale version number.
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

const loadPrices = async () => {
  if (!selectedPriceList.value || !selectedLocation.value) {
    allBreakdowns.value = []
    return
  }
  try {
    loading.value = true
    allBreakdowns.value = await api.packages.getAllPrices(selectedPriceList.value, {
      locationId: selectedLocation.value,
      version: selectedVersion.value ?? undefined,
      type: typeFilter.value ?? undefined,
    })
  } catch (error) {
    console.error('Failed to load package prices', error)
    showSnackbar('Failed to load package prices', 'error')
    allBreakdowns.value = []
  } finally {
    loading.value = false
  }
}

// Seed the search bar from the (URL-restored or default) state once initial
// data has loaded, so refreshing/bookmarking a filtered URL round-trips.
const seedChipsFromState = () => {
  const initial: SearchChip[] = []
  if (selectedPriceList.value) {
    initial.push(buildPriceListChip(selectedPriceList.value, selectedVersion.value))
  }
  if (selectedLocation.value) {
    initial.push({
      type: 'location',
      value: selectedLocation.value,
      display: getLocationDisplay(selectedLocation.value),
      color: 'secondary',
    })
  }
  if (typeFilter.value) {
    initial.push({
      type: 'packageType',
      value: typeFilter.value,
      display: typeFilter.value === 'ship' ? 'Ship' : 'Building',
      color: 'brown',
    })
  }
  tokenSearchRef.value?.setChips(initial)
}

watch(selectedPriceList, async () => {
  await loadVersionsForSelectedList()
  await loadPrices()
})
watch([selectedLocation, selectedVersion, typeFilter], loadPrices)

onMounted(async () => {
  await loadPriceLists()
  await Promise.all([loadLocations(), loadVersionsForSelectedList()])
  seedChipsFromState()
  await loadPrices()
})
</script>

<style scoped>
.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
}
</style>
