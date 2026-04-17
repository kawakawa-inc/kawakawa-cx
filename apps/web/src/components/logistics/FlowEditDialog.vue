<template>
  <v-dialog :model-value="modelValue" max-width="680" @update:model-value="onDialogUpdate">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>{{ editing ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
        {{ editing ? 'Edit Flow' : 'New Flow' }}
      </v-card-title>

      <v-divider />

      <v-card-text class="pt-4">
        <v-alert v-if="error" type="error" density="compact" variant="tonal" class="mb-3">
          {{ error }}
        </v-alert>

        <v-row dense>
          <!-- Commodity -->
          <v-col cols="12">
            <KeyValueAutocomplete
              v-model="form.commodityTicker"
              :items="commodityItems"
              :favorites="settingsStore.favoritedCommodities.value"
              label="Material"
              show-icons
              :disabled="editing"
              density="compact"
              hide-details
              @update:favorites="settingsStore.updateSetting('market.favoritedCommodities', $event)"
            />
          </v-col>

          <!-- From -->
          <v-col cols="12" class="mt-2">
            <div class="d-flex align-center mb-1">
              <div class="text-caption text-medium-emphasis">
                <v-icon size="small" class="mr-1">mdi-arrow-up-box</v-icon>
                From
              </div>
              <v-spacer />
              <v-btn
                v-if="!editing"
                size="x-small"
                variant="text"
                prepend-icon="mdi-swap-vertical"
                :disabled="!form.fromLocationId && !form.toLocationId"
                @click="swapFromTo"
              >
                Swap
              </v-btn>
            </div>
            <KeyValueAutocomplete
              v-model="form.fromLocationId"
              :items="locationItems"
              :favorites="settingsStore.favoritedLocations.value"
              label="Source location"
              :disabled="editing"
              density="compact"
              hide-details
              @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
            />
            <v-btn-toggle
              v-model="form.fromStorageTypes"
              multiple
              density="compact"
              variant="outlined"
              color="primary"
              class="mt-2"
            >
              <v-btn v-if="fromAllowsBase" value="STORE" size="small">
                <v-icon start size="small">mdi-earth</v-icon>
                Base
              </v-btn>
              <v-btn value="WAREHOUSE_STORE" size="small">
                <v-icon start size="small">mdi-warehouse</v-icon>
                Warehouse
              </v-btn>
            </v-btn-toggle>
          </v-col>

          <!-- To -->
          <v-col cols="12" class="mt-3">
            <div class="text-caption text-medium-emphasis mb-1">
              <v-icon size="small" class="mr-1">mdi-arrow-down-box</v-icon>
              To
            </div>
            <KeyValueAutocomplete
              v-model="form.toLocationId"
              :items="locationItems"
              :favorites="settingsStore.favoritedLocations.value"
              label="Destination location"
              :disabled="editing"
              density="compact"
              hide-details
              @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
            />
            <v-btn-toggle
              v-model="form.toStorageTypes"
              multiple
              density="compact"
              variant="outlined"
              color="primary"
              class="mt-2"
            >
              <v-btn v-if="toAllowsBase" value="STORE" size="small">
                <v-icon start size="small">mdi-earth</v-icon>
                Base
              </v-btn>
              <v-btn value="WAREHOUSE_STORE" size="small">
                <v-icon start size="small">mdi-warehouse</v-icon>
                Warehouse
              </v-btn>
            </v-btn-toggle>
          </v-col>

          <!-- Kind -->
          <v-col cols="12" class="mt-3">
            <div class="text-caption text-medium-emphasis mb-1">Sizing rule</div>
            <v-btn-toggle
              v-model="form.kind"
              mandatory
              density="compact"
              variant="outlined"
              color="primary"
            >
              <v-btn value="demand" size="small">
                <v-icon start size="small">mdi-arrow-down</v-icon>
                Demand
              </v-btn>
              <v-btn value="surplus" size="small">
                <v-icon start size="small">mdi-arrow-up</v-icon>
                Surplus
              </v-btn>
              <v-btn value="fixed" size="small">
                <v-icon start size="small">mdi-pin</v-icon>
                Fixed
              </v-btn>
            </v-btn-toggle>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ kindDescription }}
            </div>
          </v-col>

          <!-- Fixed amount (only when kind=fixed) -->
          <v-col v-if="form.kind === 'fixed'" cols="6" class="mt-2">
            <v-text-field
              v-model.number="form.amountOverride"
              type="number"
              min="0"
              label="Amount"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col v-if="form.kind === 'fixed'" cols="6" class="mt-2">
            <v-select
              v-model="form.rate"
              :items="[
                { title: 'Daily (× burnDays)', value: 'daily' },
                { title: 'Total', value: 'total' },
              ]"
              label="Rate"
              density="compact"
              hide-details
            />
          </v-col>

          <!-- Priority -->
          <v-col cols="6" class="mt-3">
            <v-text-field
              v-model.number="form.priority"
              type="number"
              label="Priority (optional)"
              hint="Lower wins. Blank = by jump distance."
              persistent-hint
              density="compact"
            />
          </v-col>

          <!-- Note -->
          <v-col cols="12" class="mt-2">
            <v-text-field
              v-model="form.note"
              label="Note (optional)"
              density="compact"
              hide-details
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-btn
          v-if="editing"
          color="error"
          variant="text"
          prepend-icon="mdi-delete"
          :disabled="saving || deleting"
          :loading="deleting"
          @click="handleDelete"
        >
          Delete
        </v-btn>
        <v-spacer />
        <v-btn variant="text" :disabled="saving || deleting" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="!canSave || deleting"
          @click="handleSave"
        >
          {{ editing ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import KeyValueAutocomplete from '../KeyValueAutocomplete.vue'
import { api } from '../../services/api'
import { useSettingsStore } from '../../stores/settings'
import type {
  LogisticsFlow,
  CreateLogisticsFlowRequest,
  UpdateLogisticsFlowRequest,
  FlowKind,
  DemandRate,
} from '@kawakawa/types'
import type { KeyValueItem } from '../KeyValueAutocomplete.vue'

interface Props {
  modelValue: boolean
  flow: LogisticsFlow | null
  commodityItems: KeyValueItem[]
  locationItems: KeyValueItem[]
  /** Prefills the Source location when creating (ignored when editing). */
  initialFromLocationId?: string
}

const props = withDefaults(defineProps<Props>(), {
  initialFromLocationId: '',
})
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const settingsStore = useSettingsStore()
const editing = computed(() => props.flow !== null)

interface FormShape {
  commodityTicker: string
  fromLocationId: string
  fromStorageTypes: string[]
  toLocationId: string
  toStorageTypes: string[]
  kind: FlowKind
  amountOverride: number | null
  rate: DemandRate
  priority: number | null
  note: string
}

function locationTypeOf(locationId: string): string | undefined {
  return props.locationItems.find(l => l.key === locationId)?.locationType
}

function defaultStorageFor(locationId: string): string[] {
  if (!locationId) return ['STORE']
  return locationTypeOf(locationId) === 'Station' ? ['WAREHOUSE_STORE'] : ['STORE']
}

function emptyForm(): FormShape {
  const from = props.initialFromLocationId
  return {
    commodityTicker: '',
    fromLocationId: from,
    fromStorageTypes: defaultStorageFor(from),
    toLocationId: '',
    toStorageTypes: ['STORE'],
    kind: 'demand',
    amountOverride: null,
    rate: 'daily',
    priority: null,
    note: '',
  }
}

const form = ref<FormShape>(emptyForm())

const fromAllowsBase = computed(() => {
  const id = form.value.fromLocationId
  return !id || locationTypeOf(id) !== 'Station'
})
const toAllowsBase = computed(() => {
  const id = form.value.toLocationId
  return !id || locationTypeOf(id) !== 'Station'
})

let suppressLocationWatchers = false

function swapFromTo(): void {
  const f = form.value
  suppressLocationWatchers = true
  ;[f.fromLocationId, f.toLocationId] = [f.toLocationId, f.fromLocationId]
  ;[f.fromStorageTypes, f.toStorageTypes] = [f.toStorageTypes, f.fromStorageTypes]
  // Release on next microtask so the watcher flush sees the flag set.
  queueMicrotask(() => {
    suppressLocationWatchers = false
  })
}
const saving = ref(false)
const deleting = ref(false)
const error = ref<string>('')

watch(
  () => [props.modelValue, props.flow] as const,
  ([open, flow]) => {
    if (!open) return
    error.value = ''
    if (flow) {
      form.value = {
        commodityTicker: flow.commodityTicker,
        fromLocationId: flow.fromLocationId,
        fromStorageTypes: [...flow.fromStorageTypes],
        toLocationId: flow.toLocationId,
        toStorageTypes: [...flow.toStorageTypes],
        kind: flow.kind,
        amountOverride: flow.amountOverride,
        rate: flow.rate,
        priority: flow.priority,
        note: flow.note ?? '',
      }
    } else {
      form.value = emptyForm()
    }
  },
  { immediate: true }
)

// When the user picks a new from/to location on a create form, snap the
// storage-type toggles to a sensible default for that location type.
// (No-op when editing — those pickers are disabled. Also no-op during swap,
// which manually swaps the storage arrays alongside the location ids.)
watch(
  () => form.value.fromLocationId,
  loc => {
    if (editing.value || suppressLocationWatchers) return
    form.value.fromStorageTypes = defaultStorageFor(loc)
  }
)
watch(
  () => form.value.toLocationId,
  loc => {
    if (editing.value || suppressLocationWatchers) return
    form.value.toStorageTypes = defaultStorageFor(loc)
  }
)

const canSave = computed(() => {
  const f = form.value
  if (!f.commodityTicker || !f.fromLocationId || !f.toLocationId) return false
  if (f.fromLocationId === f.toLocationId) return false
  if (f.fromStorageTypes.length === 0 || f.toStorageTypes.length === 0) return false
  if (f.kind === 'fixed' && (f.amountOverride === null || f.amountOverride < 0)) return false
  return true
})

const kindDescription = computed(() => {
  switch (form.value.kind) {
    case 'demand':
      return 'Solver sizes this edge to whatever the destination needs (downstream pull).'
    case 'surplus':
      return 'Solver ships whatever the source has left over after demand edges (upstream push).'
    case 'fixed':
      return 'Literal amount, pinned. Use for contracts or manual overrides.'
    default:
      return ''
  }
})

function onDialogUpdate(v: boolean) {
  if (!v) close()
}

function close() {
  emit('update:modelValue', false)
}

async function handleSave() {
  saving.value = true
  error.value = ''
  try {
    if (editing.value && props.flow) {
      const body: UpdateLogisticsFlowRequest = {
        fromStorageTypes: form.value.fromStorageTypes,
        toStorageTypes: form.value.toStorageTypes,
        kind: form.value.kind,
        amountOverride: form.value.kind === 'fixed' ? form.value.amountOverride : null,
        rate: form.value.rate,
        priority: form.value.priority,
        note: form.value.note.trim() || null,
      }
      await api.logistics.updateFlow(props.flow.id, body)
    } else {
      const body: CreateLogisticsFlowRequest = {
        commodityTicker: form.value.commodityTicker,
        fromLocationId: form.value.fromLocationId,
        fromStorageTypes: form.value.fromStorageTypes,
        toLocationId: form.value.toLocationId,
        toStorageTypes: form.value.toStorageTypes,
        kind: form.value.kind,
        rate: form.value.rate,
      }
      if (form.value.kind === 'fixed' && form.value.amountOverride !== null) {
        body.amountOverride = form.value.amountOverride
      }
      if (form.value.priority !== null) body.priority = form.value.priority
      if (form.value.note.trim()) body.note = form.value.note.trim()
      await api.logistics.createFlow(body)
    }
    emit('saved')
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save flow'
  } finally {
    saving.value = false
  }
}

async function handleDelete() {
  if (!props.flow) return
  if (!confirm('Delete this flow?')) return
  deleting.value = true
  error.value = ''
  try {
    await api.logistics.deleteFlow(props.flow.id)
    emit('saved')
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete flow'
  } finally {
    deleting.value = false
  }
}
</script>
