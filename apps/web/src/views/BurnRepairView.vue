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

        <v-expansion-panels v-model="expandedPanels" multiple>
          <v-expansion-panel
            v-for="planet in myBases?.planets ?? []"
            :key="planet.planetNaturalId"
            :value="planet.planetNaturalId"
          >
            <v-expansion-panel-title>
              <div class="d-flex align-center" style="width: 100%">
                <v-icon start size="small">mdi-earth</v-icon>
                <span class="font-weight-medium">{{ planet.planetName }}</span>
                <span class="text-medium-emphasis ml-2">({{ planet.planetNaturalId }})</span>
                <v-spacer />
                <v-chip size="x-small" class="mr-2" variant="tonal">
                  {{ planet.buildingCount }} buildings
                </v-chip>
                <v-chip size="x-small" variant="tonal" color="primary">
                  {{ planet.materials.length }} materials
                </v-chip>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <!-- Workforce summary -->
              <div v-if="planet.workforceSummary.length > 0" class="mb-3">
                <span class="text-subtitle-2">Workforce</span>
                <v-chip
                  v-for="wf in planet.workforceSummary"
                  :key="wf.type"
                  size="small"
                  variant="tonal"
                  class="ml-2"
                >
                  {{ wf.type }}: {{ wf.population }}/{{ wf.required }}
                </v-chip>
              </div>

              <!-- Materials table -->
              <v-data-table
                :items="planet.materials"
                :headers="myBasesHeaders"
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
                <template #item.repairTotal="{ item }">
                  {{ formatNumber(item.repairTotal) }}
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
                    :class="
                      item.productionDaily - item.burnDaily - item.inputsDaily >= 0
                        ? 'text-success'
                        : 'text-error'
                    "
                  >
                    {{ formatNumber(item.productionDaily - item.burnDaily - item.inputsDaily) }}
                  </span>
                </template>
              </v-data-table>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-tabs-window-item>

      <!-- ==================== CORP OVERVIEW TAB ==================== -->
      <v-tabs-window-item value="corp">
        <v-alert
          v-if="corpData && corpData.includedUserCount === 0 && !loading"
          type="info"
          variant="tonal"
          class="mb-4"
          density="compact"
        >
          No roles are configured for corp-wide view. An admin needs to set
          <strong>Included Roles (Corp Burn/Repair)</strong> in the Admin panel's Global Defaults.
        </v-alert>

        <template v-if="corpData && corpData.includedUserCount > 0">
          <div class="d-flex align-center mb-3 ga-2">
            <v-chip size="small" variant="tonal">
              {{ corpData.includedUserCount }} users included
            </v-chip>
            <v-chip v-if="corpData.staleUserCount > 0" size="small" variant="tonal" color="warning">
              {{ corpData.staleUserCount }} inactive (data &gt; 30 days old)
            </v-chip>
          </div>

          <!-- Materials section -->
          <v-card class="mb-4">
            <v-card-title class="text-subtitle-1">Materials</v-card-title>
            <v-data-table
              :items="corpData.materials"
              :headers="corpMaterialHeaders"
              density="compact"
              :items-per-page="25"
              :sort-by="[{ key: 'burnDaily', order: 'desc' }]"
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
              <template #item.repairTotal="{ item }">
                {{ formatNumber(item.repairTotal) }}
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
                  :class="
                    item.productionDaily - item.burnDaily - item.inputsDaily >= 0
                      ? 'text-success'
                      : 'text-error'
                  "
                >
                  {{ formatNumber(item.productionDaily - item.burnDaily - item.inputsDaily) }}
                </span>
              </template>
            </v-data-table>
          </v-card>

          <!-- Buildings section -->
          <v-card v-if="corpBuildings" class="mb-4">
            <v-card-title class="text-subtitle-1">
              Buildings
              <v-chip size="x-small" class="ml-2" variant="tonal">
                {{ corpBuildings.totalBuildings }} total
              </v-chip>
            </v-card-title>
            <v-card-text>
              <v-chip
                v-for="(count, ticker) in corpBuildings.buildings"
                :key="ticker"
                size="small"
                variant="tonal"
                class="mr-1 mb-1"
              >
                {{ ticker }}: {{ count }}
              </v-chip>
            </v-card-text>
          </v-card>

          <!-- Workforce section -->
          <v-card v-if="corpWorkforce">
            <v-card-title class="text-subtitle-1">Workforce</v-card-title>
            <v-data-table
              :items="corpWorkforce.workforce"
              :headers="corpWorkforceHeaders"
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
        </template>
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
import { ref, reactive, onMounted } from 'vue'
import { api } from '../services/api'
import { usePageState } from '../composables/usePageState'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import type {
  BurnRepairMyBasesResponse,
  BurnRepairCorpResponse,
  BurnRepairCorpBuildingsResponse,
  BurnRepairCorpWorkforceResponse,
  BurnRepairShoppingListResponse,
} from '@kawakawa/types'

// ==================== STATE ====================

const { state } = usePageState('burn-repair', {
  activeTab: 'my-bases',
  shoppingListOrigin: '',
  shoppingListBase: '',
  shoppingListDays: 7,
})

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

const snackbar = reactive({ show: false, message: '', color: 'success' })

// ==================== TABLE HEADERS ====================

const myBasesHeaders = [
  { title: 'Material', key: 'commodityTicker', sortable: true },
  { title: 'Burn/Day', key: 'burnDaily', sortable: true },
  { title: 'Inputs/Day', key: 'inputsDaily', sortable: true },
  { title: 'Repair', key: 'repairTotal', sortable: true },
  { title: 'Production/Day', key: 'productionDaily', sortable: true },
  { title: 'Net/Day', key: 'netDaily', sortable: false },
]

const corpMaterialHeaders = [
  { title: 'Material', key: 'commodityTicker', sortable: true },
  { title: 'Burn/Day', key: 'burnDaily', sortable: true },
  { title: 'Inputs/Day', key: 'inputsDaily', sortable: true },
  { title: 'Repair', key: 'repairTotal', sortable: true },
  { title: 'Production/Day', key: 'productionDaily', sortable: true },
  { title: 'Net/Day', key: 'netDaily', sortable: false },
]

const corpWorkforceHeaders = [
  { title: 'Type', key: 'type', sortable: true },
  { title: 'Total Population', key: 'totalPopulation', sortable: true },
  { title: 'Total Required', key: 'totalRequired', sortable: true },
]

const shoppingListHeaders = [
  { title: 'Material', key: 'commodityTicker', sortable: true },
  { title: 'Demand', key: 'demand', sortable: true },
  { title: 'Production', key: 'production', sortable: true },
  { title: 'Origin Stock', key: 'originStock', sortable: true },
  { title: 'Base Stock', key: 'baseStock', sortable: true },
  { title: 'To Buy', key: 'gap', sortable: true },
]

// ==================== DATA LOADING ====================

async function loadMyBases() {
  try {
    myBases.value = await api.burnRepair.myBases()
  } catch (e) {
    console.error('Failed to load my bases', e)
  }
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
  await Promise.all([loadMyBases(), loadCorpData(), loadLocations()])
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

// ==================== HELPERS ====================

function formatNumber(n: number): string {
  if (n === 0) return '-'
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2)
}

// ==================== LIFECYCLE ====================

onMounted(loadAll)
</script>
