import { ref, computed, type Ref } from 'vue'
import type { Router } from 'vue-router'
import { useShoppingListStore } from '../stores/shoppingList'
import type { CargoHoldRow } from './useCargoHold'

interface CalculatorRow extends CargoHoldRow {
  id: number
}

export function useCalculatorImport(
  rows: Ref<CalculatorRow[]>,
  hasFilledRows: Ref<boolean>,
  nextRowId: { value: number },
  showSnackbar: (message: string, color?: 'success' | 'error' | 'info' | 'warning') => void,
  router: Router
) {
  const shoppingListStore = useShoppingListStore()

  // Dialog state
  const showPasteDialog = ref(false)
  const showListPickerDialog = ref(false)
  const showSaveDialog = ref(false)
  const showReplaceConfirm = ref(false)

  // Import source tracking for Save dialog pre-fill
  const importedListName = ref('')
  const importedListId = ref<number | null>(null)

  // Pending import (waiting for confirmation)
  const pendingImport = ref<Record<string, number> | null>(null)
  const pendingImportName = ref<string | undefined>()
  const pendingImportListId = ref<number | undefined>()

  const filledRowCount = computed(
    () => rows.value.filter(r => r.commodityTicker || (r.amount && r.amount > 0)).length
  )

  // Import handlers
  const handleImportFromPaste = (materials: Record<string, number>, name?: string) => {
    pendingImportName.value = name
    pendingImportListId.value = undefined
    beginImport(materials)
  }

  const handleImportFromList = (
    materials: Record<string, number>,
    name?: string,
    savedListId?: number
  ) => {
    pendingImportName.value = name
    pendingImportListId.value = savedListId
    beginImport(materials)
  }

  const beginImport = (materials: Record<string, number>) => {
    if (hasFilledRows.value) {
      pendingImport.value = materials
      showReplaceConfirm.value = true
    } else {
      applyImport(materials)
    }
  }

  const confirmImport = () => {
    showReplaceConfirm.value = false
    if (pendingImport.value) {
      applyImport(pendingImport.value)
      pendingImport.value = null
    }
  }

  const cancelImport = () => {
    showReplaceConfirm.value = false
    pendingImport.value = null
    pendingImportName.value = undefined
    pendingImportListId.value = undefined
  }

  const applyImport = (materials: Record<string, number>) => {
    const entries = Object.entries(materials)
    if (entries.length === 0) return

    const newRows: CalculatorRow[] = entries.map(([ticker, qty]) => ({
      id: nextRowId.value++,
      commodityTicker: ticker,
      amount: qty,
    }))
    newRows.push({ id: nextRowId.value++, commodityTicker: null, amount: null })
    rows.value = newRows

    importedListName.value = pendingImportName.value ?? ''
    importedListId.value = pendingImportListId.value ?? null
    pendingImportName.value = undefined
    pendingImportListId.value = undefined

    showSnackbar(`Imported ${entries.length} materials`)
  }

  // Collect materials from rows into a Record<string, number>
  const collectMaterials = (): Record<string, number> => {
    const materials: Record<string, number> = {}
    for (const row of rows.value) {
      if (row.commodityTicker && row.amount && row.amount > 0) {
        materials[row.commodityTicker] = (materials[row.commodityTicker] ?? 0) + row.amount
      }
    }
    return materials
  }

  // Generate a short deterministic hash from materials for auto-naming
  const materialsHash = (materials: Record<string, number>): string => {
    const sorted = Object.entries(materials)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, q]) => `${t}:${q}`)
      .join(',')
    // Simple djb2 hash -> 6 hex chars
    let hash = 5381
    for (let i = 0; i < sorted.length; i++) {
      hash = ((hash << 5) + hash + sorted.charCodeAt(i)) | 0
    }
    return (hash >>> 0).toString(16).padStart(6, '0').slice(-6)
  }

  // Save as shopping list
  const handleSaveAsList = async (name: string, notes?: string) => {
    const materials = collectMaterials()
    if (Object.keys(materials).length === 0) return

    shoppingListStore.setMaterials(materials, name)
    if (importedListId.value) {
      shoppingListStore.setSavedListId(importedListId.value)
    }
    const result = await shoppingListStore.saveList(name, notes)
    showSaveDialog.value = false

    if (result) {
      importedListName.value = name
      importedListId.value = result.id
      showSnackbar(importedListId.value ? `Updated "${name}"` : `Saved as "${name}"`)
    } else {
      showSnackbar('Failed to save list', 'error')
    }
  }

  // Send calculator contents to market as a shopping list
  const sendToMarket = () => {
    const materials = collectMaterials()
    if (Object.keys(materials).length === 0) return
    const hash = materialsHash(materials)
    const name = `Calculator List ${hash}`
    shoppingListStore.setMaterials(materials, name)
    router.push('/market')
  }

  // Clear import source tracking
  const clearImportSource = () => {
    importedListName.value = ''
    importedListId.value = null
  }

  return {
    showPasteDialog,
    showListPickerDialog,
    showSaveDialog,
    showReplaceConfirm,
    importedListName,
    importedListId,
    filledRowCount,
    handleImportFromPaste,
    handleImportFromList,
    confirmImport,
    cancelImport,
    handleSaveAsList,
    sendToMarket,
    clearImportSource,
  }
}
