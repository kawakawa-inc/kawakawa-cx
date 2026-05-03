<template>
  <div class="order-reservations-table pa-4">
    <div v-if="loading" class="d-flex align-center ga-2 text-caption text-medium-emphasis">
      <v-progress-circular indeterminate size="16" width="2" />
      Loading reservations…
    </div>

    <div v-else-if="error" class="text-caption text-error">
      {{ error }}
    </div>

    <div
      v-else-if="reservations.length === 0"
      class="text-caption text-medium-emphasis font-italic"
    >
      No active reservations against this order.
    </div>

    <template v-else>
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="text-subtitle-2 text-medium-emphasis">
          Reservations ({{ reservations.length }})
        </div>
        <v-btn size="x-small" variant="text" density="compact" @click="toggleShowAll">
          {{ showAll ? 'Hide closed' : 'Show all history' }}
        </v-btn>
      </div>

      <table class="reservation-table">
        <thead>
          <tr>
            <th class="text-right">Qty</th>
            <th>User</th>
            <th>Status</th>
            <th>Created</th>
            <th>Updated</th>
            <th>Invoice</th>
            <th v-if="anyHasNotes">Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in reservations" :key="r.id">
            <td class="text-right text-caption">{{ r.quantity.toLocaleString() }}</td>
            <td class="text-caption">{{ r.counterpartyName }}</td>
            <td>
              <ReservationStatusChip :status="r.status" size="x-small" />
            </td>
            <td class="text-caption text-medium-emphasis">{{ formatRelative(r.createdAt) }}</td>
            <td class="text-caption text-medium-emphasis">{{ formatRelative(r.updatedAt) }}</td>
            <td class="text-caption">
              <a
                v-if="r.invoiceId != null && r.canViewInvoice"
                href="#"
                class="filter-link"
                @click.prevent="$emit('open-invoice', r.invoiceId)"
                >#{{ r.invoiceId }}</a
              >
              <!-- Plain text when the caller can't open this invoice (avoids a
                   clickable link that would 403). Still surface the id so users
                   can see the reservation belongs to *some* invoice. -->
              <span
                v-else-if="r.invoiceId != null"
                class="text-medium-emphasis"
                title="You don't have access to this invoice"
                >#{{ r.invoiceId }}</span
              >
              <span v-else class="text-medium-emphasis">--</span>
            </td>
            <td v-if="anyHasNotes" class="text-caption">
              <span v-if="r.notes" class="reservation-note">{{ r.notes }}</span>
              <span v-else class="text-medium-emphasis">--</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, type OrderReservationSummary } from '../services/api'
import ReservationStatusChip from './ReservationStatusChip.vue'

const props = defineProps<{
  orderId: number
  side: 'sell' | 'buy'
}>()

defineEmits<{
  'open-invoice': [invoiceId: number]
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const reservations = ref<OrderReservationSummary[]>([])
const showAll = ref(false)

const anyHasNotes = computed(() => reservations.value.some(r => r.notes != null && r.notes !== ''))

async function load() {
  loading.value = true
  error.value = null
  try {
    reservations.value =
      props.side === 'sell'
        ? await api.reservations.forSellOrder(props.orderId, { all: showAll.value })
        : await api.reservations.forBuyOrder(props.orderId, { all: showAll.value })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load reservations'
    reservations.value = []
  } finally {
    loading.value = false
  }
}

function toggleShowAll() {
  showAll.value = !showAll.value
  load()
}

// Re-fetch when the underlying order changes (defensive against component re-use).
watch(
  () => [props.orderId, props.side] as const,
  () => {
    showAll.value = false
    load()
  },
  { immediate: true }
)

// Relative time formatter — "5m ago", "3h ago", "2d ago", or absolute date for older.
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = now - then
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}
</script>

<style scoped>
.order-reservations-table {
  background: rgba(0, 0, 0, 0.15);
}

.reservation-table {
  width: 100%;
  border-collapse: collapse;
}

.reservation-table th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.6);
  padding: 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.reservation-table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.reservation-table tr:last-child td {
  border-bottom: none;
}

.reservation-note {
  white-space: pre-wrap;
}
</style>
