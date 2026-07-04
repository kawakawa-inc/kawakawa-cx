import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateInputs } from './RecipesController.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
  recipes: {},
  recipeInputs: {},
  fioCommodities: { ticker: 'ticker', name: 'name' },
  users: { id: 'id', username: 'username' },
}))

function mockKnownTickers(tickers: string[]) {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(tickers.map(ticker => ({ ticker }))),
  } as any)
}

describe('RecipesController validateInputs', () => {
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
      'A recipe must have at least one material line'
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

  it('throws on duplicate tickers within the same recipe', async () => {
    await expect(
      validateInputs([
        { commodityTicker: 'RAT', quantity: 1 },
        { commodityTicker: 'rat', quantity: 2 },
      ])
    ).rejects.toThrow('Duplicate commodityTicker values are not allowed within a recipe')
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
