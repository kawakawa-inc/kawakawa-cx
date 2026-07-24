<template>
  <div>
    <div class="d-flex align-center mb-2">
      <v-icon start size="small">mdi-swap-horizontal</v-icon>
      <span class="text-subtitle-2">
        {{ mode === 'buy' ? 'Available Sell Orders' : 'Buy Requests to Fill' }}
      </span>
      <v-spacer />
      <v-chip v-if="shouldShow" size="x-small" color="info" variant="tonal">
        {{ filteredOrders.length }} found
      </v-chip>
    </div>

    <v-divider class="mb-2" />

    <!-- Placeholder when commodity/location not set -->
    <div v-if="!shouldShow" class="text-center py-8 text-medium-emphasis">
      <v-icon size="48" class="mb-3" color="grey">mdi-arrow-left</v-icon>
      <div class="text-body-2">Select a commodity and location</div>
      <div class="text-caption">to see matching orders</div>
    </div>

    <div v-else-if="loading" class="text-center py-4">
      <v-progress-circular indeterminate size="24" />
    </div>

    <div v-else-if="filteredOrders.length === 0" class="text-center py-4 text-medium-emphasis">
      <v-icon size="32" class="mb-2">mdi-package-variant</v-icon>
      <div class="text-caption">No orders found</div>
    </div>

    <v-table v-else density="compact" class="matching-orders-table">
      <thead>
        <tr>
          <th style="width: 28px"></th>
          <th class="text-left">Location</th>
          <th class="text-right">
            <v-tooltip location="top">
              <template #activator="{ props: tooltipProps }">
                <span v-bind="tooltipProps" class="cursor-help">Jumps</span>
              </template>
              Jumps from {{ getLocationDisplay(currentLocation || '') }}
            </v-tooltip>
          </th>
          <th class="text-right">
            <v-tooltip location="top">
              <template #activator="{ props: tooltipProps }">
                <span v-bind="tooltipProps" class="cursor-help">Price</span>
              </template>
              Unit price per item
            </v-tooltip>
          </th>
          <th class="text-right">Avail</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(order, index) in filteredOrders" :key="order.id">
          <tr
            class="order-row"
            :class="{ 'alt-row': index % 2 === 1 }"
            @click="toggleOrderExpanded(order.id)"
          >
            <td class="pa-0">
              <v-icon size="small" class="expand-icon">
                {{ expandedOrders[order.id] ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
              </v-icon>
            </td>
            <td>
              <div class="text-truncate" style="min-width: 1px">
                {{ getLocationDisplay(order.locationId) }}
              </div>
            </td>
            <td class="text-right">
              <template v-if="order.locationId === currentLocation">
                <span class="text-success">0</span>
              </template>
              <template v-else-if="order.jumpCount !== null">
                {{ order.jumpCount }}
              </template>
              <template v-else>
                <span class="text-medium-emphasis">-</span>
              </template>
            </td>
            <td class="text-right">
              <span class="font-weight-medium">
                {{ getOrderDisplayPrice(order).toFixed(2) }}
              </span>
              <v-tooltip v-if="order.pricingMode === 'dynamic'" location="top">
                <template #activator="{ props: tooltipProps }">
                  <v-icon
                    v-bind="tooltipProps"
                    size="x-small"
                    class="ml-1"
                    :color="order.isFallback ? 'warning' : 'info'"
                  >
                    mdi-tag-outline
                  </v-icon>
                </template>
                <span v-if="order.isFallback">
                  Price from {{ order.priceListCode?.toUpperCase() }} (fallback location)
                </span>
                <span v-else>Price from {{ order.priceListCode?.toUpperCase() }}</span>
              </v-tooltip>
            </td>
            <td class="text-right">
              {{ order.remainingQuantity.toLocaleString() }}
            </td>
          </tr>
          <tr v-if="expandedOrders[order.id]" class="expanded-row">
            <td colspan="5" class="pa-2 bg-grey-darken-4">
              <div class="d-flex flex-column ga-2">
                <!-- Seller/Buyer info -->
                <div class="d-flex text-caption text-medium-emphasis">
                  <div class="mr-4">
                    <span class="text-uppercase">{{ mode === 'buy' ? 'Seller' : 'Buyer' }}:</span>
                    <span class="text-body-2 ml-1">
                      {{ mode === 'buy' ? order.sellerName : order.buyerName }}
                    </span>
                  </div>
                </div>
                <!-- Reservation controls -->
                <div class="d-flex align-center ga-3" @click.stop>
                  <v-label class="text-caption mr-2"
                    >{{ mode === 'buy' ? 'Reserve' : 'Fill' }}:</v-label
                  >
                  <v-text-field
                    v-model.number="reservationQuantities[order.id]"
                    label="Qty"
                    placeholder="0"
                    type="number"
                    density="compact"
                    hide-details
                    variant="outlined"
                    :min="0"
                    :max="order.remainingQuantity"
                    style="max-width: 120px"
                    @update:model-value="updateReservationQty(order.id, $event)"
                  />
                  <v-menu
                    v-model="expirationMenus[order.id]"
                    :close-on-content-click="false"
                    location="bottom"
                  >
                    <template #activator="{ props: menuProps }">
                      <v-chip
                        v-bind="menuProps"
                        size="small"
                        variant="outlined"
                        class="expiration-chip"
                      >
                        <v-icon start size="small">mdi-clock-outline</v-icon>
                        <DurationDisplay
                          v-if="reservationExpirations[order.id]"
                          :target-date="reservationExpirations[order.id]"
                          short
                        />
                        <template v-else>3d</template>
                      </v-chip>
                    </template>
                    <v-card min-width="200">
                      <v-card-text class="pa-2">
                        <v-text-field
                          :model-value="reservationExpirations[order.id] || getDefaultExpiration()"
                          label="Expires"
                          type="datetime-local"
                          density="compact"
                          hide-details
                          @update:model-value="setReservationExpiration(order.id, $event)"
                        />
                      </v-card-text>
                    </v-card>
                  </v-menu>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </v-table>

    <!-- Reservations Summary -->
    <div
      v-if="shouldShow && totalReservationQuantity > 0"
      class="mt-3 pa-2 bg-grey-darken-3 rounded"
    >
      <div class="d-flex justify-space-between align-center">
        <span class="text-caption">Total to {{ mode === 'buy' ? 'reserve' : 'fill' }}:</span>
        <span class="font-weight-bold">{{ totalReservationQuantity.toLocaleString() }}</span>
      </div>
      <div class="text-caption text-medium-emphasis">
        from {{ selectedReservationsCount }} order{{ selectedReservationsCount === 1 ? '' : 's' }}
      </div>
      <!-- Order quantity after reservations -->
      <v-divider class="my-2" />
      <div class="d-flex justify-space-between align-center">
        <span class="text-caption"
          >{{ mode === 'buy' ? 'Order quantity' : 'Order max sell' }}:</span
        >
        <span class="font-weight-bold">{{
          Math.max(0, remainingOrderQuantity).toLocaleString()
        }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { api, type MarketListing, type MarketBuyRequest } from '../services/api'
import { useDisplayHelpers } from '../composables'
import DurationDisplay from './DurationDisplay.vue'

type MatchingOrder = (MarketListing | MarketBuyRequest) & {
  sellerName?: string
  buyerName?: string
}

const props = defineProps<{
  mode: 'buy' | 'sell'
  commodityTicker: string
  locationId: string
  currency: string
  /** For calculating remaining quantity display */
  orderQuantity: number
}>()

const emit = defineEmits<{
  'update:reservations': [
    reservations: Array<{ orderId: number; quantity: number; expiresAt?: string }>,
  ]
}>()

const { getLocationDisplay } = useDisplayHelpers()

// State
const loading = ref(false)
const orders = ref<MatchingOrder[]>([])
const reservationQuantities = ref<Record<number, number>>({})
const reservationExpirations = ref<Record<number, string>>({})
const expirationMenus = ref<Record<number, boolean>>({})
const expandedOrders = ref<Record<number, boolean>>({})

// Computed
const shouldShow = computed(() => props.commodityTicker && props.locationId)

const currentLocation = computed(() => props.locationId)

const filteredOrders = computed(() => {
  if (!props.currency) return orders.value
  return orders.value.filter(o => o.currency === props.currency)
})

const totalReservationQuantity = computed(() => {
  return Object.values(reservationQuantities.value).reduce((sum, qty) => sum + (qty || 0), 0)
})

const selectedReservationsCount = computed(() => {
  return Object.values(reservationQuantities.value).filter(qty => qty && qty > 0).length
})

const remainingOrderQuantity = computed(() => {
  return props.orderQuantity - totalReservationQuantity.value
})

// Methods
const getOrderDisplayPrice = (order: MatchingOrder): number => {
  if (order.pricingMode === 'dynamic' && order.effectivePrice !== null) {
    return order.effectivePrice
  }
  return order.price
}

const toggleOrderExpanded = (orderId: number) => {
  expandedOrders.value[orderId] = !expandedOrders.value[orderId]
}

const getDefaultExpiration = (): string => {
  const date = new Date()
  date.setDate(date.getDate() + 3)
  return date.toISOString().slice(0, 16)
}

const setReservationExpiration = (orderId: number, value: string) => {
  reservationExpirations.value[orderId] = value
  emitReservations()
}

const updateReservationQty = (orderId: number, value: number | string | null) => {
  const numValue = typeof value === 'string' ? parseInt(value, 10) : (value ?? 0)
  const order = orders.value.find(o => o.id === orderId)
  if (order) {
    reservationQuantities.value[orderId] = Math.max(
      0,
      Math.min(numValue || 0, order.remainingQuantity)
    )
    emitReservations()
  }
}

const emitReservations = () => {
  const reservations = Object.entries(reservationQuantities.value)
    .filter(([, qty]) => qty && qty > 0)
    .map(([orderId, quantity]) => {
      const expiration = reservationExpirations.value[parseInt(orderId, 10)]
      return {
        orderId: parseInt(orderId, 10),
        quantity,
        expiresAt: expiration ? new Date(expiration).toISOString() : undefined,
      }
    })
  emit('update:reservations', reservations)
}

const loadOrders = async () => {
  if (!props.commodityTicker || !props.locationId) {
    orders.value = []
    return
  }

  try {
    loading.value = true

    if (props.mode === 'buy') {
      // For buy orders, fetch sell listings
      const listings = await api.market.getListings(
        props.commodityTicker,
        undefined,
        props.locationId
      )
      orders.value = listings
        .filter(l => !l.isOwn && l.remainingQuantity > 0)
        .sort((a, b) => {
          if (a.jumpCount !== null && b.jumpCount !== null) {
            if (a.jumpCount !== b.jumpCount) return a.jumpCount - b.jumpCount
          } else if (a.jumpCount === null && b.jumpCount !== null) {
            return 1
          } else if (a.jumpCount !== null && b.jumpCount === null) {
            return -1
          }
          return a.price - b.price
        })
    } else {
      // For sell orders, fetch buy requests
      const requests = await api.market.getBuyRequests(
        props.commodityTicker,
        undefined,
        props.locationId
      )
      orders.value = requests
        .filter(r => !r.isOwn && r.remainingQuantity > 0)
        .sort((a, b) => {
          if (a.jumpCount !== null && b.jumpCount !== null) {
            if (a.jumpCount !== b.jumpCount) return a.jumpCount - b.jumpCount
          } else if (a.jumpCount === null && b.jumpCount !== null) {
            return 1
          } else if (a.jumpCount !== null && b.jumpCount === null) {
            return -1
          }
          return b.price - a.price
        })
    }

    // Reset state
    reservationQuantities.value = {}
    reservationExpirations.value = {}
    expirationMenus.value = {}
    expandedOrders.value = {}
    emitReservations()
  } catch (error) {
    console.error('Failed to load matching orders', error)
  } finally {
    loading.value = false
  }
}

const reset = () => {
  orders.value = []
  reservationQuantities.value = {}
  reservationExpirations.value = {}
  expirationMenus.value = {}
  expandedOrders.value = {}
}

// Watch for changes
watch(
  () => [props.commodityTicker, props.locationId, props.mode],
  () => {
    loadOrders()
  },
  { immediate: true }
)

// Expose for parent
defineExpose({
  totalReservationQuantity,
  selectedReservationsCount,
  reset,
})
</script>

<style scoped>
.matching-orders-table {
  font-size: 0.875rem;
}

.matching-orders-table th {
  font-weight: 500;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.matching-orders-table .order-row {
  cursor: pointer;
}

.matching-orders-table .order-row:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
}

.matching-orders-table .order-row.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

.matching-orders-table .expand-icon {
  opacity: 0.6;
}

.cursor-help {
  cursor: help;
}
</style>
