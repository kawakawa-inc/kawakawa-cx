import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateEffectivePrice,
  calculateEffectivePrices,
  calculateEffectivePriceBatch,
} from './price-calculator.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  prices: {
    priceListCode: 'priceListCode',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    price: 'price',
    source: 'source',
    sourceReference: 'sourceReference',
  },
  priceLists: {
    code: 'code',
    name: 'name',
    type: 'type',
    currency: 'currency',
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

describe('price-calculator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateEffectivePrice', () => {
    it('should return null when no base price exists', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValue(mockBasePriceSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).toBeNull()
    })

    it('should return base price when no adjustments apply', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
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
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(100)
      expect(result!.adjustments).toHaveLength(0)
    })

    it('should apply percentage adjustment correctly', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
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
        orderBy: vi.fn().mockReturnThis(),
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
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '10.0000',
            priority: 0,
            description: 'KAWA 10% markup',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(110) // 100 + 10% = 110
      expect(result!.adjustments).toHaveLength(1)
      expect(result!.adjustments[0].appliedAmount).toBe(10)
    })

    it('should apply fixed adjustment correctly', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            exchangeCode: 'CI1',
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
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            exchangeCode: null,
            commodityTicker: null,
            locationId: 'BEN',
            currency: null,
            adjustmentType: 'fixed',
            adjustmentValue: '50.0000',
            priority: 0,
            description: 'BEN station fee',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('CI1', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(150) // 100 + 50 = 150
      expect(result!.adjustments).toHaveLength(1)
      expect(result!.adjustments[0].appliedAmount).toBe(50)
    })

    it('should apply multiple adjustments in priority order', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
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
        orderBy: vi.fn().mockReturnThis(),
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
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '10.0000',
            priority: 0,
            description: 'KAWA 10% markup',
          },
          {
            id: 2,
            exchangeCode: null,
            commodityTicker: null,
            locationId: 'BEN',
            currency: null,
            adjustmentType: 'fixed',
            adjustmentValue: '25.0000',
            priority: 1,
            description: 'BEN station fee',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'BEN', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      // First: 100 + 10% = 110
      // Second: 110 + 25 = 135
      expect(result!.finalPrice).toBe(135)
      expect(result!.adjustments).toHaveLength(2)
      expect(result!.adjustments[0].appliedAmount).toBe(10) // 10% of 100
      expect(result!.adjustments[1].appliedAmount).toBe(25) // fixed 25
    })

    it('should apply negative percentage adjustment (discount)', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'UV-351a',
            locationName: 'Proxion',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
        ]),
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            locationId: 'UV-351a',
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '-20.0000',
            priority: 0,
            description: 'Local production discount',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('KAWA', 'H2O', 'UV-351a', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.basePrice).toBe(100)
      expect(result!.finalPrice).toBe(80) // 100 - 20% = 80
      expect(result!.adjustments[0].appliedAmount).toBe(-20)
    })

    it('should handle case insensitive input', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
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
        orderBy: vi.fn().mockReturnThis(),
      }

      const mockAdjustmentsSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrice('kawa', 'h2o', 'ben', 'CIS')

      expect(result).not.toBeNull()
      expect(result!.exchangeCode).toBe('KAWA')
    })
  })

  describe('calculateEffectivePrices', () => {
    it('should return empty array when no base prices exist', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select).mockReturnValue(mockBasePriceSelect as any)

      const result = await calculateEffectivePrices('KAWA', 'BEN', 'CIS')

      expect(result).toEqual([])
    })

    it('should calculate effective prices for multiple commodities', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
          {
            priceListCode: 'KAWA',
            commodityTicker: 'RAT',
            commodityName: 'Rations',
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
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: 'KAWA',
            commodityTicker: null, // Applies to all commodities
            locationId: null,
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '10.0000',
            priority: 0,
            description: 'KAWA 10% markup',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrices('KAWA', 'BEN', 'CIS')

      expect(result).toHaveLength(2)
      expect(result[0].commodityTicker).toBe('H2O')
      expect(result[0].basePrice).toBe(100)
      expect(result[0].finalPrice).toBe(110) // 100 + 10%
      expect(result[1].commodityTicker).toBe('RAT')
      expect(result[1].basePrice).toBe(50)
      expect(result[1].finalPrice).toBe(55) // 50 + 10%
    })

    it('should apply commodity-specific adjustments only to matching commodities', async () => {
      const mockBasePriceSelect = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          {
            priceListCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benten Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
          },
          {
            priceListCode: 'KAWA',
            commodityTicker: 'RAT',
            commodityName: 'Rations',
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
        orderBy: vi.fn().mockResolvedValue([
          {
            id: 1,
            priceListCode: 'KAWA',
            commodityTicker: 'H2O', // Only applies to H2O
            locationId: null,
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '20.0000',
            priority: 0,
            description: 'H2O special markup',
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockBasePriceSelect as any)
        .mockReturnValueOnce(mockAdjustmentsSelect as any)

      const result = await calculateEffectivePrices('KAWA', 'BEN', 'CIS')

      expect(result).toHaveLength(2)
      // H2O should have the adjustment
      expect(result[0].commodityTicker).toBe('H2O')
      expect(result[0].finalPrice).toBe(120) // 100 + 20%
      expect(result[0].adjustments).toHaveLength(1)
      // RAT should NOT have the adjustment
      expect(result[1].commodityTicker).toBe('RAT')
      expect(result[1].finalPrice).toBe(50) // No adjustment
      expect(result[1].adjustments).toHaveLength(0)
    })
  })

  describe('calculateEffectivePriceBatch', () => {
    // Query 1 (price lists): .select().from().where() — terminal is where()
    // Query 2 (base prices): .select().from().innerJoin().leftJoin().leftJoin().where() — terminal is where()
    // Query 3 (adjustments): .select().from().where().orderBy() — terminal is orderBy()
    function createTerminalWhereMock(resolvedValue: unknown) {
      const mock: Record<string, any> = {}
      mock.from = vi.fn().mockReturnValue(mock)
      mock.innerJoin = vi.fn().mockReturnValue(mock)
      mock.leftJoin = vi.fn().mockReturnValue(mock)
      mock.where = vi.fn().mockResolvedValue(resolvedValue)
      return mock
    }

    function createTerminalOrderByMock(resolvedValue: unknown) {
      const mock: Record<string, any> = {}
      mock.from = vi.fn().mockReturnValue(mock)
      mock.where = vi.fn().mockReturnValue(mock)
      mock.orderBy = vi.fn().mockResolvedValue(resolvedValue)
      return mock
    }

    it('should return empty map for empty requests', async () => {
      const result = await calculateEffectivePriceBatch([])
      expect(result.size).toBe(0)
    })

    it('should batch fetch prices for multiple orders in 3 queries', async () => {
      const priceListMock = createTerminalWhereMock([
        { code: 'KAWA', currency: 'CIS', defaultLocationId: null },
      ])
      const basePriceMock = createTerminalWhereMock([
        {
          priceListCode: 'KAWA',
          commodityTicker: 'H2O',
          commodityName: 'Water',
          locationId: 'BEN',
          locationName: 'Benten',
          price: '100.00',
          currency: 'CIS',
          source: 'manual',
          sourceReference: null,
        },
        {
          priceListCode: 'KAWA',
          commodityTicker: 'RAT',
          commodityName: 'Rations',
          locationId: 'BEN',
          locationName: 'Benten',
          price: '50.00',
          currency: 'CIS',
          source: 'manual',
          sourceReference: null,
        },
      ])
      const adjustmentMock = createTerminalOrderByMock([])

      vi.mocked(db.select)
        .mockReturnValueOnce(priceListMock as any)
        .mockReturnValueOnce(basePriceMock as any)
        .mockReturnValueOnce(adjustmentMock as any)

      const result = await calculateEffectivePriceBatch([
        { priceListCode: 'KAWA', ticker: 'H2O', locationId: 'BEN', currency: 'CIS' },
        { priceListCode: 'KAWA', ticker: 'RAT', locationId: 'BEN', currency: 'CIS' },
      ])

      expect(db.select).toHaveBeenCalledTimes(3)
      expect(result.size).toBe(2)
      expect(result.get('KAWA:H2O:BEN')?.finalPrice).toBe(100)
      expect(result.get('KAWA:RAT:BEN')?.finalPrice).toBe(50)
    })

    it('should handle fallback to default location', async () => {
      const priceListMock = createTerminalWhereMock([
        { code: 'KAWA', currency: 'CIS', defaultLocationId: 'BEN' },
      ])
      const basePriceMock = createTerminalWhereMock([
        {
          priceListCode: 'KAWA',
          commodityTicker: 'H2O',
          commodityName: 'Water',
          locationId: 'BEN',
          locationName: 'Benten',
          price: '100.00',
          currency: 'CIS',
          source: 'manual',
          sourceReference: null,
        },
      ])
      const adjustmentMock = createTerminalOrderByMock([])

      vi.mocked(db.select)
        .mockReturnValueOnce(priceListMock as any)
        .mockReturnValueOnce(basePriceMock as any)
        .mockReturnValueOnce(adjustmentMock as any)

      const result = await calculateEffectivePriceBatch([
        { priceListCode: 'KAWA', ticker: 'H2O', locationId: 'OTHER', currency: 'CIS' },
      ])

      const price = result.get('KAWA:H2O:OTHER')
      expect(price).not.toBeNull()
      expect(price!.finalPrice).toBe(100)
      expect(price!.isFallback).toBe(true)
      expect(price!.requestedLocationId).toBe('OTHER')
      expect(price!.locationId).toBe('BEN')
    })

    it('should return null for unknown price list', async () => {
      const priceListMock = createTerminalWhereMock([])
      const basePriceMock = createTerminalWhereMock([])
      const adjustmentMock = createTerminalOrderByMock([])

      vi.mocked(db.select)
        .mockReturnValueOnce(priceListMock as any)
        .mockReturnValueOnce(basePriceMock as any)
        .mockReturnValueOnce(adjustmentMock as any)

      const result = await calculateEffectivePriceBatch([
        { priceListCode: 'UNKNOWN', ticker: 'H2O', locationId: 'BEN', currency: 'CIS' },
      ])

      expect(result.get('UNKNOWN:H2O:BEN')).toBeNull()
    })

    it('should apply adjustments correctly in batch', async () => {
      const priceListMock = createTerminalWhereMock([
        { code: 'KAWA', currency: 'CIS', defaultLocationId: null },
      ])
      const basePriceMock = createTerminalWhereMock([
        {
          priceListCode: 'KAWA',
          commodityTicker: 'H2O',
          commodityName: 'Water',
          locationId: 'BEN',
          locationName: 'Benten',
          price: '100.00',
          currency: 'CIS',
          source: 'manual',
          sourceReference: null,
        },
      ])
      const adjustmentMock = createTerminalOrderByMock([
        {
          id: 1,
          priceListCode: 'KAWA',
          commodityTicker: null,
          locationId: null,
          adjustmentType: 'percentage',
          adjustmentValue: '10.0000',
          priority: 0,
          description: '10% markup',
        },
      ])

      vi.mocked(db.select)
        .mockReturnValueOnce(priceListMock as any)
        .mockReturnValueOnce(basePriceMock as any)
        .mockReturnValueOnce(adjustmentMock as any)

      const result = await calculateEffectivePriceBatch([
        { priceListCode: 'KAWA', ticker: 'H2O', locationId: 'BEN', currency: 'CIS' },
      ])

      const price = result.get('KAWA:H2O:BEN')
      expect(price!.basePrice).toBe(100)
      expect(price!.finalPrice).toBe(110)
      expect(price!.adjustments).toHaveLength(1)
    })

    it('should deduplicate requests with same key', async () => {
      const priceListMock = createTerminalWhereMock([
        { code: 'KAWA', currency: 'CIS', defaultLocationId: null },
      ])
      const basePriceMock = createTerminalWhereMock([
        {
          priceListCode: 'KAWA',
          commodityTicker: 'H2O',
          commodityName: 'Water',
          locationId: 'BEN',
          locationName: 'Benten',
          price: '100.00',
          currency: 'CIS',
          source: 'manual',
          sourceReference: null,
        },
      ])
      const adjustmentMock = createTerminalOrderByMock([])

      vi.mocked(db.select)
        .mockReturnValueOnce(priceListMock as any)
        .mockReturnValueOnce(basePriceMock as any)
        .mockReturnValueOnce(adjustmentMock as any)

      const result = await calculateEffectivePriceBatch([
        { priceListCode: 'KAWA', ticker: 'H2O', locationId: 'BEN', currency: 'CIS' },
        { priceListCode: 'KAWA', ticker: 'H2O', locationId: 'BEN', currency: 'CIS' },
      ])

      expect(result.size).toBe(1)
      expect(result.get('KAWA:H2O:BEN')?.finalPrice).toBe(100)
    })
  })
})
