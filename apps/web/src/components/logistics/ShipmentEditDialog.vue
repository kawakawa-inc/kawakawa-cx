<template>
  <v-dialog :model-value="modelValue" max-width="980" @update:model-value="onDialogUpdate">
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
        <v-alert v-if="notice" type="info" density="compact" variant="tonal" class="mb-3">
          {{ notice }}
        </v-alert>

        <!-- Ship + notes -->
        <v-row dense>
          <v-col cols="12" md="7">
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
          <v-col cols="12" md="5">
            <v-text-field
              v-model="form.notes"
              label="Notes (optional)"
              density="compact"
              hide-details
              :readonly="readOnly"
            />
          </v-col>
        </v-row>

        <!-- Stops -->
        <div class="d-flex align-center mt-4 mb-2">
          <span class="text-subtitle-2">Stops</span>
          <span class="text-caption text-medium-emphasis ml-2"> ({{ form.stops.length }}) </span>
          <v-spacer />
          <v-btn
            v-if="!readOnly && form.stops.length >= 2"
            size="x-small"
            prepend-icon="mdi-clock-outline"
            variant="text"
            :loading="suggestingTimes"
            :disabled="!canSuggestTimes"
            :title="
              canSuggestTimes
                ? 'Estimate arrival times from jump distance + cargo load'
                : 'Pick a location for every stop first'
            "
            @click="handleSuggestTimes"
          >
            Suggest times
          </v-btn>
          <v-btn
            v-if="!readOnly"
            size="x-small"
            prepend-icon="mdi-plus"
            variant="text"
            @click="addStop"
          >
            Add stop
          </v-btn>
        </div>

        <div
          v-if="form.stops.length === 0"
          class="text-medium-emphasis text-caption pa-3 stops-empty"
        >
          A trip needs at least 2 stops. Add the origin and at least one destination.
        </div>

        <v-table v-else density="compact" class="stops-table">
          <thead>
            <tr>
              <th style="width: 40px">#</th>
              <th>Location</th>
              <th style="width: 290px">Time</th>
              <th style="width: 60px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(stop, idx) in form.stops" :key="idx">
              <td class="text-caption text-medium-emphasis">{{ idx + 1 }}</td>
              <td>
                <KeyValueAutocomplete
                  v-model="stop.locationId"
                  :items="locationItems"
                  :favorites="settingsStore.favoritedLocations.value"
                  :label="idx === 0 ? 'Origin' : `Stop ${idx + 1}`"
                  density="compact"
                  hide-details
                  :disabled="readOnly"
                  @update:favorites="
                    settingsStore.updateSetting('market.favoritedLocations', $event)
                  "
                />
              </td>
              <td>
                <v-text-field
                  v-model="stop.plannedArriveAt"
                  type="datetime-local"
                  :label="idx === 0 ? 'Departs' : 'Arrives'"
                  density="compact"
                  hide-details
                  :readonly="readOnly"
                />
              </td>
              <td class="text-end">
                <v-btn
                  v-if="!readOnly"
                  size="x-small"
                  icon
                  variant="text"
                  :disabled="!canRemoveStop(idx)"
                  :title="
                    canRemoveStop(idx)
                      ? 'Remove this stop'
                      : 'A line uses this stop — remove the line first'
                  "
                  @click="removeStop(idx)"
                >
                  <v-icon size="small">mdi-close</v-icon>
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <!-- Manifest -->
        <div class="d-flex align-center mt-5 mb-2 flex-wrap ga-2">
          <span class="text-subtitle-2">Manifest</span>
          <span class="text-caption text-medium-emphasis">
            ({{ includedCount }} of {{ form.rows.length }}
            included)
          </span>
          <v-spacer />
          <v-btn
            v-if="!readOnly && form.rows.length > 0"
            size="x-small"
            variant="text"
            @click="setAllIncluded(true)"
          >
            All
          </v-btn>
          <v-btn
            v-if="!readOnly && form.rows.length > 0"
            size="x-small"
            variant="text"
            @click="setAllIncluded(false)"
          >
            None
          </v-btn>
          <v-btn
            v-if="!readOnly && form.stops.length >= 2"
            size="x-small"
            prepend-icon="mdi-plus"
            variant="text"
            @click="addCustomRow"
          >
            Add custom row
          </v-btn>
        </div>

        <div
          v-if="form.stops.length < 2"
          class="text-medium-emphasis text-caption pa-3 stops-empty"
        >
          Add at least two stops before composing a manifest.
        </div>

        <div
          v-else-if="form.rows.length === 0"
          class="text-medium-emphasis text-caption pa-3 stops-empty"
        >
          No flows match this set of stops yet. Define flows on the Inspector tab, or click
          <strong>Add custom row</strong> for an ad-hoc line.
        </div>

        <v-table v-else density="compact" class="manifest-table">
          <thead>
            <tr>
              <th style="width: 50px" class="text-center" title="Include in this trip">Send</th>
              <th style="width: 36px"></th>
              <th style="width: 110px">Material</th>
              <th style="width: 200px">From</th>
              <th style="width: 200px">To</th>
              <th class="text-end" style="width: 140px">Amount</th>
              <th class="text-end" style="width: 140px">Cargo</th>
              <th style="width: 36px"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in form.rows" :key="row.key" :class="{ 'row-excluded': !row.included }">
              <td class="text-center">
                <v-checkbox-btn
                  :model-value="row.included"
                  density="compact"
                  hide-details
                  :disabled="readOnly"
                  @update:model-value="row.included = !!$event"
                />
              </td>
              <td>
                <v-icon
                  size="x-small"
                  :color="row.flowId == null ? 'warning' : 'primary'"
                  :title="row.flowId == null ? 'Ad-hoc' : 'From a flow'"
                >
                  {{ row.flowId == null ? 'mdi-package-variant-closed' : 'mdi-cogs' }}
                </v-icon>
              </td>
              <td>
                <span v-if="row.flowId != null || readOnly">{{ row.commodityTicker }}</span>
                <v-text-field
                  v-else
                  v-model="row.commodityTicker"
                  density="compact"
                  hide-details
                  placeholder="ticker"
                  class="ad-hoc-ticker"
                />
              </td>
              <td>
                <span v-if="row.flowId != null || readOnly" class="text-caption">
                  {{ stopLabel(row.originStopIndex) }}
                </span>
                <v-select
                  v-else
                  v-model.number="row.originStopIndex"
                  :items="stopOptionsForOrigin(row)"
                  item-title="title"
                  item-value="value"
                  density="compact"
                  hide-details
                />
              </td>
              <td>
                <span v-if="row.flowId != null || readOnly" class="text-caption">
                  {{ stopLabel(row.destinationStopIndex) }}
                </span>
                <v-select
                  v-else
                  v-model.number="row.destinationStopIndex"
                  :items="stopOptionsForDestination(row)"
                  item-title="title"
                  item-value="value"
                  density="compact"
                  hide-details
                />
              </td>
              <td class="text-end">
                <span v-if="readOnly">{{ Math.round(row.amount).toLocaleString() }}</span>
                <v-text-field
                  v-else
                  v-model.number="row.amount"
                  type="number"
                  min="1"
                  density="compact"
                  hide-details
                />
              </td>
              <td class="text-end text-caption text-medium-emphasis">
                {{ formatCargo(row) }}
              </td>
              <td>
                <v-btn
                  v-if="!readOnly && row.flowId == null"
                  size="x-small"
                  icon
                  variant="text"
                  title="Remove this custom row"
                  @click="removeRow(row.key)"
                >
                  <v-icon size="small">mdi-close</v-icon>
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <!-- Capacity meter -->
        <template v-if="form.shipDbId != null && form.stops.length >= 2">
          <div class="d-flex align-center mt-4 mb-1">
            <v-icon size="x-small" class="mr-1">mdi-weight</v-icon>
            <span class="text-subtitle-2">Capacity per segment</span>
            <span class="text-caption text-medium-emphasis ml-2">
              {{ shipCapLabel }}
            </span>
          </div>
          <v-table density="compact" class="capacity-table">
            <thead>
              <tr>
                <th>Segment</th>
                <th style="width: 220px">Weight</th>
                <th style="width: 220px">Volume</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="seg in segmentLoads" :key="seg.segmentIndex">
                <td class="text-caption">
                  {{ stopLabel(seg.segmentIndex) }} → {{ stopLabel(seg.segmentIndex + 1) }}
                </td>
                <td>
                  <div class="d-flex align-center ga-2">
                    <v-progress-linear
                      :model-value="pctOf(seg.weight, shipWeightCap)"
                      :color="seg.overWeight ? 'error' : 'primary'"
                      height="6"
                      style="max-width: 100px"
                    />
                    <span
                      class="text-caption"
                      :class="seg.overWeight ? 'text-error' : 'text-medium-emphasis'"
                    >
                      {{ Math.round(seg.weight).toLocaleString() }}t /
                      {{ Math.round(shipWeightCap).toLocaleString() }}t
                    </span>
                  </div>
                </td>
                <td>
                  <div class="d-flex align-center ga-2">
                    <v-progress-linear
                      :model-value="pctOf(seg.volume, shipVolumeCap)"
                      :color="seg.overVolume ? 'error' : 'primary'"
                      height="6"
                      style="max-width: 100px"
                    />
                    <span
                      class="text-caption"
                      :class="seg.overVolume ? 'text-error' : 'text-medium-emphasis'"
                    >
                      {{ Math.round(seg.volume).toLocaleString() }}m³ /
                      {{ Math.round(shipVolumeCap).toLocaleString() }}m³
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
          <div v-if="capacityViolations.length > 0" class="text-caption text-error mt-1">
            {{ capacityViolations.length }} segment{{ capacityViolations.length === 1 ? '' : 's' }}
            over capacity. Reduce a manifest line or pick a larger ship before saving.
          </div>
        </template>
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
        <v-btn
          v-if="!readOnly"
          color="primary"
          :loading="saving"
          :disabled="capacityViolations.length > 0"
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
import { useSettingsStore } from '../../stores/settings'
import { api } from '../../services/api'
import { commodityService } from '../../services/commodityService'
import { locationService } from '../../services/locationService'
import { useUserStore } from '../../stores/user'
import type {
  Shipment,
  LogisticsGraph,
  UserShip,
  CreateShipmentRequest,
  UpdateShipmentRequest,
  ShipmentLineInput,
  ShipmentStopInput,
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
const userStore = useUserStore()
const editing = computed(() => props.shipment !== null)
// Non-planned shipments are historical: viewable but not editable. Status
// transitions are handled in the list (Cancel/Dispatch/Deliver buttons).
const readOnly = computed(
  () => editing.value && props.shipment !== null && props.shipment.status !== 'planned'
)

interface FormStop {
  locationId: string
  /** YYYY-MM-DDTHH:MM (datetime-local) — converted to ISO on save. */
  plannedArriveAt: string
}

/**
 * One row in the manifest table. Both due flows (pre-populated, unchecked)
 * and ad-hoc lines live here as a single list — the `flowId` distinguishes
 * them and `included` is whether the row ends up in the saved manifest.
 */
interface ManifestRow {
  /** Stable key for v-for. `flow:<id>` for flow rows, `adhoc:<n>` for custom. */
  key: string
  /** Flow id for due-flow rows; null for ad-hoc. */
  flowId: number | null
  commodityTicker: string
  originStopIndex: number
  destinationStopIndex: number
  amount: number
  /** Checkbox state: true = include in the saved manifest. */
  included: boolean
}

interface FormShape {
  shipDbId: number | null
  notes: string
  stops: FormStop[]
  rows: ManifestRow[]
}

function defaultStopAt(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  // datetime-local format: YYYY-MM-DDTHH:MM in LOCAL time, so use local accessors.
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function emptyForm(): FormShape {
  return {
    shipDbId: null,
    notes: '',
    stops: [
      { locationId: '', plannedArriveAt: defaultStopAt(0) },
      { locationId: '', plannedArriveAt: defaultStopAt(1) },
    ],
    rows: [],
  }
}

/** Monotonic counter for ad-hoc row keys. Reset whenever the dialog re-opens. */
let adhocCounter = 0

function isoToLocalInput(iso: string): string {
  // Convert ISO timestamp to a datetime-local-compatible YYYY-MM-DDTHH:MM in
  // the user's local time. The HTML <input type="datetime-local"> doesn't
  // accept a 'Z' suffix.
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

const form = ref<FormShape>(emptyForm())
const saving = ref(false)
const deleting = ref(false)
const suggestingTimes = ref(false)
const error = ref('')
const notice = ref('')

// ==================== Stop management ====================

function addStop() {
  const lastStopAt = form.value.stops[form.value.stops.length - 1]?.plannedArriveAt
  // Default the new stop to a day after the last one.
  const baseTime = lastStopAt ? new Date(lastStopAt).getTime() : Date.now()
  const next = new Date(baseTime + 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  form.value.stops.push({
    locationId: '',
    plannedArriveAt:
      `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` +
      `T${pad(next.getHours())}:${pad(next.getMinutes())}`,
  })
}

function canRemoveStop(idx: number): boolean {
  if (form.value.stops.length <= 2) return false
  // Only included rows block removal — unchecked flow rows will be re-derived
  // from current eligibility after the stop change anyway.
  return !form.value.rows.some(
    r => r.included && (r.originStopIndex === idx || r.destinationStopIndex === idx)
  )
}

function removeStop(idx: number) {
  if (!canRemoveStop(idx)) return
  form.value.stops.splice(idx, 1)
  // Shift line indices that pointed past the removed stop.
  for (const row of form.value.rows) {
    if (row.originStopIndex > idx) row.originStopIndex--
    if (row.destinationStopIndex > idx) row.destinationStopIndex--
  }
}

function stopLabel(idx: number): string {
  const stop = form.value.stops[idx]
  if (!stop) return `Stop ${idx + 1}`
  if (!stop.locationId) return `Stop ${idx + 1}`
  return `${idx + 1}: ${locationService.getLocationDisplay(
    stop.locationId,
    userStore.getLocationDisplayMode()
  )}`
}

const canSuggestTimes = computed(
  () => form.value.stops.length >= 2 && form.value.stops.every(s => !!s.locationId)
)

/**
 * Estimate arrival times for stops 2..N using the server's tier-1 heuristic
 * (jump count + same-system constant + cargo load factor). Stop 1's time is
 * preserved as the trip start. Warnings are surfaced as an inline notice.
 * Only included rows count toward cargo mass.
 */
async function handleSuggestTimes() {
  if (!canSuggestTimes.value) return
  suggestingTimes.value = true
  error.value = ''
  notice.value = ''
  try {
    const startAt = localInputToIso(form.value.stops[0].plannedArriveAt)
    const result = await api.logistics.suggestStopTimes({
      startAt,
      stops: form.value.stops.map(s => ({ locationId: s.locationId })),
      shipDbId: form.value.shipDbId,
      lines: includedLines.value,
    })
    for (let i = 1; i < result.stops.length && i < form.value.stops.length; i++) {
      form.value.stops[i].plannedArriveAt = isoToLocalInput(result.stops[i].plannedArriveAt)
    }
    if (result.warnings.length > 0) {
      notice.value = `Suggested. Note: ${result.warnings.join(' ')}`
    } else {
      notice.value = `Suggested arrival times applied. These are rough — adjust if you have a better feel for a specific route.`
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to suggest stop times'
  } finally {
    suggestingTimes.value = false
  }
}

// ==================== Manifest rows (flows + ad-hoc, unified) ====================

interface EligibleFlow {
  flowId: number
  commodityTicker: string
  originStopIndex: number
  destinationStopIndex: number
  suggestedAmount: number
}

/**
 * For each demand/fixed flow in the graph, find the FIRST (i, j) pair of
 * stops where i < j, stops[i] = flow.from, stops[j] = flow.to. Used to seed
 * the manifest table with rows for what's "due on this route."
 */
const eligibleFlows = computed<EligibleFlow[]>(() => {
  if (!props.graph) return []
  const stopsLocs = form.value.stops.map(s => s.locationId)
  if (stopsLocs.length < 2) return []
  const out: EligibleFlow[] = []
  for (const edge of props.graph.edges) {
    if (edge.kind !== 'demand' && edge.kind !== 'fixed') continue
    if (edge.perShipmentAmount <= 0) continue
    const originIdx = stopsLocs.indexOf(edge.fromLocationId)
    if (originIdx < 0) continue
    const destIdx = stopsLocs.indexOf(edge.toLocationId, originIdx + 1)
    if (destIdx < 0) continue
    out.push({
      flowId: edge.id,
      commodityTicker: edge.commodityTicker,
      originStopIndex: originIdx,
      destinationStopIndex: destIdx,
      suggestedAmount: edge.perShipmentAmount,
    })
  }
  return out
})

/**
 * Reconcile flow rows with current eligibility. Adds rows for newly-eligible
 * flows (unchecked, with suggested amount), removes rows whose flow is no
 * longer eligible, and re-points origin/destination indices when stops shift
 * but the flow still applies. Ad-hoc rows pass through unchanged.
 */
function syncFlowRows(): void {
  const eligible = eligibleFlows.value
  const eligibleById = new Map(eligible.map(e => [e.flowId, e]))

  // Drop flow rows whose flow is no longer eligible.
  form.value.rows = form.value.rows.filter(r => r.flowId === null || eligibleById.has(r.flowId))

  // Update origin/destination on still-eligible flow rows.
  for (const row of form.value.rows) {
    if (row.flowId === null) continue
    const e = eligibleById.get(row.flowId)
    if (!e) continue
    row.originStopIndex = e.originStopIndex
    row.destinationStopIndex = e.destinationStopIndex
  }

  // Add any newly-eligible flows as unchecked rows with suggested amount.
  const haveFlowIds = new Set(
    form.value.rows.map(r => r.flowId).filter((v): v is number => v !== null)
  )
  for (const e of eligible) {
    if (haveFlowIds.has(e.flowId)) continue
    form.value.rows.push({
      key: `flow:${e.flowId}`,
      flowId: e.flowId,
      commodityTicker: e.commodityTicker,
      originStopIndex: e.originStopIndex,
      destinationStopIndex: e.destinationStopIndex,
      amount: Math.max(1, Math.round(e.suggestedAmount)),
      included: false,
    })
  }
}

// Keep flow rows in sync with the current set of stops + graph.
watch(
  () => [form.value.stops.map(s => s.locationId).join('|'), props.graph] as const,
  () => syncFlowRows()
)

function addCustomRow() {
  // Default a new custom row to load at first stop, drop at last stop.
  form.value.rows.push({
    key: `adhoc:${++adhocCounter}`,
    flowId: null,
    commodityTicker: '',
    originStopIndex: 0,
    destinationStopIndex: form.value.stops.length - 1,
    amount: 1,
    included: true,
  })
}

function removeRow(rowKey: string) {
  form.value.rows = form.value.rows.filter(r => r.key !== rowKey)
}

function setAllIncluded(included: boolean) {
  for (const row of form.value.rows) row.included = included
}

function stopOptionsForOrigin(row: ManifestRow): Array<{ title: string; value: number }> {
  // Origin can be any stop EXCEPT the last (it has nowhere to drop).
  return form.value.stops
    .map((_, i) => ({ title: stopLabel(i), value: i }))
    .filter(opt => opt.value < row.destinationStopIndex)
}

function stopOptionsForDestination(row: ManifestRow): Array<{ title: string; value: number }> {
  return form.value.stops
    .map((_, i) => ({ title: stopLabel(i), value: i }))
    .filter(opt => opt.value > row.originStopIndex)
}

const includedRows = computed(() => form.value.rows.filter(r => r.included))

const includedLines = computed<ShipmentLineInput[]>(() =>
  includedRows.value.map(r => ({
    originStopIndex: r.originStopIndex,
    destinationStopIndex: r.destinationStopIndex,
    flowId: r.flowId,
    commodityTicker: r.commodityTicker.toUpperCase(),
    amount: Math.floor(r.amount),
  }))
)

const includedCount = computed(() => includedRows.value.length)

// ==================== Capacity ====================

function rowWeight(row: ManifestRow): number {
  if (!row.commodityTicker || !row.amount) return 0
  const w = commodityService.getCommodityWeight(row.commodityTicker.toUpperCase()) ?? 0
  return w * row.amount
}

function rowVolume(row: ManifestRow): number {
  if (!row.commodityTicker || !row.amount) return 0
  const v = commodityService.getCommodityVolume(row.commodityTicker.toUpperCase()) ?? 0
  return v * row.amount
}

function formatCargo(row: ManifestRow): string {
  const w = Math.round(rowWeight(row))
  const v = Math.round(rowVolume(row))
  if (w === 0 && v === 0) return '—'
  return `${w.toLocaleString()}t / ${v.toLocaleString()}m³`
}

const selectedShip = computed<UserShip | null>(() => {
  if (form.value.shipDbId == null) return null
  return props.ships.find(s => s.id === form.value.shipDbId) ?? null
})

const shipWeightCap = computed(() => selectedShip.value?.cargo.weightCapacity ?? 0)
const shipVolumeCap = computed(() => selectedShip.value?.cargo.volumeCapacity ?? 0)

const shipCapLabel = computed(() => {
  const s = selectedShip.value
  if (!s) return ''
  return `(${s.name ?? s.registration} · ${Math.round(shipWeightCap.value).toLocaleString()}t / ${Math.round(
    shipVolumeCap.value
  ).toLocaleString()}m³)`
})

interface SegmentLoadRow {
  segmentIndex: number
  weight: number
  volume: number
  overWeight: boolean
  overVolume: boolean
}

const segmentLoads = computed<SegmentLoadRow[]>(() => {
  const stopCount = form.value.stops.length
  const segCount = Math.max(0, stopCount - 1)
  const out: SegmentLoadRow[] = []
  for (let i = 0; i < segCount; i++) {
    out.push({ segmentIndex: i, weight: 0, volume: 0, overWeight: false, overVolume: false })
  }
  for (const row of includedRows.value) {
    const w = rowWeight(row)
    const v = rowVolume(row)
    for (let s = row.originStopIndex; s < row.destinationStopIndex; s++) {
      const seg = out[s]
      if (!seg) continue
      seg.weight += w
      seg.volume += v
    }
  }
  for (const seg of out) {
    if (shipWeightCap.value > 0 && seg.weight > shipWeightCap.value + 1e-6) {
      seg.overWeight = true
    }
    if (shipVolumeCap.value > 0 && seg.volume > shipVolumeCap.value + 1e-6) {
      seg.overVolume = true
    }
  }
  return out
})

const capacityViolations = computed(() => {
  if (form.value.shipDbId == null) return []
  return segmentLoads.value.filter(s => s.overWeight || s.overVolume)
})

function pctOf(value: number, cap: number): number {
  if (cap <= 0) return 0
  return Math.min(100, (value / cap) * 100)
}

// ==================== Ship picker ====================

interface ShipPickerItem {
  title: string
  value: number
  fits: boolean
  capacity: number
}

const shipPickerHint = computed(() => {
  const w = peakSegmentWeight.value
  const v = peakSegmentVolume.value
  if (w <= 0 && v <= 0) return 'Pick a ship to see capacity per segment.'
  const fitting = shipItems.value.filter(s => s.fits).length
  if (fitting === 0) {
    return `Peak load: ${Math.round(w).toLocaleString()}t / ${Math.round(v).toLocaleString()}m³ — no ship in the fleet can carry this in one trip.`
  }
  return `Peak load: ${Math.round(w).toLocaleString()}t / ${Math.round(v).toLocaleString()}m³ — ${fitting} ship${fitting === 1 ? '' : 's'} can carry this. Smallest viable shown first.`
})

const peakSegmentWeight = computed(() => {
  let max = 0
  const stopCount = form.value.stops.length
  const segCount = Math.max(0, stopCount - 1)
  const seg = new Array<number>(segCount).fill(0)
  for (const row of includedRows.value) {
    const w = rowWeight(row)
    for (let s = row.originStopIndex; s < row.destinationStopIndex; s++) {
      seg[s] = (seg[s] ?? 0) + w
      if (seg[s] > max) max = seg[s]
    }
  }
  return max
})

const peakSegmentVolume = computed(() => {
  let max = 0
  const stopCount = form.value.stops.length
  const segCount = Math.max(0, stopCount - 1)
  const seg = new Array<number>(segCount).fill(0)
  for (const row of includedRows.value) {
    const v = rowVolume(row)
    for (let s = row.originStopIndex; s < row.destinationStopIndex; s++) {
      seg[s] = (seg[s] ?? 0) + v
      if (seg[s] > max) max = seg[s]
    }
  }
  return max
})

// Filter the ship picker to ships at the trip's first-stop location (or with
// unknown location) and sort by "fits the peak segment first, smallest first."
const shipItems = computed<ShipPickerItem[]>(() => {
  const w = peakSegmentWeight.value
  const v = peakSegmentVolume.value
  const firstLocation = form.value.stops[0]?.locationId
  const candidates = props.ships.filter(
    s => !firstLocation || !s.locationNaturalId || s.locationNaturalId === firstLocation
  )
  const items = candidates.map(s => {
    const fits = s.cargo.weightCapacity >= w && s.cargo.volumeCapacity >= v
    const capParts: string[] = []
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
  items.sort((a, b) => {
    if (a.fits !== b.fits) return a.fits ? -1 : 1
    return a.capacity - b.capacity
  })
  return items
})

// ==================== Open / save / delete ====================

watch(
  () => [props.modelValue, props.shipment] as const,
  ([open, shipment]) => {
    if (!open) return
    error.value = ''
    notice.value = ''
    adhocCounter = 0
    if (shipment) {
      // Map the line origin/destination IDs back to stop indices.
      const stopIdToIndex = new Map(shipment.stops.map((s, i) => [s.id, i]))
      const rows: ManifestRow[] = shipment.lines.map(l => ({
        key: l.flowId !== null ? `flow:${l.flowId}` : `adhoc:${++adhocCounter}`,
        flowId: l.flowId,
        commodityTicker: l.commodityTicker,
        originStopIndex: stopIdToIndex.get(l.originStopId) ?? 0,
        destinationStopIndex: stopIdToIndex.get(l.destinationStopId) ?? 0,
        amount: l.amount,
        included: true,
      }))
      form.value = {
        shipDbId: shipment.shipDbId,
        notes: shipment.notes ?? '',
        stops: shipment.stops.map(s => ({
          locationId: s.locationId,
          plannedArriveAt: isoToLocalInput(s.plannedArriveAt),
        })),
        rows,
      }
    } else {
      form.value = emptyForm()
    }
    // Populate flow rows from current eligibility (adds unchecked rows for
    // matching flows not already on the manifest).
    syncFlowRows()
  },
  { immediate: true }
)

function onDialogUpdate(v: boolean) {
  if (!v) close()
}

function close() {
  emit('update:modelValue', false)
}

function localInputToIso(s: string): string {
  // datetime-local is in local time without a zone — interpret it that way.
  return new Date(s).toISOString()
}

async function handleSave() {
  saving.value = true
  error.value = ''
  try {
    if (form.value.stops.length < 2) throw new Error('A trip needs at least 2 stops')
    for (let i = 0; i < form.value.stops.length; i++) {
      const s = form.value.stops[i]
      if (!s.locationId) throw new Error(`Stop ${i + 1}: pick a location`)
      if (!s.plannedArriveAt) throw new Error(`Stop ${i + 1}: pick a planned arrival time`)
      if (i > 0 && s.locationId === form.value.stops[i - 1].locationId) {
        throw new Error(
          `Stops ${i} and ${i + 1} are at the same location — pick a different one or remove the duplicate stop`
        )
      }
    }
    const included = includedRows.value
    if (included.length === 0) {
      throw new Error('Check at least one manifest row to include in the trip')
    }
    for (let i = 0; i < included.length; i++) {
      const r = included[i]
      if (!r.commodityTicker) throw new Error(`Row ${i + 1}: ticker is required`)
      if (!Number.isFinite(r.amount) || r.amount <= 0) {
        throw new Error(`Row ${i + 1} (${r.commodityTicker}): amount must be > 0`)
      }
      if (r.originStopIndex >= r.destinationStopIndex) {
        throw new Error(
          `Row ${i + 1} (${r.commodityTicker}): cargo must be loaded before it's dropped`
        )
      }
    }
    if (capacityViolations.value.length > 0) {
      throw new Error(
        'One or more segments exceed ship capacity. Reduce a line or pick a larger ship.'
      )
    }

    const stopsBody: ShipmentStopInput[] = form.value.stops.map(s => ({
      locationId: s.locationId,
      plannedArriveAt: localInputToIso(s.plannedArriveAt),
    }))
    const linesBody: ShipmentLineInput[] = includedLines.value

    if (editing.value && props.shipment) {
      const body: UpdateShipmentRequest = {
        shipDbId: form.value.shipDbId,
        notes: form.value.notes.trim() || null,
        stops: stopsBody,
        lines: linesBody,
      }
      await api.logistics.updateShipment(props.shipment.id, body)
    } else {
      const body: CreateShipmentRequest = {
        shipDbId: form.value.shipDbId,
        notes: form.value.notes.trim() || null,
        stops: stopsBody,
        lines: linesBody,
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
.stops-empty {
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.stops-table,
.manifest-table,
.capacity-table {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}

.row-excluded {
  opacity: 0.55;
}

.ad-hoc-ticker :deep(input) {
  text-transform: uppercase;
}

.cursor-pointer {
  cursor: pointer;
}
</style>
