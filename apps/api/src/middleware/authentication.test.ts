import { describe, it, expect, vi, beforeEach } from 'vitest'
import { expressAuthentication } from './authentication.js'
import * as jwtUtils from '../utils/jwt.js'
import * as roleCache from '../utils/roleCache.js'
import * as requestContext from '../utils/requestContext.js'
import type { Request } from 'express'

vi.mock('../utils/jwt.js', () => ({
  verifyToken: vi.fn(),
  generateToken: vi.fn(),
  // Not mocked: exercise the real staleness check against injected exp values.
  shouldRefreshToken: vi.fn(),
}))

vi.mock('../utils/roleCache.js', () => ({
  getCachedRoles: vi.fn(),
  setCachedRoles: vi.fn(),
}))

vi.mock('../utils/requestContext.js', () => ({
  setContextValue: vi.fn(),
}))

// Track which table is being queried so we can return appropriate mock data
const mockPermissionsWhere = vi.fn()
let mockUsersResult: unknown[] = [{ tokenVersion: 0, isLocked: false }]
let mockJoinResult: unknown[] = []

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table: unknown) => {
        if (table === 'users_table') {
          return {
            // Cache hit path: select tokenVersion from users where ... limit 1
            where: () => ({
              limit: () => Promise.resolve(mockUsersResult),
            }),
            // Cache miss path: select from users left join user_roles where ...
            leftJoin: () => ({
              where: () => Promise.resolve(mockJoinResult),
            }),
          }
        }
        // Permissions query path (from rolePermissions)
        return {
          where: mockPermissionsWhere,
        }
      }),
    })),
  },
  users: 'users_table',
  userRoles: {
    userId: 'userId',
    roleId: 'roleId',
  },
  rolePermissions: {
    roleId: 'roleId',
    permissionId: 'permissionId',
    allowed: 'allowed',
  },
}))

describe('expressAuthentication', () => {
  let mockRequest: Partial<Request>

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequest = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    }
    // Default: user exists with tokenVersion 0
    mockUsersResult = [{ tokenVersion: 0, isLocked: false }]
    mockJoinResult = [{ tokenVersion: 0, isLocked: false, roleId: 'member' }]
    // Default: return empty permissions (no permissions granted)
    mockPermissionsWhere.mockResolvedValue([])
  })

  describe('jwt authentication', () => {
    it('should reject when no token is provided', async () => {
      mockRequest.headers = {}

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'No token provided'
      )
    })

    it('should reject when token is invalid', async () => {
      vi.mocked(jwtUtils.verifyToken).mockImplementation(() => {
        throw new Error('Invalid token')
      })

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'Invalid or expired token'
      )
    })

    it('should authenticate valid token without scopes', async () => {
      const payload = { userId: 1, username: 'testuser', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])

      const result = await expressAuthentication(mockRequest as Request, 'jwt')

      expect(result).toEqual(payload)
    })

    it('should reject when tokenVersion does not match', async () => {
      const payload = { userId: 1, username: 'testuser', roles: ['member'], tokenVersion: 0 }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      // User's tokenVersion was bumped (password changed)
      mockUsersResult = [{ tokenVersion: 1, isLocked: false }]

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'Token has been invalidated'
      )
    })

    it('should reject when user not found in database', async () => {
      const payload = { userId: 999, username: 'ghost', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      mockUsersResult = []

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'Token has been invalidated'
      )
    })

    it('should pass when user has required permission', async () => {
      const payload = { userId: 1, username: 'admin', roles: ['admin'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['admin'])
      // Mock: admin role has 'prices.manage' permission
      mockPermissionsWhere.mockResolvedValue([{ permissionId: 'prices.manage', allowed: true }])

      const result = await expressAuthentication(mockRequest as Request, 'jwt', ['prices.manage'])

      expect(result).toEqual(payload)
    })

    it('should pass when user has all required permissions', async () => {
      const payload = { userId: 1, username: 'admin', roles: ['admin'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['admin'])
      // Mock: admin role has both permissions
      mockPermissionsWhere.mockResolvedValue([
        { permissionId: 'prices.manage', allowed: true },
        { permissionId: 'prices.view', allowed: true },
      ])

      const result = await expressAuthentication(mockRequest as Request, 'jwt', [
        'prices.manage',
        'prices.view',
      ])

      expect(result).toEqual(payload)
    })

    it('should reject when user lacks required permission', async () => {
      const payload = { userId: 1, username: 'user', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      // Mock: member role doesn't have 'admin.manage_users' permission
      mockPermissionsWhere.mockResolvedValue([])

      await expect(
        expressAuthentication(mockRequest as Request, 'jwt', ['admin.manage_users'])
      ).rejects.toThrow('Insufficient permissions')
    })

    it('should reject when user has only some required permissions', async () => {
      const payload = { userId: 1, username: 'user', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      // Mock: member role only has prices.view, not prices.manage
      mockPermissionsWhere.mockResolvedValue([{ permissionId: 'prices.view', allowed: true }])

      await expect(
        expressAuthentication(mockRequest as Request, 'jwt', ['prices.view', 'prices.manage'])
      ).rejects.toThrow('Insufficient permissions')
    })

    it('should use current roles from cache/db for permission check when roles changed', async () => {
      const tokenPayload = { userId: 1, username: 'user', roles: ['member'], tokenVersion: 0 }
      const currentRoles = ['member', 'admin']

      vi.mocked(jwtUtils.verifyToken).mockReturnValue(tokenPayload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(currentRoles)
      vi.mocked(jwtUtils.generateToken).mockReturnValue('new-token')
      // Mock: admin role has 'admin.manage_users' permission
      mockPermissionsWhere.mockResolvedValue([
        { permissionId: 'admin.manage_users', allowed: true },
      ])

      // Should pass because current roles (not token roles) include admin which has the permission
      const result = await expressAuthentication(mockRequest as Request, 'jwt', [
        'admin.manage_users',
      ])

      expect(result).toEqual({
        userId: 1,
        username: 'user',
        roles: currentRoles,
        tokenVersion: 0,
      })
      expect(requestContext.setContextValue).toHaveBeenCalledWith('refreshedToken', 'new-token')
    })

    it('should fetch tokenVersion and roles in one query on cache miss', async () => {
      const payload = { userId: 1, username: 'testuser', roles: ['member'], tokenVersion: 0 }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      // Cache miss
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(undefined)
      mockJoinResult = [{ tokenVersion: 0, isLocked: false, roleId: 'member' }]

      const result = await expressAuthentication(mockRequest as Request, 'jwt')

      expect(result).toEqual(payload)
      expect(roleCache.setCachedRoles).toHaveBeenCalledWith(1, ['member'])
    })

    it('should reject when the account is locked', async () => {
      const payload = { userId: 1, username: 'testuser', roles: ['member'], tokenVersion: 0 }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      // Account locked after the token was issued
      mockUsersResult = [{ tokenVersion: 0, isLocked: true }]

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'Account is locked'
      )
    })

    it('should reject a locked account on the cache-miss path too', async () => {
      const payload = { userId: 1, username: 'testuser', roles: ['member'], tokenVersion: 0 }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(undefined)
      mockJoinResult = [{ tokenVersion: 0, isLocked: true, roleId: 'member' }]

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'Account is locked'
      )
    })

    it('should deny a permission that is explicitly denied on another role', async () => {
      const payload = { userId: 1, username: 'user', roles: ['member', 'restricted'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member', 'restricted'])
      // One role grants it, another explicitly denies it — deny must win, matching
      // the shared permission service.
      mockPermissionsWhere.mockResolvedValue([
        { permissionId: 'prices.manage', allowed: true },
        { permissionId: 'prices.manage', allowed: false },
      ])

      await expect(
        expressAuthentication(mockRequest as Request, 'jwt', ['prices.manage'])
      ).rejects.toThrow('Insufficient permissions')
    })

    it('should reject when the only matching permission row is a denial', async () => {
      const payload = { userId: 1, username: 'user', roles: ['member'] }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      mockPermissionsWhere.mockResolvedValue([{ permissionId: 'prices.manage', allowed: false }])

      await expect(
        expressAuthentication(mockRequest as Request, 'jwt', ['prices.manage'])
      ).rejects.toThrow('Insufficient permissions')
    })

    it('re-issues the token when it is close to expiry (sliding session)', async () => {
      const payload = { userId: 1, username: 'testuser', roles: ['member'], tokenVersion: 0 }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      vi.mocked(jwtUtils.shouldRefreshToken).mockReturnValue(true)
      vi.mocked(jwtUtils.generateToken).mockReturnValue('sliding-token')

      await expressAuthentication(mockRequest as Request, 'jwt')

      expect(requestContext.setContextValue).toHaveBeenCalledWith('refreshedToken', 'sliding-token')
    })

    it('does not re-issue a token that is still fresh', async () => {
      const payload = { userId: 1, username: 'testuser', roles: ['member'], tokenVersion: 0 }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockReturnValue(['member'])
      vi.mocked(jwtUtils.shouldRefreshToken).mockReturnValue(false)

      await expressAuthentication(mockRequest as Request, 'jwt')

      expect(requestContext.setContextValue).not.toHaveBeenCalled()
      expect(jwtUtils.generateToken).not.toHaveBeenCalled()
    })

    it('surfaces a database error instead of masking it as a 401', async () => {
      // A blanket 401 here would log every active user out during a transient
      // DB blip, because the client tears the session down on 401.
      const payload = { userId: 1, username: 'testuser', roles: ['member'], tokenVersion: 0 }
      vi.mocked(jwtUtils.verifyToken).mockReturnValue(payload)
      vi.mocked(roleCache.getCachedRoles).mockImplementation(() => {
        throw new Error('connection terminated unexpectedly')
      })

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'connection terminated unexpectedly'
      )
    })

    it('still rejects a malformed token as 401', async () => {
      vi.mocked(jwtUtils.verifyToken).mockImplementation(() => {
        throw new Error('Invalid or expired token')
      })

      await expect(expressAuthentication(mockRequest as Request, 'jwt')).rejects.toThrow(
        'Invalid or expired token'
      )
    })
  })

  describe('unknown security type', () => {
    it('should reject unknown security types', async () => {
      await expect(expressAuthentication(mockRequest as Request, 'unknown')).rejects.toThrow(
        'Unknown security type'
      )
    })
  })
})
