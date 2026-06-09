import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateEffectivePrice,
  calculateEffectivePriceWithFallback,
  getOrderDisplayPrice,
} from './price.js'

vi.mock('@kawakawa/db', () => ({
  db: {
    select: vi.fn(),
  },
  prices: {
    priceListCode: 'priceListCode',
    version: 'version',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    price: 'price',
    source: 'source',
    sourceReference: 'sourceReference',
  },
  priceLists: {
    code: 'code',
    currency: 'currency',
    currentVersion: 'currentVersion',
  },
  priceListVersions: {
    priceListCode: 'priceListCode',
    version: 'version',
    label: 'label',
    defaultLocationId: 'defaultLocationId',
  },
  priceAdjustments: {
    id: 'id',
    priceListCode: 'priceListCode',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    adjustmentType: 'adjustmentType',
    adjustmentValue: 'adjustmentValue',
    priority: 'priority',
    description: 'description',
    isActive: 'isActive',
    effectiveFrom: 'effectiveFrom',
    effectiveUntil: 'effectiveUntil',
  },
  fioCommodities: {
    ticker: 'ticker',
    name: 'name',
  },
  fioLocations: {
    naturalId: 'naturalId',
    name: 'name',
  },
}))

import { db } from '@kawakawa/db'

describe('price', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createVersionResolutionMock(currentVersion = 1) {
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ currentVersion }]),
    }
  }

  describe('calculateEffectivePrice', () => {
    it('should return null when no base price exists', async () => {
      const mockVersionSelect = createVersionResolutionMock()
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).toBeNull()
    })

    it('should use currentVersion when no version is provided', async () => {
      const mockVersionSelect = createVersionResolutionMock(2)
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            version: 2,
            versionLabel: 'Phase 2',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.version).toBe(2)
      expect(result!.versionLabel).toBe('Phase 2')
    })

    it('should use explicit version when provided', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            version: 1,
            versionLabel: 'Phase 1',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '50.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS', 1)

      // Should NOT query for currentVersion since we passed it explicitly
      expect(db.select).toHaveBeenCalledTimes(2)
      expect(result).not.toBeNull()
      expect(result!.version).toBe(1)
      expect(result!.versionLabel).toBe('Phase 1')
      expect(result!.basePrice).toBe(50)
    })

    it('should filter by version in the price query', async () => {
      const mockVersionSelect = createVersionResolutionMock(3)
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)

      await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      // Verify the where clause was called on the base price select
      const whereMock = mockBasePriceSelect.where
      expect(whereMock).toHaveBeenCalledTimes(1)
    })

    it('should return base price when no adjustments apply', async () => {
      const mockVersionSelect = createVersionResolutionMock()
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            version: 1,
            versionLabel: null,
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(100)
      expect(result!.adjustments).toHaveLength(0)
      expect(result!.version).toBe(1)
      expect(result!.versionLabel).toBeNull()
    })

    it('should apply percentage adjustment correctly', async () => {
      const mockVersionSelect = createVersionResolutionMock()
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            version: 1,
            versionLabel: null,
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: 'KAWA',
            commodityTicker: null,
            locationId: null,
            adjustmentType: 'percentage',
            adjustmentValue: '10.0000',
            priority: 0,
            description: 'KAWA 10% markup',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(110)
      expect(result!.adjustments).toHaveLength(1)
      expect(result!.adjustments[0].appliedAmount).toBe(10)
    })

    it('should apply fixed adjustment correctly', async () => {
      const mockVersionSelect = createVersionResolutionMock()
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'CI1',
            version: 1,
            versionLabel: null,
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '100.00',
            currency: 'CIS',
            source: 'fio_exchange',
            sourceReference: 'CI1',
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: null,
            commodityTicker: null,
            locationId: 'BEN',
            adjustmentType: 'fixed',
            adjustmentValue: '50.0000',
            priority: 0,
            description: 'BEN station fee',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('CI1', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(150)
      expect(result!.adjustments).toHaveLength(1)
      expect(result!.adjustments[0].appliedAmount).toBe(50)
    })

    it('should handle case insensitive input', async () => {
      const mockVersionSelect = createVersionResolutionMock()
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            version: 1,
            versionLabel: null,
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('kawa', 'h2o', 'ben', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.exchangeCode).toBe('KAWA')
    })
  })

  describe('calculateEffectivePriceWithFallback', () => {
    it('should return null when price list not found', async () => {
      const mockVersionSelect = createVersionResolutionMock()
      const mockContextSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockContextSelect as any)

      const result = await calculateEffectivePriceWithFallback('UNKNOWN', 'H2O', 'BEN', 'CIS')

      expect(result).toBeNull()
    })

    it('should return price from requested location', async () => {
      const mockVersionSelect = createVersionResolutionMock(1)
      const mockContextSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ currency: 'CIS', defaultLocationId: 'MOR' }]),
      }
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            version: 1,
            versionLabel: 'Phase 1',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockContextSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePriceWithFallback('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.locationId).toBe('BEN')
      expect(result!.isFallback).toBeUndefined()
      expect(result!.version).toBe(1)
      expect(result!.versionLabel).toBe('Phase 1')
    })

    it('should fallback to default location when requested location has no price', async () => {
      const mockVersionSelect = createVersionResolutionMock(1)
      const mockContextSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ currency: 'CIS', defaultLocationId: 'BEN' }]),
      }
      // First call: requested location returns empty
      const mockBasePriceSelectEmpty = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      // Second call: default location returns price
      const mockBasePriceSelectFound = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            version: 1,
            versionLabel: null,
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockContextSelect as any)
        .mockReturnValueOnce(mockBasePriceSelectEmpty as any)
        .mockReturnValueOnce(mockBasePriceSelectFound as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePriceWithFallback('KAWA', 'H2O', 'OTHER', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.locationId).toBe('BEN')
      expect(result!.isFallback).toBe(true)
      expect(result!.requestedLocationId).toBe('OTHER')
    })

    it('should use explicit version when provided', async () => {
      const mockContextSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ currency: 'CIS', defaultLocationId: 'BEN' }]),
      }
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            version: 3,
            versionLabel: 'Phase 3',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '200.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockContextSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePriceWithFallback('KAWA', 'H2O', 'BEN', 'CIS', 3)

      // Should NOT query for currentVersion
      expect(db.select).toHaveBeenCalledTimes(3)
      expect(result).not.toBeNull()
      expect(result!.version).toBe(3)
      expect(result!.versionLabel).toBe('Phase 3')
      expect(result!.basePrice).toBe(200)
    })

    it('should return null when requested location is the default and has no price', async () => {
      const mockVersionSelect = createVersionResolutionMock(1)
      const mockContextSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ currency: 'CIS', defaultLocationId: 'BEN' }]),
      }
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockContextSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)

      // Requested location IS the default - no fallback possible
      const result = await calculateEffectivePriceWithFallback('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).toBeNull()
    })
  })

  describe('getOrderDisplayPrice', () => {
    it('should return stored price for fixed-price orders', async () => {
      const result = await getOrderDisplayPrice({
        price: '150.50',
        currency: 'CIS',
        priceListCode: null,
        commodityTicker: 'H2O',
        locationId: 'BEN',
      })

      expect(result).toEqual({
        price: 150.5,
        currency: 'CIS',
        version: null,
        versionLabel: null,
      })
    })

    it('should return stored price for orders with explicit price', async () => {
      const result = await getOrderDisplayPrice({
        price: 200,
        currency: 'CIS',
        priceListCode: 'KAWA',
        commodityTicker: 'H2O',
        locationId: 'BEN',
      })

      expect(result).toEqual({
        price: 200,
        currency: 'CIS',
        version: null,
        versionLabel: null,
      })
    })

    it('should resolve dynamic pricing when priceListCode set and price is 0', async () => {
      const mockVersionSelect = createVersionResolutionMock(2)
      const mockContextSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ currency: 'CIS', defaultLocationId: 'BEN' }]),
      }
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            version: 2,
            versionLabel: 'Current Phase',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '75.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
      }
      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockContextSelect as any)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await getOrderDisplayPrice({
        price: 0,
        currency: 'CIS',
        priceListCode: 'KAWA',
        commodityTicker: 'H2O',
        locationId: 'BEN',
      })

      expect(result).not.toBeNull()
      expect(result!.price).toBe(75)
      expect(result!.currency).toBe('CIS')
      expect(result!.version).toBe(2)
      expect(result!.versionLabel).toBe('Current Phase')
    })

    it('should return null when dynamic pricing fails', async () => {
      const mockVersionSelect = createVersionResolutionMock()
      const mockContextSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockVersionSelect as any)
        .mockReturnValueOnce(mockContextSelect as any)

      const result = await getOrderDisplayPrice({
        price: 0,
        currency: 'CIS',
        priceListCode: 'UNKNOWN',
        commodityTicker: 'H2O',
        locationId: 'BEN',
      })

      expect(result).toBeNull()
    })
  })
})
