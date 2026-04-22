<template>
  <template v-if="!corpData || corpData.includedUserCount === 0">
    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      No roles are configured for corp-wide view. An admin needs to set
      <strong>Included Roles (Corp Burn/Repair)</strong> in the Admin panel's Global Defaults.
    </v-alert>
  </template>

  <template v-else>
    <div class="d-flex align-center mb-3 ga-2">
      <v-chip size="small" variant="tonal">
        {{ corpData.includedUserCount }} users included
      </v-chip>
      <v-chip v-if="corpData.staleUserCount > 0" size="small" variant="tonal" color="warning">
        {{ corpData.staleUserCount }} inactive (data &gt; 30 days old)
      </v-chip>
    </div>

    <v-tabs v-model="activeSubTab" density="compact" class="mb-3">
      <v-tab value="consumables">Consumables</v-tab>
      <v-tab value="fabs">Fabs</v-tab>
      <v-tab value="other">Other</v-tab>
    </v-tabs>

    <v-tabs-window v-model="activeSubTab">
      <v-tabs-window-item value="consumables">
        <TickerListManager
          label="Consumables"
          :model-value="consumablesTickers"
          :read-only="!isAdmin"
          @update:model-value="updateTickers('burnRepair.corpOverview.consumablesTickers', $event)"
        />
        <template v-if="consumablesSet.size === 0">
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            No Consumables tickers configured.
            {{ isAdmin ? 'Use the manager above to add some.' : 'Ask an admin to configure them.' }}
          </v-alert>
        </template>
        <template v-else>
          <CorpDashboard
            mode="consumables"
            :materials="corpData.materials"
            :per-user="corpData.perUser"
            :available-surplus="corpData.availableSurplus"
            :repair-days="repairDays"
            :ticker-set="consumablesSet"
          />
          <MaterialsTable
            title="Materials"
            :materials="filteredBy(consumablesSet)"
            :available-surplus="corpData.availableSurplus"
            @copy-csv="
              emit('copy-csv', { scope: 'consumables', materials: filteredBy(consumablesSet) })
            "
          />
        </template>
      </v-tabs-window-item>

      <v-tabs-window-item value="fabs">
        <TickerListManager
          label="Fabs"
          :model-value="fabsTickers"
          :read-only="!isAdmin"
          @update:model-value="updateTickers('burnRepair.corpOverview.fabsTickers', $event)"
        />
        <template v-if="fabsSet.size === 0">
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            No Fabs tickers configured.
            {{ isAdmin ? 'Use the manager above to add some.' : 'Ask an admin to configure them.' }}
          </v-alert>
        </template>
        <template v-else>
          <CorpDashboard
            mode="fabs"
            :materials="corpData.materials"
            :per-user="corpData.perUser"
            :available-surplus="corpData.availableSurplus"
            :repair-days="repairDays"
            :ticker-set="fabsSet"
          />
          <MaterialsTable
            title="Materials"
            :materials="filteredBy(fabsSet)"
            :available-surplus="corpData.availableSurplus"
            @copy-csv="emit('copy-csv', { scope: 'fabs', materials: filteredBy(fabsSet) })"
          />
          <!-- Buildings + workforce belong with fab planning -->
          <v-card v-if="corpBuildings" class="mb-4 mt-4">
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

          <v-card v-if="corpWorkforce">
            <v-card-title class="text-subtitle-1">Workforce</v-card-title>
            <v-data-table
              :items="corpWorkforce.workforce"
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
        </template>
      </v-tabs-window-item>

      <v-tabs-window-item value="other">
        <template v-if="otherSet.size === 0">
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            All corp tickers are covered by Consumables or Fabs.
          </v-alert>
        </template>
        <template v-else>
          <CorpDashboard
            mode="other"
            :materials="corpData.materials"
            :per-user="corpData.perUser"
            :available-surplus="corpData.availableSurplus"
            :repair-days="repairDays"
            :ticker-set="otherSet"
          />
          <MaterialsTable
            title="Materials"
            :materials="filteredBy(otherSet)"
            :available-surplus="corpData.availableSurplus"
            @copy-csv="emit('copy-csv', { scope: 'other', materials: filteredBy(otherSet) })"
          />
        </template>
      </v-tabs-window-item>
    </v-tabs-window>
  </template>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import TickerListManager from './TickerListManager.vue'
import CorpDashboard from './CorpDashboard.vue'
import MaterialsTable from './MaterialsTable.vue'
import { useSettingsStore } from '../../stores/settings'
import { useUserStore } from '../../stores/user'
import type {
  BurnRepairCorpResponse,
  BurnRepairCorpBuildingsResponse,
  BurnRepairCorpWorkforceResponse,
  BurnRepairCorpMaterial,
} from '@kawakawa/types'

const props = defineProps<{
  corpData: BurnRepairCorpResponse | null
  corpBuildings: BurnRepairCorpBuildingsResponse | null
  corpWorkforce: BurnRepairCorpWorkforceResponse | null
  repairDays: number
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (
    e: 'copy-csv',
    payload: { scope: 'consumables' | 'fabs' | 'other'; materials: BurnRepairCorpMaterial[] }
  ): void
}>()

const settingsStore = useSettingsStore()
const userStore = useUserStore()

const activeSubTab = computed<string>({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const isAdmin = computed(() => {
  const user = userStore.getUser()
  return user?.roles?.some(r => r.id === 'administrator') ?? false
})

/**
 * Read ticker lists from the user settings store. Since both keys are
 * admin-only writable but read by everyone, the settings store returns the
 * global-default value when the user has no override — exactly what we want.
 */
const consumablesTickers = computed<string[]>(
  () => settingsStore.getSetting<string[]>('burnRepair.corpOverview.consumablesTickers') ?? []
)
const fabsTickers = computed<string[]>(
  () => settingsStore.getSetting<string[]>('burnRepair.corpOverview.fabsTickers') ?? []
)

const consumablesSet = computed(() => new Set(consumablesTickers.value))
const fabsSet = computed(() => new Set(fabsTickers.value))

const otherSet = computed(() => {
  const set = new Set<string>()
  if (!props.corpData) return set
  for (const m of props.corpData.materials) {
    if (!consumablesSet.value.has(m.commodityTicker) && !fabsSet.value.has(m.commodityTicker)) {
      set.add(m.commodityTicker)
    }
  }
  return set
})

function filteredBy(set: Set<string>): BurnRepairCorpMaterial[] {
  if (!props.corpData) return []
  return props.corpData.materials.filter(m => set.has(m.commodityTicker))
}

const workforceHeaders = [
  { title: 'Type', key: 'type', sortable: false },
  { title: 'Total Population', key: 'totalPopulation', sortable: false },
  { title: 'Total Required', key: 'totalRequired', sortable: false },
]

/**
 * Admin writes go through the global-defaults endpoint. The settings store
 * only updates per-user overrides, so we don't use updateSetting here.
 */
import { api } from '../../services/api'

let saveTimer: ReturnType<typeof setTimeout> | undefined
const SAVE_DEBOUNCE_MS = 400

async function updateTickers(
  key: 'burnRepair.corpOverview.consumablesTickers' | 'burnRepair.corpOverview.fabsTickers',
  value: string[]
): Promise<void> {
  if (!isAdmin.value) return
  clearTimeout(saveTimer)
  // Optimistic local update so the UI reflects the change immediately.
  settingsStore.settingsValues.value[key] = value
  saveTimer = setTimeout(async () => {
    try {
      await api.adminGlobalDefaults.update({ settings: { [key]: value } })
    } catch (e) {
      console.error('Failed to update global default', key, e)
    }
  }, SAVE_DEBOUNCE_MS)
}

/**
 * When the corp-data load first populates, auto-select Consumables if nothing
 * was stored. (Parent passes a persisted value via v-model, so this is just a
 * safety net for empty strings.)
 */
watch(
  () => props.modelValue,
  v => {
    if (!v) emit('update:modelValue', 'consumables')
  },
  { immediate: true }
)
</script>
