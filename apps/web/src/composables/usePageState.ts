import { reactive, watch } from 'vue'

const STORAGE_PREFIX = 'kawakawa-page-state:'

/**
 * Persist and restore page-level UI state via localStorage.
 *
 * Usage:
 *   const { state, reset } = usePageState('supply', {
 *     activeTab: 'planet',
 *     expandedSources: [] as string[],
 *   })
 *
 * - `state` is reactive — read/write fields directly.
 * - Auto-saves to localStorage on change (debounced 300ms).
 * - On mount, merges stored values over defaults (forward-compatible).
 * - `reset()` restores defaults and clears storage.
 */
export function usePageState<T extends Record<string, unknown>>(pageKey: string, defaults: T) {
  const storageKey = STORAGE_PREFIX + pageKey

  // Deep-clone defaults so the original object isn't mutated
  const cloneDefaults = (): T => JSON.parse(JSON.stringify(defaults))

  // Load from localStorage, merge with defaults
  function load(): T {
    const base = cloneDefaults()
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const stored = JSON.parse(raw)
        if (stored && typeof stored === 'object') {
          // Only merge keys that exist in defaults (ignore stale keys)
          for (const key of Object.keys(base)) {
            if (key in stored) {
              ;(base as Record<string, unknown>)[key] = stored[key]
            }
          }
        }
      }
    } catch {
      localStorage.removeItem(storageKey)
    }
    return base
  }

  const state = reactive(load()) as T

  // Debounced save
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => ({ ...state }),
    () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(state))
        } catch {
          // Storage full or unavailable — silently ignore
        }
      }, 300)
    },
    { deep: true }
  )

  // Reset to defaults
  function reset() {
    const fresh = cloneDefaults()
    for (const key of Object.keys(fresh)) {
      ;(state as Record<string, unknown>)[key] = (fresh as Record<string, unknown>)[key]
    }
    localStorage.removeItem(storageKey)
  }

  return { state, reset }
}
