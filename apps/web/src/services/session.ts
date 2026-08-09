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
