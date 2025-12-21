// Invoices store for managing invoice state across the application
import { ref, computed } from 'vue'
import { api } from '../services/api'
import type {
  Invoice,
  InvoiceSummary,
  InvoiceLineItem,
  AddLineItemRequest,
  UpdateLineItemRequest,
  SubmitInvoiceResponse,
} from '@kawakawa/types'

// Reactive state - module-level for persistence across component instances
const draftInvoices = ref<InvoiceSummary[]>([])
const activeInvoiceId = ref<number | null>(null)
const activeInvoice = ref<Invoice | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

export const useInvoicesStore = () => {
  // Computed properties
  const hasActiveInvoice = computed(() => activeInvoiceId.value !== null)

  const activeCounterpartyUserId = computed(() => {
    return activeInvoice.value?.counterpartyUserId ?? null
  })

  const activeCounterpartyName = computed(() => {
    return activeInvoice.value?.counterpartyName ?? null
  })

  const invoiceCount = computed(() => draftInvoices.value.length)

  // Load all draft invoices for the current user
  const loadDraftInvoices = async (): Promise<void> => {
    isLoading.value = true
    error.value = null
    try {
      draftInvoices.value = await api.invoices.list('draft')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load invoices'
      console.error('Failed to load draft invoices:', err)
    } finally {
      isLoading.value = false
    }
  }

  // Get or create an invoice for a specific partner
  const getOrCreateForPartner = async (counterpartyUserId: number): Promise<Invoice | null> => {
    isLoading.value = true
    error.value = null
    try {
      const invoice = await api.invoices.getOrCreateForPartner(counterpartyUserId)
      // Update local state
      await loadDraftInvoices()
      return invoice
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to get or create invoice'
      console.error('Failed to get or create invoice for partner:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  // Load a specific invoice by ID
  const loadInvoice = async (id: number): Promise<Invoice | null> => {
    isLoading.value = true
    error.value = null
    try {
      const invoice = await api.invoices.get(id)
      activeInvoice.value = invoice
      activeInvoiceId.value = id
      return invoice
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load invoice'
      console.error('Failed to load invoice:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  // Set the active invoice (for tab switching)
  const setActiveInvoice = async (id: number | null): Promise<void> => {
    if (id === null) {
      activeInvoiceId.value = null
      activeInvoice.value = null
      return
    }

    // If it's already active, do nothing
    if (activeInvoiceId.value === id && activeInvoice.value) {
      return
    }

    await loadInvoice(id)
  }

  // Clear active invoice (return to "All" tab)
  const clearActiveInvoice = (): void => {
    activeInvoiceId.value = null
    activeInvoice.value = null
  }

  // Add a line item to an invoice
  const addLineItem = async (
    invoiceId: number,
    request: AddLineItemRequest
  ): Promise<InvoiceLineItem | null> => {
    error.value = null
    try {
      const lineItem = await api.invoices.addLineItem(invoiceId, request)
      // Reload the active invoice if this is it
      if (activeInvoiceId.value === invoiceId) {
        await loadInvoice(invoiceId)
      }
      // Reload draft list to update counts
      await loadDraftInvoices()
      return lineItem
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to add line item'
      console.error('Failed to add line item:', err)
      return null
    }
  }

  // Add to active invoice or create one for the partner
  const addToActiveOrCreate = async (
    counterpartyUserId: number,
    request: AddLineItemRequest
  ): Promise<InvoiceLineItem | null> => {
    // If we have an active invoice with this counterparty, add to it
    if (activeInvoice.value && activeInvoice.value.counterpartyUserId === counterpartyUserId) {
      return addLineItem(activeInvoice.value.id, request)
    }

    // Otherwise, get or create an invoice for this partner
    const invoice = await getOrCreateForPartner(counterpartyUserId)
    if (!invoice) {
      return null
    }

    // Add the line item
    const lineItem = await addLineItem(invoice.id, request)

    // Set as active invoice
    await setActiveInvoice(invoice.id)

    return lineItem
  }

  // Update a line item
  const updateLineItem = async (
    invoiceId: number,
    itemId: number,
    request: UpdateLineItemRequest
  ): Promise<InvoiceLineItem | null> => {
    error.value = null
    try {
      const lineItem = await api.invoices.updateLineItem(invoiceId, itemId, request)
      // Reload the active invoice if this is it
      if (activeInvoiceId.value === invoiceId) {
        await loadInvoice(invoiceId)
      }
      return lineItem
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update line item'
      console.error('Failed to update line item:', err)
      return null
    }
  }

  // Remove a line item
  const removeLineItem = async (invoiceId: number, itemId: number): Promise<boolean> => {
    error.value = null
    try {
      await api.invoices.removeLineItem(invoiceId, itemId)
      // Reload the active invoice if this is it
      if (activeInvoiceId.value === invoiceId) {
        await loadInvoice(invoiceId)
      }
      // Reload draft list to update counts
      await loadDraftInvoices()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to remove line item'
      console.error('Failed to remove line item:', err)
      return false
    }
  }

  // Submit an invoice
  const submitInvoice = async (id: number): Promise<SubmitInvoiceResponse | null> => {
    isLoading.value = true
    error.value = null
    try {
      const result = await api.invoices.submit(id)
      // Clear active invoice if this was it
      if (activeInvoiceId.value === id) {
        clearActiveInvoice()
      }
      // Reload draft list
      await loadDraftInvoices()
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to submit invoice'
      console.error('Failed to submit invoice:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  // Cancel an invoice
  const cancelInvoice = async (id: number): Promise<Invoice | null> => {
    isLoading.value = true
    error.value = null
    try {
      const invoice = await api.invoices.cancel(id)
      // Clear active invoice if this was it
      if (activeInvoiceId.value === id) {
        clearActiveInvoice()
      }
      // Reload draft list
      await loadDraftInvoices()
      return invoice
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to cancel invoice'
      console.error('Failed to cancel invoice:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  // Delete a draft invoice
  const deleteInvoice = async (id: number): Promise<boolean> => {
    isLoading.value = true
    error.value = null
    try {
      await api.invoices.delete(id)
      // Clear active invoice if this was it
      if (activeInvoiceId.value === id) {
        clearActiveInvoice()
      }
      // Reload draft list
      await loadDraftInvoices()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete invoice'
      console.error('Failed to delete invoice:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // Find draft invoice for a specific counterparty
  const findInvoiceForCounterparty = (counterpartyUserId: number): InvoiceSummary | undefined => {
    return draftInvoices.value.find(inv => inv.counterpartyUserId === counterpartyUserId)
  }

  // Check if there's a draft invoice for a counterparty
  const hasInvoiceForCounterparty = (counterpartyUserId: number): boolean => {
    return draftInvoices.value.some(inv => inv.counterpartyUserId === counterpartyUserId)
  }

  return {
    // State
    draftInvoices,
    activeInvoiceId,
    activeInvoice,
    isLoading,
    error,

    // Computed
    hasActiveInvoice,
    activeCounterpartyUserId,
    activeCounterpartyName,
    invoiceCount,

    // Actions
    loadDraftInvoices,
    getOrCreateForPartner,
    loadInvoice,
    setActiveInvoice,
    clearActiveInvoice,
    addLineItem,
    addToActiveOrCreate,
    updateLineItem,
    removeLineItem,
    submitInvoice,
    cancelInvoice,
    deleteInvoice,
    findInvoiceForCounterparty,
    hasInvoiceForCounterparty,
  }
}
