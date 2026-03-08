<template>
  <div class="contract-breakdown">
    <div class="d-flex align-center pa-3 section-header">
      <v-icon size="small" class="mr-2">mdi-file-sign</v-icon>
      <span class="text-subtitle-1 font-weight-medium">Contract Breakdown</span>
      <v-spacer />
      <v-chip size="small" variant="tonal">
        {{ contracts.length }} contract{{ contracts.length === 1 ? '' : 's' }}
      </v-chip>
    </div>

    <div class="text-caption text-medium-emphasis px-3 pb-2">
      Each group below maps to one in-game PRUN contract (1 location, buy or sell only). Click any
      value to copy it.
    </div>

    <div class="contracts-list px-3 pb-3">
      <v-card
        v-for="(contract, idx) in contracts"
        :key="idx"
        variant="outlined"
        class="contract-card mb-2"
      >
        <div class="contract-header pa-2 d-flex align-center">
          <v-chip
            :color="contract.type === 'buy' ? 'warning' : 'success'"
            size="small"
            variant="tonal"
            class="mr-2"
          >
            <v-icon start size="small">{{
              contract.type === 'buy' ? 'mdi-arrow-down' : 'mdi-arrow-up'
            }}</v-icon>
            {{ contract.type === 'buy' ? 'BUY' : 'SELL' }}
          </v-chip>
          <span
            class="text-body-2 font-weight-medium copyable"
            @click="copyText(contract.locationId)"
          >
            {{ contract.locationDisplay }}
          </span>
          <v-chip size="x-small" variant="tonal" class="ml-2">{{ contract.currency }}</v-chip>
          <v-spacer />
          <span class="text-caption text-medium-emphasis">
            {{ contract.items.length }} item{{ contract.items.length === 1 ? '' : 's' }}
          </span>
        </div>

        <v-divider />

        <table class="contract-table">
          <thead>
            <tr>
              <th class="text-left">Commodity</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in contract.items" :key="item.id">
              <td>
                <span class="copyable" @click="copyText(item.commodityTicker)">
                  <CommodityDisplay :ticker="item.commodityTicker" />
                </span>
              </td>
              <td class="text-right">
                <span class="copyable" @click="copyText(String(item.quantity))">
                  {{ item.quantity.toLocaleString() }}
                </span>
              </td>
              <td class="text-right">
                <span class="copyable" @click="copyText(item.unitPrice.toFixed(2))">
                  {{ formatPrice(item.unitPrice) }} {{ item.currency }}
                </span>
              </td>
              <td class="text-right font-weight-medium">
                <span class="copyable" @click="copyText(item.totalValue.toFixed(2))">
                  {{ formatPrice(item.totalValue) }} {{ item.currency }}
                </span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="bg-surface-light">
              <td colspan="3" class="text-right font-weight-medium">
                Total ({{ contract.currency }}):
              </td>
              <td
                class="text-right font-weight-bold"
                :class="contract.type === 'buy' ? 'text-warning' : 'text-success'"
              >
                <span class="copyable" @click="copyText(contract.total.toFixed(2))">
                  {{ formatPrice(contract.total) }} {{ contract.currency }}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </v-card>
    </div>

    <v-snackbar v-model="snackbar" :timeout="1500" color="success">
      Copied: {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { InvoiceLineItem, InvoiceDirection, Currency } from '@kawakawa/types'
import { locationService } from '../../services/locationService'
import { useUserStore } from '../../stores/user'
import CommodityDisplay from '../CommodityDisplay.vue'

interface ContractGroup {
  type: 'buy' | 'sell'
  locationId: string
  locationDisplay: string
  currency: Currency
  items: InvoiceLineItem[]
  total: number
}

const props = defineProps<{
  lineItems: InvoiceLineItem[]
  direction: InvoiceDirection
}>()

const userStore = useUserStore()
const snackbar = ref(false)
const snackbarMessage = ref('')

const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const formatPrice = (value: number): string => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Group line items into contracts: each (location + buy/sell + currency) = 1 contract
const contracts = computed<ContractGroup[]>(() => {
  const groups = new Map<string, ContractGroup>()

  for (const item of props.lineItems) {
    // Determine buy/sell from the current user's perspective
    let type: 'buy' | 'sell'
    if (props.direction === 'sent') {
      type = item.orderType === 'sell' ? 'buy' : 'sell'
    } else {
      type = item.orderType === 'buy' ? 'buy' : 'sell'
    }

    const key = `${type}:${item.locationId}:${item.currency}`
    if (!groups.has(key)) {
      groups.set(key, {
        type,
        locationId: item.locationId,
        locationDisplay: getLocationDisplay(item.locationId),
        currency: item.currency,
        items: [],
        total: 0,
      })
    }
    const group = groups.get(key)!
    group.items.push(item)
    group.total += item.totalValue
  }

  // Sort: buys first, then by location, then by currency
  return Array.from(groups.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'buy' ? -1 : 1
    const loc = a.locationDisplay.localeCompare(b.locationDisplay)
    if (loc !== 0) return loc
    return a.currency.localeCompare(b.currency)
  })
})

const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text)
  snackbarMessage.value = text
  snackbar.value = true
}
</script>

<style scoped>
.section-header {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.contract-card {
  border-color: rgba(var(--v-border-color), 0.2);
}

.contract-header {
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.contract-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.contract-table thead th {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
  padding: 4px 12px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
  white-space: nowrap;
}

.contract-table tbody td,
.contract-table tfoot td {
  padding: 6px 12px;
  vertical-align: middle;
}

.copyable {
  cursor: pointer;
  border-radius: 4px;
  padding: 1px 4px;
  margin: -1px -4px;
  transition: background-color 0.15s;
}

.copyable:hover {
  background-color: rgba(var(--v-theme-primary), 0.15);
}

.copyable:active {
  background-color: rgba(var(--v-theme-primary), 0.25);
}
</style>
