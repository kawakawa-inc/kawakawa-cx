import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SavedFiltersController } from './SavedFiltersController.js'
import * as permissionService from '../utils/permissionService.js'

const NOW = new Date('2024-01-01T00:00:00Z')

vi.mock('../utils/permissionService.js', () => ({
  hasPermission: vi.fn(),
}))

// Track mutation calls
let insertValues: unknown[] = []
let updateSets: unknown[] = []
let deleteCalls: unknown[] = []

// Mock rows returned by db queries
let mockRows: unknown[] = []

vi.mock('../db/index.js', () => {
  const savedMarketFiltersTable = { __table: 'savedMarketFilters' }
  const usersTable = { __table: 'users' }

  return {
    db: {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          // Return a thenable so `await db.select().from().where()` works,
          // while also supporting .orderBy().limit().offset() chaining.
          const withLimit = {
            limit: vi.fn().mockImplementation(() => ({
              offset: vi.fn().mockResolvedValue(mockRows),
            })),
          }
          const promise = Promise.resolve(mockRows)
          return Object.assign(promise, {
            orderBy: vi
              .fn()
              .mockImplementation(() => Object.assign(Promise.resolve(mockRows), withLimit)),
            ...withLimit,
          })
        }),
        orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockRows)),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((data: unknown) => {
          insertValues.push(data)
          return {
            returning: vi.fn().mockResolvedValue([{ id: 99 }]),
          }
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((data: unknown) => {
          updateSets.push(data)
          return {
            where: vi.fn().mockResolvedValue([]),
          }
        }),
      })),
      delete: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation((data: unknown) => {
          deleteCalls.push(data)
          return Promise.resolve([])
        }),
      })),
    },
    savedMarketFilters: savedMarketFiltersTable,
    users: usersTable,
    eq: vi.fn((a, b) => ({ eq: true, a, b })),
    or: vi.fn((...args) => ({ or: true, args })),
    and: vi.fn((...args) => ({ and: true, args })),
    sql: vi.fn((...args) => ({ sql: true, args })),
  }
})

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ eq: true, a, b })),
  or: vi.fn((...args) => ({ or: true, args })),
  and: vi.fn((...args) => ({ and: true, args })),
  sql: Object.assign(
    vi.fn((...args) => ({ sql: true, args })),
    {
      raw: vi.fn(),
    }
  ),
}))

const makeFilter = (
  overrides: Partial<{
    id: number
    userId: number
    userName: string
    name: string
    filterData: object
    privacy: string
    isPinned: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) => ({
  id: 1,
  userId: 10,
  userName: 'alice',
  name: 'My Filter',
  filterData: { itemType: 'sell', location: ['BEN'] },
  privacy: 'private',
  isPinned: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
})

describe('SavedFiltersController', () => {
  let controller: SavedFiltersController
  const mockRequest = (userId = 10, roles = ['member']) => ({
    user: { userId, username: 'alice', roles },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SavedFiltersController()
    controller.setStatus = vi.fn()
    insertValues = []
    updateSets = []
    deleteCalls = []
    mockRows = []
    vi.mocked(permissionService.hasPermission).mockResolvedValue(false)
  })

  // ==================== list ====================

  describe('list', () => {
    it('returns own + public filters', async () => {
      mockRows = [
        makeFilter({ privacy: 'private' }),
        makeFilter({ id: 2, privacy: 'public', userId: 20 }),
      ]
      const result = await controller.list(mockRequest())
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('My Filter')
    })

    it('maps createdAt to ISO string', async () => {
      mockRows = [makeFilter()]
      const result = await controller.list(mockRequest())
      expect(result[0].createdAt).toBe(NOW.toISOString())
    })
  })

  // ==================== getPinned ====================

  describe('getPinned', () => {
    it('returns pinned filters', async () => {
      mockRows = [makeFilter({ isPinned: true, privacy: 'public' })]
      const result = await controller.getPinned(mockRequest())
      expect(result).toHaveLength(1)
      expect(result[0].isPinned).toBe(true)
    })

    it('returns empty array when nothing is pinned', async () => {
      mockRows = []
      const result = await controller.getPinned(mockRequest())
      expect(result).toEqual([])
    })
  })

  // ==================== browse ====================

  describe('browse', () => {
    it('returns public filters', async () => {
      mockRows = [makeFilter({ privacy: 'public' })]
      const result = await controller.browse(mockRequest())
      expect(result).toHaveLength(1)
    })

    it('returns empty array when no public filters', async () => {
      mockRows = []
      const result = await controller.browse(mockRequest())
      expect(result).toEqual([])
    })
  })

  // ==================== getById ====================

  describe('getById', () => {
    it('returns own private filter', async () => {
      mockRows = [makeFilter({ userId: 10, privacy: 'private' })]
      const result = await controller.getById(1, mockRequest(10))
      expect(result.id).toBe(1)
    })

    it('returns link filter to another user', async () => {
      mockRows = [makeFilter({ userId: 20, privacy: 'link' })]
      const result = await controller.getById(1, mockRequest(10))
      expect(result.userId).toBe(20)
    })

    it('returns public filter to another user', async () => {
      mockRows = [makeFilter({ userId: 20, privacy: 'public' })]
      const result = await controller.getById(1, mockRequest(10))
      expect(result.userId).toBe(20)
    })

    it('throws 404 for private filter owned by another user', async () => {
      mockRows = [makeFilter({ userId: 20, privacy: 'private' })]
      await expect(controller.getById(1, mockRequest(10))).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    it('throws 404 when filter not found', async () => {
      mockRows = []
      await expect(controller.getById(999, mockRequest())).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })

  // ==================== create ====================

  describe('create', () => {
    it('creates a filter and returns 201', async () => {
      mockRows = [makeFilter({ id: 99 })]
      const body = {
        name: 'New Filter',
        filterData: { itemType: 'sell' as const, location: ['BEN'] },
        privacy: 'private' as const,
      }
      const result = await controller.create(body, mockRequest())
      expect(controller.setStatus).toHaveBeenCalledWith(201)
      expect(insertValues).toHaveLength(1)
      const inserted = insertValues[0] as { name: string; privacy: string; isPinned: boolean }
      expect(inserted.name).toBe('New Filter')
      expect(inserted.privacy).toBe('private')
      expect(inserted.isPinned).toBe(false)
      expect(result.id).toBe(99)
    })

    it('trims whitespace from name', async () => {
      mockRows = [makeFilter({ id: 99 })]
      const body = { name: '  My Filter  ', filterData: {}, privacy: 'private' as const }
      await controller.create(body, mockRequest())
      const inserted = insertValues[0] as { name: string }
      expect(inserted.name).toBe('My Filter')
    })

    it('throws 400 when name is empty', async () => {
      await expect(
        controller.create({ name: '', filterData: {}, privacy: 'private' }, mockRequest())
      ).rejects.toMatchObject({ statusCode: 400 })
    })

    it('throws 400 when filterData is missing', async () => {
      await expect(
        controller.create(
          { name: 'Test', filterData: null as unknown as object, privacy: 'private' },
          mockRequest()
        )
      ).rejects.toMatchObject({ statusCode: 400 })
    })

    it('throws 400 for invalid privacy value', async () => {
      await expect(
        controller.create(
          { name: 'Test', filterData: {}, privacy: 'invalid' as 'private' },
          mockRequest()
        )
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  // ==================== update ====================

  describe('update', () => {
    it('updates a filter the user owns', async () => {
      // First call: get existing; subsequent: get updated
      mockRows = [makeFilter({ userId: 10, privacy: 'private' })]
      await controller.update(1, { name: 'Renamed' }, mockRequest(10))
      expect(updateSets).toHaveLength(1)
      const updated = updateSets[0] as { name: string }
      expect(updated.name).toBe('Renamed')
    })

    it('throws 404 when filter not found', async () => {
      mockRows = []
      await expect(controller.update(999, { name: 'X' }, mockRequest())).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    it('throws 403 when user does not own the filter', async () => {
      mockRows = [makeFilter({ userId: 20 })]
      await expect(controller.update(1, { name: 'X' }, mockRequest(10))).rejects.toMatchObject({
        statusCode: 403,
      })
    })

    it('throws 400 when new name is empty string', async () => {
      mockRows = [makeFilter({ userId: 10 })]
      await expect(controller.update(1, { name: '   ' }, mockRequest(10))).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('throws 400 for invalid privacy value', async () => {
      mockRows = [makeFilter({ userId: 10 })]
      await expect(
        controller.update(1, { privacy: 'invalid' as 'private' }, mockRequest(10))
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  // ==================== delete ====================

  describe('delete', () => {
    it('deletes a filter the user owns', async () => {
      mockRows = [makeFilter({ userId: 10 })]
      await controller.delete(1, mockRequest(10))
      expect(deleteCalls).toHaveLength(1)
      expect(controller.setStatus).toHaveBeenCalledWith(204)
    })

    it('throws 404 when filter not found', async () => {
      mockRows = []
      await expect(controller.delete(999, mockRequest())).rejects.toMatchObject({ statusCode: 404 })
    })

    it('throws 403 when user does not own the filter', async () => {
      mockRows = [makeFilter({ userId: 20 })]
      await expect(controller.delete(1, mockRequest(10))).rejects.toMatchObject({ statusCode: 403 })
    })
  })

  // ==================== togglePin ====================

  describe('togglePin', () => {
    it('pins a public filter when user has permission', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValue(true)
      mockRows = [makeFilter({ privacy: 'public', isPinned: false })]
      const result = await controller.togglePin(1, mockRequest(10, ['administrator']))
      // updateSets should include isPinned toggle
      expect(updateSets).toHaveLength(1)
      const upd = updateSets[0] as { isPinned: boolean }
      expect(upd.isPinned).toBe(true)
      // Result comes from re-select (mockRows used for both db.select calls)
      expect(result).toBeDefined()
    })

    it('throws 403 when user lacks filters.pin permission', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValue(false)
      await expect(controller.togglePin(1, mockRequest(10, ['member']))).rejects.toMatchObject({
        statusCode: 403,
      })
    })

    it('throws 404 when filter not found', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValue(true)
      mockRows = []
      await expect(
        controller.togglePin(999, mockRequest(10, ['administrator']))
      ).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    it('throws 400 when trying to pin a private filter', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValue(true)
      mockRows = [makeFilter({ privacy: 'private' })]
      await expect(
        controller.togglePin(1, mockRequest(10, ['administrator']))
      ).rejects.toMatchObject({
        statusCode: 400,
      })
    })

    it('throws 400 when trying to pin a link filter', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValue(true)
      mockRows = [makeFilter({ privacy: 'link' })]
      await expect(
        controller.togglePin(1, mockRequest(10, ['administrator']))
      ).rejects.toMatchObject({
        statusCode: 400,
      })
    })
  })
})
