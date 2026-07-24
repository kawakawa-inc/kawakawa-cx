import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CorpOverviewViewsController } from './CorpOverviewViewsController.js'
import type { ViewCard } from '@kawakawa/types'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  corpOverviewViews: {
    id: 'id',
    name: 'name',
    tickers: 'tickers',
    cards: 'cards',
    excludedUserIds: 'excluded_user_ids',
    materialsTableColumns: 'materials_table_columns',
    materialsTableTickers: 'materials_table_tickers',
    privacy: 'privacy',
    isPinned: 'is_pinned',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  viewOwners: {
    viewId: 'view_id',
    userId: 'user_id',
    addedAt: 'added_at',
  },
  userVisitedViews: {
    userId: 'user_id',
    viewId: 'view_id',
    lastVisitedAt: 'last_visited_at',
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
  clientId: 'test-card',
  name: 'Top Gaps',
  groupBy: 'ticker',
  type: 'table',
  filters: [{ metric: 'gap', op: '>', value: 0 }],
  sortBy: [{ metric: 'gap', direction: 'desc' }],
  columns: ['gap', 'stock', 'daysRemaining'],
  limit: 5,
}

/**
 * Build a thenable Drizzle-style chain. Each chain method returns the same
 * thenable so the controller can ride it through any sequence of `.from()`
 * `.leftJoin()` `.where()` etc. and then await the result. `groupBy` and `as`
 * are present so the owner-aggregating subquery scaffold (which is built but
 * never awaited) constructs without throwing.
 */
function makeChain(rows: unknown[]): ReturnType<typeof db.select> {
  const thenable = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
    catch: (reject: (v: unknown) => void) => Promise.resolve(rows).catch(reject),
  }
  const chain: Record<string, unknown> = { ...thenable }
  for (const m of [
    'from',
    'innerJoin',
    'leftJoin',
    'where',
    'orderBy',
    'limit',
    'offset',
    'groupBy',
    'as',
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  return chain as unknown as ReturnType<typeof db.select>
}

/**
 * Sequential `db.select(...)` queue. Each `it` block calls `queueSelect` with
 * one entry per anticipated select, in controller-call order. For endpoints
 * that build the owner-aggregating subquery, the FIRST entry is always the
 * subquery scaffold (rows ignored — it isn't awaited); the SECOND is the main
 * fetch. `isOwner` adds another entry. Calls past the queue's length get an
 * empty chain so unanticipated calls don't NPE.
 */
let selectQueue: unknown[][] = []

function queueSelect(...batches: unknown[][]): void {
  selectQueue.push(...batches)
}

/**
 * Stand-in for `db.transaction(fn)`. Our `tx` exposes `insert(...).values(...)`
 * with a settable `.returning()` so individual tests can wire the inserted-row
 * shape they need. Returns whatever the callback returns, mirroring the real
 * transaction contract.
 */
function mockTransaction(insertedId: number): {
  txInserts: Array<{ table: string; values: unknown }>
} {
  const txInserts: Array<{ table: string; values: unknown }> = []
  vi.mocked(db.transaction).mockImplementation(async fn => {
    const tx = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          txInserts.push({ table: String(table), values })
          return { returning: vi.fn().mockResolvedValue([{ id: insertedId }]) }
        }),
      })),
    }
    return fn(tx as unknown as Parameters<Parameters<typeof db.transaction>[0]>[0])
  })
  return { txInserts }
}

describe('CorpOverviewViewsController', () => {
  let controller: CorpOverviewViewsController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new CorpOverviewViewsController()
    selectQueue = []
    vi.mocked(db.select).mockImplementation(() => makeChain(selectQueue.shift() ?? []))
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
        filters: [
          { metric: 'nonsense' as ViewCard['filters'][number]['metric'], op: '>', value: 0 },
        ],
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
        clientId: 'test-bad-username',
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
        filters: [{ metric: 'gap', op: 'between' as ViewCard['filters'][number]['op'], value: 0 }],
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
        clientId: 'test-bad-stock-column',
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

    it('rejects table card with empty columns', async () => {
      const bad: ViewCard = { ...validCard, type: 'table', columns: [] }
      await expect(
        controller.create(
          { name: 'v', tickers: [], cards: [bad], privacy: 'private' },
          ownerRequest
        )
      ).rejects.toThrow(/columns must be a non-empty array/)
    })

    it('accepts a graph card with empty columns', async () => {
      const graphCard: ViewCard = {
        clientId: 'test-graph-card',
        name: 'New graph',
        groupBy: 'ticker',
        type: 'graph',
        filters: [],
        sortBy: [],
        columns: [],
        limit: 5,
        graph: {
          yMetrics: ['productionDaily'],
          seriesBy: 'corp',
          seriesLimit: 5,
          rangePreset: '90d',
        },
      }
      const { txInserts } = mockTransaction(100)
      queueSelect(
        [],
        [
          {
            id: 100,
            ownersJson: JSON.stringify([{ userId: OWNER_ID, username: 'owner' }]),
            name: 'v',
            tickers: [],
            cards: [graphCard],
            excludedUserIds: [],
            materialsTableColumns: [],
            materialsTableTickers: [],
            privacy: 'private',
            isPinned: false,
            deletedAt: null,
            createdAt: new Date('2026-04-22T00:00:00Z'),
            updatedAt: new Date('2026-04-22T00:00:00Z'),
          },
        ]
      )

      const result = await controller.create(
        { name: 'v', tickers: [], cards: [graphCard], privacy: 'private' },
        ownerRequest
      )

      expect(txInserts[0].values).toMatchObject({
        cards: [expect.objectContaining({ type: 'graph', columns: [] })],
      })
      expect(result.cards).toEqual([expect.objectContaining({ type: 'graph', columns: [] })])
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

    it('normalizes ticker case and dedupes; seeds caller as first owner', async () => {
      const { txInserts } = mockTransaction(99)
      queueSelect(
        [], // owners-subquery scaffold for post-insert fetch
        [
          {
            id: 99,
            ownersJson: JSON.stringify([{ userId: OWNER_ID, username: 'owner' }]),
            name: 'v',
            tickers: ['RAT'],
            cards: [validCard],
            excludedUserIds: [],
            materialsTableColumns: [],
            materialsTableTickers: [],
            privacy: 'private',
            isPinned: false,
            deletedAt: null,
            createdAt: new Date('2026-04-22T00:00:00Z'),
            updatedAt: new Date('2026-04-22T00:00:00Z'),
          },
        ]
      )

      const result = await controller.create(
        { name: 'v', tickers: ['rat', 'RAT', 'Rat'], cards: [validCard], privacy: 'private' },
        ownerRequest
      )

      // The view insert and the first-owner insert must both happen inside the
      // same transaction — otherwise a partial failure leaves an ownerless row.
      expect(txInserts.length).toBe(2)
      expect(txInserts[0].values).toMatchObject({ tickers: ['RAT'], excludedUserIds: [] })
      expect(txInserts[1].values).toEqual({ viewId: 99, userId: OWNER_ID })
      expect(result.owners).toEqual([{ userId: OWNER_ID, username: 'owner' }])
    })

    it('rejects non-array excludedUserIds', async () => {
      await expect(
        controller.create(
          {
            name: 'v',
            tickers: [],
            cards: [validCard],
            privacy: 'private',
            excludedUserIds: 'oops' as unknown as number[],
          },
          ownerRequest
        )
      ).rejects.toThrow(/excludedUserIds/)
    })

    it('rejects non-positive-integer excludedUserIds entries', async () => {
      await expect(
        controller.create(
          {
            name: 'v',
            tickers: [],
            cards: [validCard],
            privacy: 'private',
            excludedUserIds: [1, 0],
          },
          ownerRequest
        )
      ).rejects.toThrow(/excludedUserIds\[1\]/)

      await expect(
        controller.create(
          {
            name: 'v',
            tickers: [],
            cards: [validCard],
            privacy: 'private',
            excludedUserIds: [1, 2.5],
          },
          ownerRequest
        )
      ).rejects.toThrow(/excludedUserIds\[1\]/)
    })

    it('persists provided excludedUserIds (deduped + sorted)', async () => {
      const { txInserts } = mockTransaction(100)
      queueSelect(
        [],
        [
          {
            id: 100,
            ownersJson: JSON.stringify([{ userId: OWNER_ID, username: 'owner' }]),
            name: 'v',
            tickers: [],
            cards: [validCard],
            excludedUserIds: [3, 7],
            materialsTableColumns: [],
            materialsTableTickers: [],
            privacy: 'private',
            isPinned: false,
            deletedAt: null,
            createdAt: new Date('2026-04-22T00:00:00Z'),
            updatedAt: new Date('2026-04-22T00:00:00Z'),
          },
        ]
      )

      const result = await controller.create(
        {
          name: 'v',
          tickers: [],
          cards: [validCard],
          privacy: 'private',
          excludedUserIds: [7, 3, 7],
        },
        ownerRequest
      )

      expect(txInserts[0].values).toMatchObject({ excludedUserIds: [3, 7] })
      expect(result.excludedUserIds).toEqual([3, 7])
    })

    it('rejects materialsTableColumns containing user-only metrics', async () => {
      // `username` is only valid under user-ticker grouping; the materials
      // table is per-ticker, so this must fail validation.
      await expect(
        controller.create(
          {
            name: 'v',
            tickers: [],
            cards: [validCard],
            privacy: 'private',
            materialsTableColumns: ['username'] as unknown as ViewCard['columns'],
          },
          ownerRequest
        )
      ).rejects.toThrow(/materialsTableColumns\[0\]/)
    })

    it('persists materialsTableColumns in caller-supplied order, deduped', async () => {
      const { txInserts } = mockTransaction(101)
      queueSelect(
        [],
        [
          {
            id: 101,
            ownersJson: JSON.stringify([{ userId: OWNER_ID, username: 'owner' }]),
            name: 'v',
            tickers: [],
            cards: [validCard],
            excludedUserIds: [],
            materialsTableColumns: ['burnDaily', 'productionDaily', 'stock'],
            materialsTableTickers: [],
            privacy: 'private',
            isPinned: false,
            deletedAt: null,
            createdAt: new Date('2026-04-22T00:00:00Z'),
            updatedAt: new Date('2026-04-22T00:00:00Z'),
          },
        ]
      )

      const result = await controller.create(
        {
          name: 'v',
          tickers: [],
          cards: [validCard],
          privacy: 'private',
          materialsTableColumns: [
            'burnDaily',
            'productionDaily',
            'burnDaily', // duplicate dropped
            'stock',
          ],
        },
        ownerRequest
      )

      expect(txInserts[0].values).toMatchObject({
        materialsTableColumns: ['burnDaily', 'productionDaily', 'stock'],
      })
      expect(result.materialsTableColumns).toEqual(['burnDaily', 'productionDaily', 'stock'])
    })

    it('rejects non-array materialsTableTickers', async () => {
      await expect(
        controller.create(
          {
            name: 'v',
            tickers: [],
            cards: [validCard],
            privacy: 'private',
            materialsTableTickers: 'oops' as unknown as string[],
          },
          ownerRequest
        )
      ).rejects.toThrow(/materialsTableTickers/)
    })

    it('persists materialsTableTickers normalized + deduped', async () => {
      const { txInserts } = mockTransaction(102)
      queueSelect(
        [],
        [
          {
            id: 102,
            ownersJson: JSON.stringify([{ userId: OWNER_ID, username: 'owner' }]),
            name: 'v',
            tickers: [],
            cards: [validCard],
            excludedUserIds: [],
            materialsTableColumns: [],
            materialsTableTickers: ['RAT', 'category:Consumables'],
            privacy: 'private',
            isPinned: false,
            deletedAt: null,
            createdAt: new Date('2026-04-22T00:00:00Z'),
            updatedAt: new Date('2026-04-22T00:00:00Z'),
          },
        ]
      )

      const result = await controller.create(
        {
          name: 'v',
          tickers: [],
          cards: [validCard],
          privacy: 'private',
          materialsTableTickers: ['rat', 'category:Consumables', 'RAT'],
        },
        ownerRequest
      )

      expect(txInserts[0].values).toMatchObject({
        materialsTableTickers: ['RAT', 'category:Consumables'],
      })
      expect(result.materialsTableTickers).toEqual(['RAT', 'category:Consumables'])
    })
  })

  describe('getById - privacy', () => {
    function viewRow(privacy: 'private' | 'unlisted' | 'public', ownersUserId = OWNER_ID): unknown {
      return {
        id: 7,
        ownersJson: JSON.stringify([{ userId: ownersUserId, username: 'owner' }]),
        name: 'x',
        tickers: [],
        cards: [],
        excludedUserIds: [],
        materialsTableColumns: [],
        materialsTableTickers: [],
        privacy,
        isPinned: false,
        deletedAt: null,
        createdAt: new Date('2026-04-22T00:00:00Z'),
        updatedAt: new Date('2026-04-22T00:00:00Z'),
      }
    }

    it('returns 404 for private view not owned by caller', async () => {
      // Calls in order: subquery scaffold, main fetch, isOwner (empty → not owner).
      queueSelect([], [viewRow('private', OTHER_ID)], [])
      await expect(controller.getById(7, ownerRequest)).rejects.toThrow('View not found')
    })

    it('returns 404 when row missing', async () => {
      queueSelect([], [])
      await expect(controller.getById(7, ownerRequest)).rejects.toThrow('View not found')
    })

    it('returns the view for unlisted-privacy even if not owner', async () => {
      queueSelect([], [viewRow('unlisted', OTHER_ID)])
      const v = await controller.getById(7, ownerRequest)
      expect(v.id).toBe(7)
      expect(v.privacy).toBe('unlisted')
      expect(v.owners).toEqual([{ userId: OTHER_ID, username: 'owner' }])
    })

    it('returns the view for private when caller is an owner', async () => {
      queueSelect([], [viewRow('private', OWNER_ID)], [{ x: 1 }])
      const v = await controller.getById(7, ownerRequest)
      expect(v.id).toBe(7)
      expect(v.owners).toEqual([{ userId: OWNER_ID, username: 'owner' }])
    })
  })

  describe('update - ownership', () => {
    it('rejects non-owner with 403', async () => {
      // existing-row probe finds the view; isOwner returns empty → 403.
      queueSelect([{ id: 7 }], [])

      await expect(controller.update(7, { name: 'new name' }, ownerRequest)).rejects.toThrow(
        'do not have permission'
      )
    })

    it('returns 404 when row is missing or soft-deleted', async () => {
      queueSelect([])
      await expect(controller.update(7, { name: 'new name' }, ownerRequest)).rejects.toThrow(
        'View not found'
      )
    })

    it('persists excludedUserIds when caller is an owner', async () => {
      const updateSet = vi.fn().mockResolvedValue(undefined)
      const updateWhere = vi.fn().mockReturnValue(updateSet)
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({ where: updateWhere }),
      } as unknown as ReturnType<typeof db.update>)

      // existing-row probe → isOwner → subquery scaffold → main post-update fetch
      queueSelect(
        [{ id: 7 }],
        [{ x: 1 }],
        [],
        [
          {
            id: 7,
            ownersJson: JSON.stringify([{ userId: OWNER_ID, username: 'owner' }]),
            name: 'x',
            tickers: [],
            cards: [],
            excludedUserIds: [3, 7],
            materialsTableColumns: [],
            materialsTableTickers: [],
            privacy: 'private',
            isPinned: false,
            deletedAt: null,
            createdAt: new Date('2026-04-22T00:00:00Z'),
            updatedAt: new Date('2026-04-22T00:00:00Z'),
          },
        ]
      )

      const result = await controller.update(7, { excludedUserIds: [7, 3, 7] }, ownerRequest)

      const updateResult = vi.mocked(db.update).mock.results[0].value as {
        set: ReturnType<typeof vi.fn>
      }
      const setArgs = updateResult.set.mock.calls[0][0]
      expect(setArgs.excludedUserIds).toEqual([3, 7])
      expect(result.excludedUserIds).toEqual([3, 7])
    })

    it('persists materialsTableTickers when provided', async () => {
      const updateSet = vi.fn().mockResolvedValue(undefined)
      const updateWhere = vi.fn().mockReturnValue(updateSet)
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({ where: updateWhere }),
      } as unknown as ReturnType<typeof db.update>)

      queueSelect(
        [{ id: 7 }],
        [{ x: 1 }],
        [],
        [
          {
            id: 7,
            ownersJson: JSON.stringify([{ userId: OWNER_ID, username: 'owner' }]),
            name: 'x',
            tickers: [],
            cards: [],
            excludedUserIds: [],
            materialsTableColumns: [],
            materialsTableTickers: ['RAT'],
            privacy: 'private',
            isPinned: false,
            deletedAt: null,
            createdAt: new Date('2026-04-22T00:00:00Z'),
            updatedAt: new Date('2026-04-22T00:00:00Z'),
          },
        ]
      )

      const result = await controller.update(7, { materialsTableTickers: ['rat'] }, ownerRequest)

      const updateResult = vi.mocked(db.update).mock.results[0].value as {
        set: ReturnType<typeof vi.fn>
      }
      const setArgs = updateResult.set.mock.calls[0][0]
      expect(setArgs.materialsTableTickers).toEqual(['RAT'])
      expect(result.materialsTableTickers).toEqual(['RAT'])
    })
  })

  describe('delete - ownership and soft-delete', () => {
    it('rejects non-owner with 403', async () => {
      queueSelect([{ id: 7 }], [])
      await expect(controller.delete(7, ownerRequest)).rejects.toThrow('do not have permission')
    })

    it('returns 404 when row is missing or already soft-deleted', async () => {
      queueSelect([])
      await expect(controller.delete(7, ownerRequest)).rejects.toThrow('View not found')
    })

    it('soft-deletes via UPDATE when caller is an owner', async () => {
      // Hard-delete must NOT be called — the row is preserved with deletedAt.
      const updateSet = vi.fn().mockResolvedValue(undefined)
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({ where: updateSet }),
      } as unknown as ReturnType<typeof db.update>)

      queueSelect([{ id: 7 }], [{ x: 1 }])

      await controller.delete(7, ownerRequest)

      expect(db.delete).not.toHaveBeenCalled()
      const updateResult = vi.mocked(db.update).mock.results[0].value as {
        set: ReturnType<typeof vi.fn>
      }
      const setArgs = updateResult.set.mock.calls[0][0]
      expect(setArgs.deletedAt).toBeInstanceOf(Date)
    })
  })

  describe('togglePin', () => {
    it('rejects users without filters.pin permission', async () => {
      vi.mocked(hasPermission).mockResolvedValue(false)
      await expect(controller.togglePin(7, ownerRequest)).rejects.toThrow('do not have permission')
    })

    it('returns 404 when row missing or soft-deleted', async () => {
      vi.mocked(hasPermission).mockResolvedValue(true)
      queueSelect([])
      await expect(controller.togglePin(7, ownerRequest)).rejects.toThrow('View not found')
    })

    it('rejects pinning a non-public view', async () => {
      vi.mocked(hasPermission).mockResolvedValue(true)
      queueSelect([{ id: 7, privacy: 'private', isPinned: false }])
      await expect(controller.togglePin(7, ownerRequest)).rejects.toThrow(
        'Only public views can be pinned'
      )
    })
  })

  // The post-mutation `fetchViewById` does subquery-scaffold + main-fetch and
  // owner-mgmt tests don't care about the returned row's contents — just that
  // the mutation happened. Use this to push a minimal valid pair onto the
  // select queue.
  function queueFetchViewById(id: number): void {
    queueSelect(
      [],
      [
        {
          id,
          ownersJson: JSON.stringify([{ userId: OWNER_ID, username: 'owner' }]),
          name: 'x',
          tickers: [],
          cards: [],
          excludedUserIds: [],
          materialsTableColumns: [],
          materialsTableTickers: [],
          privacy: 'private',
          isPinned: false,
          deletedAt: null,
          createdAt: new Date('2026-04-22T00:00:00Z'),
          updatedAt: new Date('2026-04-22T00:00:00Z'),
        },
      ]
    )
  }

  describe('addOwner', () => {
    it('rejects bad userId', async () => {
      await expect(controller.addOwner(7, { userId: 0 }, ownerRequest)).rejects.toThrow(/userId/)

      await expect(controller.addOwner(7, { userId: 1.5 }, ownerRequest)).rejects.toThrow(/userId/)
    })

    it('returns 404 when view missing or soft-deleted', async () => {
      queueSelect([])
      await expect(controller.addOwner(7, { userId: OTHER_ID }, ownerRequest)).rejects.toThrow(
        'View not found'
      )
    })

    it('rejects non-owner caller with 403', async () => {
      // existing-row → isOwner caller (empty)
      queueSelect([{ id: 7 }], [])
      await expect(controller.addOwner(7, { userId: OTHER_ID }, ownerRequest)).rejects.toThrow(
        'do not have permission'
      )
    })

    it('returns 404 when target user does not exist', async () => {
      // existing-row → isOwner caller → target user lookup (empty)
      queueSelect([{ id: 7 }], [{ x: 1 }], [])
      await expect(controller.addOwner(7, { userId: 999 }, ownerRequest)).rejects.toThrow(
        'Target user not found'
      )
    })

    it('409s when target is already an owner', async () => {
      // existing-row → isOwner caller → target user → isOwner target (already)
      queueSelect([{ id: 7 }], [{ x: 1 }], [{ id: OTHER_ID }], [{ x: 1 }])
      await expect(
        controller.addOwner(7, { userId: OTHER_ID }, ownerRequest)
      ).rejects.toMatchObject({ statusCode: 409 })
    })

    it('inserts the owner row when valid', async () => {
      const insertValues = vi.fn()
      vi.mocked(db.insert).mockReturnValue({
        values: insertValues.mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof db.insert>)

      // existing-row → isOwner caller → target user → isOwner target (no) →
      // (insert happens here, no select) → fetchViewById (scaffold + main)
      queueSelect([{ id: 7 }], [{ x: 1 }], [{ id: OTHER_ID }], [])
      queueFetchViewById(7)

      await controller.addOwner(7, { userId: OTHER_ID }, ownerRequest)

      expect(insertValues).toHaveBeenCalledWith({ viewId: 7, userId: OTHER_ID })
    })
  })

  describe('removeOwner', () => {
    it('returns 404 when view missing or soft-deleted', async () => {
      queueSelect([])
      await expect(controller.removeOwner(7, OTHER_ID, ownerRequest)).rejects.toThrow(
        'View not found'
      )
    })

    it('rejects non-owner caller with 403', async () => {
      queueSelect([{ id: 7 }], [])
      await expect(controller.removeOwner(7, OTHER_ID, ownerRequest)).rejects.toThrow(
        'do not have permission'
      )
    })

    it('returns 404 when target is not currently an owner', async () => {
      // existing-row → isOwner caller → isOwner target (empty)
      queueSelect([{ id: 7 }], [{ x: 1 }], [])
      await expect(controller.removeOwner(7, OTHER_ID, ownerRequest)).rejects.toThrow(
        'not an owner'
      )
    })

    it('409s when removing the last owner', async () => {
      // existing-row → isOwner caller → isOwner target → count
      queueSelect([{ id: 7 }], [{ x: 1 }], [{ x: 1 }], [{ count: 1 }])
      await expect(controller.removeOwner(7, OWNER_ID, ownerRequest)).rejects.toMatchObject({
        statusCode: 409,
      })
    })

    it('deletes the owner row when more than one remains', async () => {
      const deleteWhere = vi.fn().mockResolvedValue(undefined)
      vi.mocked(db.delete).mockReturnValue({
        where: deleteWhere,
      } as unknown as ReturnType<typeof db.delete>)

      // existing-row → isOwner caller → isOwner target → count(>=2) →
      // fetchViewById (subquery + main)
      queueSelect([{ id: 7 }], [{ x: 1 }], [{ x: 1 }], [{ count: 2 }])
      queueFetchViewById(7)

      await controller.removeOwner(7, OTHER_ID, ownerRequest)

      expect(db.delete).toHaveBeenCalled()
      expect(deleteWhere).toHaveBeenCalledTimes(1)
    })
  })

  describe('recordVisit', () => {
    it('returns 404 when view missing or soft-deleted', async () => {
      queueSelect([])
      await expect(controller.recordVisit(7, ownerRequest)).rejects.toThrow('View not found')
    })

    it('returns 404 for private view non-owner', async () => {
      // existing-row (private) → isOwner caller (empty)
      queueSelect([{ id: 7, privacy: 'private' }], [])
      await expect(controller.recordVisit(7, ownerRequest)).rejects.toThrow('View not found')
    })

    it('upserts the visit row for unlisted views without ownership check', async () => {
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
      const insertValues = vi.fn().mockReturnValue({ onConflictDoUpdate })
      vi.mocked(db.insert).mockReturnValue({
        values: insertValues,
      } as unknown as ReturnType<typeof db.insert>)

      queueSelect([{ id: 7, privacy: 'unlisted' }])

      await controller.recordVisit(7, ownerRequest)

      // Body of the upsert: caller userId, viewId, fresh timestamp.
      const insertedValues = insertValues.mock.calls[0][0] as {
        userId: number
        viewId: number
        lastVisitedAt: Date
      }
      expect(insertedValues.userId).toBe(OWNER_ID)
      expect(insertedValues.viewId).toBe(7)
      expect(insertedValues.lastVisitedAt).toBeInstanceOf(Date)
      // Conflict resolution must update lastVisitedAt — without that, repeat
      // visits never bump recency and `getVisited` ordering breaks.
      const conflictArgs = onConflictDoUpdate.mock.calls[0][0] as { set: { lastVisitedAt: Date } }
      expect(conflictArgs.set.lastVisitedAt).toBeInstanceOf(Date)
    })

    it('records the visit for an owner of a private view', async () => {
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({ onConflictDoUpdate }),
      } as unknown as ReturnType<typeof db.insert>)

      // existing-row (private) → isOwner caller (match) → upsert
      queueSelect([{ id: 7, privacy: 'private' }], [{ x: 1 }])

      await controller.recordVisit(7, ownerRequest)

      expect(onConflictDoUpdate).toHaveBeenCalled()
    })
  })
})
