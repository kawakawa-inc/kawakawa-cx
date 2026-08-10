import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { SyncState, FioSyncError } from '@kawakawa/types'

// The sync poll goes through the shared authenticated wrapper; stub it so
// these tests exercise state handling rather than HTTP.
const authenticatedFetch = vi.fn()
vi.mock('./api', () => ({
  authenticatedFetch: (...args: unknown[]) => authenticatedFetch(...args),
}))
vi.mock('./locationService', () => ({
  locationService: { clearCache: vi.fn(), prefetch: vi.fn() },
}))
vi.mock('./commodityService', () => ({
  commodityService: { clearCache: vi.fn(), prefetch: vi.fn() },
}))

const INVALID_KEY_ERROR: FioSyncError = {
  code: 'invalid_credentials',
  title: 'FIO rejected your API key',
  detail: 'Issue a new key and save it in Account → FIO.',
  userActionable: true,
  jobType: 'user-inventory',
  rawMessage: 'FIO API request failed (HTTP 401): no details',
  failedAt: '2026-03-04T05:06:07.000Z',
}

function stateWith(fioError: FioSyncError | null): SyncState {
  return { unreadCount: 0, appVersion: 'dev', dataVersions: {}, fioError }
}

function respondWith(state: SyncState) {
  authenticatedFetch.mockResolvedValue({ ok: true, json: async () => state })
}

describe('syncService FIO error state', () => {
  let syncService: typeof import('./syncService')
  let events: Array<{ error: FioSyncError | null; previousCode: string | null }>
  let listener: EventListener

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    // Fresh module instance per test — the FIO error is module-level state.
    syncService = await import('./syncService')

    events = []
    listener = (e: Event) => {
      events.push((e as CustomEvent).detail)
    }
    window.addEventListener(syncService.SYNC_EVENTS.FIO_ERROR_CHANGED, listener)
  })

  afterEach(() => {
    window.removeEventListener(syncService.SYNC_EVENTS.FIO_ERROR_CHANGED, listener)
  })

  it('starts with no error', () => {
    expect(syncService.fioError.value).toBeNull()
  })

  it('publishes a FIO error from the poll and fires an event', async () => {
    respondWith(stateWith(INVALID_KEY_ERROR))

    await syncService.refreshSyncState()

    expect(syncService.fioError.value?.code).toBe('invalid_credentials')
    expect(events).toHaveLength(1)
    expect(events[0].previousCode).toBeNull()
  })

  it('does not re-fire the event while the same error persists', async () => {
    // Otherwise a member with a revoked key gets a toast every 60 seconds.
    respondWith(stateWith(INVALID_KEY_ERROR))
    await syncService.refreshSyncState()
    await syncService.refreshSyncState()
    await syncService.refreshSyncState()

    expect(events).toHaveLength(1)
  })

  it('clears the error and fires once when a later sync succeeds', async () => {
    respondWith(stateWith(INVALID_KEY_ERROR))
    await syncService.refreshSyncState()

    respondWith(stateWith(null))
    await syncService.refreshSyncState()

    expect(syncService.fioError.value).toBeNull()
    expect(events).toHaveLength(2)
    expect(events[1].error).toBeNull()
    expect(events[1].previousCode).toBe('invalid_credentials')
  })

  it('fires again when the error changes to a different code', async () => {
    respondWith(stateWith(INVALID_KEY_ERROR))
    await syncService.refreshSyncState()

    respondWith(stateWith({ ...INVALID_KEY_ERROR, code: 'fio_unavailable' }))
    await syncService.refreshSyncState()

    expect(events).toHaveLength(2)
    expect(syncService.fioError.value?.code).toBe('fio_unavailable')
  })

  it('leaves the last known state alone when a poll fails', async () => {
    respondWith(stateWith(INVALID_KEY_ERROR))
    await syncService.refreshSyncState()

    authenticatedFetch.mockRejectedValue(new Error('offline'))
    await syncService.refreshSyncState()

    // A failed poll is not evidence the FIO problem went away.
    expect(syncService.fioError.value?.code).toBe('invalid_credentials')
    expect(events).toHaveLength(1)
  })
})
