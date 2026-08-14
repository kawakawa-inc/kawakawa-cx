/**
 * Tests for AuthController Discord linking endpoints
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockDbSelect,
  mockDbUpdate,
  mockDbTransaction,
  mockSelectFrom,
  mockSelectWhere,
  mockSelectLimit,
  mockFindFirstUserDiscordProfile,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
  mockTxInsertValues,
  mockTxFindFirstUserDiscordProfile,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockSelectFrom: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockFindFirstUserDiscordProfile: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockTxInsertValues: vi.fn(),
  mockTxFindFirstUserDiscordProfile: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    transaction: mockDbTransaction,
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

vi.mock('@kawakawa/services/notifications', () => ({
  notificationService: { create: vi.fn() },
}))

const { mockIssueAuthCookie, mockRevokeAuthCookie } = vi.hoisted(() => ({
  mockIssueAuthCookie: vi.fn(),
  mockRevokeAuthCookie: vi.fn(),
}))
vi.mock('../utils/authCookie.js', () => ({
  issueAuthCookie: mockIssueAuthCookie,
  revokeAuthCookie: mockRevokeAuthCookie,
}))

import { AuthController } from './AuthController.js'

// Helper to build the tx mock used inside db.transaction callback
function createTxMock(
  overrides: {
    updateReturning?: unknown[]
    findFirstResults?: (unknown | null)[]
    insertThrow?: Error
  } = {}
) {
  const { updateReturning = [], findFirstResults = [], insertThrow } = overrides

  const txInsertValues = mockTxInsertValues
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues })

  mockTxFindFirstUserDiscordProfile.mockReset()
  for (const result of findFirstResults) {
    mockTxFindFirstUserDiscordProfile.mockResolvedValueOnce(result)
  }

  mockUpdateReturning.mockResolvedValue(updateReturning)
  mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning })
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
  const txUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

  if (insertThrow) {
    txInsertValues.mockRejectedValue(insertThrow)
  } else {
    txInsertValues.mockResolvedValue(undefined)
  }

  return {
    update: txUpdate,
    insert: txInsert,
    query: {
      userDiscordProfiles: {
        findFirst: mockTxFindFirstUserDiscordProfile,
      },
    },
  }
}

describe('AuthController - Discord Linking', () => {
  let controller: AuthController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new AuthController()

    // Default select chain (for validateDiscordLinkToken)
    mockSelectLimit.mockResolvedValue([])
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit })
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockDbSelect.mockReturnValue({ from: mockSelectFrom })

    // Default update chain (for validateDiscordLinkToken marking token as used)
    mockUpdateWhere.mockResolvedValue(undefined)
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockDbUpdate.mockReturnValue({ set: mockUpdateSet })

    // Default transaction: execute the callback with tx mock
    mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = createTxMock({ updateReturning: [] })
      return cb(tx)
    })
  })

  /**
   * Logout must be a server round-trip now that the session cookie is httpOnly:
   * JS cannot delete it. It is also deliberately unauthenticated and idempotent,
   * so logging out with an already-dead session still clears the cookie rather
   * than 401ing and leaving it in place.
   */
  describe('logout', () => {
    it('revokes the session cookie', async () => {
      const result = await controller.logout()

      expect(mockRevokeAuthCookie).toHaveBeenCalledTimes(1)
      expect(result.message).toBe('Logged out')
    })

    it('succeeds when called without a valid session', async () => {
      await expect(controller.logout()).resolves.toMatchObject({ message: 'Logged out' })
    })
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
          expiresAt: new Date(Date.now() - 60000),
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

    const validToken = {
      id: 1,
      token: 'valid',
      discordId: '123',
      discordUsername: 'testuser',
      discordAvatar: 'avatar.png',
      used: true, // already set to true by atomic update
      expiresAt: new Date(Date.now() + 60000),
    }

    it('throws Unauthorized when no user', async () => {
      await expect(controller.completeDiscordLink(mockRequest(), { token: 'tok' })).rejects.toThrow(
        'Authentication required'
      )
    })

    it('throws BadRequest when token not found (atomic update returns empty)', async () => {
      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = createTxMock({ updateReturning: [] })
        return cb(tx)
      })

      await expect(
        controller.completeDiscordLink(mockRequest(1), { token: 'bad-token' })
      ).rejects.toThrow('Invalid or expired link token')
    })

    it('throws BadRequest when token expired', async () => {
      const expiredToken = { ...validToken, expiresAt: new Date(Date.now() - 60000) }

      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = createTxMock({ updateReturning: [expiredToken] })
        return cb(tx)
      })

      await expect(
        controller.completeDiscordLink(mockRequest(1), { token: 'expired' })
      ).rejects.toThrow('expired')
    })

    it('throws Conflict when user already has Discord linked', async () => {
      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = createTxMock({
          updateReturning: [validToken],
          findFirstResults: [{ userId: 1, discordId: '999' }],
        })
        return cb(tx)
      })

      await expect(
        controller.completeDiscordLink(mockRequest(1), { token: 'valid' })
      ).rejects.toThrow('already has a Discord linked')
    })

    it('throws BadRequest when Discord already linked to another account', async () => {
      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = createTxMock({
          updateReturning: [validToken],
          findFirstResults: [null, { userId: 99, discordId: '123' }],
        })
        return cb(tx)
      })

      await expect(
        controller.completeDiscordLink(mockRequest(1), { token: 'valid' })
      ).rejects.toThrow('already linked to another')
    })

    it('successfully links Discord account', async () => {
      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = createTxMock({
          updateReturning: [validToken],
          findFirstResults: [null, null],
        })
        return cb(tx)
      })

      const result = await controller.completeDiscordLink(mockRequest(1), { token: 'valid' })

      expect(result.message).toContain('Successfully linked')
      expect(result.message).toContain('testuser')
      expect(mockTxInsertValues).toHaveBeenCalled()
    })
  })
})
