import { describe, it, expect } from 'vitest'
import { normalizeLineInput } from './ShipmentsController.js'

describe('normalizeLineInput', () => {
  it('normalizes valid line input', () => {
    const result = normalizeLineInput({ commodityTicker: 'h2o', amount: 100 }, 0)
    expect(result).toEqual({
      flowId: null,
      commodityTicker: 'H2O',
      amount: 100,
    })
  })

  it('preserves flowId when provided', () => {
    const result = normalizeLineInput({ flowId: 42, commodityTicker: 'raf', amount: 50 }, 0)
    expect(result).toEqual({
      flowId: 42,
      commodityTicker: 'RAF',
      amount: 50,
    })
  })

  it('floors fractional amounts', () => {
    const result = normalizeLineInput({ commodityTicker: 'DW', amount: 99.7 }, 0)
    expect(result.amount).toBe(99)
  })

  it('throws for missing commodityTicker', () => {
    expect(() => normalizeLineInput({ commodityTicker: '', amount: 100 }, 0)).toThrow(
      'Line 1: commodityTicker is required'
    )
  })

  it('throws for zero amount', () => {
    expect(() => normalizeLineInput({ commodityTicker: 'H2O', amount: 0 }, 2)).toThrow(
      'Line 3 (H2O): amount must be > 0'
    )
  })

  it('throws for negative amount', () => {
    expect(() => normalizeLineInput({ commodityTicker: 'H2O', amount: -5 }, 0)).toThrow(
      'Line 1 (H2O): amount must be > 0'
    )
  })

  it('throws for NaN amount', () => {
    expect(() => normalizeLineInput({ commodityTicker: 'H2O', amount: NaN }, 0)).toThrow(
      'Line 1 (H2O): amount must be > 0'
    )
  })

  it('throws for Infinity amount', () => {
    expect(() => normalizeLineInput({ commodityTicker: 'H2O', amount: Infinity }, 0)).toThrow(
      'Line 1 (H2O): amount must be > 0'
    )
  })

  it('uppercases multi-character tickers', () => {
    const result = normalizeLineInput({ commodityTicker: 'DrInkingWater', amount: 1 }, 0)
    expect(result.commodityTicker).toBe('DRINKINGWATER')
  })
})

describe('line validation edge cases', () => {
  it('accepts amount of 1 (minimum valid)', () => {
    const result = normalizeLineInput({ commodityTicker: 'H2O', amount: 1 }, 0)
    expect(result.amount).toBe(1)
  })

  it('handles very large amounts', () => {
    const result = normalizeLineInput({ commodityTicker: 'H2O', amount: 1_000_000 }, 0)
    expect(result.amount).toBe(1_000_000)
  })

  it('floors 0.9 to 0 (which then fails validation)', () => {
    // 0.9 floors to 0, which is not > 0
    expect(() => normalizeLineInput({ commodityTicker: 'H2O', amount: 0.9 }, 0)).toThrow(
      'amount must be > 0'
    )
  })

  it('floors 1.1 to 1 (valid)', () => {
    const result = normalizeLineInput({ commodityTicker: 'H2O', amount: 1.1 }, 0)
    expect(result.amount).toBe(1)
  })
})
