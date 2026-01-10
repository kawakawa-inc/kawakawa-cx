/**
 * Tokenizer Tests
 */

import { describe, it, expect } from 'vitest'
import {
  tokenize,
  parseLimitModifier,
  extractExplicitValue,
  isCommaSeparatedList,
  splitCommaSeparatedList,
} from './tokenizer.js'

describe('tokenize', () => {
  describe('basic tokenization', () => {
    it('should return empty tokens for empty input', () => {
      expect(tokenize('')).toEqual({ tokens: [], jsonString: null })
      expect(tokenize('   ')).toEqual({ tokens: [], jsonString: null })
    })

    it('should tokenize simple space-separated input', () => {
      const result = tokenize('100 COF BEN')
      expect(result.tokens).toHaveLength(3)
      expect(result.tokens[0]).toMatchObject({ type: 'number', value: '100' })
      expect(result.tokens[1]).toMatchObject({ type: 'unknown', value: 'COF' })
      expect(result.tokens[2]).toMatchObject({ type: 'unknown', value: 'BEN' })
    })

    it('should tokenize comma-separated input', () => {
      const result = tokenize('COF, BEN, 100')
      expect(result.tokens).toHaveLength(3)
      expect(result.tokens.map(t => t.value)).toEqual(['COF', 'BEN', '100'])
    })

    it('should tokenize tab-separated input', () => {
      const result = tokenize('COF\tBEN\t100')
      expect(result.tokens).toHaveLength(3)
    })

    it('should tokenize newline-separated input', () => {
      const result = tokenize('COF\nBEN\n100')
      expect(result.tokens).toHaveLength(3)
    })

    it('should handle mixed separators', () => {
      const result = tokenize('COF, BEN\t100\nKatoa')
      expect(result.tokens).toHaveLength(4)
      expect(result.tokens.map(t => t.value)).toEqual(['COF', 'BEN', '100', 'Katoa'])
    })
  })

  describe('number classification', () => {
    it('should classify pure numbers as number type', () => {
      const result = tokenize('100 200 500')
      expect(result.tokens.every(t => t.type === 'number')).toBe(true)
    })

    it('should not classify numbers with letters as number type', () => {
      const result = tokenize('100a abc123')
      expect(result.tokens.every(t => t.type === 'unknown')).toBe(true)
    })
  })

  describe('action keywords', () => {
    it('should classify action keywords correctly', () => {
      const result = tokenize('send close submit done finish')
      expect(result.tokens.every(t => t.type === 'action')).toBe(true)
    })

    it('should be case-insensitive for action keywords', () => {
      const result = tokenize('SEND Send sEnD')
      expect(result.tokens.every(t => t.type === 'action')).toBe(true)
    })
  })

  describe('limit modifiers', () => {
    it('should classify reserve limit modifiers', () => {
      const result = tokenize('reserve:100 r:200')
      expect(result.tokens).toHaveLength(2)
      expect(result.tokens.every(t => t.type === 'limit')).toBe(true)
    })

    it('should classify max limit modifiers', () => {
      const result = tokenize('max:100 m:200')
      expect(result.tokens).toHaveLength(2)
      expect(result.tokens.every(t => t.type === 'limit')).toBe(true)
    })

    it('should be case-insensitive for limit modifiers', () => {
      const result = tokenize('RESERVE:100 MAX:200')
      expect(result.tokens.every(t => t.type === 'limit')).toBe(true)
    })
  })

  describe('explicit prefixes', () => {
    it('should classify user: prefix', () => {
      const result = tokenize('user:bob user:alice')
      expect(result.tokens.every(t => t.type === 'explicit_user')).toBe(true)
    })

    it('should classify commodity: prefix', () => {
      const result = tokenize('commodity:COF commodity:RAT')
      expect(result.tokens.every(t => t.type === 'explicit_commodity')).toBe(true)
    })

    it('should classify location: prefix', () => {
      const result = tokenize('location:BEN location:Katoa')
      expect(result.tokens.every(t => t.type === 'explicit_location')).toBe(true)
    })

    it('should be case-insensitive for prefixes', () => {
      const result = tokenize('USER:bob COMMODITY:COF LOCATION:BEN')
      expect(result.tokens[0].type).toBe('explicit_user')
      expect(result.tokens[1].type).toBe('explicit_commodity')
      expect(result.tokens[2].type).toBe('explicit_location')
    })
  })

  describe('comma-separated lists', () => {
    it('should keep comma-separated list as single token', () => {
      const result = tokenize('COF,CAF,H2O BEN 500')
      expect(result.tokens).toHaveLength(3)
      expect(result.tokens[0]).toMatchObject({ type: 'unknown', value: 'COF,CAF,H2O' })
    })
  })

  describe('JSON extraction', () => {
    it('should extract valid JSON', () => {
      const json = '{"groups":[{"name":"test","materials":[{"ticker":"COF","amount":100}]}]}'
      const result = tokenize(`BEN ${json} 500`)
      expect(result.jsonString).toBe(json)
      expect(result.tokens).toHaveLength(2)
      expect(result.tokens.map(t => t.value)).toEqual(['BEN', '500'])
    })

    it('should handle nested braces in JSON', () => {
      const json = '{"outer":{"inner":{"deep":1}}}'
      const result = tokenize(`${json}`)
      expect(result.jsonString).toBe(json)
      expect(result.tokens).toHaveLength(0)
    })

    it('should not extract JSON with unmatched braces', () => {
      const result = tokenize('BEN {invalid 500')
      expect(result.jsonString).toBeNull()
      expect(result.tokens).toHaveLength(3)
    })

    it('should handle JSON at beginning of input', () => {
      const json = '{"test":1}'
      const result = tokenize(`${json} BEN`)
      expect(result.jsonString).toBe(json)
      expect(result.tokens).toHaveLength(1)
      expect(result.tokens[0].value).toBe('BEN')
    })

    it('should handle JSON at end of input', () => {
      const json = '{"test":1}'
      const result = tokenize(`BEN ${json}`)
      expect(result.jsonString).toBe(json)
      expect(result.tokens).toHaveLength(1)
      expect(result.tokens[0].value).toBe('BEN')
    })
  })

  describe('complex inputs', () => {
    it('should handle typical buy command input', () => {
      const result = tokenize('100 COF 200 RAT Katoa bob send')
      expect(result.tokens).toHaveLength(7)
      expect(result.tokens[0].type).toBe('number')
      expect(result.tokens[2].type).toBe('number')
      expect(result.tokens[6].type).toBe('action')
    })

    it('should handle sell command with limit', () => {
      const result = tokenize('COF BEN reserve:1000')
      expect(result.tokens).toHaveLength(3)
      expect(result.tokens[2].type).toBe('limit')
    })

    it('should preserve position information', () => {
      const result = tokenize('COF BEN')
      expect(result.tokens[0].position).toBe(0)
      expect(result.tokens[1].position).toBe(4) // COF + space + 1
    })
  })
})

describe('parseLimitModifier', () => {
  it('should parse reserve modifiers', () => {
    expect(parseLimitModifier('reserve:100')).toEqual({ mode: 'reserve', quantity: 100 })
    expect(parseLimitModifier('r:500')).toEqual({ mode: 'reserve', quantity: 500 })
  })

  it('should parse max modifiers', () => {
    expect(parseLimitModifier('max:100')).toEqual({ mode: 'max_sell', quantity: 100 })
    expect(parseLimitModifier('m:500')).toEqual({ mode: 'max_sell', quantity: 500 })
  })

  it('should return null for invalid modifiers', () => {
    expect(parseLimitModifier('invalid')).toBeNull()
    expect(parseLimitModifier('reserve:')).toBeNull()
    expect(parseLimitModifier(':100')).toBeNull()
  })

  it('should be case-insensitive', () => {
    expect(parseLimitModifier('RESERVE:100')).toEqual({ mode: 'reserve', quantity: 100 })
    expect(parseLimitModifier('MAX:100')).toEqual({ mode: 'max_sell', quantity: 100 })
  })
})

describe('extractExplicitValue', () => {
  it('should extract user prefix value', () => {
    expect(extractExplicitValue('user:bob', 'user')).toBe('bob')
    expect(extractExplicitValue('USER:Alice', 'user')).toBe('Alice')
  })

  it('should extract commodity prefix value', () => {
    expect(extractExplicitValue('commodity:COF', 'commodity')).toBe('COF')
    expect(extractExplicitValue('COMMODITY:rat', 'commodity')).toBe('rat')
  })

  it('should extract location prefix value', () => {
    expect(extractExplicitValue('location:BEN', 'location')).toBe('BEN')
    expect(extractExplicitValue('LOCATION:Katoa', 'location')).toBe('Katoa')
  })

  it('should return null for non-matching prefix', () => {
    expect(extractExplicitValue('user:bob', 'commodity')).toBeNull()
    expect(extractExplicitValue('invalid', 'user')).toBeNull()
  })
})

describe('isCommaSeparatedList', () => {
  it('should return true for valid comma-separated lists', () => {
    expect(isCommaSeparatedList('COF,CAF')).toBe(true)
    expect(isCommaSeparatedList('COF,CAF,H2O')).toBe(true)
    expect(isCommaSeparatedList('A,B,C,D,E')).toBe(true)
  })

  it('should return false for single items', () => {
    expect(isCommaSeparatedList('COF')).toBe(false)
  })

  it('should return false for items with spaces', () => {
    expect(isCommaSeparatedList('COF, CAF')).toBe(false)
  })

  it('should return false for empty parts', () => {
    expect(isCommaSeparatedList('COF,,CAF')).toBe(false)
    expect(isCommaSeparatedList(',COF')).toBe(false)
    expect(isCommaSeparatedList('COF,')).toBe(false)
  })
})

describe('splitCommaSeparatedList', () => {
  it('should split comma-separated list', () => {
    expect(splitCommaSeparatedList('COF,CAF,H2O')).toEqual(['COF', 'CAF', 'H2O'])
  })

  it('should handle whitespace around items', () => {
    expect(splitCommaSeparatedList('COF , CAF , H2O')).toEqual(['COF', 'CAF', 'H2O'])
  })

  it('should filter empty parts', () => {
    expect(splitCommaSeparatedList('COF,,CAF')).toEqual(['COF', 'CAF'])
  })
})
