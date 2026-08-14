import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncVersionController } from './SyncVersionController.js'
import { syncService } from '@kawakawa/services/sync-state'

vi.mock('@kawakawa/services/sync-state', () => ({
  syncService: {
    getAppVersion: vi.fn(),
  },
}))

describe('SyncVersionController', () => {
  let controller: SyncVersionController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SyncVersionController()
  })

  it('returns the deployed build version', async () => {
    vi.mocked(syncService.getAppVersion).mockReturnValue('abc123')

    const result = await controller.getVersion()

    expect(result).toEqual({ appVersion: 'abc123' })
  })

  /**
   * `getVersion` must stay unauthenticated: a tab whose session has lapsed is
   * exactly the one that needs to learn its bundle is stale so it can reload,
   * and `getSyncState` 401s before it can report a version. It takes no
   * `@Request` parameter, so it cannot read a user even by accident.
   */
  it('needs no session', async () => {
    vi.mocked(syncService.getAppVersion).mockReturnValue('abc123')

    await expect(controller.getVersion()).resolves.toBeDefined()
    expect(controller.getVersion.length).toBe(0)
  })
})
