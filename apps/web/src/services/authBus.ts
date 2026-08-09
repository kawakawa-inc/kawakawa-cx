/**
 * Centralized auth failure bus.
 *
 * Instead of 60+ inline 401 handlers that each call localStorage.removeItem
 * and window.location.href = '/login', the API layer emits a single event
 * here. App.vue subscribes once and handles logout + router navigation.
 */

const AUTH_FAILURE_EVENT = 'kawa:auth-failure'

export interface AuthFailureDetail {
  /**
   * The token that was rejected. The subscriber compares this against the
   * token currently in storage so a stale 401 (e.g. an in-flight request
   * that resolves after a Discord login in another tab) cannot wipe a
   * freshly-issued session.
   */
  token: string | null
}

/**
 * Called by the API layer when a 401 is received.
 *
 * Pass the token that was actually sent on the failing request. Only
 * dispatches the event — the subscriber handles credential cleanup and
 * redirect.
 */
export function handleAuthFailure(token: string | null): void {
  window.dispatchEvent(
    new CustomEvent<AuthFailureDetail>(AUTH_FAILURE_EVENT, { detail: { token } })
  )
}

/**
 * Subscribe to auth failure events. Returns an unsubscribe function.
 */
export function onAuthFailure(callback: (detail: AuthFailureDetail) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AuthFailureDetail>).detail
    callback(detail ?? { token: null })
  }
  window.addEventListener(AUTH_FAILURE_EVENT, handler)
  return () => window.removeEventListener(AUTH_FAILURE_EVENT, handler)
}
