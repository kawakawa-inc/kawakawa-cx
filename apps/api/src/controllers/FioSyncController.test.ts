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

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  syncJobs: {
    id: 'id',
  },
}))

import { db } from '../db/index.js'

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

  describe('getSyncStatus', () => {
    it('should return status for a valid job', async () => {
      const chain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 42,
              jobType: 'user-inventory',
              status: 'done',
              attempts: 1,
              startedAt: new Date('2026-01-01T00:00:00Z'),
              finishedAt: new Date('2026-01-01T00:00:05Z'),
              error: null,
            },
          ]),
        }),
      }
      vi.mocked(db.select).mockReturnValue(chain as unknown as ReturnType<typeof db.select>)

      const status = await controller.getSyncStatus(42)
      expect(status.jobId).toBe(42)
      expect(status.status).toBe('done')
      expect(status.jobType).toBe('user-inventory')
    })

    it('should throw NotFound for unknown job ID', async () => {
      const chain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }
      vi.mocked(db.select).mockReturnValue(chain as unknown as ReturnType<typeof db.select>)

      await expect(controller.getSyncStatus(9999)).rejects.toThrow('Sync job not found')
    })
  })
})
