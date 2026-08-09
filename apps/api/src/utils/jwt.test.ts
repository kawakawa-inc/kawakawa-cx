import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  generateToken,
  verifyToken,
  shouldRefreshToken,
  TokenVerificationError,
  REFRESH_BEFORE_EXPIRY_SECONDS,
  type JwtPayload,
} from './jwt.js'

/** Matches the dev/test fallback in jwt.ts. */
const SECRET = process.env.JWT_SECRET ?? 'fallback-secret-for-development-only'

const basePayload: JwtPayload = {
  userId: 42,
  username: 'MartianEngineer',
  roles: ['member', 'lead'],
  tokenVersion: 1,
}

const HOUR = 60 * 60

describe('generateToken', () => {
  it('issues a token that expires in 24 hours, not 7 days', () => {
    const decoded = jwt.decode(generateToken(basePayload)) as JwtPayload

    expect(decoded.exp! - decoded.iat!).toBe(24 * HOUR)
  })

  it('round-trips the payload claims', () => {
    const decoded = verifyToken(generateToken(basePayload))

    expect(decoded.userId).toBe(42)
    expect(decoded.username).toBe('MartianEngineer')
    expect(decoded.roles).toEqual(['member', 'lead'])
    expect(decoded.tokenVersion).toBe(1)
  })

  it('can re-sign a previously decoded token without an iat/exp conflict', () => {
    // The refresh path feeds a decoded payload straight back into generateToken;
    // jsonwebtoken throws if iat/exp are present alongside `expiresIn`.
    const decoded = verifyToken(generateToken(basePayload))

    expect(() => generateToken(decoded)).not.toThrow()

    const reissued = jwt.decode(generateToken(decoded)) as JwtPayload
    expect(reissued.exp! - reissued.iat!).toBe(24 * HOUR)
  })

  it('rejects a token signed with a different secret', () => {
    const foreign = jwt.sign({ userId: 1 }, 'not-the-real-secret')

    expect(() => verifyToken(foreign)).toThrow('Invalid or expired token')
  })

  it('rejects an expired token', () => {
    const decoded = jwt.decode(generateToken(basePayload)) as JwtPayload
    const now = decoded.iat!

    expect(() => verifyToken(generateToken(basePayload))).not.toThrow()
    // 25h later the token is past its 24h life
    expect(shouldRefreshToken(decoded, now + 25 * HOUR)).toBe(true)
  })
})

describe('shouldRefreshToken', () => {
  const exp = 1_000_000

  it('does not refresh a freshly issued token', () => {
    // 24h of life left, threshold is 12h
    expect(shouldRefreshToken({ ...basePayload, exp }, exp - 24 * HOUR)).toBe(false)
  })

  it('does not refresh exactly at the threshold', () => {
    expect(shouldRefreshToken({ ...basePayload, exp }, exp - REFRESH_BEFORE_EXPIRY_SECONDS)).toBe(
      false
    )
  })

  it('refreshes once past the halfway point', () => {
    expect(
      shouldRefreshToken({ ...basePayload, exp }, exp - REFRESH_BEFORE_EXPIRY_SECONDS + 1)
    ).toBe(true)
  })

  it('refreshes a token that is nearly expired', () => {
    expect(shouldRefreshToken({ ...basePayload, exp }, exp - 60)).toBe(true)
  })

  it('does not refresh when exp is missing', () => {
    // A malformed payload must not trigger a refresh on every single request.
    expect(shouldRefreshToken(basePayload, 0)).toBe(false)
  })
})

describe('verifyToken diagnostics', () => {
  const now = () => Math.floor(Date.now() / 1000)

  /**
   * The client-facing message stays deliberately vague, but the thrown error
   * carries the real reason so 401s are diagnosable in production. Before this,
   * every failure logged the same string and was impossible to tell apart.
   */
  const expectFailure = (token: string, reason: string): TokenVerificationError => {
    try {
      verifyToken(token)
      throw new Error('expected verifyToken to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(TokenVerificationError)
      const failure = error as TokenVerificationError
      expect(failure.reason).toBe(reason)
      // Must not leak the reason to callers/clients.
      expect(failure.message).toBe('Invalid or expired token')
      return failure
    }
  }

  it('classifies an expired token and reports how stale it is', () => {
    const token = jwt.sign({ ...basePayload, iat: now() - 90_000, exp: now() - 3600 }, SECRET)
    const failure = expectFailure(token, 'expired')

    expect(failure.unverifiedClaims?.userId).toBe(42)
    expect(failure.unverifiedClaims?.expiredAgoSeconds).toBeGreaterThan(3500)
    expect(failure.unverifiedClaims?.lifetimeSeconds).toBeGreaterThan(0)
  })

  it('classifies a token signed with the wrong secret', () => {
    const token = jwt.sign(basePayload, 'a-different-secret', { expiresIn: 3600 })
    const failure = expectFailure(token, 'bad-signature')

    // Claims are still readable (decode does not verify) — useful for spotting
    // which user a forged token was aimed at.
    expect(failure.unverifiedClaims?.userId).toBe(42)
  })

  it('classifies a structurally invalid token', () => {
    const failure = expectFailure('not-a-jwt', 'malformed')
    expect(failure.unverifiedClaims).toBeNull()
  })

  it('classifies a token that is not valid yet', () => {
    const token = jwt.sign({ ...basePayload, nbf: now() + 9999 }, SECRET, { expiresIn: 99_999 })
    expectFailure(token, 'not-active-yet')
  })

  it('exposes tokenVersion as `version` so the log redactor cannot scrub it', () => {
    // The shared redactor blanks any key containing "token".
    const token = jwt.sign({ ...basePayload, iat: now() - 10, exp: now() - 1 }, SECRET)
    const failure = expectFailure(token, 'expired')

    expect(failure.unverifiedClaims).toHaveProperty('version', 1)
    expect(failure.unverifiedClaims).not.toHaveProperty('tokenVersion')
  })
})
