<template>
  <div class="invoice-tabs-bar">
    <v-tabs
      :model-value="activeInvoiceId ?? 'all'"
      density="compact"
      show-arrows
      class="invoice-tabs"
    >
      <!-- All Tab -->
      <v-tab value="all" @click="onAllClick"> All </v-tab>

      <!-- Invoice Tabs -->
      <v-tab
        v-for="invoice in draftInvoices"
        :key="invoice.id"
        :value="invoice.id"
        class="invoice-tab"
        @click="onInvoiceClick(invoice.id)"
      >
        <v-icon size="small" class="mr-1">mdi-file-document-outline</v-icon>
        {{ invoice.counterpartyName }}
        <v-badge
          v-if="invoice.itemCount > 0"
          :content="invoice.itemCount"
          color="secondary"
          inline
          class="ml-1"
        />
        <v-btn
          icon
          size="x-small"
          variant="text"
          class="ml-1 close-btn"
          @click.stop="onCloseClick(invoice)"
        >
          <v-icon size="small">mdi-close</v-icon>
        </v-btn>
      </v-tab>

      <!-- + Invoice Tab -->
      <v-tab
        v-if="showCreateButton"
        value="create"
        class="create-tab"
        @click.prevent="onCreateClick"
      >
        <v-icon size="small" class="mr-1">mdi-plus</v-icon>
        Invoice
      </v-tab>
    </v-tabs>

    <!-- Actions aligned right -->
    <div class="d-flex align-center ml-2">
      <!-- Close All Button (submit all draft invoices) -->
      <v-btn
        v-if="draftInvoices.length > 0"
        size="small"
        variant="tonal"
        color="success"
        prepend-icon="mdi-send-check"
        :loading="closingAll"
        @click="onCloseAllClick"
      >
        Close All ({{ draftInvoices.length }})
      </v-btn>

      <!-- Loading indicator -->
      <v-progress-circular
        v-if="isLoading"
        indeterminate
        size="20"
        width="2"
        color="primary"
        class="ml-2"
      />
    </div>

    <!-- Delete Invoice Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6"> Delete Invoice? </v-card-title>
        <v-card-text>
          Are you sure you want to delete the invoice with
          <strong>{{ deletingInvoice?.counterpartyName }}</strong
          >?
          <template v-if="deletingInvoice && deletingInvoice.itemCount > 0">
            <br /><br />
            This invoice has <strong>{{ deletingInvoice.itemCount }}</strong> items that will be
            removed.
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="elevated" :loading="deleting" @click="confirmDelete">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Create Invoice Dialog -->
    <v-dialog v-model="createDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6"> Create New Invoice </v-card-title>
        <v-card-text>
          <v-autocomplete
            v-model="selectedPartnerId"
            :items="availablePartners"
            item-title="displayName"
            item-value="id"
            label="Trading Partner"
            placeholder="Select a trading partner"
            :loading="loadingPartners"
            hide-details
            autofocus
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="createDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            :disabled="!selectedPartnerId"
            :loading="creating"
            @click="confirmCreate"
          >
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Close All Confirmation Dialog -->
    <v-dialog v-model="closeAllDialog" max-width="450">
      <v-card>
        <v-card-title class="text-h6"> Submit All Invoices? </v-card-title>
        <v-card-text>
          <p>
            Are you sure you want to submit all <strong>{{ draftInvoices.length }}</strong> draft
            invoices?
          </p>
          <p class="text-medium-emphasis mt-2">
            This will create reservations for each line item and notify the trading partners.
          </p>
          <v-list density="compact" class="mt-2">
            <v-list-item v-for="inv in draftInvoices" :key="inv.id" class="px-0">
              <template #prepend>
                <v-icon size="small" color="primary">mdi-file-document-outline</v-icon>
              </template>
              <v-list-item-title>{{ inv.counterpartyName }}</v-list-item-title>
              <v-list-item-subtitle>{{ inv.itemCount }} items</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeAllDialog = false">Cancel</v-btn>
          <v-btn color="success" variant="elevated" :loading="closingAll" @click="confirmCloseAll">
            Submit All
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useInvoicesStore } from '../../stores/invoices'
import type { InvoiceSummary } from '@kawakawa/types'

interface Partner {
  id: number
  displayName: string
}

const props = defineProps<{
  partners?: Partner[]
  showCreateButton?: boolean
}>()

const emit = defineEmits<{
  'invoice-selected': [invoiceId: number | null]
  'invoice-deleted': [invoiceId: number]
  'all-invoices-submitted': []
}>()

const invoicesStore = useInvoicesStore()
const { draftInvoices, activeInvoiceId, isLoading } = invoicesStore

// Delete dialog state
const deleteDialog = ref(false)
const deletingInvoice = ref<InvoiceSummary | null>(null)
const deleting = ref(false)

// Create dialog state
const createDialog = ref(false)
const selectedPartnerId = ref<number | null>(null)
const loadingPartners = ref(false)
const creating = ref(false)

// Close all dialog state
const closeAllDialog = ref(false)
const closingAll = ref(false)

// Compute available partners (exclude those with existing draft invoices)
const availablePartners = computed(() => {
  const existingCounterpartyIds = new Set(draftInvoices.value.map(inv => inv.counterpartyUserId))
  return (props.partners ?? []).filter(p => !existingCounterpartyIds.has(p.id))
})

// Load invoices on mount
onMounted(async () => {
  await invoicesStore.loadDraftInvoices()
})

const onAllClick = () => {
  invoicesStore.clearActiveInvoice()
  emit('invoice-selected', null)
}

const onInvoiceClick = async (invoiceId: number) => {
  await invoicesStore.setActiveInvoice(invoiceId)
  emit('invoice-selected', invoiceId)
}

const onCloseClick = (invoice: InvoiceSummary) => {
  deletingInvoice.value = invoice
  deleteDialog.value = true
}

const confirmDelete = async () => {
  if (!deletingInvoice.value) return

  deleting.value = true
  try {
    const invoiceId = deletingInvoice.value.id
    const success = await invoicesStore.deleteInvoice(invoiceId)
    if (success) {
      emit('invoice-deleted', invoiceId)
    }
    deleteDialog.value = false
    deletingInvoice.value = null
  } finally {
    deleting.value = false
  }
}

const onCreateClick = () => {
  selectedPartnerId.value = null
  createDialog.value = true
}

const confirmCreate = async () => {
  if (!selectedPartnerId.value) return

  creating.value = true
  try {
    const invoice = await invoicesStore.getOrCreateForPartner(selectedPartnerId.value)
    if (invoice) {
      await invoicesStore.setActiveInvoice(invoice.id)
      emit('invoice-selected', invoice.id)
    }
    createDialog.value = false
    selectedPartnerId.value = null
  } finally {
    creating.value = false
  }
}

const onCloseAllClick = () => {
  closeAllDialog.value = true
}

const confirmCloseAll = async () => {
  closingAll.value = true
  try {
    // Submit all draft invoices sequentially
    for (const invoice of draftInvoices.value) {
      await invoicesStore.submitInvoice(invoice.id)
    }
    closeAllDialog.value = false
    // Clear the active invoice since they're all submitted now
    invoicesStore.clearActiveInvoice()
    emit('all-invoices-submitted')
    emit('invoice-selected', null)
  } finally {
    closingAll.value = false
  }
}
</script>

<style scoped>
.invoice-tabs-bar {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin-bottom: 16px;
}

.invoice-tabs {
  flex: 1;
}

.invoice-tab .close-btn {
  opacity: 0.6;
  margin-left: 4px;
}

.invoice-tab .close-btn:hover {
  opacity: 1;
}

.create-tab {
  color: rgb(var(--v-theme-primary));
}
</style>
