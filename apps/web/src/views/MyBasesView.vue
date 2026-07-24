<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-factory</v-icon>
        My Bases
        <v-spacer />
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="loadAll"
        >
          Refresh
        </v-btn>
      </v-card-title>
      <v-card-text class="text-caption text-medium-emphasis pt-0">
        Workforce burn, production input, and building repair costs for your own bases. Data is
        pre-computed during FIO sync.
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <v-alert
      v-if="myBases && myBases.planets.length === 0 && !loading"
      type="info"
      variant="tonal"
      class="mb-4"
      density="compact"
    >
      No base data found. Sync your planet data from the Supply Planning page first.
    </v-alert>

    <v-card v-if="myBases && myBases.planets.length > 0" class="mb-3" variant="flat">
      <v-card-text class="pa-3">
        <v-row dense align="center">
          <v-col cols="12" md="3">
            <KeyValueAutocomplete
              v-model="state.myBasesPlanetFilter"
              :items="myBasesPlanetOptions"
              :favorites="settingsStore.favoritedLocations.value"
              label="Filter by planet"
              density="compact"
              hide-details
              multiple
              clearable
              @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
            />
          </v-col>
          <v-col cols="12" md="5">
            <v-menu location="bottom start" :close-on-content-click="false">
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  variant="outlined"
                  block
                  height="40"
                  append-icon="mdi-menu-down"
                  class="justify-space-between text-none"
                >
                  <span class="text-medium-emphasis text-caption mr-2">Price List:</span>
                  <span class="flex-grow-1 text-left text-truncate">
                    {{ priceListMenuLabel }}
                  </span>
                </v-btn>
              </template>
              <v-list density="compact" max-height="420" min-width="280">
                <template v-for="pl in priceLists" :key="pl.code">
                  <!-- Custom list: fly-out submenu with versions -->
                  <v-menu
                    v-if="pl.type !== 'fio'"
                    location="end"
                    open-on-hover
                    open-on-click
                    :close-on-content-click="true"
                  >
                    <template #activator="{ props: subProps }">
                      <v-list-item
                        v-bind="subProps"
                        :active="
                          state.myBasesPriceListCode === pl.code &&
                          state.myBasesPriceListVersion === null
                        "
                        @click="selectPriceList(pl.code, null)"
                      >
                        <v-list-item-title class="d-flex align-center">
                          {{ pl.name }}
                          <v-spacer />
                          <v-icon size="small" class="ml-2">mdi-chevron-right</v-icon>
                        </v-list-item-title>
                        <v-list-item-subtitle>
                          {{ pl.code }} · {{ pl.currency }}
                        </v-list-item-subtitle>
                      </v-list-item>
                    </template>
                    <v-list density="compact" max-height="360" min-width="220">
                      <v-list-item
                        :active="
                          state.myBasesPriceListCode === pl.code &&
                          state.myBasesPriceListVersion === null
                        "
                        @click="selectPriceList(pl.code, null)"
                      >
                        <v-list-item-title>Latest</v-list-item-title>
                        <v-list-item-subtitle>Follows the promoted version</v-list-item-subtitle>
                      </v-list-item>
                      <v-divider />
                      <v-list-item
                        v-for="pv in priceListVersionsByCode[pl.code] ?? []"
                        :key="pv.version"
                        :active="
                          state.myBasesPriceListCode === pl.code &&
                          state.myBasesPriceListVersion === pv.version
                        "
                        @click="selectPriceList(pl.code, pv.version)"
                      >
                        <v-list-item-title>
                          v{{ pv.version }}{{ pv.label ? ` — ${pv.label}` : '' }}
                          <v-chip
                            v-if="pv.isCurrent"
                            size="x-small"
                            variant="tonal"
                            color="success"
                            class="ml-2"
                          >
                            current
                          </v-chip>
                        </v-list-item-title>
                        <v-list-item-subtitle>
                          {{
                            pv.promotedAt
                              ? `promoted ${new Date(pv.promotedAt).toLocaleDateString()}`
                              : `created ${new Date(pv.createdAt).toLocaleDateString()}`
                          }}
                        </v-list-item-subtitle>
                      </v-list-item>
                    </v-list>
                  </v-menu>

                  <!-- FIO list: plain item with info tooltip (no versions) -->
                  <v-list-item
                    v-else
                    :active="state.myBasesPriceListCode === pl.code"
                    @click="selectPriceList(pl.code, null)"
                  >
                    <v-list-item-title class="d-flex align-center">
                      {{ pl.name }}
                      <v-tooltip
                        text="FIO price lists aren't versioned — they sync directly from game data"
                        location="end"
                      >
                        <template #activator="{ props: ttProps }">
                          <v-icon v-bind="ttProps" size="x-small" class="ml-2 text-medium-emphasis">
                            mdi-sync
                          </v-icon>
                        </template>
                      </v-tooltip>
                    </v-list-item-title>
                    <v-list-item-subtitle> {{ pl.code }} · {{ pl.currency }} </v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-list>
            </v-menu>
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field
              :model-value="burnDays"
              label="Burn Days"
              type="number"
              density="compact"
              hide-details
              :min="1"
              @update:model-value="onBurnDaysInput"
            />
          </v-col>
          <v-col cols="6" md="2">
            <v-text-field
              :model-value="repairDays"
              label="Repair Days"
              type="number"
              density="compact"
              hide-details
              :min="0"
              @update:model-value="onRepairDaysInput"
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <div v-if="filteredPlanets.length > 0" class="d-flex justify-end mb-2">
      <v-btn
        variant="tonal"
        size="small"
        prepend-icon="mdi-content-copy"
        @click="copyMyBasesSummaryCsv"
      >
        Copy Summary CSV
      </v-btn>
    </div>

    <v-expansion-panels v-model="expandedPanels" multiple>
      <v-expansion-panel
        v-for="planet in filteredPlanets"
        :key="planet.planetNaturalId"
        :value="planet.planetNaturalId"
      >
        <v-expansion-panel-title>
          <div class="d-flex align-center" style="width: 100%">
            <v-icon start size="small">mdi-earth</v-icon>
            <span class="font-weight-medium">{{ planet.planetName }}</span>
            <span class="text-medium-emphasis ml-2">({{ planet.planetNaturalId }})</span>
            <v-spacer />
            <v-chip
              size="x-small"
              class="mr-2"
              variant="tonal"
              :color="worstBuildingColor(planet.buildings)"
            >
              {{ planet.buildingCount }} buildings
            </v-chip>
            <v-chip size="x-small" class="mr-2" variant="tonal" color="primary">
              {{ planet.materials.length }} materials
            </v-chip>
            <v-chip
              v-if="state.myBasesPriceListCode"
              size="x-small"
              variant="tonal"
              :color="planetPriceTotals(planet).total >= 0 ? 'success' : 'error'"
            >
              {{ formatCurrencyWhole(planetPriceTotals(planet).total) }} {{ priceListCurrency }}
            </v-chip>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <!-- Chips (left) + Prices From (right) -->
          <div class="d-flex align-start mb-3 ga-3 flex-wrap">
            <div class="flex-grow-1">
              <div v-if="planet.workforceSummary.length > 0" class="mb-2">
                <span class="text-subtitle-2">Workforce</span>
                <v-chip
                  v-for="wf in sortedWorkforce(planet.workforceSummary)"
                  :key="wf.type"
                  size="small"
                  variant="tonal"
                  class="ml-2"
                >
                  {{ wf.type }}: {{ wf.population }}/{{ wf.required }}
                </v-chip>
              </div>

              <div v-if="planet.buildings.length > 0">
                <span class="text-subtitle-2">Buildings</span>
                <v-chip
                  v-for="b in aggregateBuildings(planet.buildings)"
                  :key="b.ticker"
                  size="small"
                  variant="tonal"
                  :color="b.color"
                  class="ml-2"
                >
                  <v-tooltip v-if="b.color !== 'info'" activator="parent" location="top">
                    Oldest: {{ b.maxAgeDays.toFixed(1) }} days
                  </v-tooltip>
                  <v-tooltip v-else activator="parent" location="top">
                    No repairs needed
                  </v-tooltip>
                  {{ b.ticker }}: {{ b.count }}
                </v-chip>
              </div>
            </div>

            <div
              style="flex: 0 0 280px; max-width: 280px"
              class="d-flex flex-column align-end ga-2"
            >
              <v-autocomplete
                :model-value="effectiveLocationFor(planet.planetNaturalId)"
                :items="locationItems"
                item-title="label"
                item-value="value"
                label="Prices From"
                density="compact"
                hide-details
                clearable
                :disabled="!state.myBasesPriceListCode"
                style="width: 100%"
                @update:model-value="
                  v =>
                    (state.myBasesPricesFromByPlanet = {
                      ...state.myBasesPricesFromByPlanet,
                      [planet.planetNaturalId]: v ?? '',
                    })
                "
              />
              <v-btn
                variant="tonal"
                size="small"
                prepend-icon="mdi-content-copy"
                @click="copyMyBasesCsv(planet)"
              >
                Copy CSV
              </v-btn>
            </div>
          </div>

          <!-- Materials table -->
          <v-data-table
            :items="planet.materials"
            :headers="myBasesHeaders"
            density="compact"
            :items-per-page="-1"
            hide-default-footer
          >
            <template #header.repairDaily="{ column }">
              <span class="d-inline-flex align-center justify-center ga-1">
                {{ column.title }}
                <v-icon size="x-small" class="text-medium-emphasis">
                  mdi-information-outline
                  <v-tooltip activator="parent" location="top" max-width="340">
                    <div class="text-caption">
                      <strong>Repair/Day is an amortized projection</strong>, not a steady-state
                      wear rate. <br /><br />
                      We compute the full repair cost at the end of <em>repairDays</em> — which
                      includes <em>all accumulated wear since the last repair</em> — then divide by
                      repairDays. <br /><br />
                      This is useful for planning when to buy materials, but runs higher than
                      PRUNplanner's "Degradation" on aged bases. PRUN reports the intrinsic rate
                      (constructionCost ÷ 180 per day), independent of age.
                    </div>
                  </v-tooltip>
                </v-icon>
              </span>
            </template>
            <template #item.commodityTicker="{ item }">
              <CommodityDisplay :ticker="item.commodityTicker" />
            </template>
            <template #item.burnDaily="{ item }"> {{ formatNumber(item.burnDaily) }} </template>
            <template #item.inputsDaily="{ item }"> {{ formatNumber(item.inputsDaily) }} </template>
            <template #item.repairDaily="{ item }">
              {{ formatNumber(repairDaily(item)) }}
            </template>
            <template #item.productionDaily="{ item }">
              <span v-if="item.productionDaily > 0" class="text-success">
                {{ formatNumber(item.productionDaily) }}
              </span>
              <span v-else>-</span>
            </template>
            <template #item.netDaily="{ item }">
              <span
                class="font-weight-medium"
                :class="netDaily(item) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ formatNumber(netDaily(item)) }}
              </span>
            </template>
            <template #item.netTotal="{ item }">
              <span
                class="font-weight-bold"
                :class="netTotal(item) >= 0 ? 'text-success' : 'text-error'"
              >
                {{ formatNumber(netTotal(item)) }}
              </span>
            </template>
            <template #item.pricePerDay="{ item }">
              <span
                :class="
                  pricePerDay(planet.planetNaturalId, item) > 0
                    ? 'text-success'
                    : pricePerDay(planet.planetNaturalId, item) < 0
                      ? 'text-error'
                      : ''
                "
              >
                {{ formatCurrency(pricePerDay(planet.planetNaturalId, item)) }}
              </span>
            </template>
            <template #item.totalPrice="{ item }">
              <span
                class="font-weight-medium"
                :class="
                  totalPrice(planet.planetNaturalId, item) > 0
                    ? 'text-success'
                    : totalPrice(planet.planetNaturalId, item) < 0
                      ? 'text-error'
                      : ''
                "
              >
                {{ formatCurrency(totalPrice(planet.planetNaturalId, item)) }}
              </span>
            </template>
            <template #body.append>
              <tr>
                <td :colspan="7" class="text-right text-medium-emphasis">
                  Production Revenue ({{ priceListCurrency }}):
                </td>
                <td class="text-center text-success">
                  {{ formatCurrency(planetPriceTotals(planet).perDayProduction) }}
                </td>
                <td class="text-center text-success">
                  {{ formatCurrency(planetPriceTotals(planet).totalProduction) }}
                </td>
              </tr>
              <tr>
                <td :colspan="7" class="text-right text-medium-emphasis">
                  Workforce Cost ({{ priceListCurrency }}):
                </td>
                <td class="text-center text-error">
                  {{ formatCurrency(planetPriceTotals(planet).perDayWorkforce) }}
                </td>
                <td class="text-center text-error">
                  {{ formatCurrency(planetPriceTotals(planet).totalWorkforce) }}
                </td>
              </tr>
              <tr>
                <td :colspan="7" class="text-right text-medium-emphasis">
                  Production Inputs ({{ priceListCurrency }}):
                </td>
                <td class="text-center text-error">
                  {{ formatCurrency(planetPriceTotals(planet).perDayInputs) }}
                </td>
                <td class="text-center text-error">
                  {{ formatCurrency(planetPriceTotals(planet).totalInputs) }}
                </td>
              </tr>
              <tr>
                <td :colspan="7" class="text-right text-medium-emphasis">
                  Repair ({{ priceListCurrency }}):
                </td>
                <td class="text-center text-error">
                  {{ formatCurrency(planetPriceTotals(planet).perDayRepair) }}
                </td>
                <td class="text-center text-error">
                  {{ formatCurrency(planetPriceTotals(planet).totalRepair) }}
                </td>
              </tr>
              <tr class="font-weight-bold">
                <td :colspan="7" class="text-right text-medium-emphasis">
                  Net Total ({{ priceListCurrency }}):
                </td>
                <td
                  class="text-center"
                  :class="planetPriceTotals(planet).perDay >= 0 ? 'text-success' : 'text-error'"
                >
                  {{ formatCurrency(planetPriceTotals(planet).perDay) }}
                </td>
                <td
                  class="text-center"
                  :class="planetPriceTotals(planet).total >= 0 ? 'text-success' : 'text-error'"
                >
                  {{ formatCurrency(planetPriceTotals(planet).total) }}
                </td>
              </tr>
            </template>
          </v-data-table>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Aggregated Materials (empire-wide view) -->
    <v-card v-if="aggregatedMaterials.length > 0" class="mb-4 mt-4">
      <v-card-title class="text-subtitle-1">
        Empire Materials
        <v-chip size="x-small" class="ml-2" variant="tonal">
          {{ filteredEmpireMaterials.length }} commodities
        </v-chip>
      </v-card-title>
      <v-card-text class="pb-0">
        <div class="d-flex align-center ga-2">
          <FilterMenu
            :commodity-options="commodityFilterOptions"
            :location-options="[]"
            :category-options="categoryFilterOptions"
            :active-chips="empireMaterialsTickerChips"
            :filter-types="empireMaterialsFilterTypes"
            :show-saved="false"
            @select="onFilterMenuSelect"
          />
          <TokenSearchInput
            :chips="empireMaterialsTickerChips"
            :extra-suggestion-types="tickerCategorySuggestions"
            :allowed-suggestion-types="['commodity', 'category']"
            :chip-icon-by-type="tickerChipIcons"
            :help-tokens="tickerHelpTokens"
            :get-commodity-display="tickerDisplayForChip"
            leading-icon="mdi-tag-multiple"
            paste-split-to="commodity"
            enter-creates-type="commodity"
            placeholder="Filter materials by ticker or category…"
            history-key="my-bases-materials"
            class="flex-grow-1"
            @update:chips="onEmpireMaterialsTickerChipsUpdate"
          />
        </div>
      </v-card-text>
      <v-data-table
        :items="filteredEmpireMaterials"
        :headers="empireMaterialsHeaders"
        density="compact"
        :items-per-page="-1"
        hide-default-footer
      >
        <template #item.commodityTicker="{ item }">
          <CommodityDisplay :ticker="item.commodityTicker" />
        </template>
        <template #item.burnDaily="{ item }">
          {{ formatNumber(item.burnDaily) }}
        </template>
        <template #item.inputsDaily="{ item }">
          {{ formatNumber(item.inputsDaily) }}
        </template>
        <template #item.repairDaily="{ item }">
          {{ formatNumber(empireRepairDaily(item)) }}
        </template>
        <template #item.productionDaily="{ item }">
          <span v-if="item.productionDaily > 0" class="text-success">
            {{ formatNumber(item.productionDaily) }}
          </span>
          <span v-else>-</span>
        </template>
        <template #item.netDaily="{ item }">
          <span
            class="font-weight-medium"
            :class="empireNetDaily(item) >= 0 ? 'text-success' : 'text-error'"
          >
            {{ formatNumber(empireNetDaily(item)) }}
          </span>
        </template>
        <template #item.netTotal="{ item }">
          <span
            class="font-weight-bold"
            :class="empireNetTotal(item) >= 0 ? 'text-success' : 'text-error'"
          >
            {{ formatNumber(empireNetTotal(item)) }}
          </span>
        </template>
      </v-data-table>
    </v-card>

    <!-- Aggregated Buildings & Workforce (same style as Corp Overview) -->
    <v-card
      v-if="aggregatedBuildings && Object.keys(aggregatedBuildings).length > 0"
      class="mb-4 mt-4"
    >
      <v-card-title class="text-subtitle-1">
        Buildings
        <v-chip size="x-small" class="ml-2" variant="tonal">
          {{ totalBuildingCount }} total
        </v-chip>
      </v-card-title>
      <v-card-text>
        <v-chip
          v-for="(count, ticker) in aggregatedBuildings"
          :key="ticker"
          size="small"
          variant="tonal"
          class="mr-1 mb-1"
        >
          {{ ticker }}: {{ count }}
        </v-chip>
      </v-card-text>
    </v-card>

    <v-card v-if="aggregatedWorkforce.length > 0">
      <v-card-title class="text-subtitle-1">Workforce</v-card-title>
      <v-data-table
        :items="aggregatedWorkforce"
        :headers="workforceHeaders"
        density="compact"
        :items-per-page="-1"
        hide-default-footer
      >
        <template #item.totalPopulation="{ item }">
          {{ item.totalPopulation.toLocaleString() }}
        </template>
        <template #item.totalRequired="{ item }">
          {{ item.totalRequired.toLocaleString() }}
        </template>
      </v-data-table>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { api } from '../services/api'
import { usePageState } from '../composables/usePageState'
import { useSettingsStore } from '../stores/settings'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import TokenSearchInput, {
  type SearchChip,
  type ExtraSuggestionType,
} from '../components/TokenSearchInput.vue'
import FilterMenu, { type FilterTypeConfig } from '../components/FilterMenu.vue'
import type {
  BurnRepairMyBasesResponse,
  BurnRepairBuildingInstance,
  BurnRepairCacheRow,
  BurnRepairPlanetSummary,
  Currency,
  Commodity,
} from '@kawakawa/types'
import {
  formatNumber,
  repairDaily as repairDailyPure,
  netDaily as netDailyPure,
} from '../utils/burnRepairFormat'
import { scopeEntriesToChips, chipsToScopeEntries, resolveTickerScope } from '../utils/tickerScope'

interface PriceListLite {
  code: string
  name: string
  type: 'fio' | 'custom'
  currency: Currency
  defaultLocationId: string | null
  currentVersion: number
}

interface PriceListVersionLite {
  version: number
  label: string | null
  isCurrent: boolean
  isLatest: boolean
  promotedAt: string | null
  createdAt: string
}

// ==================== STATE ====================

const { state } = usePageState('my-bases', {
  myBasesPlanetFilter: [] as string[],
  myBasesPriceListCode: null as string | null,
  /** null = use price list's current version */
  myBasesPriceListVersion: null as number | null,
  /** Per-planet override for the price lookup location; empty/missing = use price list default */
  myBasesPricesFromByPlanet: {} as Record<string, string>,
  /** Ticker/category filter for empire materials table */
  empireMaterialsFilter: [] as string[],
})

const settingsStore = useSettingsStore()

// Local ref + debounced save. Column math reacts instantly to typing; the
// settings API write (and, for repairDays, the backend recompute) waits.
const burnDays = ref(7)
const repairDays = ref(0)

watch(
  () => settingsStore.getSetting<number>('burnRepair.burnDays'),
  v => {
    if (typeof v === 'number' && v > 0) burnDays.value = v
  },
  { immediate: true }
)
watch(
  () => settingsStore.getSetting<number>('burnRepair.repairDays'),
  v => {
    if (typeof v === 'number' && v >= 0) repairDays.value = v
  },
  { immediate: true }
)

const DAYS_DEBOUNCE_MS = 500
let burnDaysTimer: ReturnType<typeof setTimeout> | undefined
let repairDaysTimer: ReturnType<typeof setTimeout> | undefined

function onBurnDaysInput(v: unknown) {
  const n = Math.max(1, Math.floor(Number(v) || 1))
  burnDays.value = n
  clearTimeout(burnDaysTimer)
  burnDaysTimer = setTimeout(() => {
    void settingsStore.updateSetting('burnRepair.burnDays', n)
  }, DAYS_DEBOUNCE_MS)
}

function onRepairDaysInput(v: unknown) {
  const n = Math.max(0, Math.floor(Number(v) || 0))
  repairDays.value = n
  clearTimeout(repairDaysTimer)
  repairDaysTimer = setTimeout(async () => {
    await settingsStore.updateSetting('burnRepair.repairDays', n)
    await loadMyBases()
  }, DAYS_DEBOUNCE_MS)
}

// Fixed workforce ladder — chip order should match the game's progression
const WORKFORCE_ORDER = ['PIONEER', 'SETTLER', 'TECHNICIAN', 'ENGINEER', 'SCIENTIST']
function workforceRank(type: string): number {
  const i = WORKFORCE_ORDER.indexOf(type.toUpperCase())
  return i === -1 ? 999 : i
}

const loading = ref(false)
const expandedPanels = ref<string[]>([])

const myBases = ref<BurnRepairMyBasesResponse | null>(null)

const locationItems = ref<{ label: string; value: string }[]>([])

const priceLists = ref<PriceListLite[]>([])
/** Versions for each custom price list — keyed by code */
const priceListVersionsByCode = ref<Record<string, PriceListVersionLite[]>>({})
/** Effective prices keyed by `${code}:v${version}:${locationId}` → ticker → finalPrice */
const priceCache = ref<Record<string, Record<string, number>>>({})
const priceLoading = ref<Set<string>>(new Set())

const selectedPriceList = computed(() =>
  priceLists.value.find(pl => pl.code === state.myBasesPriceListCode)
)
const priceListCurrency = computed<Currency>(() => selectedPriceList.value?.currency ?? 'ICA')

/** Resolved version for API/cache key — falls back to the list's current version. */
const effectiveVersion = computed<number | null>(() => {
  if (state.myBasesPriceListVersion !== null) return state.myBasesPriceListVersion
  return selectedPriceList.value?.currentVersion ?? null
})

const priceListMenuLabel = computed(() => {
  const pl = selectedPriceList.value
  if (!pl) return 'Select Price List'
  if (pl.type === 'fio') return pl.name
  const pinned = state.myBasesPriceListVersion
  if (pinned === null) return `${pl.name} · Latest`
  const match = priceListVersionsByCode.value[pl.code]?.find(pv => pv.version === pinned)
  const suffix = match?.label ? ` ${match.label}` : ''
  return `${pl.name} · v${pinned}${suffix}`
})

function selectPriceList(code: string, version: number | null) {
  state.myBasesPriceListCode = code
  state.myBasesPriceListVersion = version
}

const snackbar = reactive({ show: false, message: '', color: 'success' })

// ==================== TABLE HEADERS ====================

const workforceHeaders = [
  { title: 'Type', key: 'type', sortable: false, align: 'start' as const },
  { title: 'Population', key: 'totalPopulation', sortable: false, align: 'end' as const },
  { title: 'Required', key: 'totalRequired', sortable: false, align: 'end' as const },
]

const empireMaterialsHeaders = [
  { title: 'Material', key: 'commodityTicker', sortable: true, align: 'start' as const },
  { title: 'Burn/Day', key: 'burnDaily', sortable: true, align: 'center' as const },
  { title: 'Inputs/Day', key: 'inputsDaily', sortable: true, align: 'center' as const },
  { title: 'Repair/Day', key: 'repairDaily', sortable: true, align: 'center' as const },
  { title: 'Production/Day', key: 'productionDaily', sortable: true, align: 'center' as const },
  { title: 'Net/Day', key: 'netDaily', sortable: true, align: 'center' as const },
  { title: 'Net Total', key: 'netTotal', sortable: true, align: 'center' as const },
]

const myBasesHeaders = computed(() => [
  { title: 'Material', key: 'commodityTicker', sortable: false, align: 'start' as const },
  { title: 'Burn/Day', key: 'burnDaily', sortable: false, align: 'center' as const },
  { title: 'Inputs/Day', key: 'inputsDaily', sortable: false, align: 'center' as const },
  { title: 'Repair/Day', key: 'repairDaily', sortable: false, align: 'center' as const },
  { title: 'Production/Day', key: 'productionDaily', sortable: false, align: 'center' as const },
  { title: 'Net/Day', key: 'netDaily', sortable: false, align: 'center' as const },
  { title: 'Net Total', key: 'netTotal', sortable: false, align: 'center' as const },
  {
    title: `Price/Day (${priceListCurrency.value})`,
    key: 'pricePerDay',
    sortable: false,
    align: 'center' as const,
  },
  {
    title: `Total Price (${priceListCurrency.value})`,
    key: 'totalPrice',
    sortable: false,
    align: 'center' as const,
  },
])

// ==================== DATA LOADING ====================

async function loadMyBases() {
  try {
    myBases.value = await api.burnRepair.myBases()
  } catch (e) {
    console.error('Failed to load my bases', e)
  }
}

async function loadPriceLists() {
  try {
    const lists = await api.priceLists.list()
    priceLists.value = lists.map(pl => ({
      code: pl.code,
      name: pl.name,
      type: pl.type,
      currency: pl.currency,
      defaultLocationId: pl.defaultLocationId,
      currentVersion: pl.currentVersion,
    }))
    // If no selection yet, fall back to user's default price list
    if (!state.myBasesPriceListCode) {
      const userDefault = settingsStore.getSetting<string | null>('market.defaultPriceList')
      if (userDefault && priceLists.value.some(pl => pl.code === userDefault)) {
        state.myBasesPriceListCode = userDefault
      } else if (priceLists.value.length > 0) {
        state.myBasesPriceListCode = priceLists.value[0].code
      }
    }
  } catch (e) {
    console.error('Failed to load price lists', e)
  }
}

async function loadAllPriceListVersions() {
  const customLists = priceLists.value.filter(pl => pl.type !== 'fio')
  const map: Record<string, PriceListVersionLite[]> = {}
  await Promise.all(
    customLists.map(async pl => {
      try {
        const versions = await api.priceLists.versions.list(pl.code)
        map[pl.code] = versions.map(v => ({
          version: v.version,
          label: v.label,
          isCurrent: v.isCurrent,
          isLatest: v.isLatest,
          promotedAt: v.promotedAt,
          createdAt: v.createdAt,
        }))
      } catch (e) {
        console.error(`Failed to load versions for ${pl.code}`, e)
        map[pl.code] = []
      }
    })
  )
  priceListVersionsByCode.value = map
}

function effectiveLocationFor(planetId: string): string | null {
  return (
    state.myBasesPricesFromByPlanet[planetId] || selectedPriceList.value?.defaultLocationId || null
  )
}

function priceCacheKey(code: string, version: number | null, locationId: string): string {
  return `${code}:v${version ?? 'latest'}:${locationId}`
}

async function ensurePricesFor(planetId: string): Promise<void> {
  const code = state.myBasesPriceListCode
  const loc = effectiveLocationFor(planetId)
  const version = effectiveVersion.value
  if (!code || !loc) return
  const key = priceCacheKey(code, version, loc)
  if (priceCache.value[key] || priceLoading.value.has(key)) return

  priceLoading.value.add(key)
  try {
    const prices = await api.prices.getEffective(code, loc, priceListCurrency.value, {
      version: version ?? undefined,
    })
    const map: Record<string, number> = {}
    for (const p of prices) map[p.commodityTicker] = p.finalPrice
    priceCache.value = { ...priceCache.value, [key]: map }
  } catch (e) {
    console.error(`Failed to load prices for ${key}`, e)
  } finally {
    priceLoading.value.delete(key)
  }
}

async function ensurePricesForVisible(): Promise<void> {
  const planets = filteredPlanets.value
  await Promise.all(planets.map(p => ensurePricesFor(p.planetNaturalId)))
}

function priceFor(planetId: string, ticker: string): number {
  const code = state.myBasesPriceListCode
  const loc = effectiveLocationFor(planetId)
  if (!code || !loc) return 0
  const map = priceCache.value[priceCacheKey(code, effectiveVersion.value, loc)]
  return map?.[ticker] ?? 0
}

async function loadLocations() {
  try {
    // Load all locations (stations + planets) for the "Prices From" picker
    const response = await fetch('/api/locations', {
      headers: { Authorization: `Bearer ${localStorage.getItem('jwt')}` },
    })
    if (response.ok) {
      const locations = await response.json()
      locationItems.value = locations.map((l: { naturalId: string; name: string }) => ({
        label: `${l.name} (${l.naturalId})`,
        value: l.naturalId,
      }))
    }
  } catch (e) {
    console.error('Failed to load locations', e)
  }
}

async function loadAll() {
  loading.value = true
  await Promise.all([loadMyBases(), loadLocations(), loadPriceLists()])
  await loadAllPriceListVersions()
  await ensurePricesForVisible()
  loading.value = false
}

// ==================== DERIVED DATA ====================

const myBasesPlanetOptions = computed<KeyValueItem[]>(() =>
  (myBases.value?.planets ?? []).map(p => ({
    key: p.planetNaturalId,
    display:
      locationService.getLocationDisplay(
        p.planetNaturalId,
        settingsStore.locationDisplayMode.value
      ) || p.planetName,
    locationType: 'Planet' as const,
    isUserLocation: true,
  }))
)

const filteredPlanets = computed(() => {
  const all = myBases.value?.planets ?? []
  const filter = state.myBasesPlanetFilter ?? []
  if (filter.length === 0) return all
  const set = new Set(filter)
  return all.filter(p => set.has(p.planetNaturalId))
})

/** Aggregate building counts across filtered planets */
const aggregatedBuildings = computed<Record<string, number>>(() => {
  const result: Record<string, number> = {}
  for (const planet of filteredPlanets.value) {
    for (const b of planet.buildings) {
      result[b.ticker] = (result[b.ticker] ?? 0) + 1
    }
  }
  // Sort by ticker
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
})

const totalBuildingCount = computed(() =>
  Object.values(aggregatedBuildings.value).reduce((sum, c) => sum + c, 0)
)

/** Aggregate workforce across filtered planets */
const aggregatedWorkforce = computed(() => {
  const map = new Map<string, { population: number; required: number }>()
  for (const planet of filteredPlanets.value) {
    for (const wf of planet.workforceSummary) {
      const existing = map.get(wf.type) ?? { population: 0, required: 0 }
      existing.population += wf.population
      existing.required += wf.required
      map.set(wf.type, existing)
    }
  }
  return WORKFORCE_ORDER.filter(t => map.has(t)).map(t => ({
    type: t,
    totalPopulation: map.get(t)!.population,
    totalRequired: map.get(t)!.required,
  }))
})

/** Empire-wide aggregated material row */
interface EmpireMaterial {
  commodityTicker: string
  burnDaily: number
  inputsDaily: number
  repairTotal: number
  productionDaily: number
}

/** Aggregate materials across all filtered planets */
const aggregatedMaterials = computed<EmpireMaterial[]>(() => {
  const map = new Map<string, EmpireMaterial>()
  for (const planet of filteredPlanets.value) {
    for (const m of planet.materials) {
      const existing = map.get(m.commodityTicker)
      if (existing) {
        existing.burnDaily += m.burnDaily
        existing.inputsDaily += m.inputsDaily
        existing.repairTotal += m.repairTotal
        existing.productionDaily += m.productionDaily
      } else {
        map.set(m.commodityTicker, {
          commodityTicker: m.commodityTicker,
          burnDaily: m.burnDaily,
          inputsDaily: m.inputsDaily,
          repairTotal: m.repairTotal,
          productionDaily: m.productionDaily,
        })
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.commodityTicker.localeCompare(b.commodityTicker))
})

function empireRepairDaily(m: EmpireMaterial): number {
  return repairDailyPure(m, repairDays.value)
}

function empireNetDaily(m: EmpireMaterial): number {
  return netDailyPure(m, repairDays.value)
}

function empireNetTotal(m: EmpireMaterial): number {
  return (m.productionDaily - m.burnDaily - m.inputsDaily) * burnDays.value - m.repairTotal
}

// ==================== TokenSearchInput wiring ====================

const commodityCatalog = ref<Commodity[]>([])

async function loadCommodityCatalog() {
  const cached = commodityService.getAllCommoditiesSync()
  commodityCatalog.value = cached.length > 0 ? cached : await commodityService.getAllCommodities()
}
void loadCommodityCatalog()

const tickerDisplayForChip = (ticker: string): string =>
  commodityService.getCommodityDisplay(ticker, settingsStore.commodityDisplayMode.value)

const tickerCategorySuggestions = computed<ExtraSuggestionType[]>(() => {
  const counts = new Map<string, number>()
  for (const c of commodityCatalog.value) {
    if (!c.category) continue
    counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
  }
  const options = [...counts.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map(cat => ({ value: cat, display: cat }))
  return [
    {
      type: 'category',
      typeLabel: 'Category',
      color: 'teal',
      options,
    },
  ]
})

const tickerChipIcons = {
  category: 'mdi-folder-outline',
  commodity: 'mdi-package-variant',
} as const

const tickerHelpTokens = [
  {
    label: 'Ticker',
    color: 'primary',
    example: 'RAT',
    description: 'A single commodity ticker.',
    icon: 'mdi-package-variant',
  },
  {
    label: 'Category',
    color: 'teal',
    example: 'category:Consumables (basic)',
    description: 'Live reference — expands to every ticker in this category right now.',
    icon: 'mdi-folder-outline',
  },
]

const empireMaterialsTickerChips = computed<SearchChip[]>(() =>
  scopeEntriesToChips(state.empireMaterialsFilter ?? [], tickerDisplayForChip)
)

function onEmpireMaterialsTickerChipsUpdate(chips: SearchChip[]): void {
  state.empireMaterialsFilter = chipsToScopeEntries(chips)
}

/** Resolve filter to a set of tickers, then filter aggregatedMaterials */
const filteredEmpireMaterials = computed<EmpireMaterial[]>(() => {
  const filter = state.empireMaterialsFilter ?? []
  if (filter.length === 0) return aggregatedMaterials.value

  const tickerSet = resolveTickerScope(filter, commodityCatalog.value)
  if (!tickerSet) return aggregatedMaterials.value
  return aggregatedMaterials.value.filter(m => tickerSet.has(m.commodityTicker))
})

// ==================== FilterMenu wiring ====================

const empireMaterialsFilterTypes: FilterTypeConfig[] = [
  { key: 'commodity', label: 'Commodities', color: 'primary', icon: 'mdi-cube-outline' },
  { key: 'category', label: 'Category', icon: 'mdi-tag-outline' },
]

/** Commodity options for FilterMenu - all tickers present in the user's empire */
const commodityFilterOptions = computed(() =>
  aggregatedMaterials.value.map(m => ({
    value: m.commodityTicker,
    display: tickerDisplayForChip(m.commodityTicker),
  }))
)

/** Category options for FilterMenu - all categories that have tickers in the user's empire */
const categoryFilterOptions = computed(() => {
  const empireTickers = new Set(aggregatedMaterials.value.map(m => m.commodityTicker))
  const categories = new Set<string>()
  for (const c of commodityCatalog.value) {
    if (c.category && empireTickers.has(c.ticker)) {
      categories.add(c.category)
    }
  }
  return [...categories].sort().map(cat => ({ title: cat, value: cat }))
})

function onFilterMenuSelect(payload: { filterType: string; key: string; display: string }): void {
  const current = state.empireMaterialsFilter ?? []
  if (payload.filterType === 'commodity') {
    // Toggle commodity ticker
    if (current.includes(payload.key)) {
      state.empireMaterialsFilter = current.filter(t => t !== payload.key)
    } else {
      state.empireMaterialsFilter = [...current, payload.key]
    }
  } else if (payload.filterType === 'category') {
    // Toggle category
    const catEntry = `category:${payload.key}`
    if (current.includes(catEntry)) {
      state.empireMaterialsFilter = current.filter(t => t !== catEntry)
    } else {
      state.empireMaterialsFilter = [...current, catEntry]
    }
  }
}

// ==================== HELPERS ====================

function repairDaily(m: { repairTotal: number }): number {
  return repairDailyPure(m, repairDays.value)
}

function netDaily(m: {
  burnDaily: number
  inputsDaily: number
  productionDaily: number
  repairTotal: number
}): number {
  return netDailyPure(m, repairDays.value)
}

/**
 * Net over the planning window: burn/inputs/production project over burnDays,
 * but repair uses its own period (the whole repairTotal is the commitment over
 * repairDays). So we sum the two independently rather than Net/Day × burnDays.
 */
function netTotal(m: {
  burnDaily: number
  inputsDaily: number
  productionDaily: number
  repairTotal: number
}): number {
  return (m.productionDaily - m.burnDaily - m.inputsDaily) * burnDays.value - m.repairTotal
}

function pricePerDay(planetId: string, m: BurnRepairCacheRow): number {
  return priceFor(planetId, m.commodityTicker) * netDaily(m)
}

function totalPrice(planetId: string, m: BurnRepairCacheRow): number {
  return priceFor(planetId, m.commodityTicker) * netTotal(m)
}

/**
 * Per-planet cash-flow breakdown, matching PRUNplanner's categories so numbers
 * compare 1:1. Costs are signed negative so rows sum cleanly to the net.
 *
 *   net = production_revenue + workforce + inputs + repair
 *
 * Period math:
 *   - workforce/inputs/production flow at daily rate × burnDays
 *   - repair is a lump sum over repairDays, so "perDay" = repairTotal / repairDays
 *     and "total" = repairTotal (independent of burnDays)
 */
function planetPriceTotals(planet: { planetNaturalId: string; materials: BurnRepairCacheRow[] }) {
  let perDayProduction = 0
  let perDayWorkforce = 0
  let perDayInputs = 0
  let perDayRepair = 0
  for (const m of planet.materials) {
    const price = priceFor(planet.planetNaturalId, m.commodityTicker)
    if (price === 0) continue
    perDayProduction += price * m.productionDaily
    perDayWorkforce -= price * m.burnDaily
    perDayInputs -= price * m.inputsDaily
    perDayRepair -= price * repairDaily(m)
  }
  const perDay = perDayProduction + perDayWorkforce + perDayInputs + perDayRepair

  const totalProduction = perDayProduction * burnDays.value
  const totalWorkforce = perDayWorkforce * burnDays.value
  const totalInputs = perDayInputs * burnDays.value
  // Repair: full repairTotal × price is the commitment over repairDays
  let totalRepair = 0
  for (const m of planet.materials) {
    const price = priceFor(planet.planetNaturalId, m.commodityTicker)
    totalRepair -= price * m.repairTotal
  }
  const total = totalProduction + totalWorkforce + totalInputs + totalRepair

  return {
    perDayProduction,
    perDayWorkforce,
    perDayInputs,
    perDayRepair,
    perDay,
    totalProduction,
    totalWorkforce,
    totalInputs,
    totalRepair,
    total,
  }
}

function toCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

async function copyCsv(headers: string[], rows: unknown[][], successLabel = 'CSV'): Promise<void> {
  const lines = [headers.map(toCsvCell).join(','), ...rows.map(r => r.map(toCsvCell).join(','))]
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    snackbar.message = `${successLabel} copied to clipboard`
    snackbar.color = 'success'
  } catch (e) {
    console.error('Clipboard write failed', e)
    snackbar.message = 'Failed to copy to clipboard'
    snackbar.color = 'error'
  }
  snackbar.show = true
}

function copyMyBasesSummaryCsv(): void {
  const headers = [
    'Location Name',
    'Location ID',
    'Production Buildings',
    'Production Revenue',
    'Workforce Cost',
    'Production Inputs',
    'Repair',
    'Net Total',
  ]
  const rows = filteredPlanets.value.map(planet => {
    const productionBuildings = aggregateBuildings(planet.buildings)
      .filter(b => b.color !== 'info')
      .map(b => `${b.ticker}:${b.count}`)
      .join(', ')
    const totals = planetPriceTotals(planet)
    return [
      planet.planetName,
      planet.planetNaturalId,
      productionBuildings,
      totals.perDayProduction,
      totals.perDayWorkforce,
      totals.perDayInputs,
      totals.perDayRepair,
      totals.perDay,
    ]
  })
  void copyCsv(headers, rows, 'My Bases summary')
}

function copyMyBasesCsv(planet: BurnRepairPlanetSummary): void {
  const headers = [
    'Material',
    'Burn/Day',
    'Inputs/Day',
    'Repair/Day',
    'Production/Day',
    'Net/Day',
    'Net Total',
    `Price/Day (${priceListCurrency.value})`,
    `Total Price (${priceListCurrency.value})`,
  ]
  const rows = planet.materials.map(m => [
    m.commodityTicker,
    m.burnDaily,
    m.inputsDaily,
    repairDaily(m),
    m.productionDaily,
    netDaily(m),
    netTotal(m),
    pricePerDay(planet.planetNaturalId, m),
    totalPrice(planet.planetNaturalId, m),
  ])
  void copyCsv(headers, rows, `${planet.planetName} materials`)
}

function formatCurrency(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '-'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return `${sign}${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Whole-number currency, floored. Used on tight surfaces like chips. */
function formatCurrencyWhole(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '-'
  return Math.floor(n).toLocaleString()
}

function sortedWorkforce<T extends { type: string }>(wf: T[]): T[] {
  return [...wf].sort((a, b) => workforceRank(a.type) - workforceRank(b.type))
}

type BuildingChipColor = 'info' | 'success' | 'warning' | 'error'

interface BuildingChip {
  ticker: string
  count: number
  color: BuildingChipColor
  /** Worst-case age for tooltip */
  maxAgeDays: number
}

// Worst-case precedence: red > yellow > green; blue only when NO building of
// this ticker needs repair (infrastructure like CM/HB1/STO).
function aggregateBuildings(instances: BurnRepairBuildingInstance[]): BuildingChip[] {
  const groups = new Map<string, BurnRepairBuildingInstance[]>()
  for (const b of instances) {
    const arr = groups.get(b.ticker) ?? []
    arr.push(b)
    groups.set(b.ticker, arr)
  }

  const result: BuildingChip[] = []
  for (const [ticker, group] of groups) {
    const anyRepairs = group.some(g => g.needsRepair)
    const maxAge = group.reduce((m, g) => (g.needsRepair && g.ageDays > m ? g.ageDays : m), 0)

    let color: BuildingChipColor
    if (!anyRepairs) {
      color = 'info' // blue — infrastructure, no decay
    } else if (repairDays.value > 0 && maxAge >= repairDays.value) {
      color = 'error' // red — past repair deadline
    } else if (maxAge >= burnDays.value) {
      color = 'warning' // yellow — stock up now
    } else {
      color = 'success' // green — fresh
    }

    result.push({ ticker, count: group.length, color, maxAgeDays: maxAge })
  }

  return result.sort((a, b) => a.ticker.localeCompare(b.ticker))
}

/**
 * Worst-case repair color across all repairable buildings on a planet.
 * Ignores infrastructure (buildings where needsRepair=false). If none need
 * repair, returns 'success' (nothing to worry about).
 */
function worstBuildingColor(
  instances: BurnRepairBuildingInstance[]
): 'success' | 'warning' | 'error' {
  let worst: 'success' | 'warning' | 'error' = 'success'
  for (const b of instances) {
    if (!b.needsRepair) continue
    if (repairDays.value > 0 && b.ageDays >= repairDays.value) return 'error'
    if (b.ageDays >= burnDays.value) worst = 'warning'
  }
  return worst
}

// ==================== LIFECYCLE ====================

watch([() => state.myBasesPriceListCode, () => state.myBasesPriceListVersion], () => {
  void ensurePricesForVisible()
})
watch(
  () => state.myBasesPricesFromByPlanet,
  () => {
    void ensurePricesForVisible()
  },
  { deep: true }
)

onMounted(async () => {
  if (!settingsStore.isLoaded.value) {
    settingsStore.loadFromCache()
    await settingsStore.loadSettings()
  }
  await loadAll()
})
</script>

<style scoped>
:deep(.v-data-table thead th) {
  font-weight: 700 !important;
}

/* Zebra striping — every other data row gets a subtle tint.
   Footer rows (from body.append) lack .v-data-table__tr so they're not matched. */
:deep(.v-data-table tbody tr.v-data-table__tr:nth-of-type(even):not(:hover) > td) {
  background-color: rgba(255, 255, 255, 0.04);
}

/* Hover highlight on data rows. */
:deep(.v-data-table tbody tr.v-data-table__tr:hover > td) {
  background-color: rgba(var(--v-theme-primary), 0.12) !important;
}
</style>
