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
}))

vi.mock('@kawakawa/services/market', () => ({
  enrichSellOrdersWithQuantities: vi.fn(async () => new Map()),
}))

import { db } from '../db/index.js'
import * as userSettingsService from '@kawakawa/services/user-settings'

describe('BurnRepairController', () => {
  let controller: BurnRepairController
  const mockRequest = { user: { userId: 1, username: 'test', roles: [] } }

  beforeEach(() => {
    vi.clearAllMocks()
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
    it('should return empty when no included roles', async () => {
      vi.mocked(userSettingsService.getSetting).mockResolvedValue([])

      const result = await controller.getCorpOverview(mockRequest)
      expect(result.materials).toEqual([])
      expect(result.includedUserCount).toBe(0)
    })

    it('should aggregate burn/repair across included users, excluding stale', async () => {
      // Mock: includedRoles = ['member']
      vi.mocked(userSettingsService.getSetting).mockResolvedValue(['member'])

      // Query 1: find users with role 'member'
      const rolesChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ userId: 1 }, { userId: 2 }, { userId: 3 }]),
        }),
      }

      // Query 2: oldest FIO upload per user — user 3's data is 50 days old so excluded.
      const now = Date.now()
      const freshAgeChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { userId: 1, oldest: new Date(now - 2 * 86_400_000) },
              { userId: 2, oldest: new Date(now - 10 * 86_400_000) },
              { userId: 3, oldest: new Date(now - 50 * 86_400_000) },
            ]),
          }),
        }),
      }

      // Query 3: aggregate query (corp-wide totals)
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

      // Query 4: per-user aggregation (empty for this test — covered separately)
      const perUserChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }

      // Query 5: sell orders for surplus aggregation (no orders for this test)
      const sellOrdersChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }

      // Query 6: login usernames
      const loginChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 1, username: 'alice' },
            { id: 2, username: 'bob' },
          ]),
        }),
      }

      // Query 7: fio.username settings
      const fioChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(rolesChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(freshAgeChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(aggregateChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(perUserChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(sellOrdersChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(loginChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(fioChain as unknown as ReturnType<typeof db.select>)

      const result = await controller.getCorpOverview(mockRequest)

      expect(result.includedUserCount).toBe(2)
      expect(result.staleUserCount).toBe(1)
      expect(result.materials).toHaveLength(1)
      expect(result.materials[0].commodityTicker).toBe('RAT')
      expect(result.materials[0].burnDaily).toBe(8)
      expect(result.availableSurplus).toEqual({})
      expect(result.perUser).toEqual([])
    })

    it('should exclude users who have never uploaded to FIO', async () => {
      vi.mocked(userSettingsService.getSetting).mockResolvedValue(['member'])

      const rolesChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ userId: 1 }, { userId: 2 }]),
        }),
      }

      // Only user 1 has uploaded to FIO; user 2 has never connected.
      const ageChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi
              .fn()
              .mockResolvedValue([{ userId: 1, oldest: new Date() }]),
          }),
        }),
      }

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
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }
      const sellOrdersChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }
      const loginChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 1, username: 'alice' }]),
        }),
      }
      const fioChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(rolesChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(ageChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(aggregateChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(perUserChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(sellOrdersChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(loginChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(fioChain as unknown as ReturnType<typeof db.select>)

      const result = await controller.getCorpOverview(mockRequest)

      expect(result.includedUserCount).toBe(1)
      expect(result.staleUserCount).toBe(1) // user 2 excluded: no FIO uploads
    })

    it('should return per-user rollups with FIO username, falling back to login username', async () => {
      vi.mocked(userSettingsService.getSetting).mockResolvedValue(['member'])

      const rolesChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ userId: 1 }, { userId: 2 }]),
        }),
      }
      // Both users uploaded recently, so both pass the freshness filter.
      // The returned `oldest` doubles as the FIO data age surfaced per user.
      const ageChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { userId: 1, oldest: new Date('2026-04-20T00:00:00Z') },
              { userId: 2, oldest: new Date('2026-04-15T00:00:00Z') },
            ]),
          }),
        }),
      }
      const aggregateChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }
      // User 1 produces RAT, user 2 consumes RAT
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
      const sellOrdersChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }
      const loginChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 1, username: 'alice-login' },
            { id: 2, username: 'bob-login' },
          ]),
        }),
      }
      // User 1 has a FIO username override; user 2 does not → should fall back to login username
      const fioChain = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ userId: 1, value: JSON.stringify('AliceFIO') }]),
        }),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(rolesChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(ageChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(aggregateChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(perUserChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(sellOrdersChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(loginChain as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce(fioChain as unknown as ReturnType<typeof db.select>)

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
