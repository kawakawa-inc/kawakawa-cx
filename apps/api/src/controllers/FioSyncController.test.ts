import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FioSyncController } from './FioSyncController.js'
import * as userSettingsService from '@kawakawa/services/user-settings'

vi.mock('@kawakawa/services/user-settings', () => ({
  getSetting: vi.fn(),
  getFioCredentials: vi.fn(),
}))

vi.mock('@kawakawa/services/sync-queue', () => ({
  enqueueUserFullSync: vi.fn().mockResolvedValue({
    inventoryJobId: 42,
    planetsJobId: 43,
  }),
}))

describe('FioSyncController', () => {
  let controller: FioSyncController
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: [] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new FioSyncController()
  })

  describe('startSyncAll', () => {
    it('should enqueue inventory + planets jobs and return their IDs', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: 'TestUser',
        fioApiKey: 'test-key',
      })

      const result = await controller.startSyncAll(mockRequest)

      expect(result.jobIds).toEqual({ inventory: 42, planets: 43 })
    })

    it('should throw when FIO credentials are missing', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: null,
        fioApiKey: null,
      })

      await expect(controller.startSyncAll(mockRequest)).rejects.toThrow(
        'FIO credentials not configured'
      )
    })
  })
})
