<template>
  <v-dialog v-model="dialog" max-width="700" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center pb-0">
        <div>
          <span class="text-h6">Find Buyers</span>
          <div v-if="item" class="text-body-2 text-medium-emphasis">
            {{ getCommodityDisplay(item.commodityTicker) }} at
            {{ getLocationDisplay(item.locationId) }}
          </div>
        </div>
        <v-spacer />
        <v-btn icon variant="text" size="small" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text class="pt-4">
        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" size="48" />
          <p class="mt-4 text-body-2">Loading buyers...</p>
        </div>

        <!-- Error State -->
        <v-alert v-else-if="error" type="error">{{ error }}</v-alert>

        <!-- No Buyers -->
        <div v-else-if="buyers.length === 0" class="text-center py-8">
          <v-icon size="64" color="grey-lighten-1">mdi-account-search</v-icon>
          <p class="text-h6 mt-4">No buyers found</p>
          <p class="text-body-2 text-medium-emphasis">
            No one is currently looking to buy this item at this location.
          </p>
        </div>

        <!-- Buyers List -->
        <v-list v-else lines="two" class="pa-0">
          <v-list-item
            v-for="buyer in buyers"
            :key="buyer.id"
            :class="{ 'bg-surface-variant': buyer.isOwn }"
          >
            <template #prepend>
              <v-avatar color="primary" size="40">
                <span class="text-body-2">{{ buyer.buyerName.charAt(0).toUpperCase() }}</span>
              </v-avatar>
            </template>

            <v-list-item-title class="d-flex align-center ga-2">
              <span class="font-weight-medium">{{ buyer.buyerName }}</span>
              <v-chip v-if="buyer.isStanding" size="x-small" color="info" variant="tonal">
                Standing
              </v-chip>
              <v-chip
                v-if="buyer.orderType === 'partner'"
                size="x-small"
                color="primary"
                variant="tonal"
              >
                Partner
              </v-chip>
              <v-chip v-if="buyer.isOwn" size="x-small" color="warning" variant="tonal">
                Your Order
              </v-chip>
            </v-list-item-title>

            <v-list-item-subtitle>
              <span class="font-weight-medium">{{ formatPrice(buyer) }}</span>
              <span class="mx-1">&bull;</span>
              <span v-if="buyer.isStanding" class="text-info">&infin; Unlimited</span>
              <span v-else>
                Wants {{ buyer.remainingQuantity.toLocaleString() }}
                <span v-if="buyer.reservedQuantity > 0" class="text-medium-emphasis">
                  ({{ buyer.quantity.toLocaleString() }} total,
                  {{ buyer.reservedQuantity.toLocaleString() }} reserved)
                </span>
              </span>
            </v-list-item-subtitle>

            <template #append>
              <v-btn
                v-if="!buyer.isOwn"
                color="success"
                size="small"
                variant="tonal"
                :disabled="!canReserve"
                @click="createReservation(buyer)"
              >
                Sell
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions v-if="buyers.length > 0">
        <v-spacer />
        <v-btn variant="text" @click="close">Close</v-btn>
      </v-card-actions>
    </v-card>

    <!-- Reservation Dialog -->
    <SellReservationDialog
      v-model="reservationDialog"
      :buyer="selectedBuyer"
      :max-quantity="maxQuantityForSale"
      @created="onReservationCreated"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { PERMISSIONS } from '@kawakawa/types'
import { api, type FioInventoryItem, type MarketBuyRequest } from '../services/api'
import { useUserStore } from '../stores/user'
import { useDisplayHelpers } from '../composables'
import SellReservationDialog from './SellReservationDialog.vue'

const props = defineProps<{
  modelValue: boolean
  item: FioInventoryItem | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  reserved: []
}>()

const dialog = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const userStore = useUserStore()
const { getLocationDisplay, getCommodityDisplay } = useDisplayHelpers()

const loading = ref(false)
const error = ref<string | null>(null)
const buyers = ref<MarketBuyRequest[]>([])
const reservationDialog = ref(false)
const selectedBuyer = ref<MarketBuyRequest | null>(null)

const canReserve = computed(() => userStore.hasPermission(PERMISSIONS.RESERVATIONS_PLACE_INTERNAL))

const maxQuantityForSale = computed(() => {
  return props.item?.quantity ?? 0
})

const close = () => {
  dialog.value = false
}

const formatPrice = (buyer: MarketBuyRequest): string => {
  const price =
    buyer.pricingMode === 'dynamic' ? (buyer.effectivePrice ?? buyer.price) : buyer.price
  return `${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${buyer.currency}`
}

const loadBuyers = async () => {
  if (!props.item) return

  loading.value = true
  error.value = null

  try {
    const allBuyRequests = await api.market.getBuyRequests(
      props.item.commodityTicker,
      props.item.locationId ?? undefined
    )

    // Filter out completed orders (remainingQuantity <= 0) unless standing
    // Sort: standing orders first, then by price (highest first)
    buyers.value = allBuyRequests
      .filter(b => b.isStanding || b.remainingQuantity > 0)
      .sort((a, b) => {
        // Standing orders first
        if (a.isStanding && !b.isStanding) return -1
        if (!a.isStanding && b.isStanding) return 1

        // Then by effective price (highest first)
        const aPrice = a.pricingMode === 'dynamic' ? (a.effectivePrice ?? a.price) : a.price
        const bPrice = b.pricingMode === 'dynamic' ? (b.effectivePrice ?? b.price) : b.price
        return bPrice - aPrice
      })
  } catch (err) {
    console.error('Failed to load buyers', err)
    error.value = err instanceof Error ? err.message : 'Failed to load buyers'
  } finally {
    loading.value = false
  }
}

const createReservation = (buyer: MarketBuyRequest) => {
  selectedBuyer.value = buyer
  reservationDialog.value = true
}

const onReservationCreated = () => {
  reservationDialog.value = false
  emit('reserved')
  loadBuyers() // Refresh the list
}

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen && props.item) {
      loadBuyers()
    }
  }
)
</script>
