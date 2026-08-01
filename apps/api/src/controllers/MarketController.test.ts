import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarketController } from './MarketController.js'
import { db } from '../db/index.js'
import * as permissionService from '../utils/permissionService.js'
import * as marketService from '@kawakawa/services/market'
import * as priceCalculator from '../services/price-calculator.js'
import * as activityService from '@kawakawa/services/activity'

/**
 * Create a chainable mock that supports subquery patterns.
 * Handles both subquery chains (db.select().from().where().as())
 * and main query chains (db.select().from().innerJoin().leftJoin().where()).
 */
function createQueryChain(finalResult: unknown) {
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    as: vi.fn().mockReturnValue({
      userId: 'userId',
      fioUsername: 'fioUsername',
    }),
    then: vi
      .fn()
      .mockImplementation((cb: (value: unknown) => unknown) =>
        Promise.resolve(finalResult).then(cb)
      ),
  }
  Object.defineProperty(chain, Symbol.toStringTag, { value: 'Promise' })
  return chain
}

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  sellOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    storageType: 'storageType',
    price: 'price',
    currency: 'currency',
    priceListCode: 'priceListCode',
    orderType: 'orderType',
    limitMode: 'limitMode',
    limitQuantity: 'limitQuantity',
  },
  buyOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    quantity: 'quantity',
    price: 'price',
    currency: 'currency',
    priceListCode: 'priceListCode',
    orderType: 'orderType',
    isStanding: 'isStanding',
  },
  users: {
    id: 'id',
    displayName: 'displayName',
    username: 'username',
  },
  userSettings: {
    userId: 'userId',
    settingKey: 'settingKey',
    value: 'value',
  },
}))

vi.mock('../utils/permissionService.js', () => ({
  hasPermission: vi.fn(),
}))

vi.mock('@kawakawa/services/market', () => ({
  enrichSellOrdersWithQuantities: vi.fn(),
  getReservationStatsForBuyOrders: vi.fn(),
}))

vi.mock('../services/price-calculator.js', () => ({
  calculateEffectivePriceBatch: vi.fn(),
}))

vi.mock('@kawakawa/services/activity', () => ({
  activeUserCondition: vi.fn(),
}))

vi.mock('@kawakawa/services/fio', () => ({
  fioClient: {
    getJumpCount: vi.fn(),
  },
}))

describe('MarketController', () => {
  let controller: MarketController
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: ['member'] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new MarketController()

    vi.mocked(db.select).mockReturnValue(createQueryChain([]) as any)
    vi.mocked(permissionService.hasPermission).mockResolvedValue(true)
    vi.mocked(activityService.activeUserCondition).mockResolvedValue(undefined as any)
  })

  describe('getMarketListings', () => {
    it('should return empty array when user has no permissions', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValue(false)

      const result = await controller.getMarketListings(mockRequest)

      expect(result).toEqual([])
    })

    it('should return empty array when no orders exist', async () => {
      const result = await controller.getMarketListings(mockRequest)

      expect(result).toEqual([])
    })

    it('should use batch price calculation for dynamic pricing orders', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '0.00',
          currency: 'CIS',
          priceListCode: 'KAWA',
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Seller1',
          username: 'seller1',
          fioUsernameRaw: null,
        },
        {
          id: 2,
          userId: 3,
          commodityTicker: 'RAT',
          locationId: 'BEN',
          price: '50.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Seller2',
          username: 'seller2',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 500,
              availableQuantity: 500,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 500,
              activeReservationCount: 0,
              fioUploadedAt: new Date('2024-01-15T10:00:00Z'),
            },
          ],
          [
            2,
            {
              fioQuantity: 200,
              availableQuantity: 200,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 200,
              activeReservationCount: 0,
              fioUploadedAt: new Date('2024-01-15T10:00:00Z'),
            },
          ],
        ])
      )

      vi.mocked(priceCalculator.calculateEffectivePriceBatch).mockResolvedValueOnce(
        new Map([
          [
            'KAWA:H2O:BEN',
            {
              priceListCode: 'KAWA',
              version: 1,
              commodityTicker: 'H2O',
              commodityName: 'Water',
              locationId: 'BEN',
              locationName: 'Benten',
              currency: 'CIS',
              basePrice: 42,
              source: 'manual',
              sourceReference: null,
              adjustments: [],
              finalPrice: 42,
              exchangeCode: 'KAWA',
            },
          ],
        ])
      )

      const result = await controller.getMarketListings(mockRequest)

      // Should call batch once, not individual calls
      expect(priceCalculator.calculateEffectivePriceBatch).toHaveBeenCalledTimes(1)
      expect(priceCalculator.calculateEffectivePriceBatch).toHaveBeenCalledWith([
        { priceListCode: 'KAWA', ticker: 'H2O', locationId: 'BEN', currency: 'CIS' },
      ])

      // Dynamic order should have effective price
      const dynamicListing = result.find(r => r.id === 1)
      expect(dynamicListing?.effectivePrice).toBe(42)
      expect(dynamicListing?.pricingMode).toBe('dynamic')

      // Fixed order should not have effective price
      const fixedListing = result.find(r => r.id === 2)
      expect(fixedListing?.effectivePrice).toBeNull()
      expect(fixedListing?.pricingMode).toBe('fixed')
      expect(fixedListing?.price).toBe(50)
    })

    it('should filter by commodity when specified', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Seller1',
          username: 'seller1',
          fioUsernameRaw: null,
        },
        {
          id: 2,
          userId: 3,
          commodityTicker: 'RAT',
          locationId: 'BEN',
          price: '50.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Seller2',
          username: 'seller2',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 500,
              availableQuantity: 500,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 500,
              activeReservationCount: 0,
              fioUploadedAt: null,
            },
          ],
        ])
      )

      const result = await controller.getMarketListings(mockRequest, 'H2O')

      expect(result).toHaveLength(1)
      expect(result[0].commodityTicker).toBe('H2O')
    })

    it('should filter out orders user lacks permission for', async () => {
      // Only allow internal, not partner
      vi.mocked(permissionService.hasPermission)
        .mockResolvedValueOnce(true) // canViewInternal
        .mockResolvedValueOnce(false) // canViewPartner

      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Seller1',
          username: 'seller1',
          fioUsernameRaw: null,
        },
        {
          id: 2,
          userId: 3,
          commodityTicker: 'RAT',
          locationId: 'BEN',
          price: '50.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'partner',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Seller2',
          username: 'seller2',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 500,
              availableQuantity: 500,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 500,
              activeReservationCount: 0,
              fioUploadedAt: null,
            },
          ],
        ])
      )

      const result = await controller.getMarketListings(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].orderType).toBe('internal')
    })

    it('should always show own orders regardless of permissions', async () => {
      // No permissions at all for partner
      vi.mocked(permissionService.hasPermission)
        .mockResolvedValueOnce(true) // canViewInternal
        .mockResolvedValueOnce(false) // canViewPartner

      const mockOrders = [
        {
          id: 1,
          userId: 1, // own order
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'partner', // partner type but own order
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'TestUser',
          username: 'testuser',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 500,
              availableQuantity: 500,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 500,
              activeReservationCount: 0,
              fioUploadedAt: null,
            },
          ],
        ])
      )

      const result = await controller.getMarketListings(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].isOwn).toBe(true)
    })

    it('should handle fallback pricing correctly', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'KW-020c',
          price: '0.00',
          currency: 'CIS',
          priceListCode: 'KAWA',
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Seller1',
          username: 'seller1',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 100,
              availableQuantity: 100,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 100,
              activeReservationCount: 0,
              fioUploadedAt: null,
            },
          ],
        ])
      )

      vi.mocked(priceCalculator.calculateEffectivePriceBatch).mockResolvedValueOnce(
        new Map([
          [
            'KAWA:H2O:KW-020c',
            {
              priceListCode: 'KAWA',
              version: 1,
              commodityTicker: 'H2O',
              commodityName: 'Water',
              locationId: 'BEN', // fallback location
              locationName: 'Benten',
              currency: 'CIS',
              basePrice: 42,
              source: 'manual' as const,
              sourceReference: null,
              adjustments: [],
              finalPrice: 42,
              exchangeCode: 'KAWA',
              isFallback: true,
              requestedLocationId: 'KW-020c',
            },
          ],
        ])
      )

      const result = await controller.getMarketListings(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].effectivePrice).toBe(42)
      expect(result[0].isFallback).toBe(true)
      expect(result[0].priceLocationId).toBe('BEN')
    })

    it('should not call batch price calculator when no dynamic orders', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Seller1',
          username: 'seller1',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 500,
              availableQuantity: 500,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 500,
              activeReservationCount: 0,
              fioUploadedAt: null,
            },
          ],
        ])
      )

      await controller.getMarketListings(mockRequest)

      expect(priceCalculator.calculateEffectivePriceBatch).not.toHaveBeenCalled()
    })

    it('should coalesce FIO username over display name for seller', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Display Name',
          username: 'loginname',
          fioUsernameRaw: '"PrUnName"',
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 500,
              availableQuantity: 500,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 500,
              activeReservationCount: 0,
              fioUploadedAt: null,
            },
          ],
        ])
      )

      const result = await controller.getMarketListings(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].sellerName).toBe('PrUnName')
    })

    it('should fall back to display name when no FIO username', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Display Name',
          username: 'loginname',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 500,
              availableQuantity: 500,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 500,
              activeReservationCount: 0,
              fioUploadedAt: null,
            },
          ],
        ])
      )

      const result = await controller.getMarketListings(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].sellerName).toBe('Display Name')
    })

    it('should fall back to username when no FIO username or display name', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: null as unknown as string,
          username: 'loginname',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 500,
              availableQuantity: 500,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 500,
              activeReservationCount: 0,
              fioUploadedAt: null,
            },
          ],
        ])
      )

      const result = await controller.getMarketListings(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].sellerName).toBe('loginname')
    })

    it('should ignore empty FIO username and fall back to display name', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          displayName: 'Display Name',
          username: 'loginname',
          fioUsernameRaw: '""',
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.enrichSellOrdersWithQuantities).mockResolvedValueOnce(
        new Map([
          [
            1,
            {
              fioQuantity: 500,
              availableQuantity: 500,
              reservedQuantity: 0,
              fulfilledQuantity: 0,
              remainingQuantity: 500,
              activeReservationCount: 0,
              fioUploadedAt: null,
            },
          ],
        ])
      )

      const result = await controller.getMarketListings(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].sellerName).toBe('Display Name')
    })
  })

  describe('getMarketBuyRequests', () => {
    it('should return empty array when user has no permissions', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValue(false)

      const result = await controller.getMarketBuyRequests(mockRequest)

      expect(result).toEqual([])
    })

    it('should return empty array when no orders exist', async () => {
      const result = await controller.getMarketBuyRequests(mockRequest)

      expect(result).toEqual([])
    })

    it('should use batch price calculation for dynamic buy orders', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          quantity: 100,
          price: '0.00',
          currency: 'CIS',
          priceListCode: 'KAWA',
          orderType: 'internal',
          isStanding: false,
          displayName: 'Buyer1',
          username: 'buyer1',
          fioUsernameRaw: null,
        },
        {
          id: 2,
          userId: 3,
          commodityTicker: 'RAT',
          locationId: 'BEN',
          quantity: 50,
          price: '75.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          isStanding: false,
          displayName: 'Buyer2',
          username: 'buyer2',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.getReservationStatsForBuyOrders).mockResolvedValueOnce(new Map())

      vi.mocked(priceCalculator.calculateEffectivePriceBatch).mockResolvedValueOnce(
        new Map([
          [
            'KAWA:H2O:BEN',
            {
              priceListCode: 'KAWA',
              version: 1,
              commodityTicker: 'H2O',
              commodityName: 'Water',
              locationId: 'BEN',
              locationName: 'Benten',
              currency: 'CIS',
              basePrice: 42,
              source: 'manual' as const,
              sourceReference: null,
              adjustments: [],
              finalPrice: 42,
              exchangeCode: 'KAWA',
            },
          ],
        ])
      )

      const result = await controller.getMarketBuyRequests(mockRequest)

      expect(priceCalculator.calculateEffectivePriceBatch).toHaveBeenCalledTimes(1)
      expect(priceCalculator.calculateEffectivePriceBatch).toHaveBeenCalledWith([
        { priceListCode: 'KAWA', ticker: 'H2O', locationId: 'BEN', currency: 'CIS' },
      ])

      const dynamicOrder = result.find(r => r.id === 1)
      expect(dynamicOrder?.effectivePrice).toBe(42)
      expect(dynamicOrder?.pricingMode).toBe('dynamic')

      const fixedOrder = result.find(r => r.id === 2)
      expect(fixedOrder?.effectivePrice).toBeNull()
      expect(fixedOrder?.pricingMode).toBe('fixed')
      expect(fixedOrder?.price).toBe(75)
    })

    it('should include reservation stats in buy order responses', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          quantity: 100,
          price: '50.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          isStanding: false,
          displayName: 'Buyer1',
          username: 'buyer1',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.getReservationStatsForBuyOrders).mockResolvedValueOnce(
        new Map([[1, { count: 2, quantity: 30, fulfilledQuantity: 10 }]])
      )

      const result = await controller.getMarketBuyRequests(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].activeReservationCount).toBe(2)
      expect(result[0].reservedQuantity).toBe(30)
      expect(result[0].remainingQuantity).toBe(60) // 100 - 30 - 10
    })

    it('should filter by commodity and location', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          quantity: 100,
          price: '50.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          isStanding: false,
          displayName: 'Buyer1',
          username: 'buyer1',
          fioUsernameRaw: null,
        },
        {
          id: 2,
          userId: 3,
          commodityTicker: 'RAT',
          locationId: 'MOR',
          quantity: 50,
          price: '75.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          isStanding: false,
          displayName: 'Buyer2',
          username: 'buyer2',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.getReservationStatsForBuyOrders).mockResolvedValueOnce(new Map())

      const result = await controller.getMarketBuyRequests(mockRequest, 'H2O', 'BEN')

      expect(result).toHaveLength(1)
      expect(result[0].commodityTicker).toBe('H2O')
      expect(result[0].locationId).toBe('BEN')
    })

    it('should not call batch price calculator when no dynamic orders', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          quantity: 100,
          price: '50.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          isStanding: false,
          displayName: 'Buyer1',
          username: 'buyer1',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.getReservationStatsForBuyOrders).mockResolvedValueOnce(new Map())

      await controller.getMarketBuyRequests(mockRequest)

      expect(priceCalculator.calculateEffectivePriceBatch).not.toHaveBeenCalled()
    })

    it('should coalesce FIO username over display name for buyer', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          quantity: 100,
          price: '50.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          isStanding: false,
          displayName: 'Display Name',
          username: 'loginname',
          fioUsernameRaw: '"PrUnName"',
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.getReservationStatsForBuyOrders).mockResolvedValueOnce(new Map())

      const result = await controller.getMarketBuyRequests(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].buyerName).toBe('PrUnName')
    })

    it('should fall back to display name when no FIO username for buyer', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          quantity: 100,
          price: '50.00',
          currency: 'CIS',
          priceListCode: null,
          orderType: 'internal',
          isStanding: false,
          displayName: 'Display Name',
          username: 'loginname',
          fioUsernameRaw: null,
        },
      ]

      vi.mocked(db.select).mockReturnValue(createQueryChain(mockOrders) as any)

      vi.mocked(marketService.getReservationStatsForBuyOrders).mockResolvedValueOnce(new Map())

      const result = await controller.getMarketBuyRequests(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].buyerName).toBe('Display Name')
    })
  })
})
