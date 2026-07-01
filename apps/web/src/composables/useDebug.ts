import { ref, onUnmounted } from 'vue'
import { getSyncDebugInfo } from '../services/syncService'

export interface DebugSection {
  title: string
  data: Record<string, unknown>
}

// Module-level shared state — only one page registers at a time
const pageContextFn = ref<(() => Record<string, unknown>) | null>(null)
const pageTitle = ref('')

// Keys that should be redacted in the localStorage display
const SENSITIVE_KEYS = new Set(['jwt'])

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return (
    SENSITIVE_KEYS.has(lower) ||
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('credential') ||
    lower.includes('apikey') ||
    lower.includes('api_key')
  )
}

/**
 * Composable for the debug modal.
 *
 * Pages register context by calling `useDebug('Inventory', () => ({ ... }))`.
 * The context function is called fresh each time the modal opens.
 * Context is automatically cleared when the calling component unmounts.
 */
export function useDebug(label: string, contextFn?: () => Record<string, unknown>) {
  pageTitle.value = `${label} Context`
  pageContextFn.value = contextFn ?? null

  // Clear context when this component unmounts (navigation away)
  onUnmounted(() => {
    // Only clear if we're still the active registrant
    if (pageTitle.value === `${label} Context`) {
      pageContextFn.value = null
      pageTitle.value = ''
    }
  })

  return {
    /** Re-register the context function (useful if it changes) */
    refreshContext: () => {
      pageContextFn.value = contextFn ?? null
    },
  }
}

/** Get all debug sections for the modal (global + page) */
export function getDebugSections(): DebugSection[] {
  const sections: DebugSection[] = []

  // Sync state
  const sync = getSyncDebugInfo()
  sections.push({
    title: 'Sync Service',
    data: {
      'Poll interval': `${sync.pollIntervalMs / 1000}s`,
      'Last poll': sync.lastPollAt ?? 'never',
      'Last poll success': sync.lastPollSuccess,
      'Last poll error': sync.lastPollError ?? 'none',
      'Build version': sync.buildVersion,
      'App version': sync.currentSyncState?.appVersion ?? 'unknown',
      'Unread count': sync.currentSyncState?.unreadCount ?? 0,
    },
  })

  // Data versions
  if (sync.currentSyncState?.dataVersions) {
    sections.push({
      title: 'Data Versions',
      data: sync.currentSyncState.dataVersions,
    })
  }

  // Page context (call the function fresh each time)
  if (pageContextFn.value) {
    try {
      const ctx = pageContextFn.value()
      sections.push({
        title: pageTitle.value,
        data: ctx,
      })
    } catch (e) {
      sections.push({
        title: pageTitle.value,
        data: { error: String(e) },
      })
    }
  }

  // localStorage overview (with sensitive values redacted)
  const lsEntries: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        if (isSensitiveKey(key)) {
          lsEntries[key] = '[REDACTED]'
        } else {
          lsEntries[key] = localStorage.getItem(key) ?? ''
        }
      }
    }
  } catch {
    // localStorage may be unavailable
  }
  sections.push({
    title: 'localStorage',
    data: lsEntries,
  })

  return sections
}

export const debugState = {
  getSections: getDebugSections,
}
