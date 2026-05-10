<template>
  <v-dialog :model-value="modelValue" max-width="980" @update:model-value="onDialogUpdate">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>{{ readOnly ? 'mdi-eye' : editing ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
        {{ readOnly ? 'View Trip' : editing ? 'Edit Trip' : 'New Trip' }}
        <v-chip
          v-if="readOnly && trip"
          size="x-small"
          class="ml-2"
          :color="
            trip.status === 'delivered' ? 'success' : trip.status === 'cancelled' ? 'grey' : 'info'
          "
          variant="tonal"
        >
          {{ trip.status }}
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
          <span class="text-caption text-medium-emphasis ml-2">({{ form.stops.length }})</span>
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

        <v-table density="compact" class="stops-table">
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
                      : 'A shipment uses this stop — un-assign it first'
                  "
                  @click="removeStop(idx)"
                >
                  <v-icon size="small">mdi-close</v-icon>
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <!-- Shipments -->
        <div class="d-flex align-center mt-5 mb-2 flex-wrap ga-2">
          <span class="text-subtitle-2">Shipments</span>
          <span class="text-caption text-medium-emphasis">
            ({{ form.assignments.length }} of {{ allShipmentRows.length }} assigned)
          </span>
          <v-spacer />
          <v-btn
            v-if="!readOnly && form.stops.length >= 2"
            size="x-small"
            prepend-icon="mdi-plus"
            variant="text"
            @click="openAdhocForm"
          >
            Add ad-hoc shipment
          </v-btn>
        </div>

        <div
          v-if="form.stops.length < 2"
          class="text-medium-emphasis text-caption pa-3 stops-empty"
        >
          Add at least two stops before assigning shipments.
        </div>

        <div
          v-else-if="allShipmentRows.length === 0"
          class="text-medium-emphasis text-caption pa-3 stops-empty"
        >
          No shipments to bundle yet. Create one from the Plan tab — predicted shipments from your
          flows will appear here.
        </div>

        <v-table v-else density="compact" class="shipments-table">
          <thead>
            <tr>
              <th style="width: 50px" class="text-center" title="Include in this trip">Send</th>
              <th>Route</th>
              <th>Lines</th>
              <th class="text-end" style="width: 130px">Cargo</th>
              <th style="width: 30px"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in allShipmentRows"
              :key="row.shipment.id"
              :class="{
                'row-excluded': !row.assigned,
                'row-ineligible': !row.eligible && !row.assigned,
              }"
            >
              <td class="text-center">
                <v-checkbox
                  :model-value="row.assigned"
                  :disabled="readOnly || (!row.assigned && !row.eligible)"
                  density="compact"
                  hide-details
                  class="ma-0 pa-0 d-inline-flex"
                  @update:model-value="toggleAssignment(row.shipment, !!$event)"
                />
              </td>
              <td class="text-caption">
                <strong>{{ locationDisplay(row.shipment.originLocationId) }}</strong>
                →
                <strong>{{ locationDisplay(row.shipment.destLocationId) }}</strong>
                <span
                  v-if="!row.eligible && !row.assigned"
                  class="text-caption text-medium-emphasis ml-2"
                >
                  (not on this route)
                </span>
                <span
                  v-else-if="row.assigned && row.assignment"
                  class="text-caption text-medium-emphasis ml-2"
                >
                  via stop {{ row.assignment.originStopIndex + 1 }} →
                  {{ row.assignment.destStopIndex + 1 }}
                </span>
              </td>
              <td class="text-caption">
                <span v-for="(line, lidx) in row.shipment.lines" :key="lidx">
                  {{ line.commodityTicker }} {{ Math.round(line.amount).toLocaleString()
                  }}<span v-if="lidx < row.shipment.lines.length - 1">, </span>
                </span>
                <span v-if="row.shipment.lines.length === 0" class="text-medium-emphasis">—</span>
              </td>
              <td class="text-end text-caption text-medium-emphasis">
                {{ formatShipmentCargo(row.shipment) }}
              </td>
              <td>
                <v-tooltip v-if="!row.eligible && !row.assigned" location="left">
                  <template #activator="{ props: tooltipProps }">
                    <v-icon size="x-small" color="medium-emphasis" v-bind="tooltipProps">
                      mdi-information-outline
                    </v-icon>
                  </template>
                  Add stops at {{ locationDisplay(row.shipment.originLocationId) }} (before)
                  {{ locationDisplay(row.shipment.destLocationId) }} to assign this shipment.
                </v-tooltip>
              </td>
            </tr>
          </tbody>
        </v-table>

        <!-- Ad-hoc shipment form -->
        <v-expand-transition>
          <div v-if="adhocOpen" class="adhoc-form pa-3 mt-2">
            <div class="d-flex align-center mb-2">
              <v-icon size="x-small" class="mr-1">mdi-package-variant-closed-plus</v-icon>
              <span class="text-subtitle-2">New ad-hoc shipment</span>
              <v-spacer />
              <v-btn size="x-small" variant="text" icon @click="adhocOpen = false">
                <v-icon size="small">mdi-close</v-icon>
              </v-btn>
            </div>
            <v-alert v-if="adhocError" type="error" density="compact" variant="tonal" class="mb-2">
              {{ adhocError }}
            </v-alert>
            <v-row dense>
              <v-col cols="12" md="6">
                <v-select
                  v-model="adhocForm.originStopIndex"
                  :items="stopOptions"
                  item-title="title"
                  item-value="value"
                  label="Origin stop"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-select
                  v-model="adhocForm.destStopIndex"
                  :items="stopOptions"
                  item-title="title"
                  item-value="value"
                  label="Destination stop"
                  density="compact"
                  hide-details
                />
              </v-col>
            </v-row>
            <v-table density="compact" class="adhoc-lines-table mt-3">
              <thead>
                <tr>
                  <th>Material</th>
                  <th class="text-end" style="width: 140px">Amount</th>
                  <th style="width: 40px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, idx) in adhocForm.lines" :key="idx">
                  <td>
                    <v-autocomplete
                      v-model="line.commodityTicker"
                      :items="commodityOptions"
                      item-title="title"
                      item-value="value"
                      label="Ticker"
                      density="compact"
                      hide-details
                    />
                  </td>
                  <td>
                    <v-text-field
                      v-model.number="line.amount"
                      type="number"
                      min="0"
                      density="compact"
                      hide-details
                    />
                  </td>
                  <td class="text-end">
                    <v-btn
                      size="x-small"
                      icon
                      variant="text"
                      :disabled="adhocForm.lines.length === 1"
                      @click="removeAdhocLine(idx)"
                    >
                      <v-icon size="small">mdi-close</v-icon>
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>
            <div class="d-flex align-center mt-2">
              <v-btn size="x-small" prepend-icon="mdi-plus" variant="text" @click="addAdhocLine">
                Add line
              </v-btn>
              <v-spacer />
              <v-btn size="small" variant="text" @click="adhocOpen = false">Cancel</v-btn>
              <v-btn size="small" color="primary" :loading="adhocSaving" @click="saveAdhocShipment">
                Add to trip
              </v-btn>
            </div>
          </div>
        </v-expand-transition>

        <!-- Capacity meter -->
        <template v-if="form.shipDbId != null && form.stops.length >= 2">
          <div class="d-flex align-center mt-4 mb-1">
            <v-icon size="x-small" class="mr-1">mdi-weight</v-icon>
            <span class="text-subtitle-2">Capacity per segment</span>
            <span class="text-caption text-medium-emphasis ml-2">{{ shipCapLabel }}</span>
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
            over capacity. Drop a shipment from the trip or pick a larger ship.
          </div>
        </template>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-btn
          v-if="editing && trip && trip.status === 'planned'"
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
import { useUserStore } from '../../stores/user'
import { api } from '../../services/api'
import { commodityService } from '../../services/commodityService'
import { locationService } from '../../services/locationService'
import type {
  Trip,
  Shipment,
  UserShip,
  CreateTripRequest,
  UpdateTripRequest,
  TripShipmentAssignment,
} from '@kawakawa/types'
import type { KeyValueItem } from '../KeyValueAutocomplete.vue'
import type { ShipmentPreset } from './PlanView.vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    locationItems: KeyValueItem[]
    trip?: Trip | null
    /**
     * If non-empty on a fresh-create dialog, these presets are pre-assigned
     * and stops are auto-seeded at the union of their origin and destination
     * locations (origins first in input order, then destinations not already
     * used as origins). Drafts (predicted shipments) are held as virtual
     * rows with negative IDs and only created via API when the trip saves —
     * cancelling out of the dialog therefore leaves no orphan records.
     */
    presetShipments?: ShipmentPreset[]
    ships?: UserShip[]
  }>(),
  { trip: null, presetShipments: () => [], ships: () => [] }
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const settingsStore = useSettingsStore()
const userStore = useUserStore()
const editing = computed(() => props.trip !== null)
const readOnly = computed(
  () => editing.value && props.trip !== null && props.trip.status !== 'planned'
)

interface FormStop {
  locationId: string
  /** YYYY-MM-DDTHH:MM (datetime-local). */
  plannedArriveAt: string
}

interface FormShape {
  shipDbId: number | null
  notes: string
  stops: FormStop[]
  assignments: TripShipmentAssignment[]
}

function defaultStopAt(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
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
    assignments: [],
  }
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function localInputToIso(s: string): string {
  return new Date(s).toISOString()
}

const form = ref<FormShape>(emptyForm())
const saving = ref(false)
const deleting = ref(false)
const suggestingTimes = ref(false)
const error = ref('')
const notice = ref('')

/** Queued (unassigned) shipments — fetched whenever the dialog opens. */
const queuedShipments = ref<Shipment[]>([])

async function loadQueuedShipments() {
  try {
    queuedShipments.value = await api.logistics.listShipments(true)
  } catch (e) {
    console.error('Failed to load queued shipments', e)
    queuedShipments.value = []
  }
}

/**
 * Drafts are predicted shipments the user pulled in from Plan that haven't
 * been written to the DB yet. They appear as virtual rows with a unique
 * negative ID; only `handleSave` actually creates them. Cancelling out of
 * the dialog throws them away — no orphans left behind.
 */
interface DraftPayload {
  originLocationId: string
  destLocationId: string
  lines: { flowId?: number | null; commodityTicker: string; amount: number }[]
}
const draftPayloadById = ref(new Map<number, DraftPayload>())
let nextDraftId = -1

function makeDraftShipment(payload: DraftPayload): Shipment {
  const id = nextDraftId--
  draftPayloadById.value.set(id, payload)
  return {
    id,
    tripId: null,
    originLocationId: payload.originLocationId,
    destLocationId: payload.destLocationId,
    originStopId: null,
    destStopId: null,
    notes: null,
    lines: payload.lines.map((l, i) => ({
      id: -i - 1,
      flowId: l.flowId ?? null,
      commodityTicker: l.commodityTicker,
      amount: l.amount,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ==================== Ad-hoc shipment form ====================
//
// A quick way to add a shipment that doesn't yet exist as a queued record.
// Picks origin and destination from the trip's stops; user fills lines
// (ticker + amount) and saves. The shipment is created via API and
// auto-assigned to the chosen stop pair so it shows in the assignment
// table immediately.

interface AdhocLine {
  commodityTicker: string
  amount: number
}

interface AdhocForm {
  originStopIndex: number | null
  destStopIndex: number | null
  lines: AdhocLine[]
}

const adhocOpen = ref(false)
const adhocSaving = ref(false)
const adhocError = ref('')
const adhocForm = ref<AdhocForm>({
  originStopIndex: null,
  destStopIndex: null,
  lines: [{ commodityTicker: '', amount: 0 }],
})

const commodityOptions = computed(() =>
  commodityService.getAllCommoditiesSync().map(c => ({
    title: `${c.ticker} - ${c.name}`,
    value: c.ticker,
  }))
)

const stopOptions = computed(() =>
  form.value.stops.map((s, i) => ({
    title: stopLabel(i),
    value: i,
    disabled: !s.locationId,
  }))
)

function resetAdhocForm() {
  adhocForm.value = {
    originStopIndex: null,
    destStopIndex: null,
    lines: [{ commodityTicker: '', amount: 0 }],
  }
  adhocError.value = ''
}

function openAdhocForm() {
  resetAdhocForm()
  // Default to first / second viable stops if the user has them.
  const viable = form.value.stops.map((s, i) => ({ s, i })).filter(e => !!e.s.locationId)
  if (viable.length >= 2) {
    adhocForm.value.originStopIndex = viable[0].i
    adhocForm.value.destStopIndex = viable[1].i
  }
  adhocOpen.value = true
}

function addAdhocLine() {
  adhocForm.value.lines.push({ commodityTicker: '', amount: 0 })
}

function removeAdhocLine(idx: number) {
  adhocForm.value.lines.splice(idx, 1)
  if (adhocForm.value.lines.length === 0) addAdhocLine()
}

async function saveAdhocShipment() {
  adhocError.value = ''
  const oIdx = adhocForm.value.originStopIndex
  const dIdx = adhocForm.value.destStopIndex
  if (oIdx === null || dIdx === null) {
    adhocError.value = 'Pick an origin and destination stop'
    return
  }
  if (oIdx >= dIdx) {
    adhocError.value = 'Destination stop must come after origin'
    return
  }
  const originStop = form.value.stops[oIdx]
  const destStop = form.value.stops[dIdx]
  if (!originStop?.locationId || !destStop?.locationId) {
    adhocError.value = 'Selected stops must have a location'
    return
  }
  const cleaned = adhocForm.value.lines
    .map(l => ({
      commodityTicker: l.commodityTicker.trim().toUpperCase(),
      amount: Number(l.amount),
    }))
    .filter(l => l.commodityTicker && l.amount > 0)
  if (cleaned.length === 0) {
    adhocError.value = 'Add at least one line with a ticker and positive amount'
    return
  }
  adhocSaving.value = true
  try {
    const created = await api.logistics.createShipment({
      originLocationId: originStop.locationId,
      destLocationId: destStop.locationId,
      lines: cleaned,
    })
    queuedShipments.value = [...queuedShipments.value, created]
    form.value.assignments.push({
      shipmentId: created.id,
      originStopIndex: oIdx,
      destStopIndex: dIdx,
    })
    adhocOpen.value = false
    resetAdhocForm()
  } catch (e) {
    adhocError.value = e instanceof Error ? e.message : 'Failed to create shipment'
  } finally {
    adhocSaving.value = false
  }
}

// ==================== Stop management ====================

function addStop() {
  const lastStopAt = form.value.stops[form.value.stops.length - 1]?.plannedArriveAt
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
  return !form.value.assignments.some(a => a.originStopIndex === idx || a.destStopIndex === idx)
}

function removeStop(idx: number) {
  if (!canRemoveStop(idx)) return
  form.value.stops.splice(idx, 1)
  for (const a of form.value.assignments) {
    if (a.originStopIndex > idx) a.originStopIndex--
    if (a.destStopIndex > idx) a.destStopIndex--
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

function locationDisplay(id: string): string {
  return locationService.getLocationDisplay(id, userStore.getLocationDisplayMode())
}

const canSuggestTimes = computed(
  () => form.value.stops.length >= 2 && form.value.stops.every(s => !!s.locationId)
)

async function handleSuggestTimes() {
  if (!canSuggestTimes.value) return
  suggestingTimes.value = true
  error.value = ''
  notice.value = ''
  try {
    const startAt = localInputToIso(form.value.stops[0].plannedArriveAt)
    const shipmentsForSuggest = form.value.assignments.map(a => {
      const ship = lookupShipment(a.shipmentId)
      return {
        originStopIndex: a.originStopIndex,
        destStopIndex: a.destStopIndex,
        lines: (ship?.lines ?? []).map(l => ({
          commodityTicker: l.commodityTicker,
          amount: l.amount,
        })),
      }
    })
    const result = await api.logistics.suggestStopTimes({
      startAt,
      stops: form.value.stops.map(s => ({ locationId: s.locationId })),
      shipDbId: form.value.shipDbId,
      shipments: shipmentsForSuggest,
    })
    for (let i = 1; i < result.stops.length && i < form.value.stops.length; i++) {
      form.value.stops[i].plannedArriveAt = isoToLocalInput(result.stops[i].plannedArriveAt)
    }
    if (result.warnings.length > 0) {
      notice.value = `Suggested. Note: ${result.warnings.join(' ')}`
    } else {
      notice.value = `Suggested arrival times applied. These are rough — adjust if reality differs.`
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to suggest stop times'
  } finally {
    suggestingTimes.value = false
  }
}

// ==================== Shipment-row composition ====================

interface ShipmentRow {
  shipment: Shipment
  /** True when this shipment is currently in form.assignments. */
  assigned: boolean
  assignment: TripShipmentAssignment | null
  /** True when origin/dest both appear in stops in valid order (or already assigned). */
  eligible: boolean
}

/**
 * Find the first (i, j) in form.stops where stops[i] = origin, stops[j] = dest,
 * and i < j. Returns null if no such pair exists.
 */
function matchShipmentToStops(
  shipment: Shipment
): { originStopIndex: number; destStopIndex: number } | null {
  const locs = form.value.stops.map(s => s.locationId)
  const oIdx = locs.indexOf(shipment.originLocationId)
  if (oIdx < 0) return null
  const dIdx = locs.indexOf(shipment.destLocationId, oIdx + 1)
  if (dIdx < 0) return null
  return { originStopIndex: oIdx, destStopIndex: dIdx }
}

function lookupShipment(shipmentId: number): Shipment | undefined {
  return (
    queuedShipments.value.find(s => s.id === shipmentId) ??
    props.trip?.shipments.find(s => s.id === shipmentId)
  )
}

const allShipmentRows = computed<ShipmentRow[]>(() => {
  const seen = new Set<number>()
  const rows: ShipmentRow[] = []
  const assignmentById = new Map(form.value.assignments.map(a => [a.shipmentId, a]))

  if (props.trip) {
    for (const s of props.trip.shipments) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      const assignment = assignmentById.get(s.id) ?? null
      const match = matchShipmentToStops(s)
      rows.push({
        shipment: s,
        assigned: assignment !== null,
        assignment,
        eligible: match !== null || assignment !== null,
      })
    }
  }
  for (const s of queuedShipments.value) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    const match = matchShipmentToStops(s)
    rows.push({ shipment: s, assigned: false, assignment: null, eligible: match !== null })
  }
  return rows
})

function toggleAssignment(shipment: Shipment, assigned: boolean) {
  if (assigned) {
    const match = matchShipmentToStops(shipment)
    if (!match) return
    if (form.value.assignments.some(a => a.shipmentId === shipment.id)) return
    form.value.assignments.push({
      shipmentId: shipment.id,
      originStopIndex: match.originStopIndex,
      destStopIndex: match.destStopIndex,
    })
  } else {
    form.value.assignments = form.value.assignments.filter(a => a.shipmentId !== shipment.id)
  }
}

// ==================== Capacity ====================

function shipmentWeight(s: Shipment): number {
  let w = 0
  for (const l of s.lines) {
    const wPer = commodityService.getCommodityWeight(l.commodityTicker.toUpperCase()) ?? 0
    w += wPer * l.amount
  }
  return w
}

function shipmentVolume(s: Shipment): number {
  let v = 0
  for (const l of s.lines) {
    const vPer = commodityService.getCommodityVolume(l.commodityTicker.toUpperCase()) ?? 0
    v += vPer * l.amount
  }
  return v
}

function formatShipmentCargo(s: Shipment): string {
  const w = Math.round(shipmentWeight(s))
  const v = Math.round(shipmentVolume(s))
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
  for (const a of form.value.assignments) {
    const s = lookupShipment(a.shipmentId)
    if (!s) continue
    const w = shipmentWeight(s)
    const v = shipmentVolume(s)
    for (let i = a.originStopIndex; i < a.destStopIndex; i++) {
      const seg = out[i]
      if (!seg) continue
      seg.weight += w
      seg.volume += v
    }
  }
  for (const seg of out) {
    if (shipWeightCap.value > 0 && seg.weight > shipWeightCap.value + 1e-6) seg.overWeight = true
    if (shipVolumeCap.value > 0 && seg.volume > shipVolumeCap.value + 1e-6) seg.overVolume = true
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

const peakSegmentWeight = computed(() => {
  let max = 0
  for (const seg of segmentLoads.value) if (seg.weight > max) max = seg.weight
  return max
})
const peakSegmentVolume = computed(() => {
  let max = 0
  for (const seg of segmentLoads.value) if (seg.volume > max) max = seg.volume
  return max
})

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
  () => [props.modelValue, props.trip, props.presetShipments] as const,
  async ([open, trip, presetShipments]) => {
    if (!open) return
    error.value = ''
    notice.value = ''
    // Reset draft state — drafts are dialog-session-scoped and never leak.
    draftPayloadById.value = new Map()
    nextDraftId = -1
    if (trip) {
      const stopIdToIndex = new Map(trip.stops.map((s, i) => [s.id, i]))
      const assignments: TripShipmentAssignment[] = trip.shipments
        .filter(s => s.originStopId !== null && s.destStopId !== null)
        .map(s => ({
          shipmentId: s.id,
          originStopIndex: stopIdToIndex.get(s.originStopId!) ?? 0,
          destStopIndex: stopIdToIndex.get(s.destStopId!) ?? 0,
        }))
      form.value = {
        shipDbId: trip.shipDbId,
        notes: trip.notes ?? '',
        stops: trip.stops.map(s => ({
          locationId: s.locationId,
          plannedArriveAt: isoToLocalInput(s.plannedArriveAt),
        })),
        assignments,
      }
    } else {
      form.value = emptyForm()
    }
    await loadQueuedShipments()

    // Resolve presets to virtual Shipment rows. Existing presets reuse the
    // queued-shipments cache (or fetch); drafts get a synthetic placeholder
    // until the trip saves.
    const presets: Shipment[] = []
    if (presetShipments && presetShipments.length > 0) {
      for (const p of presetShipments) {
        if (p.kind === 'existing') {
          const ship =
            queuedShipments.value.find(s => s.id === p.shipmentId) ??
            (await api.logistics.getShipment(p.shipmentId).catch(() => null))
          if (ship) presets.push(ship)
        } else {
          presets.push(
            makeDraftShipment({
              originLocationId: p.originLocationId,
              destLocationId: p.destLocationId,
              lines: p.lines,
            })
          )
        }
      }
      for (const p of presets) {
        if (!queuedShipments.value.find(s => s.id === p.id)) {
          queuedShipments.value = [...queuedShipments.value, p]
        }
      }
    }
    if (presets.length > 0 && !trip) {
      // Fresh-create: stops auto-seeded at the union of origin + destination
      // locations (origins first, in input order; destinations after, deduped
      // against origins).
      const stopLocs: string[] = []
      for (const p of presets) {
        if (!stopLocs.includes(p.originLocationId)) stopLocs.push(p.originLocationId)
      }
      for (const p of presets) {
        if (!stopLocs.includes(p.destLocationId)) stopLocs.push(p.destLocationId)
      }
      form.value.stops = stopLocs.map((loc, i) => ({
        locationId: loc,
        plannedArriveAt: defaultStopAt(i),
      }))
      form.value.assignments = presets.map(p => ({
        shipmentId: p.id,
        originStopIndex: stopLocs.indexOf(p.originLocationId),
        destStopIndex: stopLocs.indexOf(p.destLocationId),
      }))
      notice.value =
        presets.length === 1
          ? 'Stops auto-seeded from the shipment. Adjust times or add stops before saving.'
          : `Stops auto-seeded from ${presets.length} shipments (${stopLocs.length} stops). Adjust order or times before saving.`
    } else if (presets.length > 0 && trip) {
      // Edit mode: ADD presets to the trip. We try to bind each preset to
      // existing stops first; missing locations get appended as new stops.
      const addedStopLocs: string[] = []
      const newAssignments: TripShipmentAssignment[] = []
      for (const p of presets) {
        const locs = () => form.value.stops.map(s => s.locationId)
        let oIdx = locs().indexOf(p.originLocationId)
        if (oIdx < 0) {
          form.value.stops.push({
            locationId: p.originLocationId,
            plannedArriveAt: defaultStopAt(form.value.stops.length),
          })
          oIdx = form.value.stops.length - 1
          addedStopLocs.push(p.originLocationId)
        }
        let dIdx = locs().indexOf(p.destLocationId, oIdx + 1)
        if (dIdx < 0) {
          form.value.stops.push({
            locationId: p.destLocationId,
            plannedArriveAt: defaultStopAt(form.value.stops.length),
          })
          dIdx = form.value.stops.length - 1
          addedStopLocs.push(p.destLocationId)
        }
        newAssignments.push({
          shipmentId: p.id,
          originStopIndex: oIdx,
          destStopIndex: dIdx,
        })
      }
      form.value.assignments = [...form.value.assignments, ...newAssignments]
      const addedSummary = addedStopLocs.length
        ? ` Added ${addedStopLocs.length} stop${addedStopLocs.length === 1 ? '' : 's'} for missing locations — review before saving.`
        : ''
      notice.value =
        presets.length === 1
          ? `Added 1 shipment to trip #${trip.id}.${addedSummary}`
          : `Added ${presets.length} shipments to trip #${trip.id}.${addedSummary}`
    }
  },
  { immediate: true }
)

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
    if (form.value.stops.length < 2) throw new Error('A trip needs at least 2 stops')
    for (let i = 0; i < form.value.stops.length; i++) {
      const s = form.value.stops[i]
      if (!s.locationId) throw new Error(`Stop ${i + 1}: pick a location`)
      if (!s.plannedArriveAt) throw new Error(`Stop ${i + 1}: pick a planned arrival time`)
    }
    if (capacityViolations.value.length > 0) {
      throw new Error(
        'One or more segments exceed ship capacity. Drop a shipment or pick a larger ship.'
      )
    }

    const stopsBody = form.value.stops.map(s => ({
      locationId: s.locationId,
      plannedArriveAt: localInputToIso(s.plannedArriveAt),
    }))

    // Materialize any draft (negative-ID) assignments now — only for the
    // ones the user actually kept assigned. Drafts dropped during editing
    // don't get created at all, so cancelling really does cancel cleanly.
    const realAssignments: TripShipmentAssignment[] = []
    for (const a of form.value.assignments) {
      if (a.shipmentId >= 0) {
        realAssignments.push(a)
        continue
      }
      const draft = draftPayloadById.value.get(a.shipmentId)
      if (!draft) {
        throw new Error('Internal: draft shipment payload missing — please reload')
      }
      const created = await api.logistics.createShipment({
        originLocationId: draft.originLocationId,
        destLocationId: draft.destLocationId,
        lines: draft.lines.map(l => ({
          flowId: l.flowId ?? null,
          commodityTicker: l.commodityTicker,
          amount: l.amount,
        })),
      })
      realAssignments.push({
        shipmentId: created.id,
        originStopIndex: a.originStopIndex,
        destStopIndex: a.destStopIndex,
      })
    }

    if (editing.value && props.trip) {
      const body: UpdateTripRequest = {
        shipDbId: form.value.shipDbId,
        notes: form.value.notes.trim() || null,
        stops: stopsBody,
        shipments: realAssignments,
      }
      await api.logistics.updateTrip(props.trip.id, body)
    } else {
      const body: CreateTripRequest = {
        shipDbId: form.value.shipDbId,
        notes: form.value.notes.trim() || null,
        stops: stopsBody,
        shipments: realAssignments,
      }
      await api.logistics.createTrip(body)
    }
    emit('saved')
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save trip'
  } finally {
    saving.value = false
  }
}

async function handleDelete() {
  if (!props.trip) return
  if (!confirm('Delete this trip? Assigned shipments go back to the queue.')) return
  deleting.value = true
  try {
    await api.logistics.deleteTrip(props.trip.id)
    emit('saved')
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete trip'
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
.shipments-table,
.capacity-table {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}

.row-excluded {
  opacity: 0.7;
}

.row-ineligible {
  opacity: 0.45;
}

.adhoc-form {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.025);
}

.adhoc-lines-table {
  background: transparent;
}
</style>
