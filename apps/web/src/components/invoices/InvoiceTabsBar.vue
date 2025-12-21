<template>
  <v-card class="mb-4">
    <v-card-text class="py-2">
      <div class="d-flex align-center flex-wrap ga-2">
        <!-- All Tab -->
        <v-chip
          :color="!activeInvoiceId ? 'primary' : 'default'"
          :variant="!activeInvoiceId ? 'elevated' : 'outlined'"
          @click="onAllClick"
        >
          All Orders
        </v-chip>

        <!-- Invoice Tabs -->
        <v-chip
          v-for="invoice in draftInvoices"
          :key="invoice.id"
          :color="activeInvoiceId === invoice.id ? 'primary' : 'default'"
          :variant="activeInvoiceId === invoice.id ? 'elevated' : 'outlined'"
          closable
          @click="onInvoiceClick(invoice.id)"
          @click:close.stop="onCloseClick(invoice)"
        >
          <template #prepend>
            <v-icon size="small" class="mr-1">mdi-file-document-outline</v-icon>
          </template>
          {{ invoice.counterpartyName }}
          <template #append>
            <v-badge
              v-if="invoice.itemCount > 0"
              :content="invoice.itemCount"
              color="secondary"
              inline
              class="ml-1"
            />
          </template>
        </v-chip>

        <!-- Create New Invoice Button -->
        <v-btn
          v-if="showCreateButton"
          icon
          size="x-small"
          variant="outlined"
          @click="onCreateClick"
        >
          <v-icon size="small">mdi-plus</v-icon>
          <v-tooltip activator="parent" location="top"> Create new invoice </v-tooltip>
        </v-btn>

        <v-spacer />

        <!-- Loading indicator -->
        <v-progress-circular v-if="isLoading" indeterminate size="20" width="2" color="primary" />
      </div>
    </v-card-text>

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
  </v-card>
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
</script>

<style scoped>
.ga-2 {
  gap: 8px;
}
</style>
