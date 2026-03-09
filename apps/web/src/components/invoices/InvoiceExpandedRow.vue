<template>
  <div class="invoice-expanded-row bg-grey-darken-4 pa-4">
    <div v-if="loading" class="text-center py-4">
      <v-progress-circular indeterminate size="24" />
    </div>

    <div v-else-if="invoice" class="d-flex ga-6">
      <!-- BUY Section -->
      <div class="flex-grow-1">
        <div class="d-flex align-center mb-2 section-header" @click="buyExpanded = !buyExpanded">
          <v-icon size="x-small" class="mr-1">{{
            buyExpanded ? 'mdi-chevron-down' : 'mdi-chevron-right'
          }}</v-icon>
          <v-icon color="warning" size="small" class="mr-1">mdi-arrow-down</v-icon>
          <span class="text-subtitle-2 text-warning">Buying ({{ buyItems.length }})</span>
        </div>
        <div v-if="buyItems.length === 0" class="text-caption text-medium-emphasis">
          No buy items
        </div>
        <table v-else-if="buyExpanded" class="item-table">
          <thead>
            <tr>
              <th class="text-right">Qty</th>
              <th class="text-left">Item</th>
              <th class="text-left">Location</th>
              <th class="text-right">Price</th>
              <th class="text-left">List</th>
              <th class="text-right">Total</th>
              <th class="text-center">Status</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in buyItems" :key="item.id">
              <td class="text-caption text-right">{{ item.quantity.toLocaleString() }}</td>
              <td>
                <CommodityDisplay :ticker="item.commodityTicker" show-icon />
              </td>
              <td class="text-caption text-medium-emphasis">
                {{ getLocationDisplay(item.locationId) }}
              </td>
              <td class="text-caption text-right">
                {{ formatPrice(item.unitPrice) }} {{ item.currency }}
              </td>
              <td>
                <v-chip v-if="item.priceListCode" size="x-small" variant="tonal" color="secondary">
                  {{ item.priceListCode }}
                </v-chip>
                <span v-else class="text-caption text-medium-emphasis">--</span>
              </td>
              <td class="text-caption font-weight-medium text-right">
                {{ formatPrice(item.totalValue) }} {{ item.currency }}
              </td>
              <td class="text-center">
                <ReservationStatusChip
                  v-if="item.reservationStatus"
                  :status="item.reservationStatus"
                  size="x-small"
                />
              </td>
              <td class="text-center">
                <div class="d-flex ga-1 justify-center">
                  <template v-if="direction === 'received' && item.reservationId">
                    <v-tooltip v-if="item.reservationStatus === 'pending'" location="top">
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="success"
                          :loading="actionLoading === `confirm-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="confirmReservation(item)"
                        >
                          <v-icon size="small">mdi-check</v-icon>
                        </v-btn>
                      </template>
                      Confirm
                    </v-tooltip>
                    <v-tooltip v-if="item.reservationStatus === 'pending'" location="top">
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="error"
                          :loading="actionLoading === `reject-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="rejectReservation(item)"
                        >
                          <v-icon size="small">mdi-close</v-icon>
                        </v-btn>
                      </template>
                      Reject
                    </v-tooltip>
                    <v-tooltip v-if="item.reservationStatus === 'confirmed'" location="top">
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="primary"
                          :loading="actionLoading === `fulfill-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="fulfillReservation(item)"
                        >
                          <v-icon size="small">mdi-package-variant-closed-check</v-icon>
                        </v-btn>
                      </template>
                      Fulfill
                    </v-tooltip>
                  </template>
                  <template v-if="direction === 'sent' && item.reservationId">
                    <v-tooltip
                      v-if="
                        item.reservationStatus === 'pending' ||
                        item.reservationStatus === 'confirmed'
                      "
                      location="top"
                    >
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="warning"
                          :loading="actionLoading === `cancel-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="cancelReservation(item)"
                        >
                          <v-icon size="small">mdi-cancel</v-icon>
                        </v-btn>
                      </template>
                      Cancel
                    </v-tooltip>
                    <v-tooltip
                      v-if="
                        item.reservationStatus === 'cancelled' ||
                        item.reservationStatus === 'fulfilled'
                      "
                      location="top"
                    >
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="info"
                          :loading="actionLoading === `reopen-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="reopenReservation(item)"
                        >
                          <v-icon size="small">mdi-refresh</v-icon>
                        </v-btn>
                      </template>
                      Reopen
                    </v-tooltip>
                  </template>
                  <!-- Delete orphaned items (no reservation) -->
                  <template v-if="direction === 'sent' && !item.reservationId">
                    <v-tooltip location="top">
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="error"
                          :loading="actionLoading === `delete-${item.id}`"
                          :disabled="actionLoading !== null"
                          @click.stop="deleteLineItem(item)"
                        >
                          <v-icon size="small">mdi-delete</v-icon>
                        </v-btn>
                      </template>
                      Remove item
                    </v-tooltip>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- SELL Section -->
      <div class="flex-grow-1">
        <div class="d-flex align-center mb-2 section-header" @click="sellExpanded = !sellExpanded">
          <v-icon size="x-small" class="mr-1">{{
            sellExpanded ? 'mdi-chevron-down' : 'mdi-chevron-right'
          }}</v-icon>
          <v-icon color="success" size="small" class="mr-1">mdi-arrow-up</v-icon>
          <span class="text-subtitle-2 text-success">Selling ({{ sellItems.length }})</span>
        </div>
        <div v-if="sellItems.length === 0" class="text-caption text-medium-emphasis">
          No sell items
        </div>
        <table v-else-if="sellExpanded" class="item-table">
          <thead>
            <tr>
              <th class="text-right">Qty</th>
              <th class="text-left">Item</th>
              <th class="text-left">Location</th>
              <th class="text-right">Price</th>
              <th class="text-left">List</th>
              <th class="text-right">Total</th>
              <th class="text-center">Status</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in sellItems" :key="item.id">
              <td class="text-caption text-right">{{ item.quantity.toLocaleString() }}</td>
              <td>
                <CommodityDisplay :ticker="item.commodityTicker" show-icon />
              </td>
              <td class="text-caption text-medium-emphasis">
                {{ getLocationDisplay(item.locationId) }}
              </td>
              <td class="text-caption text-right">
                {{ formatPrice(item.unitPrice) }} {{ item.currency }}
              </td>
              <td>
                <v-chip v-if="item.priceListCode" size="x-small" variant="tonal" color="secondary">
                  {{ item.priceListCode }}
                </v-chip>
                <span v-else class="text-caption text-medium-emphasis">--</span>
              </td>
              <td class="text-caption font-weight-medium text-right">
                {{ formatPrice(item.totalValue) }} {{ item.currency }}
              </td>
              <td class="text-center">
                <ReservationStatusChip
                  v-if="item.reservationStatus"
                  :status="item.reservationStatus"
                  size="x-small"
                />
              </td>
              <td class="text-center">
                <div class="d-flex ga-1 justify-center">
                  <template v-if="direction === 'received' && item.reservationId">
                    <v-tooltip v-if="item.reservationStatus === 'pending'" location="top">
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="success"
                          :loading="actionLoading === `confirm-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="confirmReservation(item)"
                        >
                          <v-icon size="small">mdi-check</v-icon>
                        </v-btn>
                      </template>
                      Confirm
                    </v-tooltip>
                    <v-tooltip v-if="item.reservationStatus === 'pending'" location="top">
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="error"
                          :loading="actionLoading === `reject-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="rejectReservation(item)"
                        >
                          <v-icon size="small">mdi-close</v-icon>
                        </v-btn>
                      </template>
                      Reject
                    </v-tooltip>
                    <v-tooltip v-if="item.reservationStatus === 'confirmed'" location="top">
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="primary"
                          :loading="actionLoading === `fulfill-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="fulfillReservation(item)"
                        >
                          <v-icon size="small">mdi-package-variant-closed-check</v-icon>
                        </v-btn>
                      </template>
                      Fulfill
                    </v-tooltip>
                  </template>
                  <template v-if="direction === 'sent' && item.reservationId">
                    <v-tooltip
                      v-if="
                        item.reservationStatus === 'pending' ||
                        item.reservationStatus === 'confirmed'
                      "
                      location="top"
                    >
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="warning"
                          :loading="actionLoading === `cancel-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="cancelReservation(item)"
                        >
                          <v-icon size="small">mdi-cancel</v-icon>
                        </v-btn>
                      </template>
                      Cancel
                    </v-tooltip>
                    <v-tooltip
                      v-if="
                        item.reservationStatus === 'cancelled' ||
                        item.reservationStatus === 'fulfilled'
                      "
                      location="top"
                    >
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="info"
                          :loading="actionLoading === `reopen-${item.reservationId}`"
                          :disabled="actionLoading !== null"
                          @click.stop="reopenReservation(item)"
                        >
                          <v-icon size="small">mdi-refresh</v-icon>
                        </v-btn>
                      </template>
                      Reopen
                    </v-tooltip>
                  </template>
                  <!-- Delete orphaned items (no reservation) -->
                  <template v-if="direction === 'sent' && !item.reservationId">
                    <v-tooltip location="top">
                      <template #activator="{ props: tooltipProps }">
                        <v-btn
                          v-bind="tooltipProps"
                          icon
                          size="x-small"
                          variant="text"
                          color="error"
                          :loading="actionLoading === `delete-${item.id}`"
                          :disabled="actionLoading !== null"
                          @click.stop="deleteLineItem(item)"
                        >
                          <v-icon size="small">mdi-delete</v-icon>
                        </v-btn>
                      </template>
                      Remove item
                    </v-tooltip>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="text-caption text-medium-emphasis">Failed to load invoice details</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Invoice, InvoiceLineItem, InvoiceDirection } from '@kawakawa/types'
import { api } from '../../services/api'
import { locationService } from '../../services/locationService'
import { useUserStore } from '../../stores/user'
import CommodityDisplay from '../CommodityDisplay.vue'
import ReservationStatusChip from '../ReservationStatusChip.vue'

const props = defineProps<{
  invoiceId: number
  direction: InvoiceDirection
}>()

const emit = defineEmits<{
  updated: []
}>()

const userStore = useUserStore()
const loading = ref(true)
const invoice = ref<Invoice | null>(null)
const actionLoading = ref<string | null>(null)
const buyExpanded = ref(true)
const sellExpanded = ref(true)

// Display helpers
const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const formatPrice = (value: number): string => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Computed: separate buy and sell items from CURRENT USER's perspective
// For sent invoices (orderType is from my perspective):
//   orderType='sell' means I'm buying from a sell order (money out)
//   orderType='buy' means I'm selling to a buy order (money in)
// For received invoices (orderType is from sender's perspective - need to invert):
//   orderType='sell' means sender is buying = I'm SELLING (money in)
//   orderType='buy' means sender is selling = I'm BUYING (money out)
const buyItems = computed<InvoiceLineItem[]>(() => {
  if (!invoice.value) return []
  if (props.direction === 'sent') {
    // Sent: items from sell orders = I'm buying
    return invoice.value.lineItems.filter(item => item.orderType === 'sell')
  }
  // Received: sender's sell = my buy, so items from buy orders
  return invoice.value.lineItems.filter(item => item.orderType === 'buy')
})

const sellItems = computed<InvoiceLineItem[]>(() => {
  if (!invoice.value) return []
  if (props.direction === 'sent') {
    // Sent: items from buy orders = I'm selling
    return invoice.value.lineItems.filter(item => item.orderType === 'buy')
  }
  // Received: sender's buy = my sell, so items from sell orders
  return invoice.value.lineItems.filter(item => item.orderType === 'sell')
})

// Action handlers
async function confirmReservation(item: InvoiceLineItem) {
  if (!item.reservationId) return
  actionLoading.value = `confirm-${item.reservationId}`
  try {
    await api.reservations.confirm(item.reservationId)
    item.reservationStatus = 'confirmed'
    emit('updated')
  } catch (error) {
    console.error('Failed to confirm reservation', error)
  } finally {
    actionLoading.value = null
  }
}

async function rejectReservation(item: InvoiceLineItem) {
  if (!item.reservationId) return
  actionLoading.value = `reject-${item.reservationId}`
  try {
    await api.reservations.reject(item.reservationId)
    item.reservationStatus = 'rejected'
    emit('updated')
  } catch (error) {
    console.error('Failed to reject reservation', error)
  } finally {
    actionLoading.value = null
  }
}

async function fulfillReservation(item: InvoiceLineItem) {
  if (!item.reservationId) return
  actionLoading.value = `fulfill-${item.reservationId}`
  try {
    await api.reservations.fulfill(item.reservationId)
    item.reservationStatus = 'fulfilled'
    emit('updated')
  } catch (error) {
    console.error('Failed to fulfill reservation', error)
  } finally {
    actionLoading.value = null
  }
}

async function cancelReservation(item: InvoiceLineItem) {
  if (!item.reservationId) return
  actionLoading.value = `cancel-${item.reservationId}`
  try {
    await api.reservations.cancel(item.reservationId)
    item.reservationStatus = 'cancelled'
    emit('updated')
  } catch (error) {
    console.error('Failed to cancel reservation', error)
  } finally {
    actionLoading.value = null
  }
}

async function deleteLineItem(item: InvoiceLineItem) {
  if (!invoice.value) return
  actionLoading.value = `delete-${item.id}`
  try {
    await api.invoices.removeLineItem(invoice.value.id, item.id)
    // Remove from local state
    invoice.value.lineItems = invoice.value.lineItems.filter(li => li.id !== item.id)
    emit('updated')
  } catch (error) {
    console.error('Failed to remove line item', error)
  } finally {
    actionLoading.value = null
  }
}

async function reopenReservation(item: InvoiceLineItem) {
  if (!item.reservationId) return
  actionLoading.value = `reopen-${item.reservationId}`
  try {
    await api.reservations.reopen(item.reservationId)
    item.reservationStatus = 'pending'
    emit('updated')
  } catch (error) {
    console.error('Failed to reopen reservation', error)
  } finally {
    actionLoading.value = null
  }
}

onMounted(async () => {
  try {
    invoice.value = await api.invoices.get(props.invoiceId)
  } catch (error) {
    console.error('Failed to load invoice', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.invoice-expanded-row {
  border-top: 1px solid rgba(var(--v-border-color), 0.12);
}

.section-header {
  cursor: pointer;
  user-select: none;
}

.section-header:hover {
  opacity: 0.8;
}

.item-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.item-table thead th {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
  padding: 4px 8px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
  white-space: nowrap;
}

.item-table tbody td {
  padding: 6px 8px;
  vertical-align: middle;
}
</style>

<style>
/* Zebra striping for alternating rows - unscoped for specificity */
.item-table tbody tr:nth-child(odd) {
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
}

.item-table tbody tr:nth-child(even) {
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
}

.item-table tbody tr:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.14) !important;
}
</style>
