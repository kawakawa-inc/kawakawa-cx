import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CorpOverviewViewsController } from './CorpOverviewViewsController.js'
import type { ViewCard } from '@kawakawa/types'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  corpOverviewViews: {
    id: 'id',
    userId: 'user_id',
    name: 'name',
    tickers: 'tickers',
    cards: 'cards',
    privacy: 'privacy',
    isPinned: 'is_pinned',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  users: { id: 'id', username: 'username' },
}))

vi.mock('../utils/permissionService.js', () => ({
  hasPermission: vi.fn(),
}))

import { db } from '../db/index.js'
import { hasPermission } from '../utils/permissionService.js'

const OWNER_ID = 1
const OTHER_ID = 2

const ownerRequest = {
  user: { userId: OWNER_ID, username: 'owner', roles: ['member'] },
}

const validCard: ViewCard = {
  name: 'Top Gaps',
  groupBy: 'ticker',
  type: 'table',
  filters: [{ metric: 'gap', op: '>', value: 0 }],
  sortBy: [{ metric: 'gap', direction: 'desc' }],
  columns: ['gap', 'stock', 'daysRemaining'],
  limit: 5,
}

/**
 * Drizzle query builders are thenable at any link in the chain. We expose the
 * promise through all terminal points so the controller can await whichever
 * method it ends on.
 */
function mockAwaitableSelect(rows: unknown[]): ReturnType<typeof db.select> {
  const thenable = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
    catch: (reject: (v: unknown) => void) => Promise.resolve(rows).catch(reject),
  }
  const chain: Record<string, unknown> = { ...thenable }
  chain.from = vi.fn().mockReturnValue(chain)
  chain.innerJoin = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.orderBy = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.offset = vi.fn().mockReturnValue(chain)
  return chain as unknown as ReturnType<typeof db.select>
}

describe('CorpOverviewViewsController', () => {
  let controller: CorpOverviewViewsController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new CorpOverviewViewsController()
  })

  describe('create - card validation', () => {
    it('rejects empty name', async () => {
      await expect(
        controller.create(
          { name: '   ', tickers: [], cards: [validCard], privacy: 'private' },
          ownerRequest
        )
      ).rejects.toThrow('Name is required')
    })

    it('rejects filter on unknown metric', async () => {
      const bad: ViewCard = {
        ...validCard,
        filters: [{ metric: 'nonsense' as ViewCard['filters'][number]['metric'], op: '>', value: 0 }],
      }
      await expect(
        controller.create(
          { name: 'v', tickers: [], cards: [bad], privacy: 'private' },
          ownerRequest
        )
      ).rejects.toThrow(/filters\[0\]\.metric/)
    })

    it("rejects filter on 'username' (text metrics aren't filterable)", async () => {
      const bad: ViewCard = {
        name: 'x',
        groupBy: 'user-ticker',
        type: 'table',
        filters: [{ metric: 'username', op: '=', value: 0 }],
        sortBy: [{ metric: 'productionDaily', direction: 'desc' }],
        columns: ['username', 'productionDaily'],
        limit: 5,
      }
      await expect(
        controller.create(
          { name: 'v', tickers: [], cards: [bad], privacy: 'private' },
          ownerRequest
        )
      ).rejects.toThrow(/filters\[0\]\.metric/)
    })

    it('rejects filter with invalid op', async () => {
      const bad: ViewCard = {
        ...validCard,
        filters: [
          { metric: 'gap', op: 'between' as ViewCard['filters'][number]['op'], value: 0 },
        ],
      }
      await expect(
        controller.create(
          { name: 'v', tickers: [], cards: [bad], privacy: 'private' },
          ownerRequest
        )
      ).rejects.toThrow(/filters\[0\]\.op/)
    })

    it('rejects sortBy with unknown metric', async () => {
      const bad: ViewCard = {
        ...validCard,
        sortBy: [
          {
            metric: 'nonsense' as ViewCard['sortBy'][number]['metric'],
            direction: 'desc',
          },
        ],
      }
      await expect(
        controller.create(
          { name: 'v', tickers: [], cards: [bad], privacy: 'private' },
          ownerRequest
        )
      ).rejects.toThrow(/sortBy\[0\]\.metric/)
    })

    it('rejects sortBy with invalid direction', async () => {
      const bad: ViewCard = {
        ...validCard,
        sortBy: [
          {
            metric: 'gap',
            direction: 'random' as ViewCard['sortBy'][number]['direction'],
          },
        ],
      }
      await expect(
        controller.create(
          { name: 'v', tickers: [], cards: [bad], privacy: 'private' },
          ownerRequest
        )
      ).rejects.toThrow(/sortBy\[0\]\.direction/)
    })

    it("rejects 'stock' column under groupBy='user-ticker'", async () => {
      const bad: ViewCard = {
        name: 'x',
        groupBy: 'user-ticker',
        type: 'table',
        filters: [],
        sortBy: [{ metric: 'productionDaily', direction: 'desc' }],
        columns: ['productionDaily', 'stock'], // stock is ticker-only
        limit: 5,
      }
      await expect(
        controller.create(
          { name: 'v', tickers: [], cards: [bad], privacy: 'private' },
          ownerRequest
        )
      ).rejects.toThrow(/not a valid metric/)
    })

    it('rejects limit <= 0', async () => {
      const bad = { ...validCard, limit: 0 }
      await expect(
        controller.create(
          { name: 'v', tickers: [], cards: [bad], privacy: 'private' },
          ownerRequest
        )
      ).rejects.toThrow(/limit/)
    })

    it('rejects invalid privacy', async () => {
      await expect(
        controller.create(
          {
            name: 'v',
            tickers: [],
            cards: [validCard],
            privacy: 'secret' as 'private',
          },
          ownerRequest
        )
      ).rejects.toThrow(/privacy/)
    })

    it('rejects non-string ticker', async () => {
      await expect(
        controller.create(
          {
            name: 'v',
            tickers: [42 as unknown as string],
            cards: [validCard],
            privacy: 'private',
          },
          ownerRequest
        )
      ).rejects.toThrow(/tickers\[0\]/)
    })

    it('normalizes ticker case and dedupes', async () => {
      // Mock insert chain + final select
      const insertReturning = vi.fn().mockResolvedValue([{ id: 99 }])
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: insertReturning }),
      } as unknown as ReturnType<typeof db.insert>)
      vi.mocked(db.select).mockReturnValue(
        mockAwaitableSelect([
          {
            id: 99,
            userId: OWNER_ID,
            userName: 'owner',
            name: 'v',
            tickers: ['RAT'],
            cards: [validCard],
            privacy: 'private',
            isPinned: false,
            createdAt: new Date('2026-04-22T00:00:00Z'),
            updatedAt: new Date('2026-04-22T00:00:00Z'),
          },
        ])
      )

      await controller.create(
        { name: 'v', tickers: ['rat', 'RAT', 'Rat'], cards: [validCard], privacy: 'private' },
        ownerRequest
      )

      const insertResult = vi.mocked(db.insert).mock.results[0].value as {
        values: ReturnType<typeof vi.fn>
      }
      const inserted = insertResult.values.mock.calls[0][0]
      expect(inserted.tickers).toEqual(['RAT'])
    })
  })

  describe('getById - privacy', () => {
    function mockGetById(row: unknown) {
      vi.mocked(db.select).mockReturnValue(mockAwaitableSelect(row ? [row] : []))
    }

    it('returns 404 for private view not owned by caller', async () => {
      mockGetById({
        id: 7,
        userId: OTHER_ID,
        userName: 'other',
        name: 'x',
        tickers: [],
        cards: [],
        privacy: 'private',
        isPinned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await expect(controller.getById(7, ownerRequest)).rejects.toThrow('View not found')
    })

    it('returns 404 when row missing', async () => {
      mockGetById(null)
      await expect(controller.getById(7, ownerRequest)).rejects.toThrow('View not found')
    })

    it('returns the view for link-privacy even if not owner', async () => {
      mockGetById({
        id: 7,
        userId: OTHER_ID,
        userName: 'other',
        name: 'x',
        tickers: [],
        cards: [],
        privacy: 'link',
        isPinned: false,
        createdAt: new Date('2026-04-22T00:00:00Z'),
        updatedAt: new Date('2026-04-22T00:00:00Z'),
      })
      const v = await controller.getById(7, ownerRequest)
      expect(v.id).toBe(7)
      expect(v.privacy).toBe('link')
    })
  })

  describe('update - ownership', () => {
    it('rejects non-owner with 403', async () => {
      vi.mocked(db.select).mockReturnValue(
        mockAwaitableSelect([
          {
            id: 7,
            userId: OTHER_ID, // owned by someone else
            name: 'x',
            tickers: [],
            cards: [],
            privacy: 'private',
            isPinned: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ])
      )

      await expect(
        controller.update(7, { name: 'new name' }, ownerRequest)
      ).rejects.toThrow('do not have permission')
    })
  })

  describe('delete - ownership', () => {
    it('rejects non-owner with 403', async () => {
      vi.mocked(db.select).mockReturnValue(
        mockAwaitableSelect([
          {
            id: 7,
            userId: OTHER_ID,
            name: 'x',
            tickers: [],
            cards: [],
            privacy: 'public',
            isPinned: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ])
      )

      await expect(controller.delete(7, ownerRequest)).rejects.toThrow('do not have permission')
    })
  })

  describe('togglePin', () => {
    it('rejects users without filters.pin permission', async () => {
      vi.mocked(hasPermission).mockResolvedValue(false)
      await expect(controller.togglePin(7, ownerRequest)).rejects.toThrow(
        'do not have permission'
      )
    })

    it('rejects pinning a non-public view', async () => {
      vi.mocked(hasPermission).mockResolvedValue(true)
      vi.mocked(db.select).mockReturnValue(
        mockAwaitableSelect([
          {
            id: 7,
            userId: OWNER_ID,
            name: 'x',
            tickers: [],
            cards: [],
            privacy: 'private',
            isPinned: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ])
      )
      await expect(controller.togglePin(7, ownerRequest)).rejects.toThrow(
        'Only public views can be pinned'
      )
    })
  })
})
