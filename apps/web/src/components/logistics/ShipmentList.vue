<template>
  <div class="shipment-list">
    <div class="d-flex align-center pa-3">
      <div class="text-subtitle-1">Shipments</div>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="onNew">
        New shipment
      </v-btn>
    </div>

    <v-divider />

    <v-card-text v-if="loading" class="text-medium-emphasis text-center pa-4">
      Loading shipments…
    </v-card-text>
    <v-card-text v-else-if="shipments.length === 0" class="text-medium-emphasis pa-4">
      No shipments yet. Click <strong>New shipment</strong> to plan one.
    </v-card-text>

    <template v-else>
      <!-- Planned -->
      <div
        class="shipment-section-header d-flex align-center px-3 py-2 cursor-pointer"
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
        class="shipment-table"
      >
        <tbody>
          <tr
            v-for="s in grouped.planned"
            :key="s.id"
            class="shipment-row clickable"
            @click="onEdit(s)"
          >
            <td>
              <v-chip size="x-small" :color="statusColor(s.status)" variant="tonal">
                {{ s.status }}
              </v-chip>
            </td>
            <td class="text-caption route-cell" :title="fullRouteTitle(s)">
              {{ routeDisplay(s) }}
            </td>
            <td class="text-caption text-medium-emphasis">{{ shipName(s.shipDbId) }}</td>
            <td class="text-caption">
              Load <strong>{{ dateOnly(loadAt(s)) }}</strong> · arrive
              <strong>{{ dateOnly(arriveAt(s)) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ s.lines.length }} line{{ s.lines.length === 1 ? '' : 's' }}
            </td>
            <td class="text-end" @click.stop>
              <v-btn size="x-small" variant="flat" color="primary" @click="onDispatch(s)">
                Dispatch
              </v-btn>
              <v-btn size="x-small" variant="text" color="warning" @click="onCancel(s)">
                Cancel
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>

      <!-- Active (dispatched) -->
      <div
        class="shipment-section-header d-flex align-center px-3 py-2 cursor-pointer"
        @click="activeOpen = !activeOpen"
      >
        <v-icon size="small" class="mr-2">mdi-airplane</v-icon>
        <span class="text-subtitle-2">Active</span>
        <v-chip size="x-small" class="ml-2" variant="tonal">
          {{ grouped.dispatched.length }}
        </v-chip>
        <v-spacer />
        <v-icon size="small">{{ activeOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </div>
      <v-divider />
      <v-table
        v-if="activeOpen && grouped.dispatched.length > 0"
        density="compact"
        class="shipment-table"
      >
        <tbody>
          <tr
            v-for="s in grouped.dispatched"
            :key="s.id"
            class="shipment-row clickable"
            @click="onEdit(s)"
          >
            <td>
              <v-chip size="x-small" :color="statusColor(s.status)" variant="tonal">
                {{ s.status }}
              </v-chip>
            </td>
            <td class="text-caption route-cell" :title="fullRouteTitle(s)">
              {{ routeDisplay(s) }}
            </td>
            <td class="text-caption text-medium-emphasis">{{ shipName(s.shipDbId) }}</td>
            <td class="text-caption">
              Load <strong>{{ dateOnly(loadAt(s)) }}</strong> · arrive
              <strong>{{ dateOnly(arriveAt(s)) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ s.lines.length }} line{{ s.lines.length === 1 ? '' : 's' }}
            </td>
            <td class="text-end" @click.stop>
              <v-btn size="x-small" variant="flat" color="success" @click="onDeliver(s)">
                Deliver
              </v-btn>
              <v-btn size="x-small" variant="text" color="warning" @click="onCancel(s)">
                Cancel
              </v-btn>
              <v-btn
                size="x-small"
                variant="text"
                color="primary"
                prepend-icon="mdi-repeat"
                @click="onRepeat(s)"
              >
                Repeat
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>

      <!-- History (delivered + cancelled) -->
      <div
        class="shipment-section-header d-flex align-center px-3 py-2 cursor-pointer"
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
        class="shipment-table"
      >
        <tbody>
          <tr
            v-for="s in grouped.history"
            :key="s.id"
            class="shipment-row clickable"
            @click="onEdit(s)"
          >
            <td>
              <v-chip size="x-small" :color="statusColor(s.status)" variant="tonal">
                {{ s.status }}
              </v-chip>
            </td>
            <td class="text-caption route-cell" :title="fullRouteTitle(s)">
              {{ routeDisplay(s) }}
            </td>
            <td class="text-caption text-medium-emphasis">{{ shipName(s.shipDbId) }}</td>
            <td class="text-caption">
              Load <strong>{{ dateOnly(loadAt(s)) }}</strong> · arrive
              <strong>{{ dateOnly(arriveAt(s)) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ s.lines.length }} line{{ s.lines.length === 1 ? '' : 's' }}
            </td>
            <td class="text-end" @click.stop>
              <v-btn
                size="x-small"
                variant="flat"
                color="primary"
                prepend-icon="mdi-repeat"
                :loading="repeatingId === s.id"
                @click="onRepeat(s)"
              >
                Repeat
              </v-btn>
              <v-btn
                v-if="s.status === 'cancelled'"
                size="x-small"
                variant="text"
                color="error"
                @click="onDelete(s)"
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
import type { Shipment, UserShip } from '@kawakawa/types'

const props = defineProps<{
  ships: UserShip[]
}>()

const emit = defineEmits<{
  (e: 'new'): void
  (e: 'edit', shipment: Shipment): void
  (e: 'changed'): void
}>()

const userStore = useUserStore()
const shipments = ref<Shipment[]>([])
const loading = ref(false)
const repeatingId = ref<number | null>(null)

const plannedOpen = ref(true)
const activeOpen = ref(true)
const historyOpen = ref(false)

async function load() {
  loading.value = true
  try {
    shipments.value = await api.logistics.listShipments()
  } catch (e) {
    console.error('Failed to load shipments', e)
    shipments.value = []
  } finally {
    loading.value = false
  }
}

defineExpose({ reload: load })
onMounted(load)

const grouped = computed(() => {
  const planned: Shipment[] = []
  const dispatched: Shipment[] = []
  const history: Shipment[] = []
  for (const s of shipments.value) {
    if (s.status === 'planned') planned.push(s)
    else if (s.status === 'dispatched') dispatched.push(s)
    else history.push(s) // delivered + cancelled
  }
  history.sort((a, b) => arriveAt(b).localeCompare(arriveAt(a)))
  return { planned, dispatched, history: history.slice(0, 20) }
})

function locationDisplay(naturalId: string): string {
  return locationService.getLocationDisplay(naturalId, userStore.getLocationDisplayMode())
}

/** Compact route label: "A → B" for 2 stops, "A → … → Z (n stops)" for more. */
function routeDisplay(s: Shipment): string {
  if (s.stops.length === 0) return '—'
  const first = locationDisplay(s.stops[0].locationId)
  const last = locationDisplay(s.stops[s.stops.length - 1].locationId)
  if (s.stops.length === 1) return first
  if (s.stops.length === 2) return `${first} → ${last}`
  return `${first} → … → ${last} (${s.stops.length} stops)`
}

/** Full route, used as a hover title so the user can see all stops. */
function fullRouteTitle(s: Shipment): string {
  return s.stops.map(stop => locationDisplay(stop.locationId)).join(' → ')
}

function loadAt(s: Shipment): string {
  return s.stops[0]?.plannedArriveAt ?? ''
}

function arriveAt(s: Shipment): string {
  return s.stops[s.stops.length - 1]?.plannedArriveAt ?? ''
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

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

function dateOnly(iso: string): string {
  if (!iso) return '—'
  return dateFormatter.format(new Date(iso))
}

function statusColor(s: Shipment['status']): string {
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

function onEdit(shipment: Shipment) {
  emit('edit', shipment)
}

async function onCancel(shipment: Shipment) {
  if (!confirm(`Cancel this shipment?`)) return
  try {
    await api.logistics.setShipmentStatus(shipment.id, 'cancelled')
    await load()
    emit('changed')
  } catch (e) {
    console.error('Failed to cancel', e)
    window.alert(e instanceof Error ? e.message : 'Failed to cancel shipment')
  }
}

async function onDelete(shipment: Shipment) {
  if (!confirm('Delete this shipment? This cannot be undone.')) return
  try {
    await api.logistics.deleteShipment(shipment.id)
    await load()
    emit('changed')
  } catch (e) {
    console.error('Failed to delete', e)
    window.alert(e instanceof Error ? e.message : 'Failed to delete shipment')
  }
}

async function onDispatch(shipment: Shipment) {
  if (!confirm('Mark this shipment as dispatched? actualDispatchAt will be stamped to now.')) {
    return
  }
  try {
    await api.logistics.setShipmentStatus(shipment.id, 'dispatched')
    await load()
    emit('changed')
  } catch (e) {
    console.error('Failed to dispatch', e)
    window.alert(e instanceof Error ? e.message : 'Failed to dispatch shipment')
  }
}

async function onDeliver(shipment: Shipment) {
  if (!confirm('Mark this shipment as delivered? actualArrivalAt will be stamped to now.')) {
    return
  }
  try {
    await api.logistics.setShipmentStatus(shipment.id, 'delivered')
    await load()
    emit('changed')
  } catch (e) {
    console.error('Failed to deliver', e)
    window.alert(e instanceof Error ? e.message : 'Failed to deliver shipment')
  }
}

/**
 * Clone the trip as a new draft. Server refreshes flow-linked line amounts
 * from the current solver and shifts stop times forward to start "now". The
 * new draft lands in Planned for review, where the user can adjust.
 */
async function onRepeat(shipment: Shipment) {
  repeatingId.value = shipment.id
  try {
    const next = await api.logistics.repeatShipment(shipment.id, {})
    await load()
    emit('changed')
    // Open the new draft for review.
    emit('edit', next)
  } catch (e) {
    console.error('Failed to repeat', e)
    window.alert(e instanceof Error ? e.message : 'Failed to repeat shipment')
  } finally {
    repeatingId.value = null
  }
}
</script>

<style scoped>
.shipment-section-header {
  background: rgba(255, 255, 255, 0.03);
}

.shipment-table {
  background: transparent;
}

.shipment-table :deep(td) {
  padding: 6px 12px !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.shipment-row.clickable {
  cursor: pointer;
}

.shipment-row.clickable:hover {
  background: rgba(255, 255, 255, 0.04);
}

.route-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
}

/* Stripe alternating rows for readability. Cell-level !important is needed
 * to win against Vuetify's own row styles. */
:deep(.shipment-table tbody tr:nth-child(odd) td) {
  background: rgba(255, 255, 255, 0.025) !important;
}

.shipment-row.clickable:hover :deep(td) {
  background: rgba(255, 255, 255, 0.06) !important;
}
</style>
