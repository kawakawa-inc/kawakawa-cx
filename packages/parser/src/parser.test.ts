/**
 * Main Parser Tests
 */

import { describe, it, expect } from 'vitest'
import { parseTokens } from './parser.js'
import type { TokenResolvers, ResolvedCommodity, ResolvedLocation, ResolvedUser } from './types.js'

// Mock data
const COMMODITIES: Record<string, ResolvedCommodity> = {
  COF: { ticker: 'COF', name: 'Coffee' },
  RAT: { ticker: 'RAT', name: 'Rations' },
  H2O: { ticker: 'H2O', name: 'Water' },
  DW: { ticker: 'DW', name: 'Drinking Water' },
  CAF: { ticker: 'CAF', name: 'Cafeteria' },
}

const LOCATIONS: Record<string, ResolvedLocation> = {
  BEN: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
  Katoa: { naturalId: 'KAT', name: 'Katoa', type: 'planet' },
  'Giedi Prime': { naturalId: 'GP', name: 'Giedi Prime', type: 'planet' },
}

const USERS: Record<string, ResolvedUser> = {
  bob: { userId: 1, username: 'bob', displayName: 'Bob Smith', fioUsername: 'BOB' },
  alice: { userId: 2, username: 'alice', displayName: 'Alice Jones', fioUsername: 'ALICE' },
}

// Mock resolvers
const mockResolvers: TokenResolvers = {
  resolveCommodity: async (token: string) => {
    const upper = token.toUpperCase()
    return COMMODITIES[upper] ?? null
  },
  resolveLocation: async (token: string) => {
    return LOCATIONS[token] ?? null
  },
  resolveUser: async (token: string) => {
    const lower = token.toLowerCase()
    return USERS[lower] ?? null
  },
}

describe('parseTokens', () => {
  describe('empty input', () => {
    it('should return empty result for empty input', async () => {
      const result = await parseTokens('', mockResolvers)
      expect(result.items).toEqual([])
      expect(result.location).toBeNull()
      expect(result.user).toBeNull()
      expect(result.errors).toEqual([])
    })

    it('should return empty result for whitespace-only input', async () => {
      const result = await parseTokens('   ', mockResolvers)
      expect(result.items).toEqual([])
    })
  })

  describe('qty-first pattern', () => {
    it('should parse single commodity with quantity', async () => {
      const result = await parseTokens('100 COF', mockResolvers)

      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toEqual({
        commodity: { ticker: 'COF', name: 'Coffee' },
        quantity: 100,
      })
    })

    it('should parse multiple commodities with quantities', async () => {
      const result = await parseTokens('100 COF 200 RAT', mockResolvers)

      expect(result.items).toHaveLength(2)
      expect(result.items[0]).toEqual({
        commodity: { ticker: 'COF', name: 'Coffee' },
        quantity: 100,
      })
      expect(result.items[1]).toEqual({
        commodity: { ticker: 'RAT', name: 'Rations' },
        quantity: 200,
      })
    })

    it('should parse with location', async () => {
      const result = await parseTokens('100 COF BEN', mockResolvers)

      expect(result.items).toHaveLength(1)
      expect(result.location).toEqual({ naturalId: 'BEN', name: 'Benten', type: 'planet' })
    })

    it('should parse with user', async () => {
      const result = await parseTokens('100 COF bob', mockResolvers)

      expect(result.items).toHaveLength(1)
      expect(result.user).toMatchObject({ userId: 1, username: 'bob' })
    })
  })

  describe('ticker-first pattern', () => {
    it('should parse single commodity with quantity', async () => {
      const result = await parseTokens('COF 100', mockResolvers)

      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toEqual({
        commodity: { ticker: 'COF', name: 'Coffee' },
        quantity: 100,
      })
    })

    it('should parse multiple commodities with quantities', async () => {
      const result = await parseTokens('COF 100 RAT 200', mockResolvers)

      expect(result.items).toHaveLength(2)
      expect(result.items[0].commodity.ticker).toBe('COF')
      expect(result.items[0].quantity).toBe(100)
      expect(result.items[1].commodity.ticker).toBe('RAT')
      expect(result.items[1].quantity).toBe(200)
    })
  })

  describe('comma-separated format', () => {
    it('should parse comma-separated commodities with shared quantity', async () => {
      const result = await parseTokens('COF,RAT,H2O BEN 500', mockResolvers)

      expect(result.items).toHaveLength(3)
      expect(result.items.every(item => item.quantity === 500)).toBe(true)
      expect(result.items.map(item => item.commodity.ticker)).toEqual(['COF', 'RAT', 'H2O'])
      expect(result.location).toMatchObject({ naturalId: 'BEN' })
    })

    it('should handle unresolved commodities in list', async () => {
      const result = await parseTokens('COF,INVALID,H2O BEN 500', mockResolvers)

      expect(result.items).toHaveLength(2)
      expect(result.unresolved).toContain('INVALID')
    })

    it('should parse without quantity', async () => {
      const result = await parseTokens('COF,RAT BEN', mockResolvers)

      expect(result.items).toHaveLength(2)
      expect(result.items.every(item => item.quantity === null)).toBe(true)
    })
  })

  describe('action keywords', () => {
    it('should parse send action', async () => {
      const result = await parseTokens('100 COF BEN bob send', mockResolvers)

      expect(result.actions.has('send')).toBe(true)
    })

    it('should parse close action', async () => {
      const result = await parseTokens('100 COF BEN close', mockResolvers)

      expect(result.actions.has('close')).toBe(true)
    })

    it('should normalize submit/done/finish to send', async () => {
      const result1 = await parseTokens('100 COF submit', mockResolvers)
      const result2 = await parseTokens('100 COF done', mockResolvers)
      const result3 = await parseTokens('100 COF finish', mockResolvers)

      expect(result1.actions.has('send')).toBe(true)
      expect(result2.actions.has('send')).toBe(true)
      expect(result3.actions.has('send')).toBe(true)
    })
  })

  describe('limit modifiers', () => {
    it('should parse reserve limit', async () => {
      const result = await parseTokens('COF BEN reserve:1000', mockResolvers)

      expect(result.limit).toEqual({ mode: 'reserve', quantity: 1000 })
    })

    it('should parse max limit', async () => {
      const result = await parseTokens('COF BEN max:500', mockResolvers)

      expect(result.limit).toEqual({ mode: 'max_sell', quantity: 500 })
    })

    it('should parse short form limits', async () => {
      const result1 = await parseTokens('COF BEN r:100', mockResolvers)
      const result2 = await parseTokens('COF BEN m:200', mockResolvers)

      expect(result1.limit).toEqual({ mode: 'reserve', quantity: 100 })
      expect(result2.limit).toEqual({ mode: 'max_sell', quantity: 200 })
    })
  })

  describe('multi-word locations', () => {
    it('should parse two-word location', async () => {
      const result = await parseTokens('100 COF Giedi Prime', mockResolvers)

      expect(result.items).toHaveLength(1)
      expect(result.location).toMatchObject({ naturalId: 'GP', name: 'Giedi Prime' })
    })
  })

  describe('error handling', () => {
    it('should report multiple locations', async () => {
      const result = await parseTokens('100 COF BEN Katoa', mockResolvers)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Multiple locations')
    })

    it('should report multiple users', async () => {
      const result = await parseTokens('100 COF bob alice', mockResolvers)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Multiple users')
    })

    it('should collect unresolved tokens', async () => {
      const result = await parseTokens('100 COF xyz123 unknown', mockResolvers)

      expect(result.unresolved).toContain('xyz123')
      expect(result.unresolved).toContain('unknown')
    })
  })

  describe('commodity without quantity', () => {
    it('should add commodity with null quantity when unpaired', async () => {
      const result = await parseTokens('COF BEN', mockResolvers)

      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toEqual({
        commodity: { ticker: 'COF', name: 'Coffee' },
        quantity: null,
      })
      expect(result.location).toMatchObject({ naturalId: 'BEN' })
    })
  })

  describe('complex inputs', () => {
    it('should parse full invoice command', async () => {
      const result = await parseTokens('100 COF 200 RAT BEN bob send', mockResolvers)

      expect(result.items).toHaveLength(2)
      expect(result.location).toMatchObject({ naturalId: 'BEN' })
      expect(result.user).toMatchObject({ username: 'bob' })
      expect(result.actions.has('send')).toBe(true)
    })

    it('should parse sell order with limit', async () => {
      const result = await parseTokens('COF RAT BEN reserve:1000', mockResolvers)

      expect(result.items).toHaveLength(2)
      expect(result.items.every(item => item.quantity === null)).toBe(true)
      expect(result.location).toMatchObject({ naturalId: 'BEN' })
      expect(result.limit).toEqual({ mode: 'reserve', quantity: 1000 })
    })

    it('should handle tokens in any order', async () => {
      const result1 = await parseTokens('bob BEN 100 COF send', mockResolvers)
      const result2 = await parseTokens('send COF 100 bob BEN', mockResolvers)

      expect(result1.items).toHaveLength(1)
      expect(result1.items[0].commodity.ticker).toBe('COF')
      expect(result1.items[0].quantity).toBe(100)
      expect(result1.location).toMatchObject({ naturalId: 'BEN' })
      expect(result1.user).toMatchObject({ username: 'bob' })
      expect(result1.actions.has('send')).toBe(true)

      expect(result2.items).toHaveLength(1)
      expect(result2.items[0].commodity.ticker).toBe('COF')
      expect(result2.items[0].quantity).toBe(100)
      expect(result2.location).toMatchObject({ naturalId: 'BEN' })
      expect(result2.user).toMatchObject({ username: 'bob' })
      expect(result2.actions.has('send')).toBe(true)
    })
  })
})
