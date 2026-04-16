import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FioSyncController } from './FioSyncController.js'
import * as userSettingsService from '../services/userSettingsService.js'

vi.mock('../services/userSettingsService.js', () => ({
  getSetting: vi.fn(),
  getFioCredentials: vi.fn(),
}))

// Mock syncUserAll to resolve immediately
vi.mock('../services/fio/sync-user-all.js', () => ({
  syncUserAll: vi.fn().mockResolvedValue({
    success: true,
    inventory: { inserted: 10, errors: [] },
    planets: { planetsSynced: 2, errors: [] },
    errors: [],
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
    it('should start a sync and return a job ID', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: 'TestUser',
        fioApiKey: 'test-key',
      })
      vi.mocked(userSettingsService.getSetting).mockResolvedValue([])

      const result = await controller.startSyncAll(mockRequest)

      expect(result.jobId).toBeDefined()
      expect(typeof result.jobId).toBe('string')
      expect(result.status).toBe('pending')
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

  describe('getSyncStatus', () => {
    it('should return status for a valid job', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValue({
        fioUsername: 'TestUser',
        fioApiKey: 'test-key',
      })
      vi.mocked(userSettingsService.getSetting).mockResolvedValue([])

      // Start a job first
      const { jobId } = await controller.startSyncAll(mockRequest)

      // Poll it
      const status = await controller.getSyncStatus(jobId)

      expect(status.jobId).toBe(jobId)
      expect(['running', 'completed']).toContain(status.status)
    })

    it('should throw NotFound for unknown job ID', async () => {
      await expect(controller.getSyncStatus('nonexistent-id')).rejects.toThrow('Sync job not found')
    })
  })
})
