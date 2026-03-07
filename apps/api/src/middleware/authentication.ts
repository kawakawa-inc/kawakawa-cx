import { Request } from 'express'
import { eq, and, inArray } from 'drizzle-orm'
import { verifyToken, generateToken, JwtPayload } from '../utils/jwt.js'
import { getCachedRoles, setCachedRoles } from '../utils/roleCache.js'
import { db, users, userRoles, rolePermissions } from '../db/index.js'
import { setContextValue } from '../utils/requestContext.js'
import { Unauthorized, Forbidden } from '../utils/errors.js'

/**
 * Check if two role arrays have the same elements (order independent)
 */
function rolesMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((role, i) => role === sortedB[i])
}

/**
 * Fetch user's tokenVersion and current roles in a single query.
 * Returns null if user not found.
 */
async function getUserAuthInfo(
  userId: number
): Promise<{ tokenVersion: number; roles: string[] } | null> {
  // Check role cache first — if hit, we still need tokenVersion from DB
  const cachedRoles = getCachedRoles(userId)
  if (cachedRoles) {
    const [user] = await db
      .select({ tokenVersion: users.tokenVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user) return null
    return { tokenVersion: user.tokenVersion, roles: cachedRoles }
  }

  // Cache miss: fetch tokenVersion and roles in one query via left join
  const rows = await db
    .select({
      tokenVersion: users.tokenVersion,
      roleId: userRoles.roleId,
    })
    .from(users)
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .where(eq(users.id, userId))

  if (rows.length === 0) return null

  const tokenVersion = rows[0].tokenVersion
  const roles = rows.filter(r => r.roleId !== null).map(r => r.roleId!)

  // Cache roles for future requests
  setCachedRoles(userId, roles)

  return { tokenVersion, roles }
}

/**
 * Check if any of the user's roles have the required permissions
 * Returns true if the user has all required permissions granted (allowed=true)
 */
async function hasPermissions(roles: string[], requiredPermissions: string[]): Promise<boolean> {
  if (requiredPermissions.length === 0) return true
  if (roles.length === 0) return false

  // Query the role_permissions table for the required permissions and user's roles
  const grantedPermissions = await db
    .select({ permissionId: rolePermissions.permissionId })
    .from(rolePermissions)
    .where(
      and(
        inArray(rolePermissions.roleId, roles),
        inArray(rolePermissions.permissionId, requiredPermissions),
        eq(rolePermissions.allowed, true)
      )
    )

  // Create a set of granted permissions
  const grantedSet = new Set(grantedPermissions.map(p => p.permissionId))

  // Check if all required permissions are granted
  return requiredPermissions.every(p => grantedSet.has(p))
}

export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes?: string[]
): Promise<unknown> {
  if (securityName === 'jwt') {
    const token = request.headers.authorization?.split(' ')[1]

    if (!token) {
      return Promise.reject(Unauthorized('No token provided'))
    }

    try {
      const decoded = verifyToken(token)

      // Fetch tokenVersion + roles in a single DB round-trip (or cache hit + 1 query)
      const authInfo = await getUserAuthInfo(decoded.userId)

      if (!authInfo || authInfo.tokenVersion !== (decoded.tokenVersion ?? 0)) {
        return Promise.reject(Unauthorized('Token has been invalidated. Please log in again.'))
      }

      // Determine the payload to use (with current roles if they changed)
      let payload: JwtPayload = decoded

      // Check if roles have changed
      if (!rolesMatch(decoded.roles, authInfo.roles)) {
        // Generate refreshed token with current roles
        payload = {
          userId: decoded.userId,
          username: decoded.username,
          roles: authInfo.roles,
          tokenVersion: authInfo.tokenVersion,
        }
        setContextValue('refreshedToken', generateToken(payload))
      }

      // Check scopes (required permissions) if specified
      if (scopes && scopes.length > 0) {
        const hasRequiredPermissions = await hasPermissions(payload.roles, scopes)
        if (!hasRequiredPermissions) {
          return Promise.reject(Forbidden('Insufficient permissions'))
        }
      }

      return Promise.resolve(payload)
    } catch {
      return Promise.reject(Unauthorized('Invalid or expired token'))
    }
  }

  return Promise.reject(Unauthorized('Unknown security type'))
}
