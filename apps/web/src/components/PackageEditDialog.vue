<template>
  <v-dialog v-model="dialogOpen" max-width="800" persistent scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>{{ type === 'building' ? 'mdi-domain' : 'mdi-rocket-launch' }}</v-icon>
        {{ isUpdate ? 'Edit Package' : 'New Package' }}
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" v-model="isValid">
          <!-- Basic info -->
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field v-model="name" label="Name" :rules="[rules.required]" autofocus />
            </v-col>
            <v-col cols="6" sm="3">
              <v-select v-model="type" :items="typeOptions" label="Type" />
            </v-col>
            <v-col cols="6" sm="3">
              <v-switch v-model="isActive" label="Active" color="primary" hide-details inset />
            </v-col>

            <!-- Price list drives the currency + the live BOM cost tally below. -->
            <v-col cols="12" sm="6">
              <v-select
                v-model="priceListCode"
                :items="priceListOptions"
                item-title="title"
                item-value="value"
                label="Price List"
                :rules="[rules.required]"
                :loading="loadingPriceLists"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="description" label="Description (optional)" rows="2" auto-grow />
            </v-col>
          </v-row>

          <!-- Bill of materials, with a live running tally per line and a cost
               total footer that the Pricing section below reacts to. -->
          <v-card variant="outlined" class="mt-4">
            <v-card-text>
              <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
                <span class="text-subtitle-2">Bill of Materials</span>
                <div class="d-flex align-center flex-wrap ga-2">
                  <KeyValueAutocomplete
                    v-model="previewLocationId"
                    :items="locationOptions"
                    label="Location Preview"
                    density="compact"
                    hide-details
                    class="location-preview"
                  />
                  <v-select
                    v-model="categoryFilter"
                    :items="categoryOptions"
                    item-title="title"
                    item-value="value"
                    label="Filter by category"
                    density="compact"
                    hide-details
                    clearable
                    class="category-filter"
                  />
                  <v-btn
                    size="small"
                    variant="text"
                    prepend-icon="mdi-clipboard-text-outline"
                    @click="showBomPaste = !showBomPaste"
                  >
                    Paste BOM
                  </v-btn>
                  <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="addLine">
                    Add Material
                  </v-btn>
                </div>
              </div>
              <div v-if="categoryFilter" class="text-caption text-medium-emphasis mb-2">
                Showing {{ filteredCommodityOptions.length }} material(s) in "{{
                  categoryFilterLabel
                }}". A line's already-selected material stays available even if it's in a different
                category.
              </div>

              <div v-if="showBomPaste" class="bom-paste mb-3">
                <v-textarea
                  v-model="bomPasteText"
                  label="Paste BOM"
                  placeholder="e.g. 1 FFC, 1 FSE, 1 QCR, 3 MFE, 2 SFE, 1 SCB, 48 LHP, 47 SSC"
                  rows="2"
                  auto-grow
                  density="compact"
                  hide-details
                />
                <div class="d-flex align-center ga-2 mt-1">
                  <v-btn size="small" color="primary" variant="tonal" @click="parseBomPaste">
                    Replace Lines
                  </v-btn>
                  <v-btn size="small" variant="text" @click="cancelBomPaste">Cancel</v-btn>
                </div>
                <div v-if="bomPasteMessage" class="text-caption text-warning mt-1">
                  {{ bomPasteMessage }}
                </div>
              </div>

              <div v-if="lineError" class="text-error text-caption mb-2">{{ lineError }}</div>

              <div class="bom-header d-flex align-center text-caption text-medium-emphasis mb-1">
                <span class="bom-col-material">Material</span>
                <span class="bom-col-qty text-right">Qty</span>
                <span class="bom-col-price text-right">Unit Price</span>
                <span class="bom-col-total text-right">Line Total</span>
                <span class="bom-col-actions"></span>
              </div>

              <div
                v-for="(line, index) in lineRows"
                :key="index"
                class="bom-row d-flex align-center"
              >
                <KeyValueAutocomplete
                  v-model="lines[index].commodityTicker"
                  :items="optionsForLine(line.commodityTicker)"
                  :favorites="settingsStore.favoritedCommodities.value"
                  :show-icons="hasIcons"
                  label="Material"
                  density="compact"
                  hide-details
                  variant="outlined"
                  class="bom-col-material"
                  @update:favorites="
                    settingsStore.updateSetting('market.favoritedCommodities', $event)
                  "
                />
                <v-text-field
                  v-model.number="lines[index].quantity"
                  label="Qty"
                  type="number"
                  min="1"
                  density="compact"
                  hide-details
                  variant="outlined"
                  class="bom-col-qty"
                />
                <span class="bom-col-price text-right">
                  <span v-if="line.unitPrice !== null">{{ formatMoney(line.unitPrice) }}</span>
                  <span v-else-if="line.commodityTicker" class="text-warning text-caption"
                    >no price</span
                  >
                  <span v-else class="text-medium-emphasis">—</span>
                </span>
                <span class="bom-col-total text-right font-weight-medium">
                  <span v-if="line.lineTotal !== null">{{ formatMoney(line.lineTotal) }}</span>
                  <span v-else class="text-medium-emphasis">—</span>
                </span>
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="error"
                  class="bom-col-actions"
                  :disabled="lines.length <= 1"
                  @click="removeLine(index)"
                >
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </div>

              <v-alert
                v-if="missingTickers.length > 0"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-2"
              >
                No price found for {{ missingTickers.join(', ') }} at {{ selectedPriceListLabel }}
                — the tally below is based on the remaining materials only.
              </v-alert>
            </v-card-text>

            <v-divider />

            <v-card-text class="d-flex justify-end align-center py-2">
              <span class="text-subtitle-2 mr-2">Material Cost Total:</span>
              <span class="text-subtitle-1 font-weight-bold">
                {{ formatMoney(materialCost) }} {{ currency }}
              </span>
            </v-card-text>
          </v-card>

          <!-- Pricing: how the package's sale price is derived from the BOM total above. -->
          <v-card variant="outlined" class="mt-4">
            <v-card-text>
              <span class="text-subtitle-2">Pricing</span>
              <v-btn-toggle
                v-model="pricingMode"
                color="primary"
                mandatory
                density="compact"
                class="d-block my-2"
              >
                <v-btn value="fixed" size="small">Fixed Price</v-btn>
                <v-btn value="margin" size="small">Margin</v-btn>
              </v-btn-toggle>

              <v-row v-if="pricingMode === 'fixed'" dense align="center">
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model.number="fixedPrice"
                    label="Fixed Price"
                    type="number"
                    min="0"
                    step="0.01"
                    :suffix="currency ?? undefined"
                    clearable
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <template v-if="fixedPrice && materialCost > 0">
                    <span class="text-body-2 text-medium-emphasis mr-2"
                      >Implied multiplier vs. material cost:</span
                    >
                    <span class="text-subtitle-1 font-weight-bold">
                      {{ (fixedPrice / materialCost).toFixed(2) }}×
                    </span>
                  </template>
                </v-col>
              </v-row>

              <v-row v-else dense align="center">
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model.number="marginMultiplier"
                    label="Margin Multiplier"
                    type="number"
                    min="0.01"
                    step="0.01"
                    hint="> 1.0 = markup, < 1.0 = markdown (e.g. 1.2 = +20%, 0.9 = -10%)"
                    persistent-hint
                    :rules="[rules.positive]"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <span class="text-body-2 text-medium-emphasis mr-2">Computed price:</span>
                  <span class="text-subtitle-1 font-weight-bold">
                    {{ formatMoney(computedMarginPrice) }} {{ currency }}
                  </span>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!isValid"
          @click="handleSave"
        >
          {{ isUpdate ? 'Update' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import type { CommodityCategory } from '@kawakawa/types'
import {
  api,
  type PackageResponse,
  type PackageType,
  type PackagePricingMode,
  type CreatePackageRequest,
  type UpdatePackageRequest,
  type PriceListDefinition,
} from '../services/api'
import { commodityService } from '../services/commodityService'
import { locationService } from '../services/locationService'
import { useDisplayHelpers, useSnackbar } from '../composables'
import { useSettingsStore } from '../stores/settings'
import { localizeMaterialCategory } from '../utils/materials'
import KeyValueAutocomplete, { type KeyValueItem } from './KeyValueAutocomplete.vue'

interface Props {
  package?: PackageResponse | null
  saving?: boolean
  /** Hint for the initial Price List selection (e.g. whatever's currently selected in the parent view). */
  defaultPriceListCode?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  package: null,
  saving: false,
  defaultPriceListCode: null,
})

const modelValue = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  (e: 'save', payload: CreatePackageRequest | UpdatePackageRequest): void
}>()

const { getCommodityDisplay, getLocationDisplay } = useDisplayHelpers()
const { showSnackbar } = useSnackbar()
const settingsStore = useSettingsStore()
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

const formRef = ref()
const isValid = ref(false)
const lineError = ref('')

const name = ref('')
const type = ref<PackageType>('ship')
const isActive = ref(true)
const description = ref('')
const lines = ref<{ commodityTicker: string | null; quantity: number }[]>([
  { commodityTicker: null, quantity: 1 },
])

// Price list — drives currency and the live cost tally. Materials price at
// `previewLocationId`, which defaults to the list's default location but can
// be changed to preview cost at another location without affecting anything
// that gets saved (the package itself has no notion of a pricing location).
const priceLists = ref<PriceListDefinition[]>([])
const loadingPriceLists = ref(false)
const priceListCode = ref<string | null>(null)
const previewLocationId = ref<string | null>(null)
const locations = ref<KeyValueItem[]>([])
const locationOptions = computed((): KeyValueItem[] => locations.value)
const priceMap = ref<Map<string, number>>(new Map())
const loadingPrices = ref(false)

// Pricing mode
const pricingMode = ref<PackagePricingMode>('fixed')
const fixedPrice = ref<number | null>(null)
const marginMultiplier = ref<number>(1)

// BOM paste: accepts the same "1 FFC, 1 FSE, 3 MFE, ..." format the price
// list admin's BOM CSV column uses, so a ship's parts list can be pasted in
// directly instead of hand-picking every material line.
const showBomPaste = ref(false)
const bomPasteText = ref('')
const bomPasteMessage = ref('')

const isUpdate = computed(() => !!props.package)
const saving = computed(() => props.saving)

const typeOptions = [
  { title: 'Ship', value: 'ship' },
  { title: 'Building', value: 'building' },
]

const priceListOptions = computed(() =>
  priceLists.value.map(pl => ({ title: `${pl.name} (${pl.currency})`, value: pl.code }))
)
const selectedPriceListData = computed(
  () => priceLists.value.find(pl => pl.code === priceListCode.value) ?? null
)
const selectedPriceListLabel = computed(() => selectedPriceListData.value?.name ?? 'this list')
const currency = computed(() => selectedPriceListData.value?.currency ?? null)

// "Show me Ship Kits" — a category filter to narrow the material picker's
// suggestions, so a large BOM is easier to build from a known part family.
const categoryFilter = ref<string | null>(null)

const allCommodityOptions = computed((): KeyValueItem[] => {
  const commodities = commodityService.getAllCommoditiesSync()
  return commodities.map(c => ({
    key: c.ticker,
    display: getCommodityDisplay(c.ticker),
    name: c.name,
    category: c.category,
  }))
})

const categoryOptions = computed(() => {
  const counts = new Map<string, number>()
  for (const opt of allCommodityOptions.value) {
    if (!opt.category) continue
    counts.set(opt.category, (counts.get(opt.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, count]) => ({
      title: `${localizeMaterialCategory(category as CommodityCategory)} (${count})`,
      value: category,
    }))
})

const categoryFilterLabel = computed(() =>
  categoryFilter.value ? localizeMaterialCategory(categoryFilter.value as CommodityCategory) : ''
)

const filteredCommodityOptions = computed((): KeyValueItem[] => {
  if (!categoryFilter.value) return allCommodityOptions.value
  return allCommodityOptions.value.filter(o => o.category === categoryFilter.value)
})

/**
 * Options for one BOM line's picker: the category-filtered list, plus that
 * line's own currently-selected material even if it falls outside the active
 * category filter (so switching categories never silently hides an existing
 * selection).
 */
function optionsForLine(ticker: string | null): KeyValueItem[] {
  if (!ticker || filteredCommodityOptions.value.some(o => o.key === ticker)) {
    return filteredCommodityOptions.value
  }
  const existing = allCommodityOptions.value.find(o => o.key === ticker)
  return existing ? [...filteredCommodityOptions.value, existing] : filteredCommodityOptions.value
}

interface LineRow {
  commodityTicker: string | null
  quantity: number
  unitPrice: number | null
  lineTotal: number | null
}

const lineRows = computed((): LineRow[] =>
  lines.value.map(l => {
    const unitPrice = l.commodityTicker ? (priceMap.value.get(l.commodityTicker) ?? null) : null
    const lineTotal =
      unitPrice !== null && l.quantity > 0 ? Math.round(unitPrice * l.quantity * 100) / 100 : null
    return { ...l, unitPrice, lineTotal }
  })
)

const missingTickers = computed(() =>
  lineRows.value
    .filter(l => l.commodityTicker && l.unitPrice === null)
    .map(l => l.commodityTicker as string)
)

const materialCost = computed(
  () => Math.round(lineRows.value.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0) * 100) / 100
)

const computedMarginPrice = computed(
  () => Math.round(materialCost.value * (marginMultiplier.value || 0) * 100) / 100
)

const formatMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const rules = {
  required: (v: string) => !!v || 'Required',
  positive: (v: number) => (v != null && v > 0) || 'Must be greater than 0',
}

const dialogOpen = computed({
  get: () => modelValue.value,
  set: v => {
    modelValue.value = v
  },
})

const loadPriceLists = async () => {
  try {
    loadingPriceLists.value = true
    priceLists.value = await api.priceLists.list()
  } catch (error) {
    console.error('Failed to load price lists', error)
    showSnackbar('Failed to load price lists', 'error')
  } finally {
    loadingPriceLists.value = false
  }
}

const loadEffectivePrices = async () => {
  const pl = selectedPriceListData.value
  const locationId = previewLocationId.value || pl?.defaultLocationId
  if (!pl || !locationId) {
    priceMap.value = new Map()
    return
  }
  try {
    loadingPrices.value = true
    const effectivePrices = await api.prices.getEffective(pl.code, locationId, pl.currency)
    priceMap.value = new Map(effectivePrices.map(p => [p.commodityTicker, p.finalPrice]))
  } catch (error) {
    console.error('Failed to load effective prices', error)
    showSnackbar('Failed to load material prices', 'error')
    priceMap.value = new Map()
  } finally {
    loadingPrices.value = false
  }
}

const loadLocations = async () => {
  try {
    const data = await locationService.getAllLocations()
    locations.value = data.map(l => ({ key: l.id, display: getLocationDisplay(l.id) }))
  } catch (error) {
    console.error('Failed to load locations', error)
  }
}

// Switching price lists resets the location preview to that list's own
// default location (previewing a stale location from a different list's
// currency/location context wouldn't mean anything).
watch(priceListCode, () => {
  previewLocationId.value = selectedPriceListData.value?.defaultLocationId || null
  loadEffectivePrices()
})
watch(previewLocationId, loadEffectivePrices)

watch(dialogOpen, async open => {
  if (!open) return
  lineError.value = ''
  categoryFilter.value = null
  showBomPaste.value = false
  bomPasteText.value = ''
  bomPasteMessage.value = ''
  const p = props.package

  name.value = p?.name ?? ''
  type.value = p?.type ?? 'ship'
  isActive.value = p?.isActive ?? true
  description.value = p?.description ?? ''
  lines.value =
    p && p.inputs.length > 0
      ? p.inputs.map(i => ({ commodityTicker: i.commodityTicker, quantity: i.quantity }))
      : [{ commodityTicker: null, quantity: 1 }]

  pricingMode.value = p?.pricingMode ?? 'fixed'
  marginMultiplier.value = p?.marginMultiplier ?? 1
  fixedPrice.value = p && p.pricingMode !== 'margin' ? (p.salePrice ?? null) : null

  if (priceLists.value.length === 0) {
    await loadPriceLists()
  }
  if (locations.value.length === 0) {
    await loadLocations()
  }

  const preferred = props.defaultPriceListCode ?? settingsStore.defaultPriceList.value
  priceListCode.value =
    (preferred && priceLists.value.some(pl => pl.code === preferred) ? preferred : null) ??
    priceLists.value[0]?.code ??
    null
  previewLocationId.value = selectedPriceListData.value?.defaultLocationId || null

  await loadEffectivePrices()
})

onMounted(() => {
  if (dialogOpen.value) {
    loadPriceLists()
    loadLocations()
  }
})

const addLine = () => {
  lines.value.push({ commodityTicker: null, quantity: 1 })
}

const removeLine = (index: number) => {
  if (lines.value.length <= 1) return
  lines.value.splice(index, 1)
}

const cancelBomPaste = () => {
  showBomPaste.value = false
  bomPasteText.value = ''
  bomPasteMessage.value = ''
}

/**
 * Parse the "1 FFC, 1 FSE, 3 MFE, ..." format used by the price list admin's
 * BOM CSV column (see `.dev/design-docs/price-list-admin`) into material
 * lines, replacing whatever's currently in the form. Unknown tickers and
 * unparseable tokens are skipped and reported rather than blocking the paste.
 */
const parseBomPaste = () => {
  bomPasteMessage.value = ''
  const raw = bomPasteText.value.trim()
  if (!raw) return

  const tokens = raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  const knownTickers = new Set(commodityService.getAllCommoditiesSync().map(c => c.ticker))
  const merged = new Map<string, number>()
  const unknown = new Set<string>()
  const unparsed: string[] = []

  for (const token of tokens) {
    const match = token.match(/^(\d+(?:\.\d+)?)\s+([A-Za-z][A-Za-z0-9]*)$/)
    if (!match) {
      unparsed.push(token)
      continue
    }
    const quantity = Math.floor(parseFloat(match[1]))
    const ticker = match[2].toUpperCase()
    if (quantity <= 0) {
      unparsed.push(token)
      continue
    }
    if (!knownTickers.has(ticker)) {
      unknown.add(ticker)
      continue
    }
    merged.set(ticker, (merged.get(ticker) ?? 0) + quantity)
  }

  if (merged.size === 0) {
    bomPasteMessage.value = 'No valid "qty TICKER" pairs found (e.g. "1 FFC, 3 MFE").'
    return
  }

  lines.value = [...merged.entries()].map(([commodityTicker, quantity]) => ({
    commodityTicker,
    quantity,
  }))

  const problems: string[] = []
  if (unknown.size > 0) problems.push(`unknown ticker(s): ${[...unknown].join(', ')}`)
  if (unparsed.length > 0) problems.push(`unparsed token(s): ${unparsed.join(', ')}`)

  if (problems.length > 0) {
    bomPasteMessage.value = `Imported ${merged.size} material(s); skipped ${problems.join('; ')}.`
  } else {
    cancelBomPaste()
  }
}

const handleSave = () => {
  lineError.value = ''
  const validLines = lines.value.filter(l => l.commodityTicker && l.quantity > 0)
  if (validLines.length === 0) {
    lineError.value = 'At least one material line is required'
    return
  }
  const tickers = validLines.map(l => l.commodityTicker)
  if (new Set(tickers).size !== tickers.length) {
    lineError.value = 'Each material can only appear once in the package'
    return
  }
  if (!priceListCode.value) {
    lineError.value = 'A price list is required to price the bill of materials'
    return
  }
  if (pricingMode.value === 'margin' && !(marginMultiplier.value > 0)) {
    lineError.value = 'Margin multiplier must be greater than 0'
    return
  }
  if (pricingMode.value === 'fixed' && fixedPrice.value != null && fixedPrice.value <= 0) {
    lineError.value = 'Fixed price must be greater than 0'
    return
  }

  const salePrice = pricingMode.value === 'margin' ? computedMarginPrice.value : fixedPrice.value
  const resolvedCurrency = salePrice != null ? currency.value : null

  const payload: CreatePackageRequest = {
    name: name.value.trim(),
    type: type.value,
    salePrice,
    currency: resolvedCurrency,
    pricingMode: pricingMode.value,
    marginMultiplier: pricingMode.value === 'margin' ? marginMultiplier.value : null,
    description: description.value.trim() || null,
    isActive: isActive.value,
    inputs: validLines.map(l => ({
      commodityTicker: l.commodityTicker as string,
      quantity: l.quantity,
    })),
  }
  emit('save', payload)
}

const close = () => {
  dialogOpen.value = false
}
</script>

<style scoped>
.bom-row {
  gap: 8px;
  padding: 4px 0;
}

.category-filter {
  min-width: 220px;
}

.location-preview {
  min-width: 200px;
}

.bom-paste {
  padding: 8px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 4px;
}

.bom-col-material {
  flex: 1 1 auto;
  min-width: 0;
}
.bom-col-qty {
  flex: 0 0 90px;
}
.bom-col-price {
  flex: 0 0 100px;
}
.bom-col-total {
  flex: 0 0 100px;
}
.bom-col-actions {
  flex: 0 0 40px;
}
.bom-header .bom-col-material {
  flex: 1 1 auto;
}
</style>
