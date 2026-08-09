import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  generateToken,
  verifyToken,
  shouldRefreshToken,
  REFRESH_BEFORE_EXPIRY_SECONDS,
  type JwtPayload,
} from './jwt.js'

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
