/**
 * Centralized auth failure bus.
 *
 * Instead of 60+ inline 401 handlers that each call localStorage.removeItem
 * and window.location.href = '/login', the API layer emits a single event
 * here. App.vue subscribes once and handles logout + router navigation.
 */

const AUTH_FAILURE_EVENT = 'kawa:auth-failure'

/**
 * Called by the API layer when a 401 is received.
 * Clears stored credentials and notifies listeners.
 */
export function handleAuthFailure(): void {
  localStorage.removeItem('jwt')
  localStorage.removeItem('user')
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
