import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/index.js', () => ({
  db: { select: vi.fn() },
  corpSnapshotUserTicker: {
    userId: 'user_id',
    commodityTicker: 'commodity_ticker',
    snapshotAt: 'snapshot_at',
    burnDaily: 'burn_daily',
    inputsDaily: 'inputs_daily',
    productionDaily: 'production_daily',
    repairTotal: 'repair_total',
  },
  corpSnapshotTickerStock: {
    commodityTicker: 'commodity_ticker',
    snapshotAt: 'snapshot_at',
    stock: 'stock',
  },
}))

vi.mock('@kawakawa/services/burn-repair', () => ({
  resolveActiveMembers: vi.fn(),
  resolveDisplayUsernames: vi.fn(),
}))

import { db } from '../db/index.js'
import { resolveActiveMembers, resolveDisplayUsernames } from '@kawakawa/services/burn-repair'
import { CorpSnapshotsController } from './CorpSnapshotsController.js'

const mockRequest = { user: { userId: 1, username: 'alice', roles: ['member'] } }

function mockChain(rows: unknown[]): ReturnType<typeof db.select> {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
    catch: (reject: (v: unknown) => void) => Promise.resolve(rows).catch(reject),
  }
  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.groupBy = vi.fn().mockReturnValue(chain)
  chain.orderBy = vi.fn().mockReturnValue(chain)
  return chain as unknown as ReturnType<typeof db.select>
}

function userTickerRow(overrides: {
  t: string
  userId: number
  ticker: string
  burn?: number
  inputs?: number
  prod?: number
  repair?: number
}) {
  return {
    t: new Date(overrides.t),
    userId: overrides.userId,
    commodityTicker: overrides.ticker,
    burnDaily: String(overrides.burn ?? 0),
    inputsDaily: String(overrides.inputs ?? 0),
    productionDaily: String(overrides.prod ?? 0),
    repairTotal: String(overrides.repair ?? 0),
  }
}

describe('CorpSnapshotsController.query', () => {
  let controller: CorpSnapshotsController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new CorpSnapshotsController()
    vi.mocked(resolveActiveMembers).mockResolvedValue({
      activeUserIds: [1, 2, 3],
      staleUserCount: 0,
      staleUserIds: [],
      fioAgeMap: new Map(),
    })
    vi.mocked(resolveDisplayUsernames).mockResolvedValue(
      new Map([
        [1, 'alice'],
        [2, 'bob'],
        [3, 'carol'],
      ])
    )
  })

  // ---------- Validation ----------

  it("rejects yMetric='repairPerDay' (not stored historically)", async () => {
    await expect(controller.query(mockRequest, 'repairPerDay', 'corp', '7d')).rejects.toThrow(
      /repairPerDay/
    )
  })

  it("rejects yMetric='username' (display dimension)", async () => {
    await expect(controller.query(mockRequest, 'username', 'user', '7d')).rejects.toThrow(
      /username/
    )
  })

  it("rejects stock metrics when seriesBy='user'", async () => {
    await expect(controller.query(mockRequest, 'stock', 'user', '7d')).rejects.toThrow(
      /seriesBy='corp'/
    )
    await expect(controller.query(mockRequest, 'daysRemaining', 'user', '7d')).rejects.toThrow(
      /seriesBy='corp'/
    )
  })

  // ---------- Bucket auto-selection ----------

  it('auto-selects daily bucket for ranges ≤ 90 days', async () => {
    vi.mocked(db.select).mockReturnValueOnce(mockChain([]))
    const r = await controller.query(mockRequest, 'productionDaily', 'user', '30d')
    expect(r.bucket).toBe('day')
  })

  it('auto-selects weekly bucket for ranges > 90 days and ≤ 1 year', async () => {
    vi.mocked(db.select).mockReturnValueOnce(mockChain([]))
    const r = await controller.query(mockRequest, 'productionDaily', 'user', '1y')
    expect(r.bucket).toBe('week')
  })

  it('auto-selects monthly bucket for ranges > 1 year', async () => {
    vi.mocked(db.select).mockReturnValueOnce(mockChain([]))
    const r = await controller.query(mockRequest, 'productionDaily', 'user', '2y')
    expect(r.bucket).toBe('month')
  })

  it('honors caller-supplied bucket', async () => {
    vi.mocked(db.select).mockReturnValueOnce(mockChain([]))
    const r = await controller.query(
      mockRequest,
      'productionDaily',
      'user',
      '2y',
      undefined,
      undefined,
      'day'
    )
    expect(r.bucket).toBe('day')
  })

  // ---------- Empty cases ----------

  it('returns empty series when no active members', async () => {
    vi.mocked(resolveActiveMembers).mockResolvedValue({
      activeUserIds: [],
      staleUserCount: 0,
      staleUserIds: [],
      fioAgeMap: new Map(),
    })
    const r = await controller.query(mockRequest, 'productionDaily', 'user', '30d')
    expect(r.series).toEqual([])
  })

  // ---------- Series assembly ----------

  it('builds per-user series with single-ticker scope labelled by username', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      mockChain([
        userTickerRow({ t: '2026-04-20', userId: 1, ticker: 'RAT', prod: 10 }),
        userTickerRow({ t: '2026-04-21', userId: 1, ticker: 'RAT', prod: 12 }),
        userTickerRow({ t: '2026-04-20', userId: 2, ticker: 'RAT', prod: 3 }),
      ])
    )

    const r = await controller.query(
      mockRequest,
      'productionDaily',
      'user',
      '7d',
      undefined,
      undefined,
      undefined,
      'RAT'
    )

    expect(r.series).toHaveLength(2)
    const alice = r.series.find(s => s.label === 'alice')
    const bob = r.series.find(s => s.label === 'bob')
    expect(alice).toBeDefined()
    expect(bob).toBeDefined()
    expect(alice!.points).toHaveLength(2)
    expect(alice!.points.map(p => p.v)).toEqual([10, 12])
    expect(bob!.points).toHaveLength(1)
    expect(bob!.points[0].v).toBe(3)
  })

  it('labels per-user series with user · ticker when multiple tickers in scope', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      mockChain([
        userTickerRow({ t: '2026-04-20', userId: 1, ticker: 'RAT', prod: 5 }),
        userTickerRow({ t: '2026-04-20', userId: 1, ticker: 'DW', prod: 7 }),
      ])
    )
    const r = await controller.query(
      mockRequest,
      'productionDaily',
      'user',
      '7d',
      undefined,
      undefined,
      undefined,
      'RAT,DW'
    )
    const labels = r.series.map(s => s.label).sort()
    expect(labels).toEqual(['alice · DW', 'alice · RAT'])
  })

  it('sums across users for corp-aggregate series, one per ticker', async () => {
    vi.mocked(db.select).mockReturnValueOnce(
      mockChain([
        userTickerRow({ t: '2026-04-20', userId: 1, ticker: 'RAT', prod: 4 }),
        userTickerRow({ t: '2026-04-20', userId: 2, ticker: 'RAT', prod: 6 }),
        userTickerRow({ t: '2026-04-21', userId: 1, ticker: 'RAT', prod: 7 }),
      ])
    )
    const r = await controller.query(mockRequest, 'productionDaily', 'corp', '7d')
    expect(r.series).toHaveLength(1)
    expect(r.series[0].label).toBe('RAT')
    const points = r.series[0].points
    expect(points.find(p => p.t.startsWith('2026-04-20'))?.v).toBe(10)
    expect(points.find(p => p.t.startsWith('2026-04-21'))?.v).toBe(7)
  })

  // ---------- Top-N overflow ----------

  it("collapses producers beyond seriesLimit into an 'Other (N)' series", async () => {
    // 7 distinct users, seriesLimit = 5 → top 5 kept, 2 rolled up.
    const rows = [1, 2, 3, 4, 5, 6, 7].map(userId =>
      userTickerRow({ t: '2026-04-20', userId, ticker: 'RAT', prod: userId })
    )
    vi.mocked(resolveActiveMembers).mockResolvedValue({
      activeUserIds: [1, 2, 3, 4, 5, 6, 7],
      staleUserCount: 0,
      staleUserIds: [],
      fioAgeMap: new Map(),
    })
    vi.mocked(resolveDisplayUsernames).mockResolvedValue(
      new Map([
        [1, 'u1'],
        [2, 'u2'],
        [3, 'u3'],
        [4, 'u4'],
        [5, 'u5'],
        [6, 'u6'],
        [7, 'u7'],
      ])
    )
    vi.mocked(db.select).mockReturnValueOnce(mockChain(rows))

    const r = await controller.query(
      mockRequest,
      'productionDaily',
      'user',
      '7d',
      undefined,
      undefined,
      undefined,
      'RAT',
      5,
      undefined,
      true // includeOther — the rollup is opt-in
    )

    expect(r.series).toHaveLength(6) // 5 top + 1 Other
    const other = r.series.find(s => s.label.startsWith('Other ('))
    expect(other?.label).toBe('Other (2)')
    // Other should sum u1 (prod 1) + u2 (prod 2) — the two lowest — so value 3.
    expect(other?.points[0].v).toBe(3)
  })

  // ---------- Stock join ----------

  it('merges corp stock rows when yMetric is stock-dependent', async () => {
    // User-ticker query first, then stock query.
    vi.mocked(db.select)
      .mockReturnValueOnce(
        mockChain([
          userTickerRow({ t: '2026-04-20', userId: 1, ticker: 'RAT', burn: 2, inputs: 3, prod: 1 }),
          userTickerRow({ t: '2026-04-20', userId: 2, ticker: 'RAT', burn: 1, inputs: 0, prod: 0 }),
        ])
      )
      .mockReturnValueOnce(
        mockChain([{ t: new Date('2026-04-20'), commodityTicker: 'RAT', stock: '30' }])
      )

    // `daysRemaining` exercises the same stock-merge path that `daysOfCover`
    // used to: stock-dependent metric, ticker-grouping. Math: corp consumption
    // = (2+3)+(1+0) = 6; corp production = 1; gap = 5; daysRemaining = 30/5.
    const r = await controller.query(mockRequest, 'daysRemaining', 'corp', '7d')

    expect(r.series).toHaveLength(1)
    expect(r.series[0].label).toBe('RAT')
    expect(r.series[0].points[0].v).toBe(6)
  })
})
