<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-fire</v-icon>
        Burn &amp; Repair
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
        Workforce burn, production input, and building repair costs. Data is pre-computed during FIO
        sync.
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <v-tabs v-model="state.activeTab" class="mb-4">
      <v-tab value="my-bases">My Bases</v-tab>
      <v-tab value="corp">Corp Overview</v-tab>
      <v-tab value="shopping-list">Shopping List</v-tab>
    </v-tabs>

    <v-tabs-window v-model="state.activeTab">
      <!-- ==================== MY BASES TAB ==================== -->
      <v-tabs-window-item value="my-bases">
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
                  @update:favorites="
                    settingsStore.updateSetting('market.favoritedLocations', $event)
                  "
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
                            <v-list-item-subtitle
                              >Follows the promoted version</v-list-item-subtitle
                            >
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
                              <v-icon
                                v-bind="ttProps"
                                size="x-small"
                                class="ml-2 text-medium-emphasis"
                              >
                                mdi-sync
                              </v-icon>
                            </template>
                          </v-tooltip>
                        </v-list-item-title>
                        <v-list-item-subtitle>
                          {{ pl.code }} · {{ pl.currency }}
                        </v-list-item-subtitle>
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
                          We compute the full repair cost at the end of
                          <em>repairDays</em> — which includes
                          <em>all accumulated wear since the last repair</em> — then divide by
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
                <template #item.burnDaily="{ item }">
                  {{ formatNumber(item.burnDaily) }}
                </template>
                <template #item.inputsDaily="{ item }">
                  {{ formatNumber(item.inputsDaily) }}
                </template>
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
      </v-tabs-window-item>

      <!-- ==================== CORP OVERVIEW TAB ==================== -->
      <v-tabs-window-item value="corp">
        <CorpOverviewPanel
          v-model="state.corpOverviewSubTab"
          :corp-data="corpData"
          :corp-buildings="corpBuildings"
          :corp-workforce="corpWorkforce"
          :repair-days="repairDays"
          @copy-csv="onCorpCopyCsv"
        />
      </v-tabs-window-item>

      <!-- ==================== SHOPPING LIST TAB ==================== -->
      <v-tabs-window-item value="shopping-list">
        <v-card class="mb-4">
          <v-card-text>
            <v-row>
              <v-col cols="12" md="4">
                <v-autocomplete
                  v-model="state.shoppingListOrigin"
                  :items="locationItems"
                  item-title="label"
                  item-value="value"
                  label="Origin (Hub/Station)"
                  density="compact"
                  hide-details
                  clearable
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-autocomplete
                  v-model="state.shoppingListBase"
                  :items="planetItems"
                  item-title="label"
                  item-value="value"
                  label="Base (Planet)"
                  density="compact"
                  hide-details
                  clearable
                />
              </v-col>
              <v-col cols="12" md="2">
                <v-text-field
                  v-model.number="state.shoppingListDays"
                  label="Days"
                  type="number"
                  density="compact"
                  hide-details
                  :min="1"
                />
              </v-col>
              <v-col cols="12" md="2" class="d-flex align-center">
                <v-btn
                  color="primary"
                  :loading="shoppingListLoading"
                  :disabled="
                    !state.shoppingListOrigin || !state.shoppingListBase || !state.shoppingListDays
                  "
                  @click="computeShoppingList"
                >
                  Calculate
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <v-alert
          v-if="shoppingList && shoppingList.items.length === 0 && !shoppingListLoading"
          type="success"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          All needs are covered by existing stock. Nothing to buy!
        </v-alert>

        <div v-if="shoppingList && shoppingList.items.length > 0" class="d-flex justify-end mb-2">
          <v-btn
            variant="tonal"
            size="small"
            prepend-icon="mdi-content-copy"
            @click="copyShoppingListCsv"
          >
            Copy CSV
          </v-btn>
        </div>

        <v-data-table
          v-if="shoppingList && shoppingList.items.length > 0"
          :items="shoppingList.items"
          :headers="shoppingListHeaders"
          density="compact"
          :items-per-page="25"
        >
          <template #item.commodityTicker="{ item }">
            <CommodityDisplay :ticker="item.commodityTicker" />
          </template>
          <template #item.demand="{ item }">
            {{ item.demand.toLocaleString() }}
          </template>
          <template #item.production="{ item }">
            <span v-if="item.production > 0" class="text-success">
              {{ item.production.toLocaleString() }}
            </span>
            <span v-else>-</span>
          </template>
          <template #item.originStock="{ item }">
            {{ item.originStock.toLocaleString() }}
          </template>
          <template #item.baseStock="{ item }">
            {{ item.baseStock.toLocaleString() }}
          </template>
          <template #item.gap="{ item }">
            <span class="font-weight-bold text-error">{{ item.gap.toLocaleString() }}</span>
          </template>
        </v-data-table>
      </v-tabs-window-item>
    </v-tabs-window>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { api } from '../services/api'
import { usePageState } from '../composables/usePageState'
import { useSettingsStore } from '../stores/settings'
import { locationService } from '../services/locationService'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import CorpOverviewPanel from '../components/BurnRepair/CorpOverviewPanel.vue'
import type {
  BurnRepairMyBasesResponse,
  BurnRepairBuildingInstance,
  BurnRepairCacheRow,
  BurnRepairPlanetSummary,
  BurnRepairCorpResponse,
  BurnRepairCorpBuildingsResponse,
  BurnRepairCorpWorkforceResponse,
  BurnRepairCorpMaterial,
  BurnRepairShoppingListResponse,
  Currency,
} from '@kawakawa/types'

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

const { state } = usePageState('burn-repair', {
  activeTab: 'my-bases',
  myBasesPlanetFilter: [] as string[],
  myBasesPriceListCode: null as string | null,
  /** null = use price list's current version */
  myBasesPriceListVersion: null as number | null,
  /** Per-planet override for the price lookup location; empty/missing = use price list default */
  myBasesPricesFromByPlanet: {} as Record<string, string>,
  corpOverviewSubTab: 'consumables',
  shoppingListOrigin: '',
  shoppingListBase: '',
  shoppingListDays: 7,
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
const shoppingListLoading = ref(false)
const expandedPanels = ref<string[]>([])

const myBases = ref<BurnRepairMyBasesResponse | null>(null)
const corpData = ref<BurnRepairCorpResponse | null>(null)
const corpBuildings = ref<BurnRepairCorpBuildingsResponse | null>(null)
const corpWorkforce = ref<BurnRepairCorpWorkforceResponse | null>(null)
const shoppingList = ref<BurnRepairShoppingListResponse | null>(null)

const locationItems = ref<{ label: string; value: string }[]>([])
const planetItems = ref<{ label: string; value: string }[]>([])

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

function corpAvailableFor(ticker: string): number {
  return corpData.value?.availableSurplus?.[ticker] ?? 0
}

const shoppingListHeaders = [
  { title: 'Material', key: 'commodityTicker', sortable: false },
  { title: 'Demand', key: 'demand', sortable: false },
  { title: 'Production', key: 'production', sortable: false },
  { title: 'Origin Stock', key: 'originStock', sortable: false },
  { title: 'Base Stock', key: 'baseStock', sortable: false },
  { title: 'To Buy', key: 'gap', sortable: false },
]

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

async function loadCorpData() {
  try {
    const [corp, buildings, workforce] = await Promise.all([
      api.burnRepair.corp(),
      api.burnRepair.corpBuildings(),
      api.burnRepair.corpWorkforce(),
    ])
    corpData.value = corp
    corpBuildings.value = buildings
    corpWorkforce.value = workforce
  } catch (e) {
    console.error('Failed to load corp data', e)
  }
}

async function loadLocations() {
  try {
    // Load locations for the autocomplete dropdowns
    const planets = await api.supplyPlanning.getPlanets()
    planetItems.value = planets.map(p => ({
      label: `${p.planetName} (${p.planetNaturalId})`,
      value: p.planetNaturalId,
    }))

    // Load all locations (stations + planets) for origin picker
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
  await Promise.all([loadMyBases(), loadCorpData(), loadLocations(), loadPriceLists()])
  await loadAllPriceListVersions()
  await ensurePricesForVisible()
  loading.value = false
}

async function computeShoppingList() {
  if (!state.shoppingListOrigin || !state.shoppingListBase || !state.shoppingListDays) return

  shoppingListLoading.value = true
  try {
    shoppingList.value = await api.burnRepair.shoppingList({
      originLocationId: state.shoppingListOrigin,
      basePlanetId: state.shoppingListBase,
      days: state.shoppingListDays,
    })
  } catch (e) {
    console.error('Failed to compute shopping list', e)
    snackbar.message = 'Failed to compute shopping list'
    snackbar.color = 'error'
    snackbar.show = true
  } finally {
    shoppingListLoading.value = false
  }
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

// ==================== HELPERS ====================

import {
  formatNumber,
  repairDaily as repairDailyPure,
  netDaily as netDailyPure,
} from '../utils/burnRepairFormat'

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

function onCorpCopyCsv(payload: {
  scope: 'consumables' | 'fabs' | 'other'
  materials: BurnRepairCorpMaterial[]
}): void {
  const headers = [
    'Material',
    'Burn/Day',
    'Inputs/Day',
    'Repair',
    'Production/Day',
    'Net/Day',
    'Available',
    'Days Remaining',
  ]
  const rows = payload.materials.map(m => {
    const deficit = m.burnDaily + m.inputsDaily - m.productionDaily
    const avail = corpAvailableFor(m.commodityTicker)
    const days = deficit <= 0 ? '' : avail <= 0 ? 0 : avail / deficit
    return [
      m.commodityTicker,
      m.burnDaily,
      m.inputsDaily,
      m.repairTotal,
      m.productionDaily,
      m.productionDaily - m.burnDaily - m.inputsDaily,
      avail,
      days,
    ]
  })
  const label = `Corp materials (${payload.scope})`
  void copyCsv(headers, rows, label)
}

function copyShoppingListCsv(): void {
  const headers = ['Material', 'Demand', 'Production', 'Origin Stock', 'Base Stock', 'To Buy']
  const rows = (shoppingList.value?.items ?? []).map(i => [
    i.commodityTicker,
    i.demand,
    i.production,
    i.originStock,
    i.baseStock,
    i.gap,
  ])
  void copyCsv(headers, rows, 'Shopping list')
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
