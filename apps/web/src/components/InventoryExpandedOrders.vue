<template>
  <div class="bg-grey-darken-4 pa-3">
    <!-- Sell Orders Section -->
    <template v-if="sellOrders.length > 0">
      <div class="text-caption text-medium-emphasis mb-2">
        <v-icon size="small" class="mr-1" color="success">mdi-tag</v-icon>
        Sell Orders
      </div>
      <v-table density="compact" class="bg-transparent mb-3">
        <thead>
          <tr>
            <th class="text-left">Currency</th>
            <th class="text-right">
              <v-tooltip location="top">
                <template #activator="{ props: tooltipProps }">
                  <span v-bind="tooltipProps" style="cursor: help">Price</span>
                </template>
                Unit price per item
              </v-tooltip>
            </th>
            <th class="text-right">Available</th>
            <th class="text-left">Type</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="order in sellOrders"
            :key="`sell-${order.id}`"
            class="order-row"
            @click="$emit('view-sell', order)"
          >
            <td>
              <v-chip size="x-small" variant="tonal">{{ order.currency }}</v-chip>
            </td>
            <td class="text-right font-weight-medium">
              <template v-if="order.pricingMode === 'dynamic'">
                <span v-if="order.effectivePrice" class="text-info">
                  {{ order.effectivePrice.toFixed(2) }}
                </span>
                <span v-else class="text-medium-emphasis">Dynamic</span>
              </template>
              <template v-else>{{ order.price.toFixed(2) }}</template>
            </td>
            <td class="text-right">{{ order.remainingQuantity.toLocaleString() }}</td>
            <td>
              <v-chip
                size="x-small"
                :color="order.orderType === 'internal' ? 'primary' : 'warning'"
                variant="tonal"
              >
                {{ order.orderType }}
              </v-chip>
            </td>
            <td class="text-right">
              <div class="d-flex justify-end ga-1">
                <v-tooltip text="Edit order" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      size="small"
                      variant="tonal"
                      color="primary"
                      icon="mdi-pencil"
                      @click.stop="$emit('edit-sell', order)"
                    />
                  </template>
                </v-tooltip>
                <v-tooltip text="Delete order" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      size="small"
                      variant="tonal"
                      color="error"
                      icon="mdi-delete"
                      @click.stop="$emit('delete-sell', order)"
                    />
                  </template>
                </v-tooltip>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </template>

    <!-- Buy Orders Section -->
    <template v-if="buyOrders.length > 0">
      <div class="text-caption text-medium-emphasis mb-2">
        <v-icon size="small" class="mr-1" color="warning">mdi-cart</v-icon>
        Buy Orders
      </div>
      <v-table density="compact" class="bg-transparent">
        <thead>
          <tr>
            <th class="text-left">Currency</th>
            <th class="text-right">
              <v-tooltip location="top">
                <template #activator="{ props: tooltipProps }">
                  <span v-bind="tooltipProps" style="cursor: help">Price</span>
                </template>
                Unit price per item
              </v-tooltip>
            </th>
            <th class="text-right">Quantity</th>
            <th class="text-left">Type</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="order in buyOrders"
            :key="`buy-${order.id}`"
            class="order-row"
            @click="$emit('view-buy', order)"
          >
            <td>
              <v-chip size="x-small" variant="tonal">{{ order.currency }}</v-chip>
            </td>
            <td class="text-right font-weight-medium">
              <template v-if="order.pricingMode === 'dynamic'">
                <span v-if="order.effectivePrice" class="text-info">
                  {{ order.effectivePrice.toFixed(2) }}
                </span>
                <span v-else class="text-medium-emphasis">Dynamic</span>
              </template>
              <template v-else>{{ order.price.toFixed(2) }}</template>
            </td>
            <td class="text-right">{{ order.remainingQuantity.toLocaleString() }}</td>
            <td>
              <v-chip
                size="x-small"
                :color="order.orderType === 'internal' ? 'primary' : 'warning'"
                variant="tonal"
              >
                {{ order.orderType }}
              </v-chip>
            </td>
            <td class="text-right">
              <div class="d-flex justify-end ga-1">
                <v-tooltip text="Edit order" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      size="small"
                      variant="tonal"
                      color="primary"
                      icon="mdi-pencil"
                      @click.stop="$emit('edit-buy', order)"
                    />
                  </template>
                </v-tooltip>
                <v-tooltip text="Delete order" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      size="small"
                      variant="tonal"
                      color="error"
                      icon="mdi-delete"
                      @click.stop="$emit('delete-buy', order)"
                    />
                  </template>
                </v-tooltip>
              </div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { SellOrderResponse, BuyOrderResponse } from '../services/api'

defineProps<{
  sellOrders: SellOrderResponse[]
  buyOrders: BuyOrderResponse[]
}>()

defineEmits<{
  'view-sell': [order: SellOrderResponse]
  'view-buy': [order: BuyOrderResponse]
  'edit-sell': [order: SellOrderResponse]
  'edit-buy': [order: BuyOrderResponse]
  'delete-sell': [order: SellOrderResponse]
  'delete-buy': [order: BuyOrderResponse]
}>()
</script>

<style scoped>
.order-row {
  cursor: pointer;
  transition: background-color 0.2s;
}

.order-row:hover {
  background-color: rgba(var(--v-theme-primary), 0.08);
}
</style>
