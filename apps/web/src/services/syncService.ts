// Sync service - handles polling for sync state and cache invalidation

import { ref } from 'vue'
import type { SyncState, DataVersions, SyncDataKey } from '@kawakawa/types'
import { locationService } from './locationService'
import { commodityService } from './commodityService'
import { authenticatedFetch } from './api'

// Polling interval (60 seconds)
export const POLL_INTERVAL = 60 * 1000

// App version baked in at build time (commit SHA)
// This allows reliable version comparison without storage
const BUILD_VERSION = __APP_VERSION__

// Current sync state
let currentSyncState: SyncState | null = null
let pollIntervalId: ReturnType<typeof setInterval> | null = null
let isPolling = false
let versionMismatchNotified = false
let lastPollAt: string | null = null
let lastPollSuccess: boolean | null = null
let lastPollError: string | null = null

/**
 * Reactive poll health — components can watch this to surface connection
 * issues. `lastSuccessAt` is epoch ms of the last successful poll;
 * `lastFailed` is true when the most recent poll attempt failed.
 */
export const pollHealth = ref<{ lastSuccessAt: number | null; lastFailed: boolean }>({
  lastSuccessAt: null,
  lastFailed: false,
})

// Whether a manually-triggered retry is currently in flight
export const retrying = ref(false)

// Debounce window for manual retries — ignore clicks within this window
const RETRY_DEBOUNCE_MS = 5 * 1000
let lastManualRetryAt = 0

// Event names
export const SYNC_EVENTS = {
  UNREAD_COUNT_CHANGED: 'sync:unread-count-changed',
  DATA_UPDATED: 'sync:data-updated',
  APP_VERSION_CHANGED: 'sync:app-version-changed',
} as const

// Fetch sync state from API
async function fetchSyncState(): Promise<SyncState | null> {
  try {
    // Goes through the shared wrapper so this poll gets the same refreshed-token
    // handling and centralized 401 reporting as every other call. The wrapper
    // throws on 401 after notifying App.vue, which stops polling as part of
    // tearing the session down — so this must not call stopPolling() itself.
    const response = await authenticatedFetch('/api/sync/state')

    if (!response.ok) {
      throw new Error(`Failed to fetch sync state: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch sync state:', error)
    return null
  }
}

// Process sync state and handle version changes
async function processSyncState(newState: SyncState): Promise<void> {
  const oldState = currentSyncState

  // Check for unread count changes
  if (!oldState || newState.unreadCount !== oldState.unreadCount) {
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENTS.UNREAD_COUNT_CHANGED, {
        detail: {
          count: newState.unreadCount,
          previousCount: oldState?.unreadCount ?? 0,
        },
      })
    )
  }

  // Check for app version mismatch - compare API version against build version
  // In dev mode, BUILD_VERSION is 'dev' so we skip the check
  if (
    BUILD_VERSION !== 'dev' &&
    newState.appVersion !== BUILD_VERSION &&
    !versionMismatchNotified
  ) {
    versionMismatchNotified = true
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENTS.APP_VERSION_CHANGED, {
        detail: {
          newVersion: newState.appVersion,
          oldVersion: BUILD_VERSION,
        },
      })
    )
  }

  // Check for data version changes and invalidate caches
  const updatedKeys: SyncDataKey[] = []

  for (const key of Object.keys(newState.dataVersions) as SyncDataKey[]) {
    const newVersion = newState.dataVersions[key]
    const oldVersion = oldState?.dataVersions?.[key]

    if (newVersion && (!oldVersion || newVersion > oldVersion)) {
      updatedKeys.push(key)

      // Invalidate the appropriate cache
      switch (key) {
        case 'locations':
          locationService.clearCache()
          // Prefetch new data
          locationService.prefetch()
          break
        case 'commodities':
          commodityService.clearCache()
          // Prefetch new data
          commodityService.prefetch()
          break
        case 'priceLists':
          // Price lists cache will be added later
          break
        case 'globalDefaults':
          // Global defaults affect user settings - could reload settings store
          break
      }
    }
  }

  // Emit data updated event if any data changed
  if (updatedKeys.length > 0) {
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENTS.DATA_UPDATED, {
        detail: { updatedKeys },
      })
    )
  }

  // Update current state
  currentSyncState = newState
}

// Poll for sync state
async function poll(): Promise<void> {
  if (isPolling) return
  isPolling = true

  try {
    const newState = await fetchSyncState()
    lastPollAt = new Date().toISOString()
    if (newState) {
      lastPollSuccess = true
      lastPollError = null
      pollHealth.value = { lastSuccessAt: Date.now(), lastFailed: false }
      await processSyncState(newState)
    } else {
      lastPollSuccess = false
      pollHealth.value = { ...pollHealth.value, lastFailed: true }
    }
  } catch (error) {
    lastPollAt = new Date().toISOString()
    lastPollSuccess = false
    lastPollError = error instanceof Error ? error.message : String(error)
    pollHealth.value = { ...pollHealth.value, lastFailed: true }
  } finally {
    isPolling = false
  }
}

/**
 * Manually retry the sync poll (e.g. from a "Connection issue" chip).
 * Debounced — clicks within RETRY_DEBOUNCE_MS of the last manual retry are
 * ignored, and concurrent calls are naturally guarded by poll()'s own
 * isPolling check, so spamming this can't pile up requests.
 */
export function retryPoll(): void {
  const now = Date.now()
  if (now - lastManualRetryAt < RETRY_DEBOUNCE_MS) return
  lastManualRetryAt = now

  retrying.value = true
  poll().finally(() => {
    retrying.value = false
  })
}

// Start polling
export function startPolling(): void {
  if (pollIntervalId) return // Already polling

  // Immediately poll once
  poll()

  // Then poll at regular intervals
  pollIntervalId = setInterval(poll, POLL_INTERVAL)
}

// Stop polling
export function stopPolling(): void {
  if (pollIntervalId) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
}

// Get current sync state
export function getSyncState(): SyncState | null {
  return currentSyncState
}

// Get current unread count
export function getUnreadCount(): number {
  return currentSyncState?.unreadCount ?? 0
}

// Get current data versions
export function getDataVersions(): DataVersions {
  return currentSyncState?.dataVersions ?? {}
}

// Check if app has been updated
export function hasAppUpdate(): boolean {
  return BUILD_VERSION !== 'dev' && currentSyncState?.appVersion !== BUILD_VERSION
}

// Get the build version
export function getBuildVersion(): string {
  return BUILD_VERSION
}

// Force refresh sync state (useful after login)
export async function refreshSyncState(): Promise<SyncState | null> {
  const state = await fetchSyncState()
  if (state) {
    currentSyncState = state
  }
  return state
}

// Debug info for the debug modal
export function getSyncDebugInfo() {
  return {
    isPolling,
    pollIntervalMs: POLL_INTERVAL,
    lastPollAt,
    lastPollSuccess,
    lastPollError,
    buildVersion: BUILD_VERSION,
    currentSyncState: currentSyncState
      ? {
          unreadCount: currentSyncState.unreadCount,
          appVersion: currentSyncState.appVersion,
          dataVersions: { ...currentSyncState.dataVersions },
        }
      : null,
  }
}

export const syncService = {
  startPolling,
  stopPolling,
  getSyncState,
  getUnreadCount,
  getDataVersions,
  hasAppUpdate,
  getBuildVersion,
  refreshSyncState,
  getSyncDebugInfo,
  retryPoll,
  EVENTS: SYNC_EVENTS,
}
