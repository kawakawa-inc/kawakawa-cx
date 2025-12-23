import { describe, it, expect } from 'vitest'
import { detectShoppingListFormat, parseShoppingList, isShoppingList } from './shopping-list.js'

describe('detectShoppingListFormat', () => {
  it('returns null for empty input', () => {
    expect(detectShoppingListFormat('')).toBe(null)
    expect(detectShoppingListFormat('   ')).toBe(null)
  })

  it('detects XIT JSON format', () => {
    const xit = '{"groups":[{"materials":{"COF":100}}]}'
    expect(detectShoppingListFormat(xit)).toBe('xit')
  })

  it('detects XIT JSON with whitespace', () => {
    const xit = '  {"groups":[{"materials":{"COF":100}}]}  '
    expect(detectShoppingListFormat(xit)).toBe('xit')
  })

  it('detects simple format (single pair)', () => {
    expect(detectShoppingListFormat('COF 100')).toBe('simple')
    expect(detectShoppingListFormat('cof 100')).toBe('simple')
    expect(detectShoppingListFormat('COF,100')).toBe('simple')
    expect(detectShoppingListFormat('H2O 500')).toBe('simple')
  })

  it('detects CSV format (multiple pairs)', () => {
    expect(detectShoppingListFormat('COF 100 DW 500')).toBe('csv')
    expect(detectShoppingListFormat('COF,100,DW,500')).toBe('csv')
    expect(detectShoppingListFormat('COF 100 DW 500 RAT 200')).toBe('csv')
  })

  it('returns null for unrecognized format', () => {
    expect(detectShoppingListFormat('hello world')).toBe(null)
    expect(detectShoppingListFormat('no quantities here')).toBe(null)
  })

  it('handles alphanumeric tickers', () => {
    // Tickers can be any 1-4 alphanumeric chars
    expect(detectShoppingListFormat('123 456')).toBe('simple') // "123" is valid ticker
    expect(detectShoppingListFormat('H2O 500')).toBe('simple')
    expect(detectShoppingListFormat('2GO 100')).toBe('simple')
  })

  it('extracts valid portion from long tickers', () => {
    // "TOOLONG 100" extracts "LONG 100" since regex finds valid 4-char match
    expect(detectShoppingListFormat('TOOLONG 100')).toBe('simple')
  })
})

describe('parseShoppingList', () => {
  describe('XIT JSON format', () => {
    it('parses valid XIT JSON', () => {
      const input = '{"groups":[{"materials":{"COF":100,"DW":500}}]}'
      const result = parseShoppingList(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100, DW: 500 })
        expect(result.format).toBe('xit')
      }
    })

    it('parses XIT JSON with name', () => {
      const input = '{"global":{"name":"My List"},"groups":[{"materials":{"COF":100}}]}'
      const result = parseShoppingList(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.name).toBe('My List')
      }
    })

    it('aggregates materials from multiple groups', () => {
      const input = '{"groups":[{"materials":{"COF":100}},{"materials":{"COF":50,"DW":200}}]}'
      const result = parseShoppingList(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 150, DW: 200 })
      }
    })

    it('fails on invalid XIT JSON', () => {
      const result = parseShoppingList('{"groups":[]}')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('No groups found')
      }
    })

    it('fails on malformed JSON', () => {
      const result = parseShoppingList('{invalid json}')
      expect(result.success).toBe(false)
    })
  })

  describe('CSV format', () => {
    it('parses space-separated pairs', () => {
      const result = parseShoppingList('COF 100 DW 500')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100, DW: 500 })
        expect(result.format).toBe('csv')
      }
    })

    it('parses comma-separated pairs', () => {
      const result = parseShoppingList('COF,100,DW,500')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100, DW: 500 })
      }
    })

    it('parses tab-separated pairs', () => {
      const result = parseShoppingList('COF\t100\tDW\t500')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100, DW: 500 })
      }
    })

    it('parses mixed separators', () => {
      const result = parseShoppingList('COF,100 DW\t500')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100, DW: 500 })
      }
    })

    it('handles multiple spaces', () => {
      const result = parseShoppingList('COF   100    DW   500')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100, DW: 500 })
      }
    })

    it('aggregates duplicate tickers', () => {
      const result = parseShoppingList('COF 100 DW 500 COF 50')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 150, DW: 500 })
      }
    })

    it('converts tickers to uppercase', () => {
      const result = parseShoppingList('cof 100 dw 500')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100, DW: 500 })
      }
    })

    it('handles newline-separated pairs', () => {
      const result = parseShoppingList('COF 100\nDW 500\nRAT 200')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100, DW: 500, RAT: 200 })
      }
    })
  })

  describe('simple format', () => {
    it('parses single pair', () => {
      const result = parseShoppingList('COF 100')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100 })
        expect(result.format).toBe('simple')
      }
    })

    it('parses single pair with comma', () => {
      const result = parseShoppingList('COF,100')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100 })
      }
    })
  })

  describe('error cases', () => {
    it('fails on empty input', () => {
      const result = parseShoppingList('')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Empty input')
      }
    })

    it('fails on unrecognized format', () => {
      const result = parseShoppingList('hello world')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Unrecognized format')
      }
    })

    it('extracts valid ticker from long input', () => {
      // "TOOLONG 100" extracts "LONG 100" since regex finds valid 4-char match after "TOO"
      const result = parseShoppingList('TOOLONG 100')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ LONG: 100 })
      }
    })

    it('ignores zero or negative quantities', () => {
      const result = parseShoppingList('COF 100 DW 0 RAT -50 FE 200')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.materials).toEqual({ COF: 100, FE: 200 })
      }
    })
  })

  describe('ticker validation', () => {
    const validTickers = new Set(['COF', 'DW', 'RAT', 'H2O'])

    it('reports unknown tickers when validation enabled', () => {
      const result = parseShoppingList('COF 100 XYZ 200', { validTickers })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.unknownTickers).toEqual(['XYZ'])
        expect(result.materials).toEqual({ COF: 100, XYZ: 200 })
      }
    })

    it('removes unknown tickers when removeUnknown is true', () => {
      const result = parseShoppingList('COF 100 XYZ 200', {
        validTickers,
        removeUnknown: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.unknownTickers).toEqual(['XYZ'])
        expect(result.materials).toEqual({ COF: 100 })
      }
    })

    it('fails if all tickers are unknown and removeUnknown is true', () => {
      const result = parseShoppingList('XYZ 100 ABC 200', {
        validTickers,
        removeUnknown: true,
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('All tickers were unknown')
      }
    })

    it('skips validation when validTickers not provided', () => {
      const result = parseShoppingList('XYZ 100')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.unknownTickers).toBeUndefined()
      }
    })
  })
})

describe('isShoppingList', () => {
  it('returns true for valid shopping list inputs', () => {
    expect(isShoppingList('{"groups":[{"materials":{"COF":100}}]}')).toBe(true)
    expect(isShoppingList('COF 100')).toBe(true)
    expect(isShoppingList('COF 100 DW 500')).toBe(true)
    expect(isShoppingList('COF,100,DW,500')).toBe(true)
  })

  it('returns false for invalid inputs', () => {
    expect(isShoppingList('')).toBe(false)
    expect(isShoppingList('hello')).toBe(false)
    expect(isShoppingList('123')).toBe(false)
  })
})
