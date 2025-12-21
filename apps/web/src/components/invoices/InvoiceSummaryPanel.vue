<template>
  <v-card v-if="activeInvoice" class="invoice-panel">
    <v-card-title class="d-flex align-center">
      <v-icon start>mdi-file-document-outline</v-icon>
      Invoice: {{ activeInvoice.counterpartyName }}
      <v-spacer />
      <v-chip v-if="activeInvoice.status === 'draft'" color="warning" size="small" variant="tonal">
        Draft
      </v-chip>
      <v-chip
        v-else-if="activeInvoice.status === 'submitted'"
        color="info"
        size="small"
        variant="tonal"
      >
        Submitted
      </v-chip>
    </v-card-title>

    <v-divider />

    <v-card-text class="pa-0">
      <!-- Empty state -->
      <div
        v-if="activeInvoice.lineItems.length === 0"
        class="text-center pa-4 text-medium-emphasis"
      >
        <v-icon size="48" class="mb-2">mdi-cart-outline</v-icon>
        <div>No items in this invoice yet.</div>
        <div class="text-caption">Click on orders in the market to add them.</div>
      </div>

      <!-- Line items list -->
      <v-list v-else density="compact" class="py-0">
        <template v-for="(item, index) in activeInvoice.lineItems" :key="item.id">
          <v-list-item class="line-item">
            <template #prepend>
              <v-chip
                :color="item.orderType === 'buy' ? 'success' : 'warning'"
                size="x-small"
                variant="tonal"
                class="mr-2"
              >
                {{ item.orderType === 'buy' ? 'BUY' : 'SELL' }}
              </v-chip>
            </template>

            <v-list-item-title class="d-flex align-center">
              <span class="font-weight-medium">{{ item.commodityTicker }}</span>
              <span class="text-medium-emphasis mx-1">x</span>
              <span>{{ item.quantity.toLocaleString() }}</span>
            </v-list-item-title>

            <v-list-item-subtitle class="d-flex align-center">
              <span>{{ formatPrice(item.unitPrice, item.currency) }}/u</span>
              <v-icon size="x-small" class="mx-1">mdi-arrow-right</v-icon>
              <span class="font-weight-medium">{{
                formatPrice(item.totalValue, item.currency)
              }}</span>
            </v-list-item-subtitle>

            <template #append>
              <v-btn
                icon="mdi-close"
                size="x-small"
                variant="text"
                color="error"
                :loading="removingItemId === item.id"
                @click="removeItem(item.id)"
              >
                <v-icon size="small">mdi-close</v-icon>
                <v-tooltip activator="parent" location="left">Remove item</v-tooltip>
              </v-btn>
            </template>
          </v-list-item>

          <v-divider v-if="index < activeInvoice.lineItems.length - 1" />
        </template>
      </v-list>
    </v-card-text>

    <!-- Totals section -->
    <template v-if="activeInvoice.lineItems.length > 0">
      <v-divider />

      <v-card-text class="py-2">
        <div class="text-subtitle-2 mb-2">Totals</div>
        <div
          v-for="total in activeInvoice.totalsByCurrency"
          :key="total.currency"
          class="d-flex justify-space-between"
        >
          <span class="text-medium-emphasis">{{ total.currency }}:</span>
          <span class="font-weight-medium">{{ formatPrice(total.total, total.currency) }}</span>
        </div>
        <div class="d-flex justify-space-between text-medium-emphasis mt-1">
          <span>Items:</span>
          <span>{{ activeInvoice.lineItems.length }}</span>
        </div>
      </v-card-text>
    </template>

    <!-- Actions -->
    <template v-if="activeInvoice.status === 'draft' && activeInvoice.lineItems.length > 0">
      <v-divider />

      <v-card-actions>
        <v-btn
          color="primary"
          variant="elevated"
          block
          :loading="submitting"
          @click="submitDialog = true"
        >
          <v-icon start>mdi-send</v-icon>
          Submit Invoice
        </v-btn>
      </v-card-actions>
    </template>

    <!-- Submit Confirmation Dialog -->
    <v-dialog v-model="submitDialog" max-width="500">
      <v-card>
        <v-card-title class="text-h6">
          <v-icon start color="primary">mdi-send</v-icon>
          Submit Invoice?
        </v-card-title>

        <v-card-text>
          <p>
            You are about to submit this invoice to
            <strong>{{ activeInvoice.counterpartyName }}</strong
            >.
          </p>
          <p class="mt-2">
            This will create <strong>{{ activeInvoice.lineItems.length }}</strong> reservation{{
              activeInvoice.lineItems.length === 1 ? '' : 's'
            }}
            for {{ activeInvoice.counterpartyName }} to confirm.
          </p>

          <v-alert
            v-if="buyItems.length > 0 && sellItems.length > 0"
            type="info"
            variant="tonal"
            class="mt-3"
          >
            <strong>Mixed Invoice:</strong> This invoice contains both buy and sell orders.
            <ul class="mt-1 mb-0">
              <li>
                {{ buyItems.length }} item{{ buyItems.length === 1 ? '' : 's' }} you're buying FROM
                {{ activeInvoice.counterpartyName }}
              </li>
              <li>
                {{ sellItems.length }} item{{ sellItems.length === 1 ? '' : 's' }} you're selling TO
                {{ activeInvoice.counterpartyName }}
              </li>
            </ul>
          </v-alert>

          <div class="mt-3">
            <div
              v-for="total in activeInvoice.totalsByCurrency"
              :key="total.currency"
              class="d-flex justify-space-between"
            >
              <span>Total ({{ total.currency }}):</span>
              <strong>{{ formatPrice(total.total, total.currency) }}</strong>
            </div>
          </div>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="submitDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="elevated" :loading="submitting" @click="handleSubmit">
            Submit Invoice
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useInvoicesStore } from '../../stores/invoices'
import type { Currency } from '@kawakawa/types'

const emit = defineEmits<{
  'invoice-submitted': [invoiceId: number]
}>()

const invoicesStore = useInvoicesStore()
const { activeInvoice } = invoicesStore

// Local state
const submitDialog = ref(false)
const submitting = ref(false)
const removingItemId = ref<number | null>(null)

// Computed
const buyItems = computed(
  () => activeInvoice.value?.lineItems.filter(item => item.orderType === 'buy') ?? []
)

const sellItems = computed(
  () => activeInvoice.value?.lineItems.filter(item => item.orderType === 'sell') ?? []
)

// Methods
const formatPrice = (value: number, currency: Currency): string => {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${formatted} ${currency}`
}

const removeItem = async (itemId: number) => {
  if (!activeInvoice.value) return

  removingItemId.value = itemId
  try {
    await invoicesStore.removeLineItem(activeInvoice.value.id, itemId)
  } finally {
    removingItemId.value = null
  }
}

const handleSubmit = async () => {
  if (!activeInvoice.value) return

  submitting.value = true
  try {
    const result = await invoicesStore.submitInvoice(activeInvoice.value.id)
    if (result) {
      emit('invoice-submitted', activeInvoice.value.id)
      submitDialog.value = false
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.invoice-panel {
  max-height: 100%;
  display: flex;
  flex-direction: column;
}

.invoice-panel .v-card-text {
  flex: 1;
  overflow-y: auto;
}

.line-item {
  min-height: 56px;
}
</style>
