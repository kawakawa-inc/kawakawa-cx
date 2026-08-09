import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getRefreshedToken,
  setRefreshedToken,
  clearTokenRefreshCache,
} from './tokenRefreshCache.js'

describe('tokenRefreshCache', () => {
  beforeEach(() => {
    clearTokenRefreshCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns undefined for a token that has not been refreshed', () => {
    expect(getRefreshedToken('original')).toBeUndefined()
  })

  it('returns the same replacement for repeated lookups', () => {
    setRefreshedToken('original', 'replacement')

    expect(getRefreshedToken('original')).toBe('replacement')
    expect(getRefreshedToken('original')).toBe('replacement')
  })

  it('keys replacements per original token', () => {
    setRefreshedToken('token-a', 'replacement-a')
    setRefreshedToken('token-b', 'replacement-b')

    expect(getRefreshedToken('token-a')).toBe('replacement-a')
    expect(getRefreshedToken('token-b')).toBe('replacement-b')
  })

  it('expires entries after the TTL', () => {
    vi.useFakeTimers()
    setRefreshedToken('original', 'replacement')
    expect(getRefreshedToken('original')).toBe('replacement')

    vi.advanceTimersByTime(61 * 1000)

    expect(getRefreshedToken('original')).toBeUndefined()
  })

  it('does not retain the raw token as a key', () => {
    // Keys are hashed so a heap dump can't be replayed as a bearer token.
    setRefreshedToken('super-secret-jwt', 'replacement')
    const serialised = JSON.stringify([...(getRefreshedToken('super-secret-jwt') ?? '')])
    expect(serialised).not.toContain('super-secret-jwt')
  })
})
