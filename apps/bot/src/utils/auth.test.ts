import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFindFirst } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
}))

vi.mock('@kawakawa/db', () => ({
  db: {
    query: {
      userDiscordProfiles: { findFirst: mockFindFirst },
    },
  },
  userDiscordProfiles: { discordId: 'discordId' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

vi.mock('discord.js', () => ({
  MessageFlags: { Ephemeral: 64 },
}))

import { requireLinkedUser, UNLINKED_ACCOUNT_MESSAGE } from './auth.js'

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('requireLinkedUser', () => {
    it('returns userId and profile when linked', async () => {
      const profile = {
        discordId: 'discord123',
        userId: 5,
        user: { id: 5, username: 'alice', displayName: 'Alice' },
      }
      mockFindFirst.mockResolvedValue(profile)

      const mockReply = vi.fn()
      const interaction = { user: { id: 'discord123' }, reply: mockReply } as never

      const result = await requireLinkedUser(interaction)

      expect(result).toEqual({ userId: 5, profile })
      expect(mockReply).not.toHaveBeenCalled()
    })

    it('returns null and sends error when not linked', async () => {
      mockFindFirst.mockResolvedValue(undefined)

      const mockReply = vi.fn()
      const interaction = { user: { id: 'discord456' }, reply: mockReply } as never

      const result = await requireLinkedUser(interaction)

      expect(result).toBeNull()
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: UNLINKED_ACCOUNT_MESSAGE,
        })
      )
    })
  })

  describe('UNLINKED_ACCOUNT_MESSAGE', () => {
    it('mentions register and link commands', () => {
      expect(UNLINKED_ACCOUNT_MESSAGE).toContain('/register')
      expect(UNLINKED_ACCOUNT_MESSAGE).toContain('/link')
    })
  })
})
