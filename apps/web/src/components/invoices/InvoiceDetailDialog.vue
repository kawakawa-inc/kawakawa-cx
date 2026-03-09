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
          variant="flat"
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
        <!-- Contract Breakdown -->
        <ContractBreakdown
          v-if="invoice.lineItems.length > 0"
          :line-items="invoice.lineItems"
          :direction="invoice.direction"
        />

        <div v-else class="text-center pa-6 text-medium-emphasis">No items in this invoice</div>

        <!-- Net Position -->
        <template v-if="netTotals.length > 0">
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
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Invoice, Currency } from '@kawakawa/types'
import InvoiceStatusChip from './InvoiceStatusChip.vue'
import ContractBreakdown from './ContractBreakdown.vue'

const props = defineProps<{
  invoice: Invoice | null
}>()

defineEmits<{
  updated: []
}>()

const modelValue = defineModel<boolean>({ required: true })

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

// Net totals across all items
const netTotals = computed(() => {
  if (!props.invoice || props.invoice.lineItems.length === 0) return []

  const direction = props.invoice.direction
  const buyTotals = new Map<Currency, number>()
  const sellTotals = new Map<Currency, number>()

  for (const item of props.invoice.lineItems) {
    const isBuy = direction === 'sent' ? item.orderType === 'sell' : item.orderType === 'buy'

    const map = isBuy ? buyTotals : sellTotals
    map.set(item.currency, (map.get(item.currency) ?? 0) + item.totalValue)
  }

  const currencies = new Set<Currency>([...buyTotals.keys(), ...sellTotals.keys()])

  return Array.from(currencies).map(currency => ({
    currency,
    total: (sellTotals.get(currency) ?? 0) - (buyTotals.get(currency) ?? 0),
  }))
})
</script>
