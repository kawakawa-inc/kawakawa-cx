import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BurnRepairController } from './BurnRepairController.js'

// Mock database
vi.mock('../db/index.js', () => {
  return {
    db: {
      select: vi.fn(),
      query: {
        fioUserPlanets: {
          findMany: vi.fn(),
        },
      },
    },
    burnRepairCache: {
      userId: 'user_id',
      planetNaturalId: 'planet_natural_id',
      commodityTicker: 'commodity_ticker',
    },
    userRoles: { userId: 'user_id', roleId: 'role_id' },
    users: { id: 'id', username: 'username' },
    userSettings: { userId: 'user_id', settingKey: 'setting_key', value: 'value' },
    fioUserPlanets: { id: 'id', userId: 'user_id' },
    fioPlanetBuildings: { userPlanetId: 'user_planet_id', buildingTicker: 'building_ticker' },
    fioPlanetWorkforce: {
      userPlanetId: 'user_planet_id',
      workforceType: 'workforce_type',
      population: 'population',
      required: 'required',
    },
    fioUserStorage: {
      id: 'id',
      userId: 'user_id',
      locationId: 'location_id',
      fioUploadedAt: 'fio_uploaded_at',
    },
    fioInventory: {
      userStorageId: 'user_storage_id',
      commodityTicker: 'commodity_ticker',
      quantity: 'quantity',
    },
    sellOrders: {
      id: 'id',
      userId: 'user_id',
      commodityTicker: 'commodity_ticker',
      locationId: 'location_id',
      limitMode: 'limit_mode',
      limitQuantity: 'limit_quantity',
    },
  }
})

vi.mock('@kawakawa/services/user-settings', () => ({
  getSetting: vi.fn(),
}))

vi.mock('@kawakawa/services/supply', () => ({
  getRepairableTickers: vi.fn(async () => new Set(['FRM'])),
  resolveActiveMembers: vi.fn(),
  resolveDisplayUsernames: vi.fn(async () => new Map()),
  computeCorpStock: vi.fn(),
}))

vi.mock('@kawakawa/services/market', () => ({
  enrichSellOrdersWithQuantities: vi.fn(async () => new Map()),
}))

import { db } from '../db/index.js'
import {
  computeCorpStock,
  getRepairableTickers,
  resolveActiveMembers,
  resolveDisplayUsernames,
} from '@kawakawa/services/supply'

describe('BurnRepairController', () => {
  let controller: BurnRepairController
  const mockRequest = { user: { userId: 1, username: 'test', roles: [] } }

  beforeEach(() => {
    // resetAllMocks clears both call history AND queued .mockReturnValueOnce
    // values — important because tests chain multiple return values and leaks
    // between tests surface as confusing "not a function" errors. Side effect:
    // factory-level default implementations are wiped too, so we re-install
    // the innocuous defaults that most tests rely on.
    vi.resetAllMocks()
    vi.mocked(getRepairableTickers).mockResolvedValue(new Set(['FRM']))
    vi.mocked(resolveDisplayUsernames).mockResolvedValue(new Map())
    controller = new BurnRepairController()
  })

  describe('getMyBases', () => {
    it('should return empty planets when no data', async () => {
      // Mock cache query
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>)

      // Mock planet query
      vi.mocked(db.query.fioUserPlanets.findMany).mockResolvedValue([])

      const result = await controller.getMyBases(mockRequest)
      expect(result.planets).toEqual([])
    })

    it('should group cache rows by planet with building/workforce summary', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                planetNaturalId: 'UV-351a',
                planetName: 'Katoa',
                commodityTicker: 'RAT',
                burnDaily: '4.0000',
                inputsDaily: '0.0000',
                repairTotal: '0.0000',
                computedAt: new Date('2026-04-16T00:00:00Z'),
                userPlanetId: 10,
                userId: 1,
                id: 1,
              },
            ]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>)

      vi.mocked(db.query.fioUserPlanets.findMany).mockResolvedValue([
        {
          id: 10,
          userId: 1,
          planetNaturalId: 'UV-351a',
          planetName: 'Katoa',
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          buildings: [
            {
              id: 1,
              userPlanetId: 10,
              buildingId: 'b1',
              buildingTicker: 'FRM',
              buildingCreated: new Date(),
              buildingLastRepair: null,
              condition: '0.95',
              createdAt: new Date(),
              constructionCosts: [],
              repairMaterials: [],
              reclaimableMaterials: [],
            },
          ],
          workforce: [
            {
              id: 1,
              userPlanetId: 10,
              workforceType: 'PIONEER',
              population: 100,
              required: 100,
              createdAt: new Date(),
              needs: [],
            },
          ],
          production: [],
        },
      ] as any)

      const result = await controller.getMyBases(mockRequest)

      expect(result.planets).toHaveLength(1)
      expect(result.planets[0].planetNaturalId).toBe('UV-351a')
      expect(result.planets[0].materials).toHaveLength(1)
      expect(result.planets[0].materials[0].commodityTicker).toBe('RAT')
      expect(result.planets[0].materials[0].burnDaily).toBe(4)
      expect(result.planets[0].buildingCount).toBe(1)
      expect(result.planets[0].buildings).toHaveLength(1)
      expect(result.planets[0].buildings[0].ticker).toBe('FRM')
      expect(result.planets[0].buildings[0].needsRepair).toBe(true)
      expect(result.planets[0].workforceSummary).toHaveLength(1)
      expect(result.planets[0].workforceSummary[0].type).toBe('PIONEER')
    })
  })

  describe('getCorpOverview', () => {
    it('should return empty when resolveActiveMembers yields no users', async () => {
      vi.mocked(resolveActiveMembers).mockResolvedValue({
        activeUserIds: [],
        staleUserCount: 0,
        staleUserIds: [],
        fioAgeMap: new Map(),
      })

      const result = await controller.getCorpOverview(mockRequest)
      expect(result.materials).toEqual([])
      expect(result.includedUserCount).toBe(0)
    })

    it('should aggregate burn/repair across active members, report stale count', async () => {
      vi.mocked(resolveActiveMembers).mockResolvedValue({
        activeUserIds: [1, 2],
        staleUserCount: 1,
        staleUserIds: [3],
        fioAgeMap: new Map(),
      })
      vi.mocked(computeCorpStock).mockResolvedValue({})

      // Query 1: aggregate query (corp-wide totals)
      const aggregateChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  commodityTicker: 'RAT',
                  burnDaily: '8.0000',
                  inputsDaily: '0.0000',
                  repairTotal: '0.0000',
                  productionDaily: '0.0000',
                },
              ]),
            }),
          }),
        }),
      }

      // Query 2: per-user aggregation (empty for this test — covered separately)
      const perUserChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(aggregateChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(perUserChain as unknown as ReturnType<typeof db.select>)

      const result = await controller.getCorpOverview(mockRequest)

      expect(result.includedUserCount).toBe(2)
      expect(result.staleUserCount).toBe(1)
      expect(result.materials).toHaveLength(1)
      expect(result.materials[0].commodityTicker).toBe('RAT')
      expect(result.materials[0].burnDaily).toBe(8)
      expect(result.availableSurplus).toEqual({})
      expect(result.perUser).toEqual([])
    })

    // FIO-age filtering (both the stale-data cutoff and the never-uploaded
    // exclusion) is exercised by the corp-members service tests. The
    // controller just forwards whatever resolveActiveMembers returns.

    it('should forward per-user rows with display names from the service and FIO ages from the member resolver', async () => {
      // Username resolution logic itself lives in resolveDisplayUsernames; the
      // controller just stitches its result onto each row. FIO age comes from
      // the active-members resolver. Both get forwarded as-is.
      vi.mocked(resolveActiveMembers).mockResolvedValue({
        activeUserIds: [1, 2],
        staleUserCount: 0,
        staleUserIds: [],
        fioAgeMap: new Map([
          [1, '2026-04-20T00:00:00.000Z'],
          [2, '2026-04-15T00:00:00.000Z'],
        ]),
      })
      vi.mocked(computeCorpStock).mockResolvedValue({})
      vi.mocked(resolveDisplayUsernames).mockResolvedValue(
        new Map([
          [1, 'AliceFIO'],
          [2, 'bob-login'],
        ])
      )

      const aggregateChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }
      const perUserChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              {
                userId: 1,
                commodityTicker: 'RAT',
                burnDaily: '0.0000',
                inputsDaily: '0.0000',
                repairTotal: '0.0000',
                productionDaily: '5.0000',
              },
              {
                userId: 2,
                commodityTicker: 'RAT',
                burnDaily: '3.0000',
                inputsDaily: '0.0000',
                repairTotal: '0.0000',
                productionDaily: '0.0000',
              },
            ]),
          }),
        }),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(aggregateChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(perUserChain as unknown as ReturnType<typeof db.select>)

      const result = await controller.getCorpOverview(mockRequest)

      expect(result.perUser).toHaveLength(2)
      const alice = result.perUser.find(r => r.userId === 1)!
      const bob = result.perUser.find(r => r.userId === 2)!
      expect(alice.username).toBe('AliceFIO')
      expect(alice.productionDaily).toBe(5)
      expect(alice.fioDataAge).toBe('2026-04-20T00:00:00.000Z')
      expect(bob.username).toBe('bob-login')
      expect(bob.burnDaily).toBe(3)
      expect(bob.fioDataAge).toBe('2026-04-15T00:00:00.000Z')
    })
  })

  describe('getShoppingList', () => {
    it('should compute shopping list with correct formula including production', async () => {
      // Mock cache rows for the base
      const cacheChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              commodityTicker: 'RAT',
              burnDaily: '4.0000',
              inputsDaily: '1.0000',
              repairTotal: '10.0000',
              productionDaily: '2.0000',
            },
          ]),
        }),
      }

      // Mock inventory at origin (has 5 RAT)
      const originInvChain = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ ticker: 'RAT', quantity: 5 }]),
          }),
        }),
      }

      // Mock inventory at base (has 0 RAT)
      const baseInvChain = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(cacheChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(originInvChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(baseInvChain as unknown as ReturnType<typeof db.select>)

      const result = await controller.getShoppingList(
        { originLocationId: 'BEN', basePlanetId: 'UV-351a', days: 7 },
        mockRequest
      )

      // consumption = (4 + 1) * 7 + 10 = 45
      // production = 2 * 7 = 14
      // gap = max(0, ceil(45 - 14 - 5 - 0)) = 26
      expect(result.items).toHaveLength(1)
      expect(result.items[0].commodityTicker).toBe('RAT')
      expect(result.items[0].demand).toBe(45)
      expect(result.items[0].production).toBe(14)
      expect(result.items[0].originStock).toBe(5)
      expect(result.items[0].baseStock).toBe(0)
      expect(result.items[0].gap).toBe(26)
    })

    it('should return empty when stock covers demand', async () => {
      const cacheChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              commodityTicker: 'RAT',
              burnDaily: '1.0000',
              inputsDaily: '0.0000',
              repairTotal: '0.0000',
              productionDaily: '0.0000',
            },
          ]),
        }),
      }

      const originInvChain = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ ticker: 'RAT', quantity: 100 }]),
          }),
        }),
      }

      const baseInvChain = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(cacheChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(originInvChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(baseInvChain as unknown as ReturnType<typeof db.select>)

      const result = await controller.getShoppingList(
        { originLocationId: 'BEN', basePlanetId: 'UV-351a', days: 7 },
        mockRequest
      )

      // demand = 1 * 7 = 7, stock = 100 → gap = 0 → excluded
      expect(result.items).toHaveLength(0)
    })

    it('should reject days <= 0', async () => {
      await expect(
        controller.getShoppingList(
          { originLocationId: 'BEN', basePlanetId: 'UV-351a', days: 0 },
          mockRequest
        )
      ).rejects.toThrow('Days must be greater than 0')
    })
  })
})
