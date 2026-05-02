<template>
  <v-dialog :model-value="modelValue" max-width="780" @update:model-value="onDialogUpdate">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>
          {{ readOnly ? 'mdi-eye' : editing ? 'mdi-pencil' : 'mdi-plus' }}
        </v-icon>
        {{ readOnly ? 'View Shipment' : editing ? 'Edit Shipment' : 'New Shipment' }}
        <v-chip
          v-if="readOnly && shipment"
          size="x-small"
          class="ml-2"
          :color="
            shipment.status === 'delivered'
              ? 'success'
              : shipment.status === 'cancelled'
                ? 'grey'
                : 'info'
          "
          variant="tonal"
        >
          {{ shipment.status }}
        </v-chip>
      </v-card-title>

      <v-divider />

      <v-card-text class="pt-4">
        <v-alert v-if="error" type="error" density="compact" variant="tonal" class="mb-3">
          {{ error }}
        </v-alert>

        <v-row dense>
          <v-col cols="12" md="6">
            <KeyValueAutocomplete
              v-model="form.fromLocationId"
              :items="locationItems"
              :favorites="settingsStore.favoritedLocations.value"
              label="Origin"
              :disabled="editing"
              density="compact"
              hide-details
              @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
            />
          </v-col>
          <v-col cols="12" md="6">
            <KeyValueAutocomplete
              v-model="form.toLocationId"
              :items="locationItems"
              :favorites="settingsStore.favoritedLocations.value"
              label="Destination"
              :disabled="editing"
              density="compact"
              hide-details
              @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
            />
          </v-col>

          <v-col cols="12" md="6" class="mt-3">
            <v-text-field
              v-model="form.plannedLoadAt"
              type="date"
              label="Planned load date"
              hint="When the ship loads at the source"
              persistent-hint
              density="compact"
              :readonly="readOnly"
            />
          </v-col>
          <v-col cols="12" md="6" class="mt-3">
            <v-text-field
              v-model="form.plannedArrivalAt"
              type="date"
              label="Planned arrival date"
              :hint="`Auto: load + ${maxTransitForRoute}d transit. Override if needed.`"
              persistent-hint
              density="compact"
              :readonly="readOnly"
            />
          </v-col>

          <v-col cols="12" class="mt-3">
            <v-autocomplete
              v-model="form.shipDbId"
              :items="shipItems"
              item-title="title"
              item-value="value"
              label="Ship (optional)"
              clearable
              density="compact"
              :hint="shipPickerHint"
              persistent-hint
              prepend-inner-icon="mdi-rocket"
              :disabled="readOnly"
            />
          </v-col>

          <!-- Manifest -->
          <v-col cols="12" class="mt-4">
            <div class="d-flex align-center mb-2">
              <span class="text-subtitle-2">Manifest</span>
              <v-spacer />
              <v-btn
                v-if="!readOnly"
                size="x-small"
                prepend-icon="mdi-plus"
                variant="text"
                @click="addAdHocLine"
              >
                Add ad-hoc material
              </v-btn>
            </div>

            <div
              v-if="eligibleFlows.length === 0 && form.lines.length === 0"
              class="text-medium-emphasis text-caption pa-3"
            >
              Pick an origin and destination to see eligible flows for this route, or add an ad-hoc
              material.
            </div>

            <v-table v-else density="compact" class="manifest-table">
              <thead>
                <tr>
                  <th style="width: 40px"></th>
                  <th>Material</th>
                  <th class="text-end" style="width: 110px">Cadence</th>
                  <th class="text-end" style="width: 130px">Suggested</th>
                  <th class="text-end" style="width: 130px">Amount</th>
                  <th style="width: 40px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, idx) in form.lines" :key="idx">
                  <td>
                    <v-icon size="x-small" :color="line.flowId == null ? 'warning' : 'primary'">
                      {{ line.flowId == null ? 'mdi-package-variant-closed' : 'mdi-cogs' }}
                    </v-icon>
                  </td>
                  <td>
                    <span v-if="line.flowId != null || readOnly">{{ line.commodityTicker }}</span>
                    <v-text-field
                      v-else
                      v-model="line.commodityTicker"
                      density="compact"
                      hide-details
                      placeholder="ticker"
                      class="ad-hoc-ticker"
                    />
                  </td>
                  <td class="text-end text-caption text-medium-emphasis">
                    {{ line.flowId != null ? `${flowMeta(line.flowId).cadenceDays}d` : '—' }}
                  </td>
                  <td class="text-end text-caption text-medium-emphasis">
                    {{
                      line.flowId != null
                        ? Math.round(flowMeta(line.flowId).perShipmentAmount).toLocaleString()
                        : '—'
                    }}
                  </td>
                  <td>
                    <span v-if="readOnly">{{ Math.round(line.amount).toLocaleString() }}</span>
                    <v-text-field
                      v-else
                      v-model.number="line.amount"
                      type="number"
                      min="1"
                      density="compact"
                      hide-details
                    />
                  </td>
                  <td>
                    <v-btn
                      v-if="!readOnly"
                      size="x-small"
                      icon
                      variant="text"
                      @click="removeLine(idx)"
                    >
                      <v-icon size="small">mdi-close</v-icon>
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>

            <div v-if="!readOnly && missingEligibleFlows.length > 0" class="mt-2">
              <div class="text-caption text-medium-emphasis mb-1">
                Eligible flows not in manifest:
              </div>
              <div class="d-flex flex-wrap ga-1">
                <v-chip
                  v-for="f in missingEligibleFlows"
                  :key="f.id"
                  size="x-small"
                  color="primary"
                  variant="tonal"
                  class="cursor-pointer"
                  prepend-icon="mdi-plus"
                  @click="addEligibleFlow(f.id)"
                >
                  {{ f.commodityTicker }} ({{ Math.round(f.perShipmentAmount).toLocaleString() }})
                </v-chip>
              </div>
            </div>
          </v-col>

          <v-col cols="12" class="mt-2">
            <v-text-field
              v-model="form.notes"
              label="Notes (optional)"
              density="compact"
              hide-details
              :readonly="readOnly"
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-btn
          v-if="editing && shipment && shipment.status === 'planned'"
          variant="text"
          color="error"
          :loading="deleting"
          @click="handleDelete"
        >
          Delete
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="close">{{ readOnly ? 'Close' : 'Cancel' }}</v-btn>
        <v-btn v-if="!readOnly" color="primary" :loading="saving" @click="handleSave">
          {{ editing ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import KeyValueAutocomplete from '../KeyValueAutocomplete.vue'
import { useSettingsStore } from '../../stores/settings'
import { api } from '../../services/api'
import { commodityService } from '../../services/commodityService'
import type {
  Shipment,
  EdgeState,
  LogisticsGraph,
  UserShip,
  CreateShipmentRequest,
  UpdateShipmentRequest,
} from '@kawakawa/types'
import type { KeyValueItem } from '../KeyValueAutocomplete.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    locationItems: KeyValueItem[]
    shipment?: Shipment | null
    graph?: LogisticsGraph | null
    ships?: UserShip[]
  }>(),
  { shipment: null, graph: null, ships: () => [] }
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const settingsStore = useSettingsStore()
const editing = computed(() => props.shipment !== null)
// A non-planned shipment is a historical record — viewable but not editable.
// The Cancel/Dispatch/Deliver buttons in the list handle status transitions;
// the dialog is purely informational once the shipment leaves "planned".
const readOnly = computed(
  () => editing.value && props.shipment !== null && props.shipment.status !== 'planned'
)

interface ManifestLine {
  flowId: number | null
  commodityTicker: string
  amount: number
}

interface FormShape {
  fromLocationId: string
  toLocationId: string
  shipDbId: number | null
  plannedLoadAt: string // YYYY-MM-DD
  plannedArrivalAt: string // YYYY-MM-DD
  notes: string
  lines: ManifestLine[]
}

function todayISO(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function emptyForm(): FormShape {
  return {
    fromLocationId: '',
    toLocationId: '',
    shipDbId: null,
    plannedLoadAt: todayISO(),
    plannedArrivalAt: todayISO(),
    notes: '',
    lines: [],
  }
}

const form = ref<FormShape>(emptyForm())
const saving = ref(false)
const deleting = ref(false)
const error = ref('')

// All committed (amount > 0) demand/fixed edges in the graph for the current
// (from, to). These are the eligible flows for the shipment's manifest.
const eligibleFlows = computed<EdgeState[]>(() => {
  if (!props.graph) return []
  if (!form.value.fromLocationId || !form.value.toLocationId) return []
  return props.graph.edges.filter(
    e =>
      (e.kind === 'demand' || e.kind === 'fixed') &&
      e.fromLocationId === form.value.fromLocationId &&
      e.toLocationId === form.value.toLocationId
  )
})

const missingEligibleFlows = computed(() => {
  const inManifest = new Set(form.value.lines.map(l => l.flowId).filter(v => v !== null))
  return eligibleFlows.value.filter(f => !inManifest.has(f.id))
})

function flowMeta(flowId: number): EdgeState {
  return (
    props.graph?.edges.find(e => e.id === flowId) ??
    ({
      id: flowId,
      cadenceDays: 7,
      perShipmentAmount: 0,
    } as EdgeState)
  )
}

function addEligibleFlow(flowId: number) {
  const flow = props.graph?.edges.find(e => e.id === flowId)
  if (!flow) return
  form.value.lines.push({
    flowId,
    commodityTicker: flow.commodityTicker,
    amount: Math.max(1, Math.round(flow.perShipmentAmount)),
  })
}

function addAdHocLine() {
  form.value.lines.push({ flowId: null, commodityTicker: '', amount: 1 })
}

function removeLine(idx: number) {
  form.value.lines.splice(idx, 1)
}

const maxTransitForRoute = computed(() => {
  if (eligibleFlows.value.length === 0) return 0
  return Math.max(...eligibleFlows.value.map(e => e.transitDays))
})

// Total weight + volume of the current manifest, in tons / m³. Used to filter
// the ship picker to ships that can carry the load.
const manifestWeight = computed(() => {
  let total = 0
  for (const line of form.value.lines) {
    if (!line.commodityTicker || !line.amount) continue
    const w = commodityService.getCommodityWeight(line.commodityTicker.toUpperCase()) ?? 0
    total += w * line.amount
  }
  return total
})

const manifestVolume = computed(() => {
  let total = 0
  for (const line of form.value.lines) {
    if (!line.commodityTicker || !line.amount) continue
    const v = commodityService.getCommodityVolume(line.commodityTicker.toUpperCase()) ?? 0
    total += v * line.amount
  }
  return total
})

interface ShipPickerItem {
  title: string
  value: number
  fits: boolean
  capacity: number
}

const shipPickerHint = computed(() => {
  if (manifestWeight.value <= 0 && manifestVolume.value <= 0) {
    return 'Auto-assign deferred to Stage C; pick manually if you want.'
  }
  const w = Math.round(manifestWeight.value)
  const v = Math.round(manifestVolume.value)
  const fitting = shipItems.value.filter(s => s.fits).length
  if (fitting === 0) {
    return `Manifest: ${w.toLocaleString()}t / ${v.toLocaleString()}m³ — no ship at the source can carry this in one trip. Pick anyway and split, or shrink the manifest.`
  }
  return `Manifest: ${w.toLocaleString()}t / ${v.toLocaleString()}m³ — ${fitting} ship${fitting === 1 ? '' : 's'} can carry this. Smallest viable shown first.`
})

// Ship picker: filter to ships at the source (or with unknown location), then
// sort by "fits the manifest first, smallest viable first" so the natural
// default is the smallest ship that can carry the load. Each label shows
// capacity + a check or warning icon.
const shipItems = computed<ShipPickerItem[]>(() => {
  const w = manifestWeight.value
  const v = manifestVolume.value
  const candidates = props.ships.filter(
    s =>
      !form.value.fromLocationId ||
      !s.locationNaturalId ||
      s.locationNaturalId === form.value.fromLocationId
  )
  const items = candidates.map(s => {
    const fits = s.cargo.weightCapacity >= w && s.cargo.volumeCapacity >= v
    const capParts = []
    if (s.cargo.weightCapacity > 0) {
      capParts.push(`${Math.round(s.cargo.weightCapacity).toLocaleString()}t`)
    }
    if (s.cargo.volumeCapacity > 0) {
      capParts.push(`${Math.round(s.cargo.volumeCapacity).toLocaleString()}m³`)
    }
    const cap = capParts.length > 0 ? ` · ${capParts.join('/')}` : ''
    const marker = w + v > 0 ? (fits ? ' ✓' : ' ⚠') : ''
    return {
      title: `${s.name ?? s.registration} · ${s.locationName ?? 'in flight'}${cap}${marker}`,
      value: s.id,
      fits,
      capacity: s.cargo.weightCapacity,
    }
  })
  // Sort: fitting ships first; within each group, smallest capacity first
  // (so the picker defaults visually to the most efficient choice).
  items.sort((a, b) => {
    if (a.fits !== b.fits) return a.fits ? -1 : 1
    return a.capacity - b.capacity
  })
  return items
})

// When opening the dialog, snapshot the shipment (or reset).
watch(
  () => [props.modelValue, props.shipment] as const,
  ([open, shipment]) => {
    if (!open) return
    error.value = ''
    if (shipment) {
      form.value = {
        fromLocationId: shipment.fromLocationId,
        toLocationId: shipment.toLocationId,
        shipDbId: shipment.shipDbId,
        plannedLoadAt: shipment.plannedLoadAt.slice(0, 10),
        plannedArrivalAt: shipment.plannedArrivalAt.slice(0, 10),
        notes: shipment.notes ?? '',
        lines: shipment.lines.map(l => ({
          flowId: l.flowId,
          commodityTicker: l.commodityTicker,
          amount: l.amount,
        })),
      }
    } else {
      form.value = emptyForm()
    }
  },
  { immediate: true }
)

// On create, when the user picks a route, auto-fill manifest from eligible flows
// and auto-bump the planned arrival date by the max transit days. The user can
// still add/remove lines or override the date afterward.
watch(
  () => [form.value.fromLocationId, form.value.toLocationId] as const,
  ([from, to], [oldFrom, oldTo]) => {
    if (editing.value) return
    if (!from || !to) return
    if (from === oldFrom && to === oldTo) return
    // Replace lines with the eligible-flow autofill
    form.value.lines = eligibleFlows.value.map(e => ({
      flowId: e.id,
      commodityTicker: e.commodityTicker,
      amount: Math.max(1, Math.round(e.perShipmentAmount)),
    }))
    // Bump arrival = load + max transit
    if (form.value.plannedLoadAt) {
      const load = new Date(form.value.plannedLoadAt + 'T00:00:00Z')
      const arrive = new Date(load.getTime() + maxTransitForRoute.value * 86_400_000)
      form.value.plannedArrivalAt = arrive.toISOString().slice(0, 10)
    }
  }
)

function onDialogUpdate(v: boolean) {
  if (!v) close()
}

function close() {
  emit('update:modelValue', false)
}

function toIsoMidnight(yyyymmdd: string): string {
  // Treat the date as midnight UTC to keep server-side comparisons stable.
  return new Date(yyyymmdd + 'T00:00:00Z').toISOString()
}

async function handleSave() {
  saving.value = true
  error.value = ''
  try {
    if (!form.value.fromLocationId || !form.value.toLocationId) {
      throw new Error('Origin and destination are required')
    }
    if (form.value.fromLocationId === form.value.toLocationId) {
      throw new Error('Origin and destination must differ')
    }
    if (form.value.lines.length === 0) {
      throw new Error('At least one manifest line is required')
    }
    for (const l of form.value.lines) {
      if (!l.commodityTicker) throw new Error('Every line needs a ticker')
      if (!Number.isFinite(l.amount) || l.amount <= 0) {
        throw new Error(`Line for ${l.commodityTicker || 'ad-hoc'}: amount must be > 0`)
      }
    }

    const lines = form.value.lines.map(l => ({
      flowId: l.flowId,
      commodityTicker: l.commodityTicker.toUpperCase(),
      amount: Math.floor(l.amount),
    }))

    if (editing.value && props.shipment) {
      const body: UpdateShipmentRequest = {
        shipDbId: form.value.shipDbId,
        plannedLoadAt: toIsoMidnight(form.value.plannedLoadAt),
        plannedArrivalAt: toIsoMidnight(form.value.plannedArrivalAt),
        notes: form.value.notes.trim() || null,
        lines,
      }
      await api.logistics.updateShipment(props.shipment.id, body)
    } else {
      const body: CreateShipmentRequest = {
        fromLocationId: form.value.fromLocationId,
        toLocationId: form.value.toLocationId,
        shipDbId: form.value.shipDbId,
        plannedLoadAt: toIsoMidnight(form.value.plannedLoadAt),
        plannedArrivalAt: toIsoMidnight(form.value.plannedArrivalAt),
        notes: form.value.notes.trim() || undefined,
        lines,
      }
      await api.logistics.createShipment(body)
    }
    emit('saved')
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save shipment'
  } finally {
    saving.value = false
  }
}

async function handleDelete() {
  if (!props.shipment) return
  if (!confirm('Delete this shipment?')) return
  deleting.value = true
  try {
    await api.logistics.deleteShipment(props.shipment.id)
    emit('saved')
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete shipment'
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.manifest-table {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}

.ad-hoc-ticker :deep(input) {
  text-transform: uppercase;
}
</style>
