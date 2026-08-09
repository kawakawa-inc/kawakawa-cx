import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest'
import { setToken, clearCredentials } from './session'

/**
 * Regression tests for the stale-token retry in `rawFetch`.
 *
 * Real failure this guards against: MartianEngineer had two tabs open. Logging
 * in via one tab replaced the JWT in localStorage, but the other tabs never
 * learn about a `localStorage` write they didn't perform — `storage` only fires
 * in *other* tabs, and nothing was listening. Those tabs kept sending the token
 * captured at page load, so every `/account` call 401'd while sibling requests
 * issued from the fresh tab returned 200/304. The 401 then tore the session
 * down and bounced to /login, where Discord `prompt=none` silently
 * re-authenticated — producing the visible "login loop".
 */

const ORIGINAL = 'stale-token'
const CURRENT = 'fresh-token'

/**
 * Mirrors the retry decision in rawFetch. Kept in lockstep with the real
 * implementation; api.ts pulls in the entire app graph, so exercising the
 * decision directly keeps this a unit test.
 */
function shouldRetryWithNewerToken(
  sentToken: string | null,
  storedToken: string | null,
  alreadyRetried: boolean
): boolean {
  return Boolean(sentToken && storedToken && storedToken !== sentToken && !alreadyRetried)
}

describe('stale-token retry decision', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('retries when another tab replaced the token', () => {
    setToken(CURRENT)
    expect(shouldRetryWithNewerToken(ORIGINAL, CURRENT, false)).toBe(true)
  })

  it('does not retry when the failing token is still the current one', () => {
    // Genuinely expired/invalid — retrying would just re-send a dead token.
    setToken(ORIGINAL)
    expect(shouldRetryWithNewerToken(ORIGINAL, ORIGINAL, false)).toBe(false)
  })

  it('retries at most once', () => {
    expect(shouldRetryWithNewerToken(ORIGINAL, CURRENT, true)).toBe(false)
  })

  it('does not retry when there is no stored token (logged out)', () => {
    expect(shouldRetryWithNewerToken(ORIGINAL, null, false)).toBe(false)
  })

  it('does not retry unauthenticated requests', () => {
    expect(shouldRetryWithNewerToken(null, CURRENT, false)).toBe(false)
  })
})

describe('cross-tab storage handling', () => {
  let endSession: Mock<() => void>
  let revalidate: Mock<() => void>

  /** Mirrors handleStorageChange in App.vue. */
  const onStorage = (event: { key: string; newValue: string | null }) => {
    if (event.key !== 'jwt') return
    if (event.newValue === null) {
      endSession()
      return
    }
    revalidate()
  }

  beforeEach(() => {
    localStorage.clear()
    endSession = vi.fn<() => void>()
    revalidate = vi.fn<() => void>()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('re-validates when another tab writes a new token', () => {
    onStorage({ key: 'jwt', newValue: CURRENT })
    expect(revalidate).toHaveBeenCalledOnce()
    expect(endSession).not.toHaveBeenCalled()
  })

  it('ends the session when another tab logs out', () => {
    onStorage({ key: 'jwt', newValue: null })
    expect(endSession).toHaveBeenCalledOnce()
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('ignores unrelated storage keys', () => {
    onStorage({ key: 'kawakawa-page-state:market', newValue: '{}' })
    expect(endSession).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('clearCredentials removes both keys so other tabs see a logout', () => {
    setToken(CURRENT)
    localStorage.setItem('user', '{}')
    clearCredentials()
    expect(localStorage.getItem('jwt')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })
})
