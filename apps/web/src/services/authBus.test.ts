import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleAuthFailure, onAuthFailure } from './authBus'
import {
  setToken,
  clearCredentials,
  getToken,
  rolesDifferFromCachedUser,
  JWT_STORAGE_KEY,
} from './session'

/**
 * Regression tests for the session-teardown logic.
 *
 * Background: a guard of the form `if (localStorage.getItem('jwt')) return`
 * was added to the 401 subscriber to stop a Discord login race. Because it
 * checked only for *presence* of a token rather than comparing values, it made
 * the handler a no-op in the ordinary expired-token case: the stale JWT stayed
 * in storage, every request kept 401ing, and the app was wedged until a reload.
 *
 * These tests encode the intended behaviour of both cases.
 */

/** Mirror of the subscriber in App.vue, minus the Vue/router wiring. */
function subscribeWithGuard(onTeardown: () => void): () => void {
  return onAuthFailure(({ token }) => {
    if (token !== null && getToken() !== token) return
    onTeardown()
  })
}

describe('authBus', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('delivers the failing token to subscribers', () => {
    const seen: Array<string | null> = []
    const unsub = onAuthFailure(({ token }) => seen.push(token))

    handleAuthFailure('token-abc')

    expect(seen).toEqual(['token-abc'])
    unsub()
  })

  it('tears down the session when the rejected token is still the current one', () => {
    setToken('expired-token')
    const teardown = vi.fn()
    const unsub = subscribeWithGuard(teardown)

    handleAuthFailure('expired-token')

    expect(teardown).toHaveBeenCalledOnce()
    unsub()
  })

  it('ignores a stale 401 for a token that has already been replaced', () => {
    // Simulates a Discord callback in another tab swapping in a new token
    // while an older request was still in flight.
    setToken('fresh-token')
    const teardown = vi.fn()
    const unsub = subscribeWithGuard(teardown)

    handleAuthFailure('old-token')

    expect(teardown).not.toHaveBeenCalled()
    expect(getToken()).toBe('fresh-token')
    unsub()
  })

  it('tears down when a request without a token is rejected', () => {
    const teardown = vi.fn()
    const unsub = subscribeWithGuard(teardown)

    handleAuthFailure(null)

    expect(teardown).toHaveBeenCalledOnce()
    unsub()
  })

  it('unsubscribes cleanly', () => {
    const teardown = vi.fn()
    const unsub = subscribeWithGuard(teardown)
    unsub()

    handleAuthFailure(null)

    expect(teardown).not.toHaveBeenCalled()
  })
})

describe('session', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears the JWT and the cached user together', () => {
    setToken('t')
    localStorage.setItem('user', JSON.stringify({ username: 'MartianEngineer' }))

    clearCredentials()

    expect(localStorage.getItem(JWT_STORAGE_KEY)).toBeNull()
    // Leaving `user` behind would keep the router's role guards passing for a
    // session that no longer exists.
    expect(localStorage.getItem('user')).toBeNull()
  })
})

describe('rolesDifferFromCachedUser', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const tokenWithRoles = (roles: unknown) => {
    const payload = btoa(JSON.stringify({ userId: 1, roles }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    return `header.${payload}.signature`
  }

  const cacheUser = (roles: { id: string }[]) =>
    localStorage.setItem('user', JSON.stringify({ username: 'x', roles }))

  it('is false when the token roles match the cached user', () => {
    // The common case for a sliding refresh: nothing changed, so the app must
    // NOT refetch the profile — each refetch can itself return a refreshed
    // token and re-trigger the handler.
    cacheUser([{ id: 'member' }, { id: 'lead' }])
    expect(rolesDifferFromCachedUser(tokenWithRoles(['lead', 'member']))).toBe(false)
  })

  it('is true when a role was added', () => {
    cacheUser([{ id: 'member' }])
    expect(rolesDifferFromCachedUser(tokenWithRoles(['member', 'lead']))).toBe(true)
  })

  it('is true when a role was removed', () => {
    cacheUser([{ id: 'member' }, { id: 'lead' }])
    expect(rolesDifferFromCachedUser(tokenWithRoles(['member']))).toBe(true)
  })

  it('errs towards refetching when there is no cached user', () => {
    expect(rolesDifferFromCachedUser(tokenWithRoles(['member']))).toBe(true)
  })

  it('errs towards refetching when the token is unreadable', () => {
    cacheUser([{ id: 'member' }])
    expect(rolesDifferFromCachedUser('not-a-jwt')).toBe(true)
  })
})
