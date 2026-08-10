import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SyncController } from './SyncController.js'
import { syncService } from '@kawakawa/services/sync-state'
import type { SyncState } from '@kawakawa/types'

vi.mock('@kawakawa/services/sync-state', () => ({
  syncService: {
    getSyncState: vi.fn(),
  },
}))

describe('SyncController', () => {
  let controller: SyncController
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: ['member'] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SyncController()
  })

  describe('getSyncState', () => {
    const mockSyncState: SyncState = {
      unreadCount: 5,
      appVersion: 'abc123',
      dataVersions: {
        locations: 1704844800000,
        commodities: 1704844800000,
      },
      fioError: null,
    }

    it('should return sync state with unread count and data versions', async () => {
      vi.mocked(syncService.getSyncState).mockResolvedValue(mockSyncState)

      const result = await controller.getSyncState(mockRequest)

      expect(syncService.getSyncState).toHaveBeenCalledWith(1)
      expect(result).toEqual(mockSyncState)
    })

    it('should return zero unread count when no notifications', async () => {
      const emptyState: SyncState = {
        unreadCount: 0,
        appVersion: 'abc123',
        dataVersions: {},
        fioError: null,
      }
      vi.mocked(syncService.getSyncState).mockResolvedValue(emptyState)

      const result = await controller.getSyncState(mockRequest)

      expect(result.unreadCount).toBe(0)
    })

    it('should pass through the FIO error so the UI can surface it', async () => {
      const failedState: SyncState = {
        unreadCount: 1,
        appVersion: 'abc123',
        dataVersions: {},
        fioError: {
          code: 'invalid_credentials',
          title: 'FIO rejected your API key',
          detail: 'Issue a new key and save it in Account → FIO.',
          userActionable: true,
          jobType: 'user-inventory',
          rawMessage: 'FIO API request failed (HTTP 401): no details',
          failedAt: '2026-01-01T00:00:00.000Z',
        },
      }
      vi.mocked(syncService.getSyncState).mockResolvedValue(failedState)

      const result = await controller.getSyncState(mockRequest)

      expect(result.fioError?.code).toBe('invalid_credentials')
      expect(result.fioError?.userActionable).toBe(true)
    })
  })
})
