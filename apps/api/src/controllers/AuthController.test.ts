/**
 * Tests for AuthController Discord linking endpoints
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectLimit,
  mockFindFirstDiscordProfile,
  mockFindFirstUserDiscordProfile,
  mockUpdateSet,
  mockUpdateWhere,
  mockInsertValues,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockFindFirstDiscordProfile: vi.fn(),
  mockFindFirstUserDiscordProfile: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockInsertValues: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    query: {
      userDiscordProfiles: {
        findFirst: mockFindFirstUserDiscordProfile,
      },
    },
  },
  discordLinkTokens: {
    id: 'discordLinkTokens.id',
    token: 'discordLinkTokens.token',
    discordId: 'discordLinkTokens.discordId',
    used: 'discordLinkTokens.used',
  },
  userDiscordProfiles: {
    userId: 'userDiscordProfiles.userId',
    discordId: 'userDiscordProfiles.discordId',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}))

vi.mock('../utils/password.js', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}))

vi.mock('../utils/jwt.js', () => ({
  generateToken: vi.fn(),
}))

vi.mock('../utils/permissionService.js', () => ({
  getPermissions: vi.fn().mockResolvedValue([]),
  hasPermission: vi.fn().mockResolvedValue(false),
}))

vi.mock('../services/notificationService.js', () => ({
  notificationService: { create: vi.fn() },
}))

import { AuthController } from './AuthController.js'

describe('AuthController - Discord Linking', () => {
  let controller: AuthController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new AuthController()

    // Default select chain
    mockSelectLimit.mockResolvedValue([])
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit })
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockDbSelect.mockReturnValue({ from: mockSelectFrom })

    // Default update chain
    mockUpdateWhere.mockResolvedValue(undefined)
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockDbUpdate.mockReturnValue({ set: mockUpdateSet })

    // Default insert chain
    mockInsertValues.mockResolvedValue(undefined)
    mockDbInsert.mockReturnValue({ values: mockInsertValues })
  })

  describe('validateDiscordLinkToken', () => {
    it('returns invalid when no token provided', async () => {
      const result = await controller.validateDiscordLinkToken('')

      expect(result).toEqual({ valid: false, error: 'No token provided' })
    })

    it('returns invalid when token not found', async () => {
      mockSelectLimit.mockResolvedValue([])

      const result = await controller.validateDiscordLinkToken('nonexistent-token')

      expect(result).toEqual({ valid: false, error: 'Invalid link token' })
    })

    it('returns invalid when token already used', async () => {
      mockSelectLimit.mockResolvedValue([
        {
          id: 1,
          token: 'used-token',
          discordId: '123',
          discordUsername: 'user',
          used: true,
          expiresAt: new Date(Date.now() + 60000),
        },
      ])

      const result = await controller.validateDiscordLinkToken('used-token')

      expect(result).toEqual({ valid: false, error: 'This link has already been used' })
    })

    it('returns invalid when token expired', async () => {
      mockSelectLimit.mockResolvedValue([
        {
          id: 1,
          token: 'expired-token',
          discordId: '123',
          discordUsername: 'user',
          used: false,
          expiresAt: new Date(Date.now() - 60000), // In the past
        },
      ])

      const result = await controller.validateDiscordLinkToken('expired-token')

      expect(result).toEqual({
        valid: false,
        error: 'This link has expired. Please run /link again in Discord.',
      })
    })

    it('returns invalid when Discord already linked', async () => {
      const expiresAt = new Date(Date.now() + 60000)
      mockSelectLimit.mockResolvedValue([
        {
          id: 1,
          token: 'valid-token',
          discordId: '123',
          discordUsername: 'user',
          used: false,
          expiresAt,
        },
      ])
      mockFindFirstUserDiscordProfile.mockResolvedValue({ userId: 99, discordId: '123' })

      const result = await controller.validateDiscordLinkToken('valid-token')

      expect(result).toEqual({
        valid: false,
        error: 'This Discord account is already linked to a Kawakawa account.',
      })
      // Should mark token as used
      expect(mockDbUpdate).toHaveBeenCalled()
    })

    it('returns valid with Discord info for valid token', async () => {
      const expiresAt = new Date(Date.now() + 60000)
      mockSelectLimit.mockResolvedValue([
        {
          id: 1,
          token: 'valid-token',
          discordId: '123',
          discordUsername: 'testuser',
          used: false,
          expiresAt,
        },
      ])
      mockFindFirstUserDiscordProfile.mockResolvedValue(null)

      const result = await controller.validateDiscordLinkToken('valid-token')

      expect(result).toEqual({
        valid: true,
        discordUsername: 'testuser',
        expiresAt,
      })
    })
  })

  describe('completeDiscordLink', () => {
    const mockRequest = (userId?: number) => ({ user: userId ? { userId } : undefined }) as never

    it('throws Unauthorized when no user', async () => {
      await expect(controller.completeDiscordLink(mockRequest(), { token: 'tok' })).rejects.toThrow(
        'Authentication required'
      )
    })

    it('throws BadRequest when token not found', async () => {
      mockSelectLimit.mockResolvedValue([])

      await expect(
        controller.completeDiscordLink(mockRequest(1), { token: 'bad-token' })
      ).rejects.toThrow('Invalid or expired link token')
    })

    it('throws BadRequest when token expired', async () => {
      mockSelectLimit.mockResolvedValue([
        {
          id: 1,
          token: 'expired',
          discordId: '123',
          discordUsername: 'user',
          discordAvatar: null,
          used: false,
          expiresAt: new Date(Date.now() - 60000),
        },
      ])

      await expect(
        controller.completeDiscordLink(mockRequest(1), { token: 'expired' })
      ).rejects.toThrow('expired')
    })

    it('throws Conflict when user already has Discord linked', async () => {
      mockSelectLimit.mockResolvedValue([
        {
          id: 1,
          token: 'valid',
          discordId: '123',
          discordUsername: 'user',
          discordAvatar: null,
          used: false,
          expiresAt: new Date(Date.now() + 60000),
        },
      ])
      // First findFirst call = check if user already has Discord
      mockFindFirstUserDiscordProfile.mockResolvedValueOnce({ userId: 1, discordId: '999' })

      await expect(
        controller.completeDiscordLink(mockRequest(1), { token: 'valid' })
      ).rejects.toThrow('already has a Discord linked')
    })

    it('throws BadRequest when Discord already linked to another account', async () => {
      mockSelectLimit.mockResolvedValue([
        {
          id: 1,
          token: 'valid',
          discordId: '123',
          discordUsername: 'user',
          discordAvatar: null,
          used: false,
          expiresAt: new Date(Date.now() + 60000),
        },
      ])
      // First call: user has no Discord profile
      // Second call: this Discord is already linked to someone else
      mockFindFirstUserDiscordProfile
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ userId: 99, discordId: '123' })

      await expect(
        controller.completeDiscordLink(mockRequest(1), { token: 'valid' })
      ).rejects.toThrow('already linked to another')
    })

    it('successfully links Discord account', async () => {
      mockSelectLimit.mockResolvedValue([
        {
          id: 1,
          token: 'valid',
          discordId: '123',
          discordUsername: 'testuser',
          discordAvatar: 'avatar.png',
          used: false,
          expiresAt: new Date(Date.now() + 60000),
        },
      ])
      mockFindFirstUserDiscordProfile.mockResolvedValue(null)

      const result = await controller.completeDiscordLink(mockRequest(1), { token: 'valid' })

      expect(result.message).toContain('Successfully linked')
      expect(result.message).toContain('testuser')
      // Should insert the profile
      expect(mockDbInsert).toHaveBeenCalled()
      // Should mark token as used
      expect(mockDbUpdate).toHaveBeenCalled()
    })
  })
})
