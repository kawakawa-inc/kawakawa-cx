import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockResolveCommodity, mockResolveLocation, mockReply } = vi.hoisted(() => ({
  mockResolveCommodity: vi.fn(),
  mockResolveLocation: vi.fn(),
  mockReply: vi.fn(),
}))

vi.mock('./commodityService.js', () => ({
  formatCommodity: vi.fn((t: string) => t),
  formatCommodityWithMode: vi.fn(async (t: string) => t),
  resolveCommodity: mockResolveCommodity,
  getCommodity: vi.fn(),
  clearCommodityCache: vi.fn(),
}))

vi.mock('./locationService.js', () => ({
  formatLocation: vi.fn(async (id: string) => id),
  resolveLocation: mockResolveLocation,
  getLocation: vi.fn(),
  clearLocationCache: vi.fn(),
}))

vi.mock('discord.js', () => ({
  MessageFlags: { Ephemeral: 64 },
}))

import { requireCommodity, requireLocation, clearDisplayCache } from './display.js'

describe('display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('requireCommodity', () => {
    it('returns resolved commodity when found', async () => {
      mockResolveCommodity.mockResolvedValue({ ticker: 'COF', name: 'Coffee' })
      const interaction = { reply: mockReply } as never

      const result = await requireCommodity(interaction, 'COF')

      expect(result).toEqual({ ticker: 'COF', name: 'Coffee' })
      expect(mockReply).not.toHaveBeenCalled()
    })

    it('returns null and sends error when commodity not found', async () => {
      mockResolveCommodity.mockResolvedValue(null)
      const interaction = { reply: mockReply } as never

      const result = await requireCommodity(interaction, 'XYZ')

      expect(result).toBeNull()
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('"XYZ"'),
        })
      )
    })
  })

  describe('requireLocation', () => {
    it('returns resolved location when found', async () => {
      mockResolveLocation.mockResolvedValue({ naturalId: 'BEN', name: 'Benten', type: 'station' })
      const interaction = { reply: mockReply } as never

      const result = await requireLocation(interaction, 'BEN')

      expect(result).toEqual({ naturalId: 'BEN', name: 'Benten', type: 'station' })
      expect(mockReply).not.toHaveBeenCalled()
    })

    it('returns null and sends error when location not found', async () => {
      mockResolveLocation.mockResolvedValue(null)
      const interaction = { reply: mockReply } as never

      const result = await requireLocation(interaction, 'NOWHERE')

      expect(result).toBeNull()
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('"NOWHERE"'),
        })
      )
    })
  })

  describe('clearDisplayCache', () => {
    it('does not throw', () => {
      expect(() => clearDisplayCache()).not.toThrow()
    })
  })
})
