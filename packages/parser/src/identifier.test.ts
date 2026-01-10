/**
 * Token Identifier Tests
 */

import { describe, it, expect } from 'vitest'
import { tokenize } from './tokenizer.js'
import { identifyTokens, resolveCommaSeparatedCommodities } from './identifier.js'
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
  Benten: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
  Katoa: { naturalId: 'KAT', name: 'Katoa', type: 'planet' },
  'Promitor Station': { naturalId: 'PS', name: 'Promitor Station', type: 'station' },
  'Giedi Prime': { naturalId: 'GP', name: 'Giedi Prime', type: 'planet' },
}

const USERS: Record<string, ResolvedUser> = {
  bob: { userId: 1, username: 'bob', displayName: 'Bob Smith', fioUsername: 'BOB' },
  alice: { userId: 2, username: 'alice', displayName: 'Alice Jones', fioUsername: 'ALICE' },
  CoffeeCupMassacre: {
    userId: 3,
    username: 'CoffeeCupMassacre',
    displayName: null,
    fioUsername: 'CCM',
  },
}

// Mock resolvers
const mockResolvers: TokenResolvers = {
  resolveCommodity: async (token: string) => {
    const upper = token.toUpperCase()
    return COMMODITIES[upper] ?? COMMODITIES[token] ?? null
  },
  resolveLocation: async (token: string) => {
    return LOCATIONS[token] ?? LOCATIONS[token.toUpperCase()] ?? null
  },
  resolveUser: async (token: string) => {
    const lower = token.toLowerCase()
    return USERS[lower] ?? USERS[token] ?? null
  },
}

describe('identifyTokens', () => {
  describe('pre-classified tokens', () => {
    it('should pass through number tokens', async () => {
      const { tokens } = tokenize('100 200')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(2)
      expect(identified[0].type).toBe('number')
      expect(identified[0].value).toBe('100')
      expect(identified[1].type).toBe('number')
      expect(identified[1].value).toBe('200')
    })

    it('should pass through action tokens', async () => {
      const { tokens } = tokenize('send close')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(2)
      expect(identified[0]).toMatchObject({ type: 'action', value: 'send' })
      expect(identified[1]).toMatchObject({ type: 'action', value: 'close' })
    })

    it('should normalize action keywords', async () => {
      const { tokens } = tokenize('submit done finish')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified.every(t => t.type === 'action' && t.value === 'send')).toBe(true)
    })

    it('should pass through limit tokens with parsed data', async () => {
      const { tokens } = tokenize('reserve:100 max:500')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(2)
      expect(identified[0]).toMatchObject({
        type: 'limit',
        limitData: { mode: 'reserve', quantity: 100 },
      })
      expect(identified[1]).toMatchObject({
        type: 'limit',
        limitData: { mode: 'max_sell', quantity: 500 },
      })
    })
  })

  describe('explicit prefixes', () => {
    it('should resolve user: prefix', async () => {
      const { tokens } = tokenize('user:bob')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(1)
      expect(identified[0]).toMatchObject({
        type: 'user',
        resolved: { userId: 1, username: 'bob' },
      })
    })

    it('should resolve commodity: prefix', async () => {
      const { tokens } = tokenize('commodity:COF')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(1)
      expect(identified[0]).toMatchObject({
        type: 'commodity',
        resolved: { ticker: 'COF', name: 'Coffee' },
      })
    })

    it('should resolve location: prefix', async () => {
      const { tokens } = tokenize('location:BEN')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(1)
      expect(identified[0]).toMatchObject({
        type: 'location',
        resolved: { naturalId: 'BEN', name: 'Benten' },
      })
    })

    it('should mark invalid explicit prefix as unresolved', async () => {
      const { tokens } = tokenize('user:nonexistent')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(1)
      expect(identified[0].type).toBe('unresolved')
    })
  })

  describe('resolution order', () => {
    it('should resolve commodity before location', async () => {
      const { tokens } = tokenize('COF')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(1)
      expect(identified[0].type).toBe('commodity')
    })

    it('should resolve location when not a commodity', async () => {
      const { tokens } = tokenize('BEN')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(1)
      expect(identified[0].type).toBe('location')
    })

    it('should resolve user when not commodity or location', async () => {
      const { tokens } = tokenize('CoffeeCupMassacre')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(1)
      expect(identified[0].type).toBe('user')
    })

    it('should mark truly unknown tokens as unresolved', async () => {
      const { tokens } = tokenize('xyz123 unknown')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(2)
      expect(identified.every(t => t.type === 'unresolved')).toBe(true)
    })
  })

  describe('multi-word locations', () => {
    it('should resolve two-word location', async () => {
      const { tokens } = tokenize('Giedi Prime')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(1)
      expect(identified[0]).toMatchObject({
        type: 'location',
        value: 'Giedi Prime',
        resolved: { naturalId: 'GP', name: 'Giedi Prime' },
      })
    })

    it('should resolve two-word location within larger input', async () => {
      const { tokens } = tokenize('100 COF Giedi Prime bob')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(4)
      expect(identified[0].type).toBe('number')
      expect(identified[1].type).toBe('commodity')
      expect(identified[2]).toMatchObject({
        type: 'location',
        value: 'Giedi Prime',
      })
      expect(identified[3].type).toBe('user')
    })

    it('should not combine tokens if result is not a valid location', async () => {
      const { tokens } = tokenize('Unknown Place')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(2)
      expect(identified.every(t => t.type === 'unresolved')).toBe(true)
    })
  })

  describe('complex inputs', () => {
    it('should identify typical buy command', async () => {
      const { tokens } = tokenize('100 COF 200 RAT BEN bob send')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(7)
      expect(identified.map(t => t.type)).toEqual([
        'number',
        'commodity',
        'number',
        'commodity',
        'location',
        'user',
        'action',
      ])
    })

    it('should identify sell command with limit', async () => {
      const { tokens } = tokenize('COF BEN reserve:1000')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(3)
      expect(identified[0].type).toBe('commodity')
      expect(identified[1].type).toBe('location')
      expect(identified[2].type).toBe('limit')
    })

    it('should handle case-insensitive commodity matching', async () => {
      const { tokens } = tokenize('cof Cof COF')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified.every(t => t.type === 'commodity')).toBe(true)
    })
  })

  describe('comma-separated lists', () => {
    it('should mark comma-separated list as unresolved (parser handles expansion)', async () => {
      const { tokens } = tokenize('COF,CAF,H2O BEN')
      const identified = await identifyTokens(tokens, mockResolvers)

      expect(identified).toHaveLength(2)
      expect(identified[0]).toMatchObject({ type: 'unresolved', value: 'COF,CAF,H2O' })
      expect(identified[1].type).toBe('location')
    })
  })
})

describe('resolveCommaSeparatedCommodities', () => {
  it('should resolve all valid commodities', async () => {
    const result = await resolveCommaSeparatedCommodities('COF,RAT,H2O', mockResolvers)

    expect(result.commodities).toHaveLength(3)
    expect(result.unresolved).toHaveLength(0)
    expect(result.commodities.map(c => c.ticker)).toEqual(['COF', 'RAT', 'H2O'])
  })

  it('should separate resolved and unresolved', async () => {
    const result = await resolveCommaSeparatedCommodities('COF,INVALID,H2O', mockResolvers)

    expect(result.commodities).toHaveLength(2)
    expect(result.unresolved).toEqual(['INVALID'])
  })

  it('should handle all invalid commodities', async () => {
    const result = await resolveCommaSeparatedCommodities('AAA,BBB,CCC', mockResolvers)

    expect(result.commodities).toHaveLength(0)
    expect(result.unresolved).toEqual(['AAA', 'BBB', 'CCC'])
  })
})
