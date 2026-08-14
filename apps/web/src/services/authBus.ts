/**
 * Centralized auth failure bus.
 *
 * Instead of 60+ inline 401 handlers that each tear down credentials and
 * redirect, the API layer emits a single event here. App.vue subscribes once and
 * handles logout + navigation.
 *
 * ## Why this no longer carries a token
 *
 * It used to pass the rejected token so the subscriber could compare it against
 * storage and ignore a 401 for a credential that had since been replaced —
 * necessary when each tab held its own copy in `localStorage` and they could
 * disagree. With the session in a shared httpOnly cookie there is exactly one
 * credential per browser, so a 401 is unambiguous: the session really is dead.
 *
 * Critically, the handler is also no longer destructive to *other* tabs. It can
 * only clear this tab's cached UI state; revoking the session requires a
 * deliberate server call. A stale tab 401ing can no longer log everyone out.
 */

const AUTH_FAILURE_EVENT = 'kawa:auth-failure'

/**
 * Emitted when the server reports that the session's roles drifted
 * (`X-Roles-Changed`). The SPA can no longer decode the JWT to notice this
 * itself, so the server has to say so and the app refetches the profile.
 *
 * Named here rather than inlined as a string literal at each end: the dispatch
 * and the listener live in different files, so a typo in either would silently
 * stop role changes from propagating.
 */
export const ROLES_CHANGED_EVENT = 'kawa:roles-changed'

/** Called by the API layer when a 401 is received. */
export function handleAuthFailure(): void {
  window.dispatchEvent(new CustomEvent(AUTH_FAILURE_EVENT))
}

/**
 * Subscribe to auth failure events. Returns an unsubscribe function.
 */
export function onAuthFailure(callback: () => void): () => void {
  const handler = () => callback()
  window.addEventListener(AUTH_FAILURE_EVENT, handler)
  return () => window.removeEventListener(AUTH_FAILURE_EVENT, handler)
}
