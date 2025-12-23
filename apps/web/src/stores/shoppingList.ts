// Shopping List store for managing shopping list state across the application
import { ref, computed } from 'vue'
import { api } from '../services/api'
import type {
  SavedShoppingList,
  ShoppingListSummary,
  ShoppingListMaterials,
  WorkingShoppingList,
  CreateShoppingListRequest,
  UpdateShoppingListRequest,
} from '@kawakawa/types'

const STORAGE_KEY = 'kawakawa-shopping-list'

// Reactive state - module-level for persistence across component instances
const workingList = ref<WorkingShoppingList | null>(null)
const savedLists = ref<ShoppingListSummary[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

// Computed properties - module-level for consistent reactivity across components
const hasWorkingList = computed(() => workingList.value !== null)
const workingMaterials = computed(() => workingList.value?.materials ?? null)
const workingName = computed(() => workingList.value?.name)
const isDirty = computed(() => workingList.value?.isDirty ?? false)
const isFromSavedList = computed(() => workingList.value?.savedListId !== undefined)
const itemCount = computed(() => {
  if (!workingList.value) return 0
  return Object.keys(workingList.value.materials).length
})
const totalQuantity = computed(() => {
  if (!workingList.value) return 0
  return Object.values(workingList.value.materials).reduce((sum, qty) => sum + qty, 0)
})

// Load working list from localStorage on init
function loadFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      workingList.value = JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load shopping list from localStorage:', e)
    localStorage.removeItem(STORAGE_KEY)
  }
}

// Save working list to localStorage
function saveToStorage(): void {
  try {
    if (workingList.value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workingList.value))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch (e) {
    console.error('Failed to save shopping list to localStorage:', e)
  }
}

// Initialize from storage on module load
loadFromStorage()

export const useShoppingListStore = () => {
  // Set materials directly (from parser)
  const setMaterials = (materials: ShoppingListMaterials, name?: string): void => {
    workingList.value = {
      materials,
      name,
      isDirty: true,
    }
    saveToStorage()
  }

  // Clear the working list
  const clearList = (): void => {
    workingList.value = null
    saveToStorage()
  }

  // Load saved lists from server
  const loadSavedLists = async (): Promise<void> => {
    isLoading.value = true
    error.value = null
    try {
      savedLists.value = await api.lists.list()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load saved lists'
      console.error('Failed to load saved lists:', err)
    } finally {
      isLoading.value = false
    }
  }

  // Open a saved list (load into working list)
  const openList = async (id: number): Promise<SavedShoppingList | null> => {
    isLoading.value = true
    error.value = null
    try {
      const list = await api.lists.get(id)
      workingList.value = {
        materials: list.materials,
        name: list.name,
        savedListId: list.id,
        isDirty: false,
      }
      saveToStorage()
      return list
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load list'
      console.error('Failed to load list:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  // Save current working list to server
  const saveList = async (name: string, notes?: string): Promise<SavedShoppingList | null> => {
    if (!workingList.value || Object.keys(workingList.value.materials).length === 0) {
      error.value = 'No materials to save'
      return null
    }

    isLoading.value = true
    error.value = null

    try {
      let savedList: SavedShoppingList

      if (workingList.value.savedListId) {
        // Update existing
        const request: UpdateShoppingListRequest = {
          name,
          materials: workingList.value.materials,
          notes: notes ?? null,
        }
        savedList = await api.lists.update(workingList.value.savedListId, request)
      } else {
        // Create new
        const request: CreateShoppingListRequest = {
          name,
          materials: workingList.value.materials,
          notes,
        }
        savedList = await api.lists.create(request)
      }

      // Update working list with saved info
      workingList.value = {
        materials: savedList.materials,
        name: savedList.name,
        savedListId: savedList.id,
        isDirty: false,
      }
      saveToStorage()

      // Refresh saved lists
      await loadSavedLists()

      return savedList
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to save list'
      console.error('Failed to save list:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  // Delete a saved list
  const deleteList = async (id: number): Promise<boolean> => {
    isLoading.value = true
    error.value = null
    try {
      await api.lists.delete(id)

      // If we deleted the currently loaded list, clear it
      if (workingList.value?.savedListId === id) {
        clearList()
      }

      // Refresh saved lists
      await loadSavedLists()

      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete list'
      console.error('Failed to delete list:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // Mark as dirty when materials change
  const markDirty = (): void => {
    if (workingList.value) {
      workingList.value.isDirty = true
      saveToStorage()
    }
  }

  // Update materials in working list
  const updateMaterials = (materials: ShoppingListMaterials): void => {
    if (workingList.value) {
      workingList.value.materials = materials
      workingList.value.isDirty = true
      saveToStorage()
    }
  }

  // Get current materials (returns null if no working list)
  const getMaterials = (): ShoppingListMaterials | null => {
    return workingList.value?.materials ?? null
  }

  return {
    // State
    workingList,
    savedLists,
    isLoading,
    error,

    // Computed
    hasWorkingList,
    workingMaterials,
    workingName,
    isDirty,
    isFromSavedList,
    itemCount,
    totalQuantity,

    // Actions
    setMaterials,
    clearList,
    loadSavedLists,
    openList,
    saveList,
    deleteList,
    markDirty,
    updateMaterials,
    getMaterials,
  }
}
