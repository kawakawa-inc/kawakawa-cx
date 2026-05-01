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
          <tr v-for="s in grouped.planned" :key="s.id" class="shipment-row">
            <td>
              <v-chip size="x-small" :color="statusColor(s.status)" variant="tonal">
                {{ s.status }}
              </v-chip>
            </td>
            <td class="text-caption">
              <strong>{{ locationDisplay(s.fromLocationId) }}</strong>
              →
              <strong>{{ locationDisplay(s.toLocationId) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">{{ shipName(s.shipDbId) }}</td>
            <td class="text-caption">
              Load <strong>{{ dateOnly(s.plannedLoadAt) }}</strong> · arrive
              <strong>{{ dateOnly(s.plannedArrivalAt) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ s.lines.length }} line{{ s.lines.length === 1 ? '' : 's' }}
            </td>
            <td class="text-end">
              <v-btn size="x-small" variant="flat" color="primary" @click="onDispatch(s)">
                Dispatch
              </v-btn>
              <v-btn size="x-small" variant="text" @click="onEdit(s)">Edit</v-btn>
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
          <tr v-for="s in grouped.dispatched" :key="s.id" class="shipment-row">
            <td>
              <v-chip size="x-small" :color="statusColor(s.status)" variant="tonal">
                {{ s.status }}
              </v-chip>
            </td>
            <td class="text-caption">
              <strong>{{ locationDisplay(s.fromLocationId) }}</strong>
              →
              <strong>{{ locationDisplay(s.toLocationId) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">{{ shipName(s.shipDbId) }}</td>
            <td class="text-caption">
              Load <strong>{{ dateOnly(s.plannedLoadAt) }}</strong> · arrive
              <strong>{{ dateOnly(s.plannedArrivalAt) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ s.lines.length }} line{{ s.lines.length === 1 ? '' : 's' }}
            </td>
            <td class="text-end">
              <v-btn size="x-small" variant="flat" color="success" @click="onDeliver(s)">
                Deliver
              </v-btn>
              <v-btn size="x-small" variant="text" color="warning" @click="onCancel(s)">
                Cancel
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
          <tr v-for="s in grouped.history" :key="s.id" class="shipment-row">
            <td>
              <v-chip size="x-small" :color="statusColor(s.status)" variant="tonal">
                {{ s.status }}
              </v-chip>
            </td>
            <td class="text-caption">
              <strong>{{ locationDisplay(s.fromLocationId) }}</strong>
              →
              <strong>{{ locationDisplay(s.toLocationId) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">{{ shipName(s.shipDbId) }}</td>
            <td class="text-caption">
              Load <strong>{{ dateOnly(s.plannedLoadAt) }}</strong> · arrive
              <strong>{{ dateOnly(s.plannedArrivalAt) }}</strong>
            </td>
            <td class="text-caption text-medium-emphasis">
              {{ s.lines.length }} line{{ s.lines.length === 1 ? '' : 's' }}
            </td>
            <td class="text-end">
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
  history.sort((a, b) => b.plannedArrivalAt.localeCompare(a.plannedArrivalAt))
  return { planned, dispatched, history: history.slice(0, 20) }
})

function locationDisplay(naturalId: string): string {
  return locationService.getLocationDisplay(naturalId, userStore.getLocationDisplayMode())
}

const shipById = computed(() => {
  const map = new Map<number, UserShip>()
  for (const s of props.ships) map.set(s.id, s)
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
  if (!confirm(`Cancel shipment to ${locationDisplay(shipment.toLocationId)}?`)) return
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
  if (
    !confirm(
      `Mark shipment to ${locationDisplay(shipment.toLocationId)} as dispatched? actualDispatchAt will be stamped to now.`
    )
  ) {
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
  if (
    !confirm(
      `Mark shipment to ${locationDisplay(shipment.toLocationId)} as delivered? actualArrivalAt will be stamped to now.`
    )
  ) {
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
</style>
