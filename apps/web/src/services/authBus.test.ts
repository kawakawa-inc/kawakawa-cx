import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleAuthFailure, onAuthFailure } from './authBus'
import {
  hasSession,
  presenceCookiePresent,
  clearCachedUser,
  markSessionDead,
  markSessionLive,
  cachedUserRoles,
  USER_STORAGE_KEY,
  AUTH_PRESENT_COOKIE,
} from './session'

/**
 * Tests for session teardown after the move to httpOnly session cookies.
 *
 * History this locks down: the JWT used to live in `localStorage`, so each tab
 * held its own copy and they could disagree. A stale tab's 401 handler called
 * `localStorage.removeItem('jwt')` and destroyed the session a *different* tab
 * had just created — a login loop. Two prior fixes (a presence guard, then a
 * value-comparison guard) tried to make the shared mutable state safe.
 *
 * With the session in a cookie there is one credential per browser, so the
 * guards are gone. The property that matters now is that teardown is
 * **local-only**: it must never be able to revoke a session other tabs are using.
 */

function setPresenceCookie(): void {
  document.cookie = `${AUTH_PRESENT_COOKIE}=1; path=/`
}

/**
 * Reset shared state between tests.
 *
 * Clears the cookie directly rather than through a production helper — the app no
 * longer has one, deliberately: only the server writes that cookie.
 */
function resetSessionState(): void {
  document.cookie = `${AUTH_PRESENT_COOKIE}=; Max-Age=0; path=/`
  markSessionLive()
}

describe('authBus', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSessionState()
  })

  it('notifies subscribers on auth failure', () => {
    const onTeardown = vi.fn()
    const unsub = onAuthFailure(onTeardown)

    handleAuthFailure()

    expect(onTeardown).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('stops notifying after unsubscribe', () => {
    const onTeardown = vi.fn()
    const unsub = onAuthFailure(onTeardown)
    unsub()

    handleAuthFailure()

    expect(onTeardown).not.toHaveBeenCalled()
  })

  it('notifies every subscriber', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubFirst = onAuthFailure(first)
    const unsubSecond = onAuthFailure(second)

    handleAuthFailure()

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    unsubFirst()
    unsubSecond()
  })

  /**
   * The regression that caused the original outage, and the reason this file
   * exists. A stale tab receiving a 401 must not disturb any state another tab
   * depends on.
   *
   * This deliberately performs the *exact* teardown `App.vue`'s `endSession()`
   * does. An earlier version of this test called only `clearCachedUser()` and
   * omitted the shared-cookie write that production also made — so it asserted a
   * safe subset of the real behaviour and passed while the bug was live. If
   * `endSession()` gains a step, it belongs here too.
   */
  it('teardown leaves shared cross-tab state untouched', () => {
    setPresenceCookie()
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ roles: [{ id: 'member' }] }))

    const unsub = onAuthFailure(() => {
      // Mirror of App.vue endSession().
      clearCachedUser()
      markSessionDead()
    })

    handleAuthFailure()

    // This tab's cached UI state is gone, and it knows its own session is dead.
    expect(cachedUserRoles()).toEqual([])
    expect(hasSession()).toBe(false)

    // But the shared presence cookie survives, so a *different* tab still sees a
    // session and its router guards keep passing. This is the property that was
    // broken: clearing this cookie bounced every other tab to /login.
    expect(presenceCookiePresent()).toBe(true)
    unsub()
  })

  /**
   * A tab that gave up must be able to rejoin, or it stays wedged until reload —
   * the failure mode the dead-session flag could reintroduce if it were sticky.
   */
  it('recovers when a session is established elsewhere after a 401', () => {
    setPresenceCookie()
    const unsub = onAuthFailure(() => {
      clearCachedUser()
      markSessionDead()
    })
    handleAuthFailure()
    expect(hasSession()).toBe(false)

    // What App.vue's visibilitychange handler does on seeing the cookie present.
    markSessionLive()

    expect(hasSession()).toBe(true)
    unsub()
  })
})

describe('session', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSessionState()
  })

  it('reports no session when the presence cookie is absent', () => {
    expect(hasSession()).toBe(false)
  })

  it('reports a session when the presence cookie is set', () => {
    setPresenceCookie()
    expect(hasSession()).toBe(true)
  })

  it('does not confuse a similarly-prefixed cookie for the presence flag', () => {
    document.cookie = `${AUTH_PRESENT_COOKIE}_other=1; path=/`
    expect(hasSession()).toBe(false)
    document.cookie = `${AUTH_PRESENT_COOKIE}_other=; Max-Age=0; path=/`
  })

  /**
   * The server expires the cookie rather than blanking it, so this form should
   * not occur — but reading it as a live session would send router guards to a
   * protected screen that immediately 401s, and the cost of ruling it out is one
   * condition.
   */
  it('treats an empty presence cookie as no session', () => {
    document.cookie = `${AUTH_PRESENT_COOKIE}=; path=/`
    expect(hasSession()).toBe(false)
  })

  it('reads roles from the cached user blob', () => {
    localStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({ roles: [{ id: 'member' }, { id: 'lead' }] })
    )
    expect(cachedUserRoles()).toEqual(['member', 'lead'])
  })

  it('returns no roles for a malformed cached user blob', () => {
    localStorage.setItem(USER_STORAGE_KEY, 'not-json')
    expect(cachedUserRoles()).toEqual([])
  })

  it('returns no roles when nothing is cached', () => {
    expect(cachedUserRoles()).toEqual([])
  })
})
