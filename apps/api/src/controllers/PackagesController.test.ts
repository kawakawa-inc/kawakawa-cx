import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateInputs, validatePricing, resolveIconTicker } from './PackagesController.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  packages: {},
  packageInputs: {},
  fioCommodities: { ticker: 'ticker', name: 'name' },
  users: { id: 'id', username: 'username' },
}))

function mockKnownTickers(tickers: string[]) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(tickers.map(ticker => ({ ticker }))),
  } as any)
}

describe('PackagesController validateInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes and uppercases valid input lines', async () => {
    mockKnownTickers(['RAT', 'DW'])

    const result = await validateInputs([
      { commodityTicker: 'rat', quantity: 10 },
      { commodityTicker: 'dw', quantity: 5 },
    ])

    expect(result).toEqual([
      { commodityTicker: 'RAT', quantity: 10 },
      { commodityTicker: 'DW', quantity: 5 },
    ])
  })

  it('throws when inputs array is empty', async () => {
    await expect(validateInputs([])).rejects.toThrow(
      'A package must have at least one material line'
    )
  })

  it('throws when a line is missing commodityTicker', async () => {
    await expect(validateInputs([{ commodityTicker: '', quantity: 1 }])).rejects.toThrow(
      'Line 1: commodityTicker is required'
    )
  })

  it('throws when quantity is zero or negative', async () => {
    await expect(validateInputs([{ commodityTicker: 'RAT', quantity: 0 }])).rejects.toThrow(
      'Line 1 (RAT): quantity must be > 0'
    )

    await expect(validateInputs([{ commodityTicker: 'RAT', quantity: -5 }])).rejects.toThrow(
      'Line 1 (RAT): quantity must be > 0'
    )
  })

  it('floors fractional quantities', async () => {
    mockKnownTickers(['RAT'])
    const result = await validateInputs([{ commodityTicker: 'RAT', quantity: 9.9 }])
    expect(result[0].quantity).toBe(9)
  })

  it('throws on duplicate tickers within the same package', async () => {
    await expect(
      validateInputs([
        { commodityTicker: 'RAT', quantity: 1 },
        { commodityTicker: 'rat', quantity: 2 },
      ])
    ).rejects.toThrow('Duplicate commodityTicker values are not allowed within a package')
  })

  it('throws listing unknown ticker(s)', async () => {
    mockKnownTickers(['RAT']) // DW is not known

    await expect(
      validateInputs([
        { commodityTicker: 'RAT', quantity: 1 },
        { commodityTicker: 'DW', quantity: 2 },
      ])
    ).rejects.toThrow('Unknown commodity ticker(s): DW')
  })
})

describe('PackagesController validatePricing', () => {
  it('allows a fixed price with salePrice and currency provided together', () => {
    expect(() =>
      validatePricing({
        salePrice: 1000,
        currency: 'CIS',
        pricingMode: 'fixed',
        marginMultiplier: null,
      })
    ).not.toThrow()
  })

  it('allows a draft package with no price set at all', () => {
    expect(() =>
      validatePricing({
        salePrice: null,
        currency: null,
        pricingMode: 'fixed',
        marginMultiplier: null,
      })
    ).not.toThrow()
  })

  it('throws when salePrice is set without a currency', () => {
    expect(() =>
      validatePricing({
        salePrice: 1000,
        currency: null,
        pricingMode: 'fixed',
        marginMultiplier: null,
      })
    ).toThrow('salePrice and currency must be provided together')
  })

  it('throws when currency is set without a salePrice', () => {
    expect(() =>
      validatePricing({
        salePrice: null,
        currency: 'CIS',
        pricingMode: 'fixed',
        marginMultiplier: null,
      })
    ).toThrow('salePrice and currency must be provided together')
  })

  it('allows margin pricing with a positive marginMultiplier', () => {
    expect(() =>
      validatePricing({
        salePrice: 600,
        currency: 'CIS',
        pricingMode: 'margin',
        marginMultiplier: 1.2,
      })
    ).not.toThrow()
  })

  it('throws when pricingMode is margin but marginMultiplier is missing', () => {
    expect(() =>
      validatePricing({
        salePrice: 600,
        currency: 'CIS',
        pricingMode: 'margin',
        marginMultiplier: null,
      })
    ).toThrow('marginMultiplier must be a positive number when pricingMode is "margin"')
  })

  it('throws when marginMultiplier is zero or negative', () => {
    expect(() =>
      validatePricing({
        salePrice: 600,
        currency: 'CIS',
        pricingMode: 'margin',
        marginMultiplier: 0,
      })
    ).toThrow('marginMultiplier must be a positive number when pricingMode is "margin"')

    expect(() =>
      validatePricing({
        salePrice: 600,
        currency: 'CIS',
        pricingMode: 'margin',
        marginMultiplier: -1,
      })
    ).toThrow('marginMultiplier must be a positive number when pricingMode is "margin"')
  })
})

describe('PackagesController resolveIconTicker', () => {
  const inputs = [
    { commodityTicker: 'WCB', quantity: 1 },
    { commodityTicker: 'FFC', quantity: 2 },
  ]

  it('returns null when no icon requested', () => {
    expect(resolveIconTicker(null, inputs)).toBeNull()
    expect(resolveIconTicker(undefined, inputs)).toBeNull()
    expect(resolveIconTicker('', inputs)).toBeNull()
  })

  it('uppercases and accepts an icon that is in the BoM', () => {
    expect(resolveIconTicker('wcb', inputs)).toBe('WCB')
    expect(resolveIconTicker('FFC', inputs)).toBe('FFC')
  })

  it('throws when the icon is not one of the package materials', () => {
    expect(() => resolveIconTicker('RAT', inputs)).toThrow(
      "Icon commodity RAT must be one of the package's materials"
    )
  })
})
