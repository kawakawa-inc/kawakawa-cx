import { describe, expect, it } from 'vitest'
import { parseMaterials, parsePaste } from './paste-parse.js'
import { roundPrice, serializePaste, type PasteMaterial } from './paste-serialize.js'

const resolveTicker = (ticker: string) => ticker

function expectRoundTrip(input: PasteMaterial[], rounding: 'none' | 'up' | 'down' = 'none') {
  const result = serializePaste(input, rounding)
  expect(result.errors).toEqual([])
  expect(result.text).toBeDefined()
  const bill = parseMaterials(result.text!, resolveTicker)
  const expected = Object.fromEntries(
    result.materials.map(x => [x.ticker, { quantity: x.quantity, price: x.price }])
  )
  expect(bill).toEqual(expected)
  return result
}

describe('roundPrice', () => {
  it.each([
    [299250, 299000, 300000],
    [16.57, 16.5, 16.6],
    [16.47, 16.4, 16.5],
    [45.67, 45.6, 45.7],
    [1234, 1230, 1240],
    [0.125, 0.12, 0.13],
    [1.005, 1, 1.01],
    [4.35, 4.35, 4.35],
    [0.07, 0.07, 0.07],
    [530, 530, 530],
    [123000000, 123000000, 123000000],
    [999.5, 999, 1000],
    [99950000, 99900000, 100000000],
  ])('%s rounds down to %s and up to %s', (price, down, up) => {
    expect(roundPrice(price, 'down')).toBe(down)
    expect(roundPrice(price, 'up')).toBe(up)
  })

  it('never moves a price the wrong way and always satisfies the parser', () => {
    // Every cent value across magnitudes, including float-hostile decimals.
    const samples: number[] = []
    for (let cents = 1; cents <= 200000; cents += 7) samples.push(cents / 100)
    for (let n = 1000; n <= 10000000; n = Math.round(n * 1.37 + 1)) samples.push(n)
    for (const price of samples) {
      const down = roundPrice(price, 'down')
      const up = roundPrice(price, 'up')
      expect(down).toBeLessThanOrEqual(price)
      expect(up).toBeGreaterThanOrEqual(price)
      for (const p of [down, up]) {
        if (p <= 0) continue
        expect(parsePaste(`RAT\t1\t${p}`, resolveTicker).errors).toEqual([])
      }
    }
  })
})

describe('serializePaste', () => {
  it('writes tab-separated rows with minimal prices', () => {
    const result = expectRoundTrip([
      { ticker: 'RAT', quantity: 100, price: 530 },
      { ticker: 'DW', quantity: 50, price: 62.5 },
    ])
    expect(result.text).toBe('RAT\t100\t530\nDW\t50\t62.5')
    expect(result.adjustments).toEqual([])
    expect(result.gameTotal).toBe(56125)
    expect(result.totalDelta).toBe(0)
  })

  it('does not group large quantities', () => {
    const result = expectRoundTrip([{ ticker: 'RAT', quantity: 1600000, price: 530 }])
    expect(result.text).toBe('RAT\t1600000\t530')
  })

  it('sums repeated tickers that share a price', () => {
    const result = expectRoundTrip([
      { ticker: 'RAT', quantity: 100, price: 530 },
      { ticker: 'DW', quantity: 25, price: 70 },
      { ticker: 'RAT', quantity: 50, price: 530 },
    ])
    expect(result.text).toBe('RAT\t150\t530\nDW\t25\t70')
  })

  it('rejects one ticker at two prices, even if they would round together', () => {
    const input = [
      { ticker: 'RAT', quantity: 100, price: 16.57 },
      { ticker: 'RAT', quantity: 50, price: 16.58 },
    ]
    for (const mode of ['none', 'up', 'down'] as const) {
      const result = serializePaste(input, mode)
      expect(result.text).toBeUndefined()
      expect(result.errors).toEqual([
        { ticker: 'RAT', reason: 'conflicting prices 16.57 and 16.58' },
      ])
    }
  })

  it("reports the parser's own error for an unrounded price over 3 significant figures", () => {
    const result = serializePaste([
      { ticker: 'RAT', quantity: 100, price: 530 },
      { ticker: 'MCB', quantity: 2, price: 299250 },
    ])
    expect(result.text).toBeUndefined()
    expect(result.errors).toEqual([
      {
        ticker: 'MCB',
        reason: 'price "299250" has more than 3 significant figures (use 299000)',
      },
    ])
  })

  it('rounds down and reports the adjustment and in-game total', () => {
    const result = expectRoundTrip(
      [
        { ticker: 'RAT', quantity: 100, price: 530 },
        { ticker: 'MCB', quantity: 2, price: 299250 },
      ],
      'down'
    )
    expect(result.text).toBe('RAT\t100\t530\nMCB\t2\t299000')
    expect(result.adjustments).toEqual([{ ticker: 'MCB', from: 299250, to: 299000 }])
    expect(result.gameTotal).toBe(53000 + 598000)
    expect(result.totalDelta).toBe(-500)
  })

  it('rounds up and floors each line total as PRUN does', () => {
    const result = expectRoundTrip([{ ticker: 'CIS', quantity: 2, price: 16.57 }], 'up')
    expect(result.text).toBe('CIS\t2\t16.6')
    // floor(2 × 16.6) = 33 vs the exact 33.14.
    expect(result.gameTotal).toBe(33)
    expect(result.totalDelta).toBe(-0.14)
  })

  it('matches the in-game examples from refined-prun#247 when no rounding is needed', () => {
    for (const [price, qty, total] of [
      [16.5, 1, 16],
      [16.5, 2, 33],
      [16.4, 2, 32],
    ]) {
      expect(serializePaste([{ ticker: 'CIS', quantity: qty, price }]).gameTotal).toBe(total)
    }
  })

  it('rejects quantities that are not positive whole numbers', () => {
    for (const quantity of [0, -1, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
      const result = serializePaste([{ ticker: 'RAT', quantity, price: 530 }])
      expect(result.text).toBeUndefined()
      expect(result.errors).toHaveLength(1)
    }
  })

  it('rejects prices outside the contract range', () => {
    for (const price of [0, -5, 0.001, 200000000, NaN]) {
      const result = serializePaste([{ ticker: 'RAT', quantity: 1, price }], 'down')
      expect(result.text).toBeUndefined()
      expect(result.errors).toHaveLength(1)
    }
  })

  it('rejects an empty contract', () => {
    expect(serializePaste([]).text).toBeUndefined()
  })
})
