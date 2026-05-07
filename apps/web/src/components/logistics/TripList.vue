<template>
  <div class="trip-list">
    <div class="d-flex align-center pa-3">
      <div class="text-subtitle-1">Trips</div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="onNew">New trip</v-btn>
    </div>

    <v-divider />

    <v-card-text v-if="loading" class="text-medium-emphasis text-center pa-4">
      Loading trips…
    </v-card-text>
    <v-card-text v-else-if="trips.length === 0" class="text-medium-emphasis pa-4">
      No trips yet. Click <strong>New trip</strong> to plan one.
    </v-card-text>

    <template v-else>
      <!-- Planned -->
      <div
        class="trip-section-header d-flex align-center px-3 py-2 cursor-pointer"
        @click="plannedOpen = !plannedOpen"
      >
        <v-icon size="small" class="mr-2">mdi-clipboard-list</v-icon>
        <span class="text-subtitle-2">Planned</span>
        <v-chip size="x-small" class="ml-2" variant="tonal">{{ grouped.planned.length }}</v-chip>
        <v-spacer />
        <v-icon size="small">{{ plannedOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </div>
      <v-divider />
      <v-table
        v-if="plannedOpen && grouped.planned.length > 0"
        density="compact"
        class="trip-table"
      >
        <tbody>
          <tr
            v-for="t in grouped.planned"
            :key="t.id"
            class="trip-row clickable"
            @click="onEdit(t)"
          >
            <td>
              <v-chip size="x-small" :color="statusColor(t.status)" variant="tonal">
                {{ t.status }}
              </v-chip>
            </td>
            <td class="text-caption route-cell" :title="fullRouteTitle(t)">
              {{ routeDisplay(t) }}
            </td>
            <td class="text-caption text-medium-emphasis">{{ shipName(t.shipDbId) }}</td>
            <td class="text-caption">
              Load <strong>{{ dateOnly(loadAt(t)) }}</strong> · arrive
              <strong>{{ dateOnly(arriveAt(t)) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ t.shipments.length }} shipment{{ t.shipments.length === 1 ? '' : 's' }}
            </td>
            <td class="text-end" @click.stop>
              <v-btn size="x-small" variant="flat" color="primary" @click="onDispatch(t)">
                Dispatch
              </v-btn>
              <v-btn size="x-small" variant="text" color="warning" @click="onCancel(t)">
                Cancel
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>

      <!-- Active (dispatched) -->
      <div
        class="trip-section-header d-flex align-center px-3 py-2 cursor-pointer"
        @click="activeOpen = !activeOpen"
      >
        <v-icon size="small" class="mr-2">mdi-airplane</v-icon>
        <span class="text-subtitle-2">Active</span>
        <v-chip size="x-small" class="ml-2" variant="tonal">{{ grouped.dispatched.length }}</v-chip>
        <v-spacer />
        <v-icon size="small">{{ activeOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </div>
      <v-divider />
      <v-table
        v-if="activeOpen && grouped.dispatched.length > 0"
        density="compact"
        class="trip-table"
      >
        <tbody>
          <tr
            v-for="t in grouped.dispatched"
            :key="t.id"
            class="trip-row clickable"
            @click="onEdit(t)"
          >
            <td>
              <v-chip size="x-small" :color="statusColor(t.status)" variant="tonal">
                {{ t.status }}
              </v-chip>
            </td>
            <td class="text-caption route-cell" :title="fullRouteTitle(t)">
              {{ routeDisplay(t) }}
            </td>
            <td class="text-caption text-medium-emphasis">{{ shipName(t.shipDbId) }}</td>
            <td class="text-caption">
              Load <strong>{{ dateOnly(loadAt(t)) }}</strong> · arrive
              <strong>{{ dateOnly(arriveAt(t)) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ t.shipments.length }} shipment{{ t.shipments.length === 1 ? '' : 's' }}
            </td>
            <td class="text-end" @click.stop>
              <v-btn size="x-small" variant="flat" color="success" @click="onDeliver(t)">
                Deliver
              </v-btn>
              <v-btn size="x-small" variant="text" color="warning" @click="onCancel(t)">
                Cancel
              </v-btn>
              <v-btn
                size="x-small"
                variant="text"
                color="primary"
                prepend-icon="mdi-repeat"
                @click="onRepeat(t)"
              >
                Repeat
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>

      <!-- History (delivered + cancelled) -->
      <div
        class="trip-section-header d-flex align-center px-3 py-2 cursor-pointer"
        @click="historyOpen = !historyOpen"
      >
        <v-icon size="small" class="mr-2">mdi-history</v-icon>
        <span class="text-subtitle-2">History</span>
        <v-chip size="x-small" class="ml-2" variant="tonal">{{ grouped.history.length }}</v-chip>
        <v-spacer />
        <v-icon size="small">{{ historyOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </div>
      <v-divider />
      <v-table
        v-if="historyOpen && grouped.history.length > 0"
        density="compact"
        class="trip-table"
      >
        <tbody>
          <tr
            v-for="t in grouped.history"
            :key="t.id"
            class="trip-row clickable"
            @click="onEdit(t)"
          >
            <td>
              <v-chip size="x-small" :color="statusColor(t.status)" variant="tonal">
                {{ t.status }}
              </v-chip>
            </td>
            <td class="text-caption route-cell" :title="fullRouteTitle(t)">
              {{ routeDisplay(t) }}
            </td>
            <td class="text-caption text-medium-emphasis">{{ shipName(t.shipDbId) }}</td>
            <td class="text-caption">
              Load <strong>{{ dateOnly(loadAt(t)) }}</strong> · arrive
              <strong>{{ dateOnly(arriveAt(t)) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ t.shipments.length }} shipment{{ t.shipments.length === 1 ? '' : 's' }}
            </td>
            <td class="text-end" @click.stop>
              <v-btn
                size="x-small"
                variant="flat"
                color="primary"
                prepend-icon="mdi-repeat"
                :loading="repeatingId === t.id"
                @click="onRepeat(t)"
              >
                Repeat
              </v-btn>
              <v-btn
                v-if="t.status === 'cancelled'"
                size="x-small"
                variant="text"
                color="error"
                @click="onDelete(t)"
              >
                Delete
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { api } from '../../services/api'
import { locationService } from '../../services/locationService'
import { useUserStore } from '../../stores/user'
import type { Trip, UserShip } from '@kawakawa/types'

const props = defineProps<{
  ships: UserShip[]
}>()

const emit = defineEmits<{
  (e: 'new'): void
  (e: 'edit', trip: Trip): void
  (e: 'changed'): void
}>()

const userStore = useUserStore()
const trips = ref<Trip[]>([])
const loading = ref(false)
const repeatingId = ref<number | null>(null)

const plannedOpen = ref(true)
const activeOpen = ref(true)
const historyOpen = ref(false)

async function load() {
  loading.value = true
  try {
    trips.value = await api.logistics.listTrips()
  } catch (e) {
    console.error('Failed to load trips', e)
    trips.value = []
  } finally {
    loading.value = false
  }
}

defineExpose({ reload: load })
onMounted(load)

const grouped = computed(() => {
  const planned: Trip[] = []
  const dispatched: Trip[] = []
  const history: Trip[] = []
  for (const t of trips.value) {
    if (t.status === 'planned') planned.push(t)
    else if (t.status === 'dispatched') dispatched.push(t)
    else history.push(t) // delivered + cancelled
  }
  history.sort((a, b) => arriveAt(b).localeCompare(arriveAt(a)))
  return { planned, dispatched, history: history.slice(0, 20) }
})

function locationDisplay(naturalId: string): string {
  return locationService.getLocationDisplay(naturalId, userStore.getLocationDisplayMode())
}

/** Compact route label: "A → B" for 2 stops, "A → … → Z (n stops)" for more. */
function routeDisplay(t: Trip): string {
  if (t.stops.length === 0) return '—'
  const first = locationDisplay(t.stops[0].locationId)
  const last = locationDisplay(t.stops[t.stops.length - 1].locationId)
  if (t.stops.length === 1) return first
  if (t.stops.length === 2) return `${first} → ${last}`
  return `${first} → … → ${last} (${t.stops.length} stops)`
}

function fullRouteTitle(t: Trip): string {
  return t.stops.map(s => locationDisplay(s.locationId)).join(' → ')
}

function loadAt(t: Trip): string {
  return t.stops[0]?.plannedArriveAt ?? ''
}

function arriveAt(t: Trip): string {
  return t.stops[t.stops.length - 1]?.plannedArriveAt ?? ''
}

const shipById = computed(() => {
  const map = new Map<number, UserShip>()
  for (const ship of props.ships) map.set(ship.id, ship)
  return map
})

function shipName(id: number | null): string {
  if (id == null) return '—'
  const ship = shipById.value.get(id)
  return ship ? (ship.name ?? ship.registration) : `#${id}`
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function dateOnly(iso: string): string {
  if (!iso) return '—'
  return dateFormatter.format(new Date(iso))
}

function statusColor(s: Trip['status']): string {
  return (
    {
      planned: 'primary',
      dispatched: 'info',
      delivered: 'success',
      cancelled: 'grey',
    } as const
  )[s]
}

function onNew() {
  emit('new')
}

function onEdit(trip: Trip) {
  emit('edit', trip)
}

async function onCancel(trip: Trip) {
  if (!confirm('Cancel this trip? Assigned shipments go back to the queue.')) return
  try {
    await api.logistics.setTripStatus(trip.id, 'cancelled')
    await load()
    emit('changed')
  } catch (e) {
    console.error('Failed to cancel', e)
    window.alert(e instanceof Error ? e.message : 'Failed to cancel trip')
  }
}

async function onDelete(trip: Trip) {
  if (!confirm('Delete this trip? This cannot be undone.')) return
  try {
    await api.logistics.deleteTrip(trip.id)
    await load()
    emit('changed')
  } catch (e) {
    console.error('Failed to delete', e)
    window.alert(e instanceof Error ? e.message : 'Failed to delete trip')
  }
}

async function onDispatch(trip: Trip) {
  if (!confirm('Mark this trip as dispatched? actualDispatchAt will be stamped to now.')) return
  try {
    await api.logistics.setTripStatus(trip.id, 'dispatched')
    await load()
    emit('changed')
  } catch (e) {
    console.error('Failed to dispatch', e)
    window.alert(e instanceof Error ? e.message : 'Failed to dispatch trip')
  }
}

async function onDeliver(trip: Trip) {
  if (!confirm('Mark this trip as delivered? actualArrivalAt will be stamped to now.')) return
  try {
    await api.logistics.setTripStatus(trip.id, 'delivered')
    await load()
    emit('changed')
  } catch (e) {
    console.error('Failed to deliver', e)
    window.alert(e instanceof Error ? e.message : 'Failed to deliver trip')
  }
}

/**
 * Clone the trip + its shipments as a new draft. Server refreshes flow-linked
 * line amounts and shifts stop times forward to start now.
 */
async function onRepeat(trip: Trip) {
  repeatingId.value = trip.id
  try {
    const next = await api.logistics.repeatTrip(trip.id, {})
    await load()
    emit('changed')
    emit('edit', next)
  } catch (e) {
    console.error('Failed to repeat', e)
    window.alert(e instanceof Error ? e.message : 'Failed to repeat trip')
  } finally {
    repeatingId.value = null
  }
}
</script>

<style scoped>
.trip-section-header {
  background: rgba(255, 255, 255, 0.03);
}

.trip-table {
  background: transparent;
}

.trip-table :deep(td) {
  padding: 6px 12px !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.trip-row.clickable {
  cursor: pointer;
}

.trip-row.clickable:hover {
  background: rgba(255, 255, 255, 0.04);
}

.route-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}

:deep(.trip-table tbody tr:nth-child(odd) td) {
  background: rgba(255, 255, 255, 0.025) !important;
}

.trip-row.clickable:hover :deep(td) {
  background: rgba(255, 255, 255, 0.06) !important;
}
</style>
