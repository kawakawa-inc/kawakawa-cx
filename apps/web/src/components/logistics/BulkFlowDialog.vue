<template>
  <v-dialog :model-value="modelValue" max-width="780" persistent>
    <v-card>
      <!-- ==================== Form phase ==================== -->
      <template v-if="phase === 'form'">
        <v-card-title class="d-flex align-center">
          <v-icon start>mdi-auto-fix</v-icon>
          Bulk Add Flows
        </v-card-title>

        <v-divider />

        <v-card-text class="pt-4">
          <v-alert v-if="error" type="error" density="compact" variant="tonal" class="mb-3">
            {{ error }}
          </v-alert>

          <div class="text-caption text-medium-emphasis mb-3">
            Connects a single hub to any number of planets. Consumption categories become
            <strong>demand</strong> edges hub→planet. Production outputs become <strong>surplus</strong>
            edges planet→hub. Direction auto-orients per category — you don't need to swap.
          </div>

          <!-- Hub -->
          <div class="text-caption text-medium-emphasis mb-1">
            <v-icon size="small" class="mr-1">mdi-warehouse</v-icon>
            Hub
          </div>
          <KeyValueAutocomplete
            v-model="hubLocationId"
            :items="locationItems"
            :favorites="settingsStore.favoritedLocations.value"
            label="Hub location"
            density="compact"
            hide-details
            @update:favorites="
              settingsStore.updateSetting('market.favoritedLocations', $event)
            "
          />
          <v-btn-toggle
            v-model="hubStorageTypes"
            multiple
            density="compact"
            variant="outlined"
            color="primary"
            class="mt-2"
          >
            <v-btn v-if="hubAllowsBase" value="STORE" size="small">
              <v-icon start size="small">mdi-earth</v-icon>
              Base
            </v-btn>
            <v-btn value="WAREHOUSE_STORE" size="small">
              <v-icon start size="small">mdi-warehouse</v-icon>
              Warehouse
            </v-btn>
          </v-btn-toggle>

          <!-- Planets -->
          <div class="d-flex align-center mt-4 mb-1">
            <div class="text-caption text-medium-emphasis">
              <v-icon size="small" class="mr-1">mdi-earth</v-icon>
              Planets
              <span class="ml-2">
                ({{ selectedPlanetIdsArray.length }} / {{ availablePlanets.length }} selected)
              </span>
            </div>
            <v-spacer />
            <v-btn size="x-small" variant="text" @click="selectAllAvailable">
              Select all
            </v-btn>
            <v-btn size="x-small" variant="text" @click="clearSelection">
              Clear
            </v-btn>
            <v-btn
              size="x-small"
              variant="text"
              prepend-icon="mdi-eye-off-outline"
              @click="exclusionsOpen = !exclusionsOpen"
            >
              Exclusions ({{ excludedPlanetIds.size }})
            </v-btn>
          </div>

          <KeyValueAutocomplete
            v-model="planetAutocompleteValue"
            :items="availablePlanets"
            :favorites="settingsStore.favoritedLocations.value"
            multiple
            label="Select planets"
            density="compact"
            hide-details
            @update:favorites="
              settingsStore.updateSetting('market.favoritedLocations', $event)
            "
          />
          <div v-if="availablePlanets.length === 0" class="text-caption text-medium-emphasis mt-2">
            No synced planets yet. Run a planet sync from the old Supply page.
          </div>

          <!-- Exclusions management (collapsible) -->
          <v-expand-transition>
            <div
              v-if="exclusionsOpen"
              class="mt-3 pa-3"
              style="background: rgba(255, 255, 255, 0.03); border-radius: 4px"
            >
              <div class="text-caption text-medium-emphasis mb-2">
                Excluded planets are hidden from the selector above. Scoped to logistics bulk
                operations — separate from FIO sync exclusions.
              </div>
              <KeyValueAutocomplete
                v-model="exclusionAutocompleteValue"
                :items="allPlanets"
                multiple
                label="Excluded planets"
                density="compact"
                hide-details
              />
            </div>
          </v-expand-transition>

          <!-- Planet storage types (applies to all selected) -->
          <div class="mt-3">
            <div class="text-caption text-medium-emphasis mb-1">
              Planet storage types (applied to all)
            </div>
            <v-btn-toggle
              v-model="planetStorageTypes"
              multiple
              density="compact"
              variant="outlined"
              color="primary"
            >
              <v-btn value="STORE" size="small">
                <v-icon start size="small">mdi-earth</v-icon>
                Base
              </v-btn>
              <v-btn value="WAREHOUSE_STORE" size="small">
                <v-icon start size="small">mdi-warehouse</v-icon>
                Warehouse
              </v-btn>
            </v-btn-toggle>
          </div>

          <!-- Categories -->
          <div class="text-caption text-medium-emphasis mt-4 mb-1">Categories</div>
          <div class="d-flex flex-wrap ga-2">
            <v-btn
              v-for="cat in categoryOptions"
              :key="cat.value"
              size="small"
              :variant="selectedCategories.has(cat.value) ? 'flat' : 'outlined'"
              :color="selectedCategories.has(cat.value) ? 'primary' : undefined"
              :prepend-icon="cat.icon"
              @click="toggleCategory(cat.value)"
            >
              {{ cat.label }}
            </v-btn>
          </div>
          <div class="text-caption text-medium-emphasis mt-2">
            Direction auto-orients: consumption → hub→planet (demand). Outputs → planet→hub (surplus).
          </div>
        </v-card-text>

        <v-divider />

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="submitting" @click="close">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            Create ({{ estimatedOps }})
          </v-btn>
        </v-card-actions>
      </template>

      <!-- ==================== Result phase ==================== -->
      <template v-else>
        <v-card-title class="d-flex align-center">
          <v-icon start color="success">mdi-check-circle</v-icon>
          Bulk Add Complete
        </v-card-title>

        <v-divider />

        <v-card-text class="pt-4">
          <div class="d-flex ga-4 mb-4">
            <v-chip color="success" size="small" variant="flat">
              {{ result?.totals.created ?? 0 }} created
            </v-chip>
            <v-chip
              v-if="(result?.totals.duplicates ?? 0) > 0"
              color="warning"
              size="small"
              variant="tonal"
            >
              {{ result?.totals.duplicates ?? 0 }} duplicates
            </v-chip>
            <v-chip
              v-if="(result?.totals.cycles ?? 0) > 0"
              color="error"
              size="small"
              variant="tonal"
            >
              {{ result?.totals.cycles ?? 0 }} cycles
            </v-chip>
            <v-chip
              v-if="(result?.totals.empty ?? 0) > 0"
              color="grey"
              size="small"
              variant="tonal"
            >
              {{ result?.totals.empty ?? 0 }} empty categories
            </v-chip>
          </div>

          <v-expansion-panels variant="accordion" multiple>
            <v-expansion-panel v-for="pr in sortedPlanetResults" :key="pr.planetLocationId">
              <v-expansion-panel-title>
                <div class="d-flex align-center" style="width: 100%">
                  <v-icon start :color="planetStatusColor(pr)" size="small">
                    {{ planetStatusIcon(pr) }}
                  </v-icon>
                  <span>{{ planetName(pr.planetLocationId) }}</span>
                  <v-spacer />
                  <v-chip v-if="pr.created.length > 0" size="x-small" color="success" class="mr-1">
                    +{{ pr.created.length }}
                  </v-chip>
                  <v-chip
                    v-if="pr.skippedDuplicates.length > 0"
                    size="x-small"
                    color="warning"
                    variant="tonal"
                    class="mr-1"
                  >
                    {{ pr.skippedDuplicates.length }} dup
                  </v-chip>
                  <v-chip
                    v-if="pr.skippedCycles.length > 0"
                    size="x-small"
                    color="error"
                    variant="tonal"
                    class="mr-1"
                  >
                    {{ pr.skippedCycles.length }} cyc
                  </v-chip>
                  <v-chip v-if="pr.error" size="x-small" color="error" variant="tonal">
                    error
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div v-if="pr.error" class="text-caption text-error">
                  {{ pr.error }}
                </div>
                <div v-else>
                  <div
                    v-for="group in groupByCategory(pr.created.map(c => ({ category: c.category, ticker: c.flow.commodityTicker })))"
                    :key="'c-' + group.category"
                    class="mb-2"
                  >
                    <div class="text-caption text-success">
                      + {{ categoryLabel(group.category) }} ({{ group.tickers.length }})
                    </div>
                    <v-chip
                      v-for="t in group.tickers"
                      :key="t"
                      size="x-small"
                      class="mr-1 mt-1"
                      variant="outlined"
                    >
                      {{ t }}
                    </v-chip>
                  </div>

                  <div
                    v-for="group in groupByCategory(pr.skippedDuplicates)"
                    :key="'d-' + group.category"
                    class="mb-2"
                  >
                    <div class="text-caption text-warning">
                      ↺ {{ categoryLabel(group.category) }} — existing ({{ group.tickers.length }})
                    </div>
                    <v-chip
                      v-for="t in group.tickers"
                      :key="t"
                      size="x-small"
                      class="mr-1 mt-1"
                      variant="outlined"
                    >
                      {{ t }}
                    </v-chip>
                  </div>

                  <div
                    v-for="group in groupByCategory(pr.skippedCycles)"
                    :key="'y-' + group.category"
                    class="mb-2"
                  >
                    <div class="text-caption text-error">
                      ⟲ {{ categoryLabel(group.category) }} — cycle ({{ group.tickers.length }})
                    </div>
                    <v-chip
                      v-for="t in group.tickers"
                      :key="t"
                      size="x-small"
                      class="mr-1 mt-1"
                      variant="outlined"
                    >
                      {{ t }}
                    </v-chip>
                  </div>

                  <div v-if="pr.emptyCategories.length > 0" class="text-caption text-medium-emphasis">
                    No tickers detected for:
                    <v-chip
                      v-for="c in pr.emptyCategories"
                      :key="c"
                      size="x-small"
                      class="mr-1"
                      variant="outlined"
                    >
                      {{ categoryLabel(c) }}
                    </v-chip>
                  </div>

                  <div
                    v-if="
                      pr.created.length === 0 &&
                      pr.skippedDuplicates.length === 0 &&
                      pr.skippedCycles.length === 0 &&
                      pr.emptyCategories.length === 0
                    "
                    class="text-caption text-medium-emphasis"
                  >
                    Nothing to do.
                  </div>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>

        <v-divider />

        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="close">Done</v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import KeyValueAutocomplete from '../KeyValueAutocomplete.vue'
import { api } from '../../services/api'
import { useSettingsStore } from '../../stores/settings'
import type {
  BulkMultiCreateLogisticsFlowsRequest,
  BulkMultiCreateLogisticsFlowsResponse,
  BulkMultiPlanetResult,
  BulkDetectionCategory,
} from '@kawakawa/types'
import type { KeyValueItem } from '../KeyValueAutocomplete.vue'

interface Props {
  modelValue: boolean
  locationItems: KeyValueItem[]
  /** Optional pre-fill for the hub picker. */
  initialHubLocationId?: string
}

const props = withDefaults(defineProps<Props>(), {
  initialHubLocationId: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const settingsStore = useSettingsStore()

type Phase = 'form' | 'result'

const phase = ref<Phase>('form')
const submitting = ref(false)
const error = ref('')
const result = ref<BulkMultiCreateLogisticsFlowsResponse | null>(null)

const hubLocationId = ref<string>('')
const hubStorageTypes = ref<string[]>([])
const planetStorageTypes = ref<string[]>(['STORE'])
const selectedPlanetIds = ref<Set<string>>(new Set())
const exclusionsOpen = ref(false)

const selectedCategories = ref<Set<BulkDetectionCategory>>(
  new Set(['consumables', 'repair', 'inputs', 'production_output'])
)

const categoryOptions: Array<{ value: BulkDetectionCategory; label: string; icon: string }> = [
  { value: 'consumables', label: 'Consumables', icon: 'mdi-fire' },
  { value: 'inputs', label: 'Production Inputs', icon: 'mdi-factory' },
  { value: 'repair', label: 'Repair', icon: 'mdi-wrench' },
  { value: 'production_output', label: 'Production Outputs', icon: 'mdi-package-variant' },
]

function categoryLabel(c: BulkDetectionCategory): string {
  return categoryOptions.find(o => o.value === c)?.label ?? c
}

function toggleCategory(c: BulkDetectionCategory): void {
  const next = new Set(selectedCategories.value)
  if (next.has(c)) next.delete(c)
  else next.add(c)
  selectedCategories.value = next
}

// ---- Planet list + exclusions ----

const allPlanets = computed<KeyValueItem[]>(() =>
  props.locationItems
    .filter(l => l.locationType === 'Planet' && l.isUserLocation)
    .sort((a, b) => a.display.localeCompare(b.display))
)

const excludedPlanetIds = computed(
  () => new Set(settingsStore.logisticsExcludedPlanets.value)
)

const availablePlanets = computed(() =>
  allPlanets.value.filter(p => !excludedPlanetIds.value.has(p.key))
)

const selectedPlanetIdsArray = computed(() => [...selectedPlanetIds.value])

// Two-way adapter so the multi-select autocomplete binds to the Set-based state.
const planetAutocompleteValue = computed<string[]>({
  get: () => selectedPlanetIdsArray.value,
  set: (ids: string[]) => {
    // Filter to currently-available (excluded planets are hidden in the
    // picker, but guard anyway in case state drifts).
    const excluded = excludedPlanetIds.value
    selectedPlanetIds.value = new Set(ids.filter(id => !excluded.has(id)))
  },
})

// Exclusions are also a multi-select against the full planet list.
const exclusionAutocompleteValue = computed<string[]>({
  get: () => settingsStore.logisticsExcludedPlanets.value ?? [],
  set: (ids: string[]) => {
    const nextSet = new Set(ids)
    // Any newly-excluded planets get dropped from the current selection.
    if (selectedPlanetIds.value.size > 0) {
      const nextSelection = new Set(
        [...selectedPlanetIds.value].filter(id => !nextSet.has(id))
      )
      selectedPlanetIds.value = nextSelection
    }
    settingsStore.updateSetting('logistics.excludedPlanets', ids)
  },
})

function selectAllAvailable(): void {
  selectedPlanetIds.value = new Set(availablePlanets.value.map(p => p.key))
}

function clearSelection(): void {
  selectedPlanetIds.value = new Set()
}

// ---- Hub storage defaults ----

function locationTypeOf(locationId: string): string | undefined {
  return props.locationItems.find(l => l.key === locationId)?.locationType
}

const hubAllowsBase = computed(() => locationTypeOf(hubLocationId.value) !== 'Station')

function hubDefaultStorage(locationId: string): string[] {
  if (locationTypeOf(locationId) === 'Station') return ['WAREHOUSE_STORE']
  return ['STORE']
}

watch(
  () => hubLocationId.value,
  (loc) => {
    hubStorageTypes.value = hubDefaultStorage(loc)
  }
)

// ---- Dialog lifecycle ----

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    phase.value = 'form'
    result.value = null
    error.value = ''
    hubLocationId.value = props.initialHubLocationId
    hubStorageTypes.value = hubDefaultStorage(props.initialHubLocationId)
    planetStorageTypes.value = ['STORE']
    selectedPlanetIds.value = new Set()
    exclusionsOpen.value = false
    selectedCategories.value = new Set([
      'consumables',
      'repair',
      'inputs',
      'production_output',
    ])
  }
)

// ---- Submit gating ----

const canSubmit = computed(() => {
  if (!hubLocationId.value) return false
  if (selectedPlanetIds.value.size === 0) return false
  if (hubStorageTypes.value.length === 0) return false
  if (planetStorageTypes.value.length === 0) return false
  if (selectedCategories.value.size === 0) return false
  return true
})

const estimatedOps = computed(() => {
  const planets = selectedPlanetIds.value.size
  const cats = selectedCategories.value.size
  return `${planets} planet${planets === 1 ? '' : 's'} × ${cats} categor${cats === 1 ? 'y' : 'ies'}`
})

async function handleSubmit(): Promise<void> {
  submitting.value = true
  error.value = ''
  try {
    const body: BulkMultiCreateLogisticsFlowsRequest = {
      hubLocationId: hubLocationId.value,
      planetLocationIds: [...selectedPlanetIds.value],
      hubStorageTypes: hubStorageTypes.value,
      planetStorageTypes: planetStorageTypes.value,
      categories: [...selectedCategories.value],
    }
    result.value = await api.logistics.bulkMultiCreateFlows(body)
    phase.value = 'result'
    if (result.value.totals.created > 0) emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Bulk create failed'
  } finally {
    submitting.value = false
  }
}

function close(): void {
  emit('update:modelValue', false)
}

// ---- Result helpers ----

function planetName(id: string): string {
  return props.locationItems.find(l => l.key === id)?.display ?? id
}

function planetStatusColor(pr: BulkMultiPlanetResult): string {
  if (pr.error) return 'error'
  if (pr.skippedCycles.length > 0) return 'error'
  if (pr.created.length > 0) return 'success'
  if (pr.skippedDuplicates.length > 0) return 'warning'
  return 'grey'
}

function planetStatusIcon(pr: BulkMultiPlanetResult): string {
  if (pr.error) return 'mdi-alert-circle'
  if (pr.skippedCycles.length > 0) return 'mdi-sync-off'
  if (pr.created.length > 0) return 'mdi-check-circle'
  if (pr.skippedDuplicates.length > 0) return 'mdi-content-copy'
  return 'mdi-circle-outline'
}

const sortedPlanetResults = computed(() =>
  [...(result.value?.perPlanet ?? [])].sort((a, b) => {
    // Errors first, then most created, then name
    if (!!a.error !== !!b.error) return a.error ? -1 : 1
    if (a.created.length !== b.created.length) return b.created.length - a.created.length
    return planetName(a.planetLocationId).localeCompare(planetName(b.planetLocationId))
  })
)

function groupByCategory(items: Array<{ category: BulkDetectionCategory; ticker: string }>) {
  const groups = new Map<BulkDetectionCategory, string[]>()
  for (const item of items) {
    const list = groups.get(item.category) ?? []
    list.push(item.ticker)
    groups.set(item.category, list)
  }
  return [...groups.entries()]
    .map(([category, tickers]) => ({ category, tickers: tickers.sort() }))
    .sort((a, b) => categoryLabel(a.category).localeCompare(categoryLabel(b.category)))
}
</script>
