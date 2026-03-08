import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockResolveCommodity, mockResolveLocation, mockFindUserByName, mockFindUserByDiscordId } =
  vi.hoisted(() => ({
    mockResolveCommodity: vi.fn(),
    mockResolveLocation: vi.fn(),
    mockFindUserByName: vi.fn(),
    mockFindUserByDiscordId: vi.fn(),
  }))

vi.mock('../services/commodityService.js', () => ({
  resolveCommodity: mockResolveCommodity,
}))

vi.mock('../services/locationService.js', () => ({
  resolveLocation: mockResolveLocation,
}))

vi.mock('../services/invoiceService.js', () => ({
  findUserByName: mockFindUserByName,
  findUserByDiscordId: mockFindUserByDiscordId,
}))

import { botResolvers } from './resolvers.js'

describe('resolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('resolveCommodity', () => {
    it('returns resolved commodity', async () => {
      mockResolveCommodity.mockResolvedValue({ ticker: 'COF', name: 'Coffee' })

      const result = await botResolvers.resolveCommodity('COF')

      expect(result).toEqual({ ticker: 'COF', name: 'Coffee' })
    })

    it('returns null when not found', async () => {
      mockResolveCommodity.mockResolvedValue(null)

      const result = await botResolvers.resolveCommodity('XYZ')

      expect(result).toBeNull()
    })
  })

  describe('resolveLocation', () => {
    it('returns resolved location with normalized type', async () => {
      mockResolveLocation.mockResolvedValue({ naturalId: 'BEN', name: 'Benten', type: 'Station' })

      const result = await botResolvers.resolveLocation('BEN')

      expect(result).toEqual({ naturalId: 'BEN', name: 'Benten', type: 'station' })
    })

    it('defaults to planet type for unknown types', async () => {
      mockResolveLocation.mockResolvedValue({ naturalId: 'KAT', name: 'Katoa', type: 'Rocky' })

      const result = await botResolvers.resolveLocation('KAT')

      expect(result).toEqual({ naturalId: 'KAT', name: 'Katoa', type: 'planet' })
    })

    it('handles warehouse type', async () => {
      mockResolveLocation.mockResolvedValue({
        naturalId: 'WH1',
        name: 'Warehouse 1',
        type: 'Warehouse',
      })

      const result = await botResolvers.resolveLocation('WH1')

      expect(result).toEqual({ naturalId: 'WH1', name: 'Warehouse 1', type: 'warehouse' })
    })

    it('returns null when not found', async () => {
      mockResolveLocation.mockResolvedValue(null)

      const result = await botResolvers.resolveLocation('NOWHERE')

      expect(result).toBeNull()
    })
  })

  describe('resolveUser', () => {
    it('returns resolved user', async () => {
      mockFindUserByName.mockResolvedValue({
        userId: 1,
        username: 'alice',
        displayName: 'Alice',
        fioUsername: 'AliceFIO',
      })

      const result = await botResolvers.resolveUser('alice')

      expect(result).toEqual({
        userId: 1,
        username: 'alice',
        displayName: 'Alice',
        fioUsername: 'AliceFIO',
      })
    })

    it('returns null when user not found', async () => {
      mockFindUserByName.mockResolvedValue(null)

      const result = await botResolvers.resolveUser('nobody')

      expect(result).toBeNull()
    })
  })

  describe('resolveDiscordMention', () => {
    it('returns resolved user from discord ID', async () => {
      mockFindUserByDiscordId.mockResolvedValue({
        userId: 2,
        username: 'bob',
        displayName: 'Bob',
        fioUsername: null,
      })

      const result = await botResolvers.resolveDiscordMention!('123456')

      expect(result).toEqual({
        userId: 2,
        username: 'bob',
        displayName: 'Bob',
        fioUsername: null,
      })
    })

    it('returns null when discord user not found', async () => {
      mockFindUserByDiscordId.mockResolvedValue(null)

      const result = await botResolvers.resolveDiscordMention!('999999')

      expect(result).toBeNull()
    })
  })
})
