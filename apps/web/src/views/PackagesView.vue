<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Controls -->
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center ga-2 flex-wrap toolbar-title">
        <v-select
          v-model="selectedPriceList"
          :items="priceListSelectOptions"
          item-title="title"
          item-value="value"
          label="Price List"
          density="compact"
          variant="outlined"
          hide-details
          :loading="loadingPriceLists"
          class="toolbar-select"
          style="width: 220px"
        />
        <v-select
          v-model="selectedVersionOption"
          :items="versionSelectOptions"
          item-title="display"
          item-value="value"
          label="Version"
          density="compact"
          variant="outlined"
          hide-details
          :disabled="!selectedPriceList"
          class="toolbar-select"
          style="width: 220px"
        />
        <v-select
          v-model="typeFilter"
          :items="packageTypeOptions"
          item-title="title"
          item-value="value"
          label="Type"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="toolbar-select"
          style="width: 140px"
        />
        <TokenSearchInput
          ref="tokenSearchRef"
          class="toolbar-material-search"
          :get-commodity-display="getCommodityDisplay"
          :allowed-suggestion-types="['commodity']"
          :help-tokens="materialHelpTokens"
          history-key="packages-material"
          placeholder="Material in BOM..."
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
            <PackageLabel
              :name="item.packageName"
              :icon-commodity-ticker="item.iconCommodityTicker"
              class="font-weight-medium"
            />
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
            <v-icon size="64" color="grey-lighten-1">mdi-package-variant-closed</v-icon>
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
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useSnackbar, useDisplayHelpers, useUrlState } from '../composables'
import TokenSearchInput, {
  type SearchChip,
  type HelpToken,
} from '../components/TokenSearchInput.vue'
import PackageEditDialog from '../components/PackageEditDialog.vue'
import PackageLabel from '../components/PackageLabel.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'

const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getCommodityDisplay } = useDisplayHelpers()

const canManagePackages = computed(() => userStore.hasPermission(PERMISSIONS.PACKAGES_MANAGE))

// Controls — URL-synced so a specific price list/version/type combination can
// be linked/bookmarked. Pricing location is not user-selectable here: it
// always comes from the selected price list version's own defaultLocationId
// (packages have no location of their own).
const selectedPriceList = useUrlState<string | null>({ param: 'priceList', defaultValue: null })
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

const priceLists = ref<{ title: string; value: string; currency: string }[]>([])
const versionsForSelectedList = ref<{ value: string; display: string }[]>([])

const loadingPriceLists = ref(false)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)

const breakdowns = ref<PackagePriceBreakdown[]>([])
const allBreakdowns = ref<PackagePriceBreakdown[]>([])
const expandedRows = ref<string[]>([])

const priceListSelectOptions = computed(() =>
  priceLists.value.map(pl => ({ title: `${pl.title} (${pl.currency})`, value: pl.value }))
)
const packageTypeOptions = [
  { title: 'Ship', value: 'ship' },
  { title: 'Building', value: 'building' },
]

// "Version" dropdown — "current" (the list's latest promoted version, no
// pinned version param) plus every explicit version on the selected list.
const versionSelectOptions = computed(() => [
  { value: 'current', display: 'Current (latest promoted)' },
  ...versionsForSelectedList.value,
])

// v-select works with a single flat value; `selectedVersion` is `number |
// null` (null = "current"), so bridge the two.
const selectedVersionOption = computed<string>({
  get: () => (selectedVersion.value === null ? 'current' : String(selectedVersion.value)),
  set: val => {
    selectedVersion.value = val === 'current' ? null : Number(val)
  },
})

const materialHelpTokens: HelpToken[] = [
  {
    label: 'Material',
    color: 'primary',
    example: 'RAT',
    description: 'Only ships/buildings whose BOM contains this material',
  },
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

// Material search bar — the only remaining chip-based control. Chips are
// commodity tickers only; `materialTickers` (used for filtering) mirrors them.
const tokenSearchRef = ref<InstanceType<typeof TokenSearchInput> | null>(null)
const chips = ref<SearchChip[]>([])

const hasActiveFilters = computed(() => chips.value.length > 0)

const onChipsUpdate = (newChips: SearchChip[]) => {
  chips.value = newChips
  materialTickers.value = newChips.map(c => c.value)
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
  if (!selectedPriceList.value) {
    allBreakdowns.value = []
    return
  }
  try {
    loading.value = true
    // No locationId: the API defaults to the resolved version's own
    // defaultLocationId, which is always what we want here.
    allBreakdowns.value = await api.packages.getAllPrices(selectedPriceList.value, {
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

watch(selectedPriceList, async () => {
  await loadVersionsForSelectedList()
  await loadPrices()
})
watch([selectedVersion, typeFilter], loadPrices)

onMounted(async () => {
  await loadPriceLists()
  await loadVersionsForSelectedList()
  await loadPrices()
})
</script>

<style scoped>
.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
}

/* Vuetify's default .v-card-title is single-line text (nowrap + ellipsis) —
   fine for a plain title, but wrong once it's holding an actual toolbar of
   controls: it was truncating/clipping the row's contents. `d-flex` already
   overrides `display`; explicitly reset the rest here too. */
.toolbar-title {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
}

/* Fixed width (not max-width) so each select's flex-basis actually equals
   the width below instead of shrinking to its content, which was truncating
   the selected option's text. flex-shrink stays enabled so they can still
   give up space on narrow viewports rather than overflowing. */
.toolbar-select {
  flex: 0 1 auto;
}

/* Grows to absorb whatever width the (fixed-width) dropdowns and buttons
   don't use, instead of leaving a dead gap in the middle of the toolbar. */
.toolbar-material-search {
  flex: 1 1 240px;
  min-width: 160px;
}
</style>
