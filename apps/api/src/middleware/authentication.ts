import { Request } from 'express'
import { eq, and, inArray } from 'drizzle-orm'
import { verifyToken, generateToken, shouldRefreshToken, type JwtPayload } from '../utils/jwt.js'
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
): Promise<{ tokenVersion: number; roles: string[]; isLocked: boolean } | null> {
  // Check role cache first — if hit, we still need tokenVersion from DB
  const cachedRoles = getCachedRoles(userId)
  if (cachedRoles) {
    const [user] = await db
      .select({ tokenVersion: users.tokenVersion, isLocked: users.isLocked })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user) return null
    return { tokenVersion: user.tokenVersion, roles: cachedRoles, isLocked: user.isLocked }
  }

  // Cache miss: fetch tokenVersion and roles in one query via left join
  const rows = await db
    .select({
      tokenVersion: users.tokenVersion,
      isLocked: users.isLocked,
      roleId: userRoles.roleId,
    })
    .from(users)
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .where(eq(users.id, userId))

  if (rows.length === 0) return null

  const tokenVersion = rows[0].tokenVersion
  const isLocked = rows[0].isLocked
  const roles = rows.filter(r => r.roleId !== null).map(r => r.roleId!)

  // Cache roles for future requests
  setCachedRoles(userId, roles)

  return { tokenVersion, roles, isLocked }
}

/**
 * Check if any of the user's roles have the required permissions.
 *
 * Resolution is **deny-wins**: an explicit `allowed = false` row on any of the
 * user's roles revokes the permission even if another role grants it. This
 * matches the shared permission service; previously this function filtered to
 * `allowed = true` only and would grant where the service denied.
 */
async function hasPermissions(roles: string[], requiredPermissions: string[]): Promise<boolean> {
  if (requiredPermissions.length === 0) return true
  if (roles.length === 0) return false

  // Query the role_permissions table for the required permissions and user's
  // roles — including denials, so they can override grants.
  const rows = await db
    .select({
      permissionId: rolePermissions.permissionId,
      allowed: rolePermissions.allowed,
    })
    .from(rolePermissions)
    .where(
      and(
        inArray(rolePermissions.roleId, roles),
        inArray(rolePermissions.permissionId, requiredPermissions)
      )
    )

  const granted = new Set<string>()
  const denied = new Set<string>()
  for (const row of rows) {
    if (row.allowed) granted.add(row.permissionId)
    else denied.add(row.permissionId)
  }

  // Every required permission must be granted and not explicitly denied
  return requiredPermissions.every(p => granted.has(p) && !denied.has(p))
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

    // Verify the signature/expiry in its own try block: only failures *here*
    // mean "bad token". Everything after this point is application logic whose
    // errors must not be laundered into a 401 (see the note further down).
    let decoded: JwtPayload
    try {
      decoded = verifyToken(token)
    } catch {
      return Promise.reject(Unauthorized('Invalid or expired token'))
    }

    // Fetch tokenVersion + roles in a single DB round-trip (or cache hit + 1 query)
    const authInfo = await getUserAuthInfo(decoded.userId)

    if (!authInfo || authInfo.tokenVersion !== (decoded.tokenVersion ?? 0)) {
      return Promise.reject(Unauthorized('Token has been invalidated. Please log in again.'))
    }

    // Enforce account locking on every request, not just at login.
    // Otherwise locking a user leaves their existing token usable for the
    // remainder of its lifetime.
    //
    // Deliberately 401 rather than the 403 that POST /auth/login returns for
    // the same condition: 401 is what drives the client to tear the session
    // down and redirect to /login, where the subsequent login attempt surfaces
    // the proper "account locked" message. A 403 here would leave the user
    // sitting on a broken page with a dead token.
    if (authInfo.isLocked) {
      return Promise.reject(Unauthorized('Account is locked. Please contact an administrator.'))
    }

    // Determine the payload to use (with current roles if they changed)
    let payload: JwtPayload = decoded

    const rolesChanged = !rolesMatch(decoded.roles, authInfo.roles)

    if (rolesChanged) {
      payload = {
        userId: decoded.userId,
        username: decoded.username,
        roles: authInfo.roles,
        tokenVersion: authInfo.tokenVersion,
      }
    }

    // Re-issue the token when roles drifted, or when it is approaching expiry.
    // The latter gives a sliding session: tokens are short-lived (24h) to
    // limit the damage of a leaked token, but anyone using the site at least
    // once a day is never forced to log back in.
    if (rolesChanged || shouldRefreshToken(decoded)) {
      setContextValue('refreshedToken', generateToken(payload))
    }

    // Check scopes (required permissions) if specified
    if (scopes && scopes.length > 0) {
      const hasRequiredPermissions = await hasPermissions(payload.roles, scopes)
      if (!hasRequiredPermissions) {
        return Promise.reject(Forbidden('Insufficient permissions'))
      }
    }

    // NOTE: no try/catch around the block above. Errors here are application
    // failures (DB reads, permission lookups), not auth failures — wrapping them
    // in a 401 would force-log-out every user hitting the API during a transient
    // database blip, because the client tears the session down on 401. Let them
    // propagate to the global error handler as the 5xx they really are.
    return Promise.resolve(payload)
  }

  return Promise.reject(Unauthorized('Unknown security type'))
}
