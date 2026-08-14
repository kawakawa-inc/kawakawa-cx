/**
 * Single source of truth for client-side session state.
 *
 * ## The JWT is no longer here
 *
 * The session JWT lives in an `httpOnly` cookie set by the API and is not
 * readable from JS. That is deliberate: while the token lived in
 * `localStorage`, keeping multiple tabs in agreement about the current
 * credential was application code's problem, and a tab running an older bundle
 * could not participate. A stale tab kept presenting a long-expired token, got
 * a 401 from its background poll, cleared `localStorage`, and destroyed the
 * session a *different* tab had just created — a login loop no amount of
 * client-side coordination could fix, because the fix has to already be loaded
 * to run.
 *
 * The browser's cookie jar is shared across tabs and updated by `Set-Cookie`
 * regardless of what JS is running, so credential propagation is now free and
 * works even in bundles that predate this change.
 *
 * What remains here is *non-sensitive* UI state: the cached user blob (for
 * rendering and router guards) and a readable presence flag. Neither is a
 * credential, and neither is trusted by the API.
 */

export const USER_STORAGE_KEY = 'user'

/**
 * Readable companion to the httpOnly session cookie, set by the API alongside
 * it. Router guards need a synchronous "is there a session?" answer before any
 * request completes, which the httpOnly cookie cannot provide.
 *
 * This is a hint for choosing which screen to render first — never an
 * authorisation decision. Forging it grants nothing: every protected endpoint
 * validates the real session cookie server-side.
 */
export const AUTH_PRESENT_COOKIE = 'kawa_session_present'

/**
 * Tab-local record that this tab's session was rejected.
 *
 * Module scope means per-tab by construction — which is the whole point. The
 * presence cookie is shared by every tab on the origin, so clearing it on a 401
 * (as an earlier version did) let a stale tab bounce *other* tabs to /login even
 * though their session was perfectly valid: the same cross-tab teardown this
 * migration exists to eliminate, in a milder form.
 *
 * Deliberately not persisted to `sessionStorage`. On reload `validateSession()`
 * re-checks with the server, so persistence buys nothing and risks a stale flag
 * outliving a genuine re-login.
 */
let sessionKnownDead = false

/**
 * True when this tab believes it has a live session.
 *
 * Two parts: the shared presence cookie (did the server ever issue a session?)
 * and this tab's own knowledge that its requests are being rejected. Only the
 * server writes the cookie; only this tab writes the flag.
 */
export function hasSession(): boolean {
  if (sessionKnownDead) return false
  return presenceCookiePresent()
}

/**
 * Raw read of the shared presence cookie, ignoring this tab's dead-session flag.
 *
 * Needed so a tab that has given up can still notice a session established in
 * another tab: `hasSession()` would keep answering false and leave it wedged
 * until reload. Prefer `hasSession()` everywhere else.
 *
 * A present-but-empty value (`kawa_session_present=`) counts as absent. Today
 * the server expires the cookie rather than blanking it, so that form is
 * unreachable — but if it ever appears, treating it as a live session sends the
 * router guards to a protected screen that immediately 401s, which is a
 * miserable thing to debug for the sake of one extra condition.
 */
export function presenceCookiePresent(): boolean {
  const prefix = `${AUTH_PRESENT_COOKIE}=`
  return document.cookie
    .split(';')
    .some(part => part.trim().startsWith(prefix) && part.trim().length > prefix.length)
}

/**
 * Record that this tab's session is dead, without touching shared state.
 *
 * Replaces the old `clearSessionHint()`. Guards in this tab stop treating it as
 * signed in; every other tab is unaffected.
 */
export function markSessionDead(): void {
  sessionKnownDead = true
}

/**
 * Clear the dead-session flag after establishing a new one.
 *
 * Required because the flag is not tied to the cookie's lifetime: without this a
 * tab that 401'd would keep reporting "no session" after a successful login in
 * the same tab.
 */
export function markSessionLive(): void {
  sessionKnownDead = false
}

/**
 * Clear client-side session state.
 *
 * This cannot remove the httpOnly session cookie — only the server can, via
 * `POST /auth/logout`. That asymmetry is the point: stale JS can no longer
 * revoke a session out from under other tabs.
 */
export function clearCachedUser(): void {
  localStorage.removeItem(USER_STORAGE_KEY)
}

/** Roles from the cached user blob, for UI decisions only. */
export function cachedUserRoles(): string[] {
  const stored = localStorage.getItem(USER_STORAGE_KEY)
  if (!stored) return []
  try {
    const user = JSON.parse(stored) as { roles?: { id?: string }[] }
    if (!Array.isArray(user.roles)) return []
    return user.roles.map(r => r?.id).filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}
