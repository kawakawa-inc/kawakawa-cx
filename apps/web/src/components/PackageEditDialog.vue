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

            <!-- Price list drives the currency + the live BOM cost tally below.
                 Shown as a compact chip with a pencil that reveals the full
                 dropdown, since it rarely changes after the first pick. -->
            <v-col cols="12" sm="6" class="d-flex align-center">
              <template v-if="editingPriceList">
                <v-select
                  v-model="priceListCode"
                  :items="priceListOptions"
                  item-title="title"
                  item-value="value"
                  label="Price List"
                  :rules="[rules.required]"
                  :loading="loadingPriceLists"
                  autofocus
                  density="compact"
                  hide-details
                  @update:model-value="editingPriceList = false"
                  @blur="editingPriceList = false"
                />
              </template>
              <template v-else>
                <span class="text-caption text-medium-emphasis mr-2">Price List</span>
                <v-chip color="indigo" size="small" label>
                  {{ selectedPriceListChipLabel }}
                </v-chip>
                <v-btn
                  icon="mdi-pencil"
                  size="x-small"
                  variant="text"
                  class="ml-1"
                  @click="editingPriceList = true"
                />
              </template>
            </v-col>
          </v-row>

          <!-- Description is optional: hidden behind a link until the user wants it. -->
          <div class="mt-2">
            <a
              v-if="!showDescription"
              href="#"
              class="text-caption text-medium-emphasis"
              @click.prevent="openDescription"
            >
              <v-icon size="x-small" start>mdi-plus</v-icon>Click to add a description
            </a>
            <v-textarea
              v-else
              ref="descriptionRef"
              v-model="description"
              label="Description (optional)"
              rows="2"
              auto-grow
              density="compact"
            />
          </div>

          <!-- Bill of materials, with a live running tally per line and a cost
               total footer that the Pricing section below reacts to. -->
          <v-card variant="outlined" class="mt-4">
            <v-card-text>
              <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
                <span class="text-subtitle-2">Bill of Materials</span>
                <v-btn
                  size="small"
                  variant="text"
                  prepend-icon="mdi-clipboard-text-outline"
                  @click="showBomPaste = !showBomPaste"
                >
                  Paste BOM
                </v-btn>
              </div>

              <!-- One search box adds materials (and filters by category) — pick
                   a material to add a row; add a category chip to narrow the
                   material suggestions to a part family. -->
              <TokenSearchInput
                ref="materialSearchRef"
                class="mb-3"
                leading-icon="mdi-cube-outline"
                history-key="package-bom"
                placeholder="Add material… (type a ticker, or a category to narrow suggestions)"
                :get-commodity-display="getCommodityDisplay"
                :get-commodity-name="getCommodityName"
                :get-commodity-category="commodityService.getCommodityCategory"
                :extra-suggestion-types="categorySuggestionTypes"
                :allowed-suggestion-types="['commodity', 'category']"
                :chip-icon-by-type="bomChipIconByType"
                @update:chips="onMaterialSearchChips"
              />

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

              <div v-if="lineRows.length === 0" class="text-caption text-medium-emphasis py-2">
                No materials yet — use the search above to add some, or paste a BOM.
              </div>

              <template v-else>
                <div class="bom-header d-flex align-center text-caption text-medium-emphasis mb-1">
                  <span class="bom-col-material">Material</span>
                  <span class="bom-col-qty text-right">Qty</span>
                  <span class="bom-col-price text-right">Unit Price</span>
                  <span class="bom-col-total text-right">Line Total</span>
                  <span class="bom-col-actions"></span>
                </div>

                <div
                  v-for="(line, index) in lineRows"
                  :key="line.commodityTicker ?? index"
                  class="bom-row d-flex align-center"
                >
                  <span class="bom-col-material text-truncate">
                    {{ getCommodityDisplay(line.commodityTicker as string) }}
                  </span>
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
                    <span v-else class="text-warning text-caption">no price</span>
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
                    @click="removeLine(index)"
                  >
                    <v-icon>mdi-delete</v-icon>
                  </v-btn>
                </div>
              </template>

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
import { computed, ref, watch, onMounted, nextTick } from 'vue'
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
import { useDisplayHelpers, useSnackbar } from '../composables'
import { useSettingsStore } from '../stores/settings'
import { localizeMaterialCategory } from '../utils/materials'
import TokenSearchInput, { type SearchChip, type ExtraSuggestionType } from './TokenSearchInput.vue'

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

const { getCommodityDisplay, getCommodityName } = useDisplayHelpers()
const { showSnackbar } = useSnackbar()
const settingsStore = useSettingsStore()

const formRef = ref()
const isValid = ref(false)
const lineError = ref('')

const name = ref('')
const type = ref<PackageType>('ship')
const isActive = ref(true)
const description = ref('')
const descriptionRef = ref<{ focus: () => void } | null>(null)
// Description is optional — hidden behind a link until wanted (or when the
// package being edited already has one).
const showDescription = ref(false)
const lines = ref<{ commodityTicker: string | null; quantity: number }[]>([])

// Price list — drives currency and the live cost tally. Materials are priced
// at the list's default location (the package itself has no notion of a
// pricing location). Shown as a chip; the full dropdown is revealed on edit.
const priceLists = ref<PriceListDefinition[]>([])
const loadingPriceLists = ref(false)
const priceListCode = ref<string | null>(null)
const editingPriceList = ref(false)
const priceMap = ref<Map<string, number>>(new Map())
const loadingPrices = ref(false)

// Material search: a token box that adds BOM rows (commodity chips) and
// narrows suggestions by category chips.
const materialSearchRef = ref<InstanceType<typeof TokenSearchInput> | null>(null)

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
const selectedPriceListChipLabel = computed(() => {
  const pl = selectedPriceListData.value
  return pl ? `${pl.name} (${pl.currency})` : 'None'
})

const openDescription = () => {
  showDescription.value = true
  nextTick(() => descriptionRef.value?.focus())
}
const currency = computed(() => selectedPriceListData.value?.currency ?? null)

// Category chips in the material search narrow suggestions to a part family
// (e.g. "Ship Kits"), so a large BOM is easier to build. They're filters
// only — picking a material adds it, picking a category just scopes search.
const bomChipIconByType = { category: 'mdi-folder-outline' }

const categorySuggestionTypes = computed((): ExtraSuggestionType[] => {
  const counts = new Map<string, number>()
  for (const c of commodityService.getAllCommoditiesSync()) {
    if (!c.category) continue
    counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
  }
  return [
    {
      type: 'category',
      typeLabel: 'Category',
      color: 'teal',
      options: [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([category, count]) => ({
          value: category,
          display: `${localizeMaterialCategory(category as CommodityCategory)} (${count})`,
        })),
    },
  ]
})

// Picking a commodity in the search adds a BOM row (deduped); category chips
// are left in place as active filters and don't become materials.
const onMaterialSearchChips = (chips: SearchChip[]) => {
  const picked = chips.filter(c => c.type === 'commodity')
  if (picked.length === 0) return

  let added = false
  for (const chip of picked) {
    if (!lines.value.some(l => l.commodityTicker === chip.value)) {
      lines.value.push({ commodityTicker: chip.value, quantity: 1 })
      added = true
    }
  }
  // Remove the commodity chips so the box stays a pure "add another" control,
  // keeping only category filter chips.
  for (const chip of picked) {
    materialSearchRef.value?.removeChipByTypeValue('commodity', chip.value)
  }
  if (added) lineError.value = ''
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
  if (!pl || !pl.defaultLocationId) {
    priceMap.value = new Map()
    return
  }
  try {
    loadingPrices.value = true
    const effectivePrices = await api.prices.getEffective(
      pl.code,
      pl.defaultLocationId,
      pl.currency
    )
    priceMap.value = new Map(effectivePrices.map(p => [p.commodityTicker, p.finalPrice]))
  } catch (error) {
    console.error('Failed to load effective prices', error)
    showSnackbar('Failed to load material prices', 'error')
    priceMap.value = new Map()
  } finally {
    loadingPrices.value = false
  }
}

watch(priceListCode, loadEffectivePrices)

watch(dialogOpen, async open => {
  if (!open) return
  lineError.value = ''
  showBomPaste.value = false
  bomPasteText.value = ''
  bomPasteMessage.value = ''
  editingPriceList.value = false
  materialSearchRef.value?.clear()
  const p = props.package

  name.value = p?.name ?? ''
  type.value = p?.type ?? 'ship'
  isActive.value = p?.isActive ?? true
  description.value = p?.description ?? ''
  // Reveal the description field only when there's already one to show.
  showDescription.value = !!p?.description?.trim()
  lines.value =
    p && p.inputs.length > 0
      ? p.inputs.map(i => ({ commodityTicker: i.commodityTicker, quantity: i.quantity }))
      : []

  pricingMode.value = p?.pricingMode ?? 'fixed'
  marginMultiplier.value = p?.marginMultiplier ?? 1
  fixedPrice.value = p && p.pricingMode !== 'margin' ? (p.salePrice ?? null) : null

  if (priceLists.value.length === 0) {
    await loadPriceLists()
  }

  const preferred = props.defaultPriceListCode ?? settingsStore.defaultPriceList.value
  priceListCode.value =
    (preferred && priceLists.value.some(pl => pl.code === preferred) ? preferred : null) ??
    priceLists.value[0]?.code ??
    null

  await loadEffectivePrices()
})

onMounted(() => {
  if (dialogOpen.value) {
    loadPriceLists()
  }
})

const removeLine = (index: number) => {
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
