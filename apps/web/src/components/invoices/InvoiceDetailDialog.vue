<template>
  <v-dialog v-model="modelValue" max-width="900" scrollable>
    <v-card v-if="invoice">
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-file-document-outline</v-icon>
        Invoice #{{ invoice.id }}
        <span class="text-medium-emphasis mx-2">—</span>
        <v-chip
          :color="invoice.direction === 'sent' ? 'primary' : 'info'"
          size="small"
          variant="tonal"
          class="mr-2"
        >
          <v-icon start size="small">{{
            invoice.direction === 'sent' ? 'mdi-arrow-up' : 'mdi-arrow-down'
          }}</v-icon>
          {{ invoice.direction === 'sent' ? 'Sent to' : 'From' }}
        </v-chip>
        <span>{{ invoice.counterpartyName }}</span>
        <v-spacer />
        <InvoiceStatusChip :status="invoice.status" class="mr-2" />
        <v-btn icon variant="text" @click="modelValue = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-0">
        <!-- BUY Section (money out = yellow/warning) -->
        <div class="section-header bg-warning-darken-4 pa-3 d-flex align-center">
          <v-icon color="warning" class="mr-2">mdi-arrow-down</v-icon>
          <span class="text-subtitle-1 font-weight-medium">Buying (you pay)</span>
          <v-spacer />
          <v-chip v-if="buyItems.length > 0" size="small" variant="tonal" class="mr-2">
            {{ buyItems.length }} item{{ buyItems.length === 1 ? '' : 's' }}
          </v-chip>
          <!-- Bulk action buttons -->
          <v-btn
            v-if="allBuyItemsCanConfirm"
            size="small"
            variant="tonal"
            color="success"
            class="mr-1"
            :loading="actionLoading === 'confirm-all-buy'"
            :disabled="actionLoading !== null"
            @click="confirmAllBuy"
          >
            <v-icon start size="small">mdi-check-all</v-icon>
            Confirm All
          </v-btn>
          <v-btn
            v-if="allBuyItemsCanReject"
            size="small"
            variant="tonal"
            color="error"
            class="mr-1"
            :loading="actionLoading === 'reject-all-buy'"
            :disabled="actionLoading !== null"
            @click="rejectAllBuy"
          >
            <v-icon start size="small">mdi-close</v-icon>
            Reject All
          </v-btn>
          <v-btn
            v-if="allBuyItemsCanFulfill"
            size="small"
            variant="tonal"
            color="primary"
            class="mr-2"
            :loading="actionLoading === 'fulfill-all-buy'"
            :disabled="actionLoading !== null"
            @click="fulfillAllBuy"
          >
            <v-icon start size="small">mdi-package-variant-closed-check</v-icon>
            Fulfill All
          </v-btn>
          <v-btn
            v-if="buyItems.length > 0"
            size="small"
            variant="tonal"
            color="warning"
            @click="copyBuyCsv"
          >
            <v-icon start size="small">mdi-content-copy</v-icon>
            Copy CSV
          </v-btn>
        </div>

        <div v-if="buyItems.length === 0" class="text-center pa-4 text-medium-emphasis">
          No buy items in this invoice
        </div>

        <v-table v-else density="compact" class="buy-table">
          <thead>
            <tr>
              <th>Commodity</th>
              <th>Location</th>
              <th class="text-right">Quantity</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Total</th>
              <th v-if="hasReservations" class="text-center">Status</th>
              <th v-if="showReservationActions" class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in buyItems" :key="item.id">
              <td>
                <CommodityDisplay :ticker="item.commodityTicker" />
              </td>
              <td>{{ getLocationDisplay(item.locationId) }}</td>
              <td class="text-right">{{ item.quantity.toLocaleString() }}</td>
              <td class="text-right">{{ formatPrice(item.unitPrice) }} {{ item.currency }}</td>
              <td class="text-right font-weight-medium">
                {{ formatPrice(item.totalValue) }} {{ item.currency }}
              </td>
              <td v-if="hasReservations" class="text-center">
                <ReservationStatusChip
                  v-if="item.reservationStatus"
                  :status="item.reservationStatus"
                  size="small"
                />
                <span v-else class="text-medium-emphasis">-</span>
              </td>
              <td v-if="showReservationActions" class="text-center">
                <template v-if="item.reservationId">
                  <v-btn
                    v-if="getAvailableActions(item.reservationStatus).confirm"
                    size="x-small"
                    color="success"
                    variant="tonal"
                    class="mr-1"
                    :loading="actionLoading === `confirm-${item.id}`"
                    :disabled="actionLoading !== null"
                    @click="confirmReservation(item)"
                  >
                    <v-icon size="small">mdi-check</v-icon>
                  </v-btn>
                  <v-btn
                    v-if="getAvailableActions(item.reservationStatus).reject"
                    size="x-small"
                    color="error"
                    variant="tonal"
                    class="mr-1"
                    :loading="actionLoading === `reject-${item.id}`"
                    :disabled="actionLoading !== null"
                    @click="rejectReservation(item)"
                  >
                    <v-icon size="small">mdi-close</v-icon>
                  </v-btn>
                  <v-btn
                    v-if="getAvailableActions(item.reservationStatus).fulfill"
                    size="x-small"
                    color="primary"
                    variant="tonal"
                    :loading="actionLoading === `fulfill-${item.id}`"
                    :disabled="actionLoading !== null"
                    @click="fulfillReservation(item)"
                  >
                    <v-icon size="small">mdi-package-variant-closed-check</v-icon>
                  </v-btn>
                </template>
                <span v-else class="text-medium-emphasis">-</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr v-for="total in buyTotals" :key="total.currency" class="bg-surface-light">
              <td
                :colspan="4 + (hasReservations ? 1 : 0) + (showReservationActions ? 1 : 0)"
                class="text-right font-weight-medium"
              >
                Subtotal ({{ total.currency }}):
              </td>
              <td class="text-right font-weight-bold text-warning">
                {{ formatPrice(total.total) }} {{ total.currency }}
              </td>
            </tr>
          </tfoot>
        </v-table>

        <v-divider />

        <!-- SELL Section (money in = green/success) -->
        <div class="section-header bg-success-darken-4 pa-3 d-flex align-center">
          <v-icon color="success" class="mr-2">mdi-arrow-up</v-icon>
          <span class="text-subtitle-1 font-weight-medium">Selling (you receive)</span>
          <v-spacer />
          <v-chip v-if="sellItems.length > 0" size="small" variant="tonal" class="mr-2">
            {{ sellItems.length }} item{{ sellItems.length === 1 ? '' : 's' }}
          </v-chip>
          <!-- Bulk action buttons -->
          <v-btn
            v-if="allSellItemsCanConfirm"
            size="small"
            variant="tonal"
            color="success"
            class="mr-1"
            :loading="actionLoading === 'confirm-all-sell'"
            :disabled="actionLoading !== null"
            @click="confirmAllSell"
          >
            <v-icon start size="small">mdi-check-all</v-icon>
            Confirm All
          </v-btn>
          <v-btn
            v-if="allSellItemsCanReject"
            size="small"
            variant="tonal"
            color="error"
            class="mr-1"
            :loading="actionLoading === 'reject-all-sell'"
            :disabled="actionLoading !== null"
            @click="rejectAllSell"
          >
            <v-icon start size="small">mdi-close</v-icon>
            Reject All
          </v-btn>
          <v-btn
            v-if="allSellItemsCanFulfill"
            size="small"
            variant="tonal"
            color="primary"
            class="mr-2"
            :loading="actionLoading === 'fulfill-all-sell'"
            :disabled="actionLoading !== null"
            @click="fulfillAllSell"
          >
            <v-icon start size="small">mdi-package-variant-closed-check</v-icon>
            Fulfill All
          </v-btn>
          <v-btn
            v-if="sellItems.length > 0"
            size="small"
            variant="tonal"
            color="success"
            @click="copySellCsv"
          >
            <v-icon start size="small">mdi-content-copy</v-icon>
            Copy CSV
          </v-btn>
        </div>

        <div v-if="sellItems.length === 0" class="text-center pa-4 text-medium-emphasis">
          No sell items in this invoice
        </div>

        <v-table v-else density="compact" class="sell-table">
          <thead>
            <tr>
              <th>Commodity</th>
              <th>Location</th>
              <th class="text-right">Quantity</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Total</th>
              <th v-if="hasReservations" class="text-center">Status</th>
              <th v-if="showReservationActions" class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in sellItems" :key="item.id">
              <td>
                <CommodityDisplay :ticker="item.commodityTicker" />
              </td>
              <td>{{ getLocationDisplay(item.locationId) }}</td>
              <td class="text-right">{{ item.quantity.toLocaleString() }}</td>
              <td class="text-right">{{ formatPrice(item.unitPrice) }} {{ item.currency }}</td>
              <td class="text-right font-weight-medium">
                {{ formatPrice(item.totalValue) }} {{ item.currency }}
              </td>
              <td v-if="hasReservations" class="text-center">
                <ReservationStatusChip
                  v-if="item.reservationStatus"
                  :status="item.reservationStatus"
                  size="small"
                />
                <span v-else class="text-medium-emphasis">-</span>
              </td>
              <td v-if="showReservationActions" class="text-center">
                <template v-if="item.reservationId">
                  <v-btn
                    v-if="getAvailableActions(item.reservationStatus).confirm"
                    size="x-small"
                    color="success"
                    variant="tonal"
                    class="mr-1"
                    :loading="actionLoading === `confirm-${item.id}`"
                    :disabled="actionLoading !== null"
                    @click="confirmReservation(item)"
                  >
                    <v-icon size="small">mdi-check</v-icon>
                  </v-btn>
                  <v-btn
                    v-if="getAvailableActions(item.reservationStatus).reject"
                    size="x-small"
                    color="error"
                    variant="tonal"
                    class="mr-1"
                    :loading="actionLoading === `reject-${item.id}`"
                    :disabled="actionLoading !== null"
                    @click="rejectReservation(item)"
                  >
                    <v-icon size="small">mdi-close</v-icon>
                  </v-btn>
                  <v-btn
                    v-if="getAvailableActions(item.reservationStatus).fulfill"
                    size="x-small"
                    color="primary"
                    variant="tonal"
                    :loading="actionLoading === `fulfill-${item.id}`"
                    :disabled="actionLoading !== null"
                    @click="fulfillReservation(item)"
                  >
                    <v-icon size="small">mdi-package-variant-closed-check</v-icon>
                  </v-btn>
                </template>
                <span v-else class="text-medium-emphasis">-</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr v-for="total in sellTotals" :key="total.currency" class="bg-surface-light">
              <td
                :colspan="4 + (hasReservations ? 1 : 0) + (showReservationActions ? 1 : 0)"
                class="text-right font-weight-medium"
              >
                Subtotal ({{ total.currency }}):
              </td>
              <td class="text-right font-weight-bold text-success">
                {{ formatPrice(total.total) }} {{ total.currency }}
              </td>
            </tr>
          </tfoot>
        </v-table>

        <!-- Net Summary -->
        <template v-if="buyItems.length > 0 && sellItems.length > 0">
          <v-divider />
          <div class="pa-4">
            <div class="text-subtitle-2 mb-2">Net Position</div>
            <div v-for="net in netTotals" :key="net.currency" class="d-flex justify-space-between">
              <span class="text-medium-emphasis">{{ net.currency }}:</span>
              <span
                class="font-weight-bold"
                :class="net.total >= 0 ? 'text-success' : 'text-warning'"
              >
                {{ net.total >= 0 ? '+' : '' }}{{ formatPrice(net.total) }} {{ net.currency }}
              </span>
            </div>
          </div>
        </template>

        <!-- Invoice metadata -->
        <v-divider />
        <div class="pa-4 text-caption text-medium-emphasis">
          <div>Created: {{ formatDate(invoice.createdAt) }}</div>
          <div v-if="invoice.submittedAt">Submitted: {{ formatDate(invoice.submittedAt) }}</div>
          <div v-if="invoice.notes" class="mt-2"><strong>Notes:</strong> {{ invoice.notes }}</div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="modelValue = false">Close</v-btn>
      </v-card-actions>
    </v-card>

    <!-- Loading state -->
    <v-card v-else>
      <v-card-text class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
        <div class="mt-4">Loading invoice...</div>
      </v-card-text>
    </v-card>

    <!-- Snackbar for feedback -->
    <v-snackbar v-model="snackbar" :timeout="2000" :color="snackbarColor">
      {{ snackbarMessage }}
    </v-snackbar>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Invoice, InvoiceLineItem, Currency, ReservationStatus } from '@kawakawa/types'
import { locationService } from '../../services/locationService'
import { useUserStore } from '../../stores/user'
import { api } from '../../services/api'
import CommodityDisplay from '../CommodityDisplay.vue'
import InvoiceStatusChip from './InvoiceStatusChip.vue'
import ReservationStatusChip from '../ReservationStatusChip.vue'

const props = defineProps<{
  invoice: Invoice | null
}>()

const emit = defineEmits<{
  updated: []
}>()

const modelValue = defineModel<boolean>({ required: true })

const userStore = useUserStore()
const snackbar = ref(false)
const snackbarMessage = ref('Copied to clipboard!')
const snackbarColor = ref<'success' | 'error'>('success')
const actionLoading = ref<string | null>(null)

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

const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
  if (!props.invoice) return []
  if (props.invoice.direction === 'sent') {
    // Sent: items from sell orders = I'm buying
    return props.invoice.lineItems.filter(item => item.orderType === 'sell')
  }
  // Received: sender's sell = my buy, so items from buy orders
  return props.invoice.lineItems.filter(item => item.orderType === 'buy')
})

const sellItems = computed<InvoiceLineItem[]>(() => {
  if (!props.invoice) return []
  if (props.invoice.direction === 'sent') {
    // Sent: items from buy orders = I'm selling
    return props.invoice.lineItems.filter(item => item.orderType === 'buy')
  }
  // Received: sender's buy = my sell, so items from sell orders
  return props.invoice.lineItems.filter(item => item.orderType === 'sell')
})

// Calculate totals by currency
const buyTotals = computed(() => {
  const totals = new Map<Currency, number>()
  for (const item of buyItems.value) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.totalValue)
  }
  return Array.from(totals.entries()).map(([currency, total]) => ({ currency, total }))
})

const sellTotals = computed(() => {
  const totals = new Map<Currency, number>()
  for (const item of sellItems.value) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.totalValue)
  }
  return Array.from(totals.entries()).map(([currency, total]) => ({ currency, total }))
})

const netTotals = computed(() => {
  const currencies = new Set<Currency>()
  for (const item of props.invoice?.lineItems ?? []) {
    currencies.add(item.currency)
  }

  return Array.from(currencies).map(currency => {
    const buyTotal = buyTotals.value.find(t => t.currency === currency)?.total ?? 0
    const sellTotal = sellTotals.value.find(t => t.currency === currency)?.total ?? 0
    return {
      currency,
      total: sellTotal - buyTotal, // positive = receive, negative = pay
    }
  })
})

// CSV generation
const generateCsv = (items: InvoiceLineItem[]): string => {
  const header = 'Commodity,Location,Quantity,Unit Price,Currency,Total'
  const rows = items.map(item => {
    const location = getLocationDisplay(item.locationId)
    return `${item.commodityTicker},${location},${item.quantity},${item.unitPrice.toFixed(2)},${item.currency},${item.totalValue.toFixed(2)}`
  })
  return [header, ...rows].join('\n')
}

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}

const copyBuyCsv = async () => {
  const csv = generateCsv(buyItems.value)
  await navigator.clipboard.writeText(csv)
  showSnackbar('Copied to clipboard!')
}

const copySellCsv = async () => {
  const csv = generateCsv(sellItems.value)
  await navigator.clipboard.writeText(csv)
  showSnackbar('Copied to clipboard!')
}

// Check if we should show reservation management (received invoice with submitted status)
const isReceivedInvoice = computed(() => props.invoice?.direction === 'received')
const showReservationActions = computed(
  () => isReceivedInvoice.value && props.invoice?.status !== 'draft'
)

// Check if any items have reservations (i.e., invoice was submitted)
const hasReservations = computed(
  () => props.invoice?.lineItems.some(item => item.reservationId !== null) ?? false
)

// Get action buttons for a line item based on its status
const getAvailableActions = (
  status: ReservationStatus | null
): { confirm: boolean; reject: boolean; fulfill: boolean } => {
  if (!status) return { confirm: false, reject: false, fulfill: false }

  return {
    confirm: status === 'pending',
    reject: status === 'pending',
    fulfill: status === 'confirmed',
  }
}

// Reservation actions
async function confirmReservation(item: InvoiceLineItem) {
  if (!item.reservationId) return
  actionLoading.value = `confirm-${item.id}`
  try {
    await api.reservations.confirm(item.reservationId)
    emit('updated')
    showSnackbar('Reservation confirmed')
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to confirm reservation', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function rejectReservation(item: InvoiceLineItem) {
  if (!item.reservationId) return
  actionLoading.value = `reject-${item.id}`
  try {
    await api.reservations.reject(item.reservationId)
    emit('updated')
    showSnackbar('Reservation rejected')
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to reject reservation', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function fulfillReservation(item: InvoiceLineItem) {
  if (!item.reservationId) return
  actionLoading.value = `fulfill-${item.id}`
  try {
    await api.reservations.fulfill(item.reservationId)
    emit('updated')
    showSnackbar('Reservation marked as fulfilled')
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to fulfill reservation', 'error')
  } finally {
    actionLoading.value = null
  }
}

// Bulk action helpers - check if all items in a section can have a specific action
const allBuyItemsCanConfirm = computed(() => {
  if (!showReservationActions.value || buyItems.value.length === 0) return false
  return buyItems.value.every(item => item.reservationId && item.reservationStatus === 'pending')
})

const allBuyItemsCanReject = computed(() => {
  if (!showReservationActions.value || buyItems.value.length === 0) return false
  return buyItems.value.every(item => item.reservationId && item.reservationStatus === 'pending')
})

const allBuyItemsCanFulfill = computed(() => {
  if (!showReservationActions.value || buyItems.value.length === 0) return false
  return buyItems.value.every(item => item.reservationId && item.reservationStatus === 'confirmed')
})

const allSellItemsCanConfirm = computed(() => {
  if (!showReservationActions.value || sellItems.value.length === 0) return false
  return sellItems.value.every(item => item.reservationId && item.reservationStatus === 'pending')
})

const allSellItemsCanReject = computed(() => {
  if (!showReservationActions.value || sellItems.value.length === 0) return false
  return sellItems.value.every(item => item.reservationId && item.reservationStatus === 'pending')
})

const allSellItemsCanFulfill = computed(() => {
  if (!showReservationActions.value || sellItems.value.length === 0) return false
  return sellItems.value.every(item => item.reservationId && item.reservationStatus === 'confirmed')
})

// Bulk action methods
async function confirmAllBuy() {
  actionLoading.value = 'confirm-all-buy'
  try {
    for (const item of buyItems.value) {
      if (item.reservationId && item.reservationStatus === 'pending') {
        await api.reservations.confirm(item.reservationId)
      }
    }
    emit('updated')
    showSnackbar(`Confirmed ${buyItems.value.length} reservations`)
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to confirm reservations', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function rejectAllBuy() {
  actionLoading.value = 'reject-all-buy'
  try {
    for (const item of buyItems.value) {
      if (item.reservationId && item.reservationStatus === 'pending') {
        await api.reservations.reject(item.reservationId)
      }
    }
    emit('updated')
    showSnackbar(`Rejected ${buyItems.value.length} reservations`)
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to reject reservations', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function fulfillAllBuy() {
  actionLoading.value = 'fulfill-all-buy'
  try {
    for (const item of buyItems.value) {
      if (item.reservationId && item.reservationStatus === 'confirmed') {
        await api.reservations.fulfill(item.reservationId)
      }
    }
    emit('updated')
    showSnackbar(`Fulfilled ${buyItems.value.length} reservations`)
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to fulfill reservations', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function confirmAllSell() {
  actionLoading.value = 'confirm-all-sell'
  try {
    for (const item of sellItems.value) {
      if (item.reservationId && item.reservationStatus === 'pending') {
        await api.reservations.confirm(item.reservationId)
      }
    }
    emit('updated')
    showSnackbar(`Confirmed ${sellItems.value.length} reservations`)
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to confirm reservations', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function rejectAllSell() {
  actionLoading.value = 'reject-all-sell'
  try {
    for (const item of sellItems.value) {
      if (item.reservationId && item.reservationStatus === 'pending') {
        await api.reservations.reject(item.reservationId)
      }
    }
    emit('updated')
    showSnackbar(`Rejected ${sellItems.value.length} reservations`)
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to reject reservations', 'error')
  } finally {
    actionLoading.value = null
  }
}

async function fulfillAllSell() {
  actionLoading.value = 'fulfill-all-sell'
  try {
    for (const item of sellItems.value) {
      if (item.reservationId && item.reservationStatus === 'confirmed') {
        await api.reservations.fulfill(item.reservationId)
      }
    }
    emit('updated')
    showSnackbar(`Fulfilled ${sellItems.value.length} reservations`)
  } catch (e) {
    showSnackbar(e instanceof Error ? e.message : 'Failed to fulfill reservations', 'error')
  } finally {
    actionLoading.value = null
  }
}
</script>

<style scoped>
.section-header {
  position: sticky;
  top: 0;
  z-index: 1;
}

.buy-table tbody tr:hover,
.sell-table tbody tr:hover {
  background-color: rgba(var(--v-theme-surface-variant), 0.3);
}
</style>
