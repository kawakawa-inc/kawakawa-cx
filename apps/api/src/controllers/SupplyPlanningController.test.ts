import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupplyPlanningController } from './SupplyPlanningController.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  fioUserPlanets: {
    id: 'id',
    userId: 'userId',
    planetNaturalId: 'planetNaturalId',
    planetName: 'planetName',
    lastSyncedAt: 'lastSyncedAt',
  },
}))

describe('SupplyPlanningController', () => {
  let controller: SupplyPlanningController
  let mockSelect: any
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: [] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SupplyPlanningController()
    mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    vi.mocked(db.select).mockReturnValue(mockSelect)
  })

  describe('getPlanets', () => {
    it('should return synced planets with timestamps', async () => {
      const mockPlanets = [
        {
          id: 1,
          planetNaturalId: 'UV-351a',
          planetName: 'Katoa',
          lastSyncedAt: new Date('2024-06-15T12:00:00Z'),
        },
        {
          id: 2,
          planetNaturalId: 'KW-688c',
          planetName: 'Promitor',
          lastSyncedAt: new Date('2024-06-15T12:00:00Z'),
        },
      ]
      mockSelect.orderBy.mockResolvedValue(mockPlanets)

      const result = await controller.getPlanets(mockRequest)

      expect(result).toHaveLength(2)
      expect(result[0].planetNaturalId).toBe('UV-351a')
      expect(result[0].planetName).toBe('Katoa')
      expect(result[0].lastSyncedAt).toBe('2024-06-15T12:00:00.000Z')
    })

    it('should return empty array when no planets synced', async () => {
      mockSelect.orderBy.mockResolvedValue([])

      const result = await controller.getPlanets(mockRequest)

      expect(result).toHaveLength(0)
    })
  })
})
