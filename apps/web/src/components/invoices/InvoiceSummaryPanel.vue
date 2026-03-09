<template>
  <div class="invoice-panel-wrapper">
    <!-- Empty State when no invoices -->
    <div v-if="draftInvoices.length === 0" class="invoice-empty-state">
      <v-icon size="48" color="grey-darken-1" class="mb-3">mdi-file-document-outline</v-icon>
      <div class="text-body-1 text-grey-darken-1 mb-2">No Invoices</div>
      <div class="text-caption text-grey mb-4 text-center px-4">
        Click "+ Invoice" on market orders to create invoices
      </div>
      <v-btn color="primary" variant="tonal" size="small" @click="emit('add-invoice')">
        <v-icon start size="small">mdi-plus</v-icon>
        Invoice
      </v-btn>
    </div>

    <!-- Accordion of all draft invoices -->
    <div v-else class="invoice-accordion-container">
      <v-expansion-panels v-model="expandedPanels" multiple variant="accordion">
        <v-expansion-panel
          v-for="invoice in draftInvoices"
          :key="invoice.id"
          :value="invoice.id"
          class="invoice-panel"
        >
          <v-expansion-panel-title class="invoice-header">
            <div class="invoice-header-content">
              <div class="invoice-title">
                <span class="counterparty-name">{{ invoice.counterpartyName }}</span>
                <v-chip size="x-small" variant="tonal" class="ml-2">
                  {{ invoice.itemCount }} item{{ invoice.itemCount === 1 ? '' : 's' }}
                </v-chip>
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  class="ml-1 filter-btn"
                  title="Filter by this user"
                  @click.stop="emitFilterAdd(invoice.counterpartyName)"
                >
                  <v-icon size="small">mdi-filter-plus</v-icon>
                </v-btn>
              </div>
              <div class="invoice-totals">
                <template v-if="invoice.buyTotalsByCurrency.length > 0">
                  <span
                    v-for="total in invoice.buyTotalsByCurrency"
                    :key="`buy-${total.currency}`"
                    class="total-chip buy"
                  >
                    -{{ formatPrice(total.total, total.currency) }}
                  </span>
                </template>
                <template v-if="invoice.sellTotalsByCurrency.length > 0">
                  <span
                    v-for="total in invoice.sellTotalsByCurrency"
                    :key="`sell-${total.currency}`"
                    class="total-chip sell"
                  >
                    +{{ formatPrice(total.total, total.currency) }}
                  </span>
                </template>
              </div>
            </div>
          </v-expansion-panel-title>

          <v-expansion-panel-text class="invoice-content">
            <!-- Loading state while fetching line items -->
            <div v-if="loadingInvoiceId === invoice.id" class="text-center py-4">
              <v-progress-circular indeterminate size="24" />
            </div>

            <!-- Line items list -->
            <template v-else-if="expandedInvoices[invoice.id]">
              <div class="line-items-list">
                <div
                  v-for="item in expandedInvoices[invoice.id].lineItems"
                  :key="item.id"
                  class="line-item"
                >
                  <div class="line-item-left">
                    <v-chip
                      :color="item.orderType === 'sell' ? 'warning' : 'success'"
                      size="x-small"
                      variant="tonal"
                      class="order-type-chip"
                    >
                      {{ item.orderType === 'sell' ? 'BUY' : 'SELL' }}
                    </v-chip>
                    <span class="commodity">{{ item.commodityTicker }}</span>
                    <span class="quantity">x{{ item.quantity.toLocaleString() }}</span>
                  </div>
                  <div class="line-item-right">
                    <span class="price">{{ formatPrice(item.totalValue, item.currency) }}</span>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      color="error"
                      :loading="removingItemId === item.id"
                      @click.stop="removeItem(invoice.id, item.id)"
                    >
                      <v-icon size="small">mdi-close</v-icon>
                    </v-btn>
                  </div>
                </div>
              </div>

              <!-- Action buttons -->
              <div class="invoice-actions">
                <v-btn
                  color="primary"
                  variant="elevated"
                  size="small"
                  class="flex-grow-1"
                  :loading="submittingInvoiceId === invoice.id"
                  @click="openSubmitDialog(invoice)"
                >
                  <v-icon start size="small">mdi-send</v-icon>
                  Submit
                </v-btn>
                <v-btn
                  color="error"
                  variant="outlined"
                  size="small"
                  :loading="deletingInvoiceId === invoice.id"
                  @click="openDeleteDialog(invoice)"
                >
                  <v-icon size="small">mdi-delete</v-icon>
                </v-btn>
              </div>
            </template>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Panel Footer -->
      <div v-if="draftInvoices.length > 1" class="panel-footer">
        <v-btn
          variant="elevated"
          size="small"
          color="primary"
          :loading="submittingAll"
          @click="openSubmitAllDialog"
        >
          <v-icon start size="small">mdi-send</v-icon>
          Submit All
        </v-btn>
      </div>
    </div>

    <!-- Submit Confirmation Dialog -->
    <v-dialog v-model="submitDialog" max-width="450">
      <v-card v-if="submitInvoice">
        <v-card-title class="text-subtitle-1 d-flex align-center">
          <v-icon start color="primary" size="small">mdi-send</v-icon>
          Submit Invoice to {{ submitInvoice.counterpartyName }}?
        </v-card-title>

        <v-card-text class="py-3">
          <p class="text-body-2 mb-2">
            This will create {{ submitInvoice.itemCount }} reservation{{
              submitInvoice.itemCount === 1 ? '' : 's'
            }}
            for {{ submitInvoice.counterpartyName }} to confirm.
          </p>

          <div class="totals-summary">
            <template v-if="submitInvoice.buyTotalsByCurrency.length > 0">
              <div class="total-row">
                <span class="label">You pay:</span>
                <span
                  v-for="total in submitInvoice.buyTotalsByCurrency"
                  :key="`buy-${total.currency}`"
                  class="text-warning font-weight-medium"
                >
                  {{ formatPrice(total.total, total.currency) }}
                </span>
              </div>
            </template>
            <template v-if="submitInvoice.sellTotalsByCurrency.length > 0">
              <div class="total-row">
                <span class="label">You receive:</span>
                <span
                  v-for="total in submitInvoice.sellTotalsByCurrency"
                  :key="`sell-${total.currency}`"
                  class="text-success font-weight-medium"
                >
                  {{ formatPrice(total.total, total.currency) }}
                </span>
              </div>
            </template>
          </div>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" size="small" @click="submitDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            size="small"
            :loading="submittingInvoiceId === submitInvoice.id"
            @click="handleSubmit"
          >
            Submit
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card v-if="deleteInvoice">
        <v-card-title class="text-subtitle-1 d-flex align-center">
          <v-icon start color="error" size="small">mdi-delete</v-icon>
          Delete Invoice?
        </v-card-title>

        <v-card-text class="py-3">
          <p class="text-body-2">
            Are you sure you want to delete the invoice for
            <strong>{{ deleteInvoice.counterpartyName }}</strong
            >?
          </p>
          <p class="text-body-2 text-grey mt-2">
            This will remove {{ deleteInvoice.itemCount }} item{{
              deleteInvoice.itemCount === 1 ? '' : 's'
            }}
            from the invoice. This action cannot be undone.
          </p>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" size="small" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn
            color="error"
            variant="elevated"
            size="small"
            :loading="deletingInvoiceId === deleteInvoice.id"
            @click="handleDelete"
          >
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Submit All Confirmation Dialog -->
    <v-dialog v-model="submitAllDialog" max-width="450">
      <v-card>
        <v-card-title class="text-subtitle-1 d-flex align-center">
          <v-icon start color="primary" size="small">mdi-send</v-icon>
          Submit All Invoices?
        </v-card-title>

        <v-card-text class="py-3">
          <p class="text-body-2 mb-2">
            This will submit {{ draftInvoices.length }} invoice{{
              draftInvoices.length === 1 ? '' : 's'
            }}
            to their respective counterparties.
          </p>
          <p class="text-body-2 text-grey">
            Each counterparty will need to confirm their reservations.
          </p>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" size="small" @click="submitAllDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            size="small"
            :loading="submittingAll"
            @click="handleSubmitAll"
          >
            Submit All
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useInvoicesStore } from '../../stores/invoices'
import type { Currency, Invoice, InvoiceSummary } from '@kawakawa/types'

const emit = defineEmits<{
  'invoice-submitted': [invoiceId: number, invoicedQuantities: Record<string, number>]
  'all-invoices-submitted': [
    results: { invoiceId: number; counterpartyName: string }[],
    invoicedQuantities: Record<string, number>,
  ]
  'filter-add': [userName: string]
  'add-invoice': []
}>()

const invoicesStore = useInvoicesStore()
const { draftInvoices, loadDraftInvoices } = invoicesStore

// Load draft invoices and prefetch their details on mount
// Prefetching ensures allClaimedQuantities has complete data for shopping list sync
onMounted(async () => {
  await loadDraftInvoices()
  // Prefetch all invoice details in the background
  prefetchAllInvoices()
})

// Prefetch all invoice details (for shopping list sync)
// Uses setActive: false to avoid auto-expanding panels
const prefetchAllInvoices = async () => {
  for (const invoice of draftInvoices.value) {
    // Skip if already loaded
    if (expandedInvoices.value[invoice.id]) continue
    // Load in background without setting as active
    try {
      const details = await invoicesStore.loadInvoice(invoice.id, false)
      if (details) {
        expandedInvoices.value[invoice.id] = details
      }
    } catch {
      // Silently fail - user can still expand manually
    }
  }
}

// Watch for new draft invoices and prefetch them
watch(draftInvoices, newDrafts => {
  for (const invoice of newDrafts) {
    if (!expandedInvoices.value[invoice.id]) {
      // Prefetch in background without setting as active
      invoicesStore.loadInvoice(invoice.id, false).then(details => {
        if (details) {
          expandedInvoices.value[invoice.id] = details
        }
      })
    }
  }
})

// State
const expandedPanels = ref<number[]>([])
const expandedInvoices = ref<Record<number, Invoice>>({})
const loadingInvoiceId = ref<number | null>(null)
const removingItemId = ref<number | null>(null)
const submittingInvoiceId = ref<number | null>(null)
const deletingInvoiceId = ref<number | null>(null)
const submitDialog = ref(false)
const submitInvoice = ref<InvoiceSummary | null>(null)
const deleteDialog = ref(false)
const deleteInvoice = ref<InvoiceSummary | null>(null)
const submitAllDialog = ref(false)
const submittingAll = ref(false)

// Watch for panel expansion to load invoice details
watch(expandedPanels, async newPanels => {
  for (const invoiceId of newPanels) {
    if (!expandedInvoices.value[invoiceId]) {
      await loadInvoiceDetails(invoiceId)
    }
  }
})

// Watch for changes to the active invoice in the store
// This keeps our local cache in sync when items are added/removed via the store
watch(
  () => invoicesStore.activeInvoice.value,
  newActiveInvoice => {
    if (newActiveInvoice) {
      // Update the local cache with the new invoice data
      expandedInvoices.value[newActiveInvoice.id] = newActiveInvoice
      // Auto-expand the panel if not already expanded
      if (!expandedPanels.value.includes(newActiveInvoice.id)) {
        expandedPanels.value.push(newActiveInvoice.id)
      }
    }
  }
)

// Load full invoice details when expanded
const loadInvoiceDetails = async (invoiceId: number) => {
  loadingInvoiceId.value = invoiceId
  try {
    const invoice = await invoicesStore.loadInvoice(invoiceId)
    if (invoice) {
      expandedInvoices.value[invoiceId] = invoice
    }
  } finally {
    loadingInvoiceId.value = null
  }
}

// Format price
const formatPrice = (value: number, currency: Currency): string => {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${formatted} ${currency}`
}

// Remove line item
const removeItem = async (invoiceId: number, itemId: number) => {
  removingItemId.value = itemId
  try {
    await invoicesStore.removeLineItem(invoiceId, itemId)
    // Reload the invoice details
    await loadInvoiceDetails(invoiceId)
  } finally {
    removingItemId.value = null
  }
}

// Open submit dialog
const openSubmitDialog = (invoice: InvoiceSummary) => {
  submitInvoice.value = invoice
  submitDialog.value = true
}

// Handle submit
const handleSubmit = async () => {
  if (!submitInvoice.value) return

  const invoiceId = submitInvoice.value.id
  // Capture invoiced quantities before submission (for shopping list updates)
  // Only count sell orders (user is buying these commodities)
  const invoicedQuantities: Record<string, number> = {}
  const invoiceDetails = expandedInvoices.value[invoiceId]
  if (invoiceDetails) {
    for (const item of invoiceDetails.lineItems) {
      if (item.orderType === 'sell') {
        invoicedQuantities[item.commodityTicker] =
          (invoicedQuantities[item.commodityTicker] ?? 0) + item.quantity
      }
    }
  }

  submittingInvoiceId.value = invoiceId
  try {
    const result = await invoicesStore.submitInvoice(invoiceId)
    if (result) {
      emit('invoice-submitted', invoiceId, invoicedQuantities)
      // Remove from expanded cache
      delete expandedInvoices.value[invoiceId]
      // Remove from expanded panels
      expandedPanels.value = expandedPanels.value.filter(id => id !== invoiceId)
      submitDialog.value = false
    }
  } finally {
    submittingInvoiceId.value = null
  }
}

// Open delete dialog
const openDeleteDialog = (invoice: InvoiceSummary) => {
  deleteInvoice.value = invoice
  deleteDialog.value = true
}

// Handle delete
const handleDelete = async () => {
  if (!deleteInvoice.value) return

  deletingInvoiceId.value = deleteInvoice.value.id
  try {
    const result = await invoicesStore.deleteInvoice(deleteInvoice.value.id)
    if (result) {
      // Remove from expanded cache
      delete expandedInvoices.value[deleteInvoice.value.id]
      // Remove from expanded panels
      expandedPanels.value = expandedPanels.value.filter(id => id !== deleteInvoice.value?.id)
      deleteDialog.value = false
    }
  } finally {
    deletingInvoiceId.value = null
  }
}

// Open submit all dialog
const openSubmitAllDialog = () => {
  submitAllDialog.value = true
}

// Handle submit all
const handleSubmitAll = async () => {
  submittingAll.value = true
  try {
    const submitted: { invoiceId: number; counterpartyName: string }[] = []
    const allInvoicedQuantities: Record<string, number> = {}

    // Submit all invoices in sequence
    for (const invoice of draftInvoices.value) {
      // Capture invoiced quantities before submission
      const invoiceDetails = expandedInvoices.value[invoice.id]
      if (invoiceDetails) {
        for (const item of invoiceDetails.lineItems) {
          if (item.orderType === 'sell') {
            allInvoicedQuantities[item.commodityTicker] =
              (allInvoicedQuantities[item.commodityTicker] ?? 0) + item.quantity
          }
        }
      }

      const result = await invoicesStore.submitInvoice(invoice.id)
      if (result) {
        submitted.push({ invoiceId: invoice.id, counterpartyName: invoice.counterpartyName })
        // Remove from expanded cache
        delete expandedInvoices.value[invoice.id]
      }
    }
    // Clear expanded panels
    expandedPanels.value = []
    submitAllDialog.value = false

    if (submitted.length > 0) {
      emit('all-invoices-submitted', submitted, allInvoicedQuantities)
    }
  } finally {
    submittingAll.value = false
  }
}

// Emit filter add event
const emitFilterAdd = (userName: string) => {
  emit('filter-add', userName)
}
</script>

<style scoped>
.invoice-panel-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.invoice-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.invoice-accordion-container {
  flex: 1;
  overflow-y: auto;
}

.invoice-panel {
  background: transparent !important;
}

.invoice-header {
  padding: 8px 12px !important;
  min-height: 48px !important;
}

.invoice-header-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  overflow: hidden;
}

.invoice-title {
  display: flex;
  align-items: center;
  font-weight: 500;
  font-size: 13px;
}

.counterparty-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-btn {
  opacity: 0.5;
  transition: opacity 0.2s;
}

.filter-btn:hover {
  opacity: 1;
}

.invoice-totals {
  display: flex;
  gap: 8px;
  font-size: 11px;
}

.total-chip {
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 500;
}

.total-chip.buy {
  background: rgba(var(--v-theme-warning), 0.15);
  color: rgb(var(--v-theme-warning));
}

.total-chip.sell {
  background: rgba(var(--v-theme-success), 0.15);
  color: rgb(var(--v-theme-success));
}

.invoice-content {
  padding: 0 !important;
}

.invoice-content :deep(.v-expansion-panel-text__wrapper) {
  padding: 8px 12px;
}

.line-items-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.line-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
}

.line-item-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.order-type-chip {
  font-size: 10px !important;
  height: 18px !important;
}

.commodity {
  font-weight: 500;
}

.quantity {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.line-item-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.price {
  font-weight: 500;
}

.invoice-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.panel-footer {
  display: flex;
  justify-content: center;
  padding: 8px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.totals-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.total-row .label {
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
