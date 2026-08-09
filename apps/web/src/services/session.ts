/**
 * Single source of truth for credential storage.
 *
 * The JWT and the cached user blob were previously read/written directly via
 * `localStorage` in a dozen places, which made it easy to clear one and leave
 * the other behind (producing a "logged out" UI that still passes the router's
 * role guards, or vice versa). Everything should go through here.
 */

export const JWT_STORAGE_KEY = 'jwt'
export const USER_STORAGE_KEY = 'user'

export function getToken(): string | null {
  return localStorage.getItem(JWT_STORAGE_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(JWT_STORAGE_KEY, token)
}

/**
 * Remove both the JWT and the cached user blob. Always clear them together —
 * the router guards read `user` while the API layer reads `jwt`.
 */
export function clearCredentials(): void {
  localStorage.removeItem(JWT_STORAGE_KEY)
  localStorage.removeItem(USER_STORAGE_KEY)
}

/**
 * Read the `roles` claim out of a JWT without verifying it.
 *
 * Safe for UI decisions only — the signature is not checked, and every
 * privileged action is authorised server-side. Returns null if the token isn't
 * a readable JWT.
 */
export function rolesFromToken(token: string): string[] | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    // base64url -> base64, then decode.
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims = JSON.parse(json) as { roles?: unknown }
    if (!Array.isArray(claims.roles)) return null
    return claims.roles.filter((r): r is string => typeof r === 'string')
  } catch {
    return null
  }
}

/**
 * True when the roles in `token` differ from those on the cached user blob.
 *
 * Used to decide whether a refreshed token warrants re-fetching the profile.
 * Errs on the side of "yes" when either side is unreadable.
 */
export function rolesDifferFromCachedUser(token: string): boolean {
  const tokenRoles = rolesFromToken(token)
  if (!tokenRoles) return true

  const stored = localStorage.getItem(USER_STORAGE_KEY)
  if (!stored) return true

  try {
    const user = JSON.parse(stored) as { roles?: { id?: string }[] }
    if (!Array.isArray(user.roles)) return true
    const userRoles = user.roles
      .map(r => r?.id)
      .filter((id): id is string => typeof id === 'string')
    if (userRoles.length !== tokenRoles.length) return true
    const a = [...userRoles].sort()
    const b = [...tokenRoles].sort()
    return !a.every((id, i) => id === b[i])
  } catch {
    return true
  }
}
