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
const loadingCount = ref(0)
const isLoading = computed(() => loadingCount.value > 0)
const error = ref<string | null>(null)

// Cache of loaded invoice details (keyed by invoice ID)
// Used to track line items across all loaded invoices for shopping list sync
const loadedInvoiceDetails = ref<Map<number, Invoice>>(new Map())

export const useInvoicesStore = () => {
  // Computed properties
  const hasActiveInvoice = computed(() => activeInvoiceId.value !== null)

  // Aggregate all line items from all loaded invoices (for shopping list sync)
  // Only counts draft invoices (submitted ones are not relevant for shopping list)
  const allClaimedQuantities = computed((): Record<string, number> => {
    const claimed: Record<string, number> = {}
    const draftIds = new Set(draftInvoices.value.map(inv => inv.id))

    for (const [invoiceId, invoice] of loadedInvoiceDetails.value) {
      // Only count if it's still a draft invoice
      if (!draftIds.has(invoiceId)) continue

      for (const item of invoice.lineItems) {
        // Only count items from sell orders (user is buying)
        if (item.orderType === 'sell') {
          claimed[item.commodityTicker] = (claimed[item.commodityTicker] ?? 0) + item.quantity
        }
      }
    }
    return claimed
  })

  const activeCounterpartyUserId = computed(() => {
    return activeInvoice.value?.counterpartyUserId ?? null
  })

  const activeCounterpartyName = computed(() => {
    return activeInvoice.value?.counterpartyName ?? null
  })

  const invoiceCount = computed(() => draftInvoices.value.length)

  // Load all draft invoices for the current user
  const loadDraftInvoices = async (): Promise<void> => {
    loadingCount.value++
    error.value = null
    try {
      draftInvoices.value = await api.invoices.list('draft')
      // Prune cache: remove entries that are no longer drafts
      const draftIds = new Set(draftInvoices.value.map(inv => inv.id))
      for (const cachedId of loadedInvoiceDetails.value.keys()) {
        if (!draftIds.has(cachedId)) {
          loadedInvoiceDetails.value.delete(cachedId)
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load invoices'
      console.error('Failed to load draft invoices:', err)
    } finally {
      loadingCount.value--
    }
  }

  // Get or create an invoice for a specific partner
  const getOrCreateForPartner = async (counterpartyUserId: number): Promise<Invoice | null> => {
    loadingCount.value++
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
      loadingCount.value--
    }
  }

  // Load a specific invoice by ID
  // If setActive is false, only caches the invoice for shopping list sync without setting it as active
  const loadInvoice = async (id: number, setActive = true): Promise<Invoice | null> => {
    loadingCount.value++
    error.value = null
    try {
      const invoice = await api.invoices.get(id)
      if (setActive) {
        activeInvoice.value = invoice
        activeInvoiceId.value = id
      }
      // Cache the invoice details for shopping list sync
      loadedInvoiceDetails.value.set(id, invoice)
      return invoice
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load invoice'
      console.error('Failed to load invoice:', err)
      return null
    } finally {
      loadingCount.value--
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

  // Clear all invoice state (for logout)
  const clearAll = (): void => {
    draftInvoices.value = []
    activeInvoiceId.value = null
    activeInvoice.value = null
    loadedInvoiceDetails.value.clear()
    loadingCount.value = 0
    error.value = null
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

  // Add to active invoice or get/create one for the partner
  const addToActiveOrCreate = async (
    counterpartyUserId: number,
    request: AddLineItemRequest
  ): Promise<InvoiceLineItem | null> => {
    // If we have an active invoice with this counterparty, add to it
    if (activeInvoice.value && activeInvoice.value.counterpartyUserId === counterpartyUserId) {
      return addLineItem(activeInvoice.value.id, request)
    }

    // Otherwise, get or create an invoice for this partner (one draft per counterparty)
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
    loadingCount.value++
    error.value = null
    try {
      const result = await api.invoices.submit(id)
      // Clear active invoice if this was it
      if (activeInvoiceId.value === id) {
        clearActiveInvoice()
      }
      // Remove from cache (no longer a draft)
      loadedInvoiceDetails.value.delete(id)
      // Reload draft list
      await loadDraftInvoices()
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to submit invoice'
      console.error('Failed to submit invoice:', err)
      return null
    } finally {
      loadingCount.value--
    }
  }

  // Cancel an invoice
  const cancelInvoice = async (id: number): Promise<Invoice | null> => {
    loadingCount.value++
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
      loadingCount.value--
    }
  }

  // Delete a draft invoice
  const deleteInvoice = async (id: number): Promise<boolean> => {
    loadingCount.value++
    error.value = null
    try {
      await api.invoices.delete(id)
      // Clear active invoice if this was it
      if (activeInvoiceId.value === id) {
        clearActiveInvoice()
      }
      // Remove from cache
      loadedInvoiceDetails.value.delete(id)
      // Reload draft list
      await loadDraftInvoices()
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete invoice'
      console.error('Failed to delete invoice:', err)
      return false
    } finally {
      loadingCount.value--
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

  // Check if a sell order is in any loaded draft invoice
  const isOrderInAnyDraftInvoice = (orderId: number, orderType: 'sell' | 'buy'): boolean => {
    const draftIds = new Set(draftInvoices.value.map(inv => inv.id))

    for (const [invoiceId, invoice] of loadedInvoiceDetails.value) {
      // Only check draft invoices
      if (!draftIds.has(invoiceId)) continue

      const found = invoice.lineItems.some(li =>
        orderType === 'sell' ? li.sellOrderId === orderId : li.buyOrderId === orderId
      )
      if (found) return true
    }
    return false
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
    allClaimedQuantities,

    // Actions
    loadDraftInvoices,
    getOrCreateForPartner,
    loadInvoice,
    setActiveInvoice,
    clearActiveInvoice,
    clearAll,
    addLineItem,
    addToActiveOrCreate,
    updateLineItem,
    removeLineItem,
    submitInvoice,
    cancelInvoice,
    deleteInvoice,
    findInvoiceForCounterparty,
    hasInvoiceForCounterparty,
    isOrderInAnyDraftInvoice,
  }
}
