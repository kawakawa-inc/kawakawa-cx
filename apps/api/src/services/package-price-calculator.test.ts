import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculatePackagePrice, calculateAllPackagePrices } from './package-price-calculator.js'
import { db } from '../db/index.js'
import { calculateEffectivePrices } from './price-calculator.js'
import { resolveVersionContext } from './price-version.js'
import type { EffectivePrice } from './price-calculator.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  packages: {
    id: 'id',
    name: 'name',
    type: 'type',
    salePrice: 'salePrice',
    currency: 'currency',
    isActive: 'isActive',
  },
  packageInputs: {
    packageId: 'packageId',
    commodityTicker: 'commodityTicker',
    quantity: 'quantity',
  },
  fioCommodities: {
    ticker: 'ticker',
    name: 'name',
  },
}))

vi.mock('./price-calculator.js', () => ({
  calculateEffectivePrices: vi.fn(),
}))

vi.mock('./price-version.js', () => ({
  resolveVersionContext: vi.fn(),
}))

/**
 * Builds a chainable query-builder mock. Every method returns the same
 * object (so any call order works) except `terminalMethod`, which resolves
 * to `value` — matching how a single `db.select()...` call is consumed.
 */
function createChain(value: unknown[], terminalMethod: string) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const name of ['from', 'where', 'orderBy', 'leftJoin', 'innerJoin', 'limit']) {
    chain[name] = vi.fn(() => (name === terminalMethod ? Promise.resolve(value) : chain))
  }
  return chain
}

function fakeEffectivePrice(
  ticker: string,
  finalPrice: number,
  isFallback = false
): EffectivePrice {
  return {
    priceListCode: 'KAWA',
    version: 1,
    commodityTicker: ticker,
    commodityName: ticker,
    locationId: 'BEN',
    locationName: 'Benten Station',
    currency: 'CIS',
    basePrice: finalPrice,
    source: 'manual',
    sourceReference: null,
    adjustments: [],
    finalPrice,
    exchangeCode: 'KAWA',
    ...(isFallback ? { isFallback: true, requestedLocationId: 'BEN' } : {}),
  }
}

describe('package-price-calculator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveVersionContext).mockResolvedValue({
      version: 1,
      defaultLocationId: 'BEN',
      currency: 'CIS',
    })
  })

  describe('calculatePackagePrice', () => {
    it('computes materialCost, margin, and marginPercent when all prices are present', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [{ id: 1, name: 'Test Ship', type: 'ship', salePrice: '1000.00', currency: 'CIS' }],
            'limit'
          ) as any
        )
        .mockReturnValueOnce(
          createChain(
            [
              { commodityTicker: 'RAT', commodityName: 'Rations', quantity: 10 },
              { commodityTicker: 'DW', commodityName: 'Drinking Water', quantity: 20 },
            ],
            'orderBy'
          ) as any
        )
      vi.mocked(calculateEffectivePrices).mockResolvedValue([
        fakeEffectivePrice('RAT', 50),
        fakeEffectivePrice('DW', 5),
      ])

      const result = await calculatePackagePrice(1, 'KAWA')

      // 10*50 + 20*5 = 500 + 100 = 600
      expect(result.materialCost).toBe(600)
      expect(result.missingPriceTickers).toEqual([])
      expect(result.salePrice).toBe(1000)
      expect(result.margin).toBe(400)
      expect(result.marginPercent).toBe(40)
      expect(result.lines).toHaveLength(2)
      expect(result.lines[0]).toMatchObject({
        commodityTicker: 'RAT',
        quantity: 10,
        unitPrice: 50,
        lineTotal: 500,
        isFallback: false,
      })
    })

    it('leaves margin null and lists missing tickers when a price is missing', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [{ id: 1, name: 'Test Ship', type: 'ship', salePrice: '1000.00', currency: 'CIS' }],
            'limit'
          ) as any
        )
        .mockReturnValueOnce(
          createChain(
            [{ commodityTicker: 'RAT', commodityName: 'Rations', quantity: 10 }],
            'orderBy'
          ) as any
        )
      vi.mocked(calculateEffectivePrices).mockResolvedValue([]) // no price found for RAT

      const result = await calculatePackagePrice(1, 'KAWA')

      expect(result.missingPriceTickers).toEqual(['RAT'])
      expect(result.lines[0].unitPrice).toBeNull()
      expect(result.lines[0].lineTotal).toBeNull()
      expect(result.materialCost).toBe(0)
      expect(result.margin).toBeNull()
      expect(result.marginPercent).toBeNull()
    })

    it('leaves margin null on currency mismatch between sale price and price list', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [{ id: 1, name: 'Test Ship', type: 'ship', salePrice: '1000.00', currency: 'ICA' }],
            'limit'
          ) as any
        )
        .mockReturnValueOnce(
          createChain(
            [{ commodityTicker: 'RAT', commodityName: 'Rations', quantity: 10 }],
            'orderBy'
          ) as any
        )
      vi.mocked(calculateEffectivePrices).mockResolvedValue([fakeEffectivePrice('RAT', 50)])

      const result = await calculatePackagePrice(1, 'KAWA')

      expect(result.currencyMismatch).toBe(true)
      expect(result.margin).toBeNull()
      expect(result.marginPercent).toBeNull()
      // Material cost is still computed even when margin can't be
      expect(result.materialCost).toBe(500)
    })

    it('returns null margin when the package has no sale price set', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [{ id: 1, name: 'Test Ship', type: 'ship', salePrice: null, currency: null }],
            'limit'
          ) as any
        )
        .mockReturnValueOnce(
          createChain(
            [{ commodityTicker: 'RAT', commodityName: 'Rations', quantity: 10 }],
            'orderBy'
          ) as any
        )
      vi.mocked(calculateEffectivePrices).mockResolvedValue([fakeEffectivePrice('RAT', 50)])

      const result = await calculatePackagePrice(1, 'KAWA')

      expect(result.salePrice).toBeNull()
      expect(result.margin).toBeNull()
      expect(result.marginPercent).toBeNull()
      expect(result.materialCost).toBe(500)
    })

    it('propagates isFallback from the underlying effective price', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [{ id: 1, name: 'Test Ship', type: 'ship', salePrice: null, currency: null }],
            'limit'
          ) as any
        )
        .mockReturnValueOnce(
          createChain(
            [{ commodityTicker: 'RAT', commodityName: 'Rations', quantity: 1 }],
            'orderBy'
          ) as any
        )
      vi.mocked(calculateEffectivePrices).mockResolvedValue([fakeEffectivePrice('RAT', 50, true)])

      const result = await calculatePackagePrice(1, 'KAWA')

      expect(result.lines[0].isFallback).toBe(true)
    })

    it('throws NotFound when the package does not exist', async () => {
      vi.mocked(db.select).mockReturnValueOnce(createChain([], 'limit') as any)

      await expect(calculatePackagePrice(999, 'KAWA')).rejects.toThrow(
        'Package with ID 999 not found'
      )
    })

    it('wraps resolveVersionContext errors as BadRequest', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [{ id: 1, name: 'Test Ship', type: 'ship', salePrice: null, currency: null }],
            'limit'
          ) as any
        )
        .mockReturnValueOnce(createChain([], 'orderBy') as any)
      vi.mocked(resolveVersionContext).mockRejectedValue(
        new Error("Price list 'NOPE' version 1 not found")
      )

      await expect(calculatePackagePrice(1, 'NOPE')).rejects.toThrow(
        "Price list 'NOPE' version 1 not found"
      )
    })

    it('passes through pricingMode and marginMultiplier from the package row', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [
              {
                id: 1,
                name: 'Test Ship',
                type: 'ship',
                salePrice: '600.00',
                currency: 'CIS',
                pricingMode: 'margin',
                marginMultiplier: '1.2000',
              },
            ],
            'limit'
          ) as any
        )
        .mockReturnValueOnce(
          createChain(
            [{ commodityTicker: 'RAT', commodityName: 'Rations', quantity: 10 }],
            'orderBy'
          ) as any
        )
      vi.mocked(calculateEffectivePrices).mockResolvedValue([fakeEffectivePrice('RAT', 50)])

      const result = await calculatePackagePrice(1, 'KAWA')

      expect(result.pricingMode).toBe('margin')
      expect(result.marginMultiplier).toBe(1.2)
    })

    it('reports pricingMode "fixed" and null marginMultiplier when not set', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [
              {
                id: 1,
                name: 'Test Ship',
                type: 'ship',
                salePrice: '600.00',
                currency: 'CIS',
                pricingMode: 'fixed',
                marginMultiplier: null,
              },
            ],
            'limit'
          ) as any
        )
        .mockReturnValueOnce(createChain([], 'orderBy') as any)
      vi.mocked(calculateEffectivePrices).mockResolvedValue([])

      const result = await calculatePackagePrice(1, 'KAWA')

      expect(result.pricingMode).toBe('fixed')
      expect(result.marginMultiplier).toBeNull()
    })

    it('uses the explicit locationId over the version default when provided', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [{ id: 1, name: 'Test Ship', type: 'ship', salePrice: null, currency: null }],
            'limit'
          ) as any
        )
        .mockReturnValueOnce(createChain([], 'orderBy') as any)
      vi.mocked(calculateEffectivePrices).mockResolvedValue([])

      await calculatePackagePrice(1, 'KAWA', 'ANT')

      expect(calculateEffectivePrices).toHaveBeenCalledWith('KAWA', 'ANT', 'CIS', 1)
    })
  })

  describe('calculateAllPackagePrices', () => {
    it('shares one effective-price fetch across every package', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(
          createChain(
            [
              { id: 1, name: 'Ship A', type: 'ship', salePrice: '100.00', currency: 'CIS' },
              { id: 2, name: 'Ship B', type: 'ship', salePrice: '200.00', currency: 'CIS' },
            ],
            'orderBy'
          ) as any
        )
        .mockReturnValueOnce(
          createChain(
            [
              { packageId: 1, commodityTicker: 'RAT', commodityName: 'Rations', quantity: 1 },
              { packageId: 2, commodityTicker: 'RAT', commodityName: 'Rations', quantity: 2 },
            ],
            'orderBy'
          ) as any
        )
      vi.mocked(calculateEffectivePrices).mockResolvedValue([fakeEffectivePrice('RAT', 50)])

      const results = await calculateAllPackagePrices('KAWA')

      expect(calculateEffectivePrices).toHaveBeenCalledTimes(1)
      expect(results).toHaveLength(2)
      expect(results[0].materialCost).toBe(50)
      expect(results[0].margin).toBe(50)
      expect(results[1].materialCost).toBe(100)
      expect(results[1].margin).toBe(100)
    })

    it('returns an empty array without fetching inputs when there are no packages', async () => {
      vi.mocked(db.select).mockReturnValueOnce(createChain([], 'orderBy') as any)

      const results = await calculateAllPackagePrices('KAWA')

      expect(results).toEqual([])
      // Only the packages query should have run — no inputs query
      expect(db.select).toHaveBeenCalledTimes(1)
    })
  })
})
