import jwt from 'jsonwebtoken'

/**
 * Token lifetime. Deliberately short: the JWT is held in localStorage, so it is
 * readable by any script running on the origin. A shorter window limits how long
 * a leaked token stays usable, since there is no server-side revocation list
 * (only the blunt `users.tokenVersion` bump, which logs out every device).
 *
 * Active users are not logged out every 24h — `expressAuthentication` re-issues
 * a token once it passes the halfway mark (see REFRESH_BEFORE_EXPIRY_SECONDS),
 * giving a sliding session that only lapses after a real period of inactivity.
 */
const JWT_EXPIRES_IN_SECONDS = 24 * 60 * 60 // 24 hours

/**
 * Re-issue a token when its remaining life drops below this. At 12h with a 24h
 * lifetime, any user who visits at least once a day stays signed in.
 */
export const REFRESH_BEFORE_EXPIRY_SECONDS = 12 * 60 * 60 // 12 hours

// Eagerly resolve and cache the JWT secret once at module load.
// This eliminates the race condition from lazy env reads on every call.
const JWT_SECRET: string = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return 'fallback-secret-for-development-only'
  }
  throw new Error('JWT_SECRET environment variable is required in production')
})()

export interface JwtPayload {
  userId: number
  username: string
  roles: string[]
  /** Bumped on password change to invalidate all existing tokens. Defaults to 0 for legacy tokens. */
  tokenVersion?: number
  /** Issued-at, seconds since epoch. Set by jsonwebtoken on sign. */
  iat?: number
  /** Expiry, seconds since epoch. Set by jsonwebtoken on sign. */
  exp?: number
}

export const generateToken = (payload: JwtPayload): string => {
  // Strip any iat/exp carried over from a decoded token — jsonwebtoken rejects
  // signing a payload that already contains them alongside `expiresIn`.
  const { iat: _iat, exp: _exp, ...claims } = payload
  return jwt.sign(claims, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN_SECONDS })
}

/**
 * True when the token is close enough to expiry that it should be swapped for a
 * fresh one. Returns false for tokens with no `exp` (shouldn't happen, but a
 * missing claim must not trigger a refresh storm).
 */
export const shouldRefreshToken = (
  payload: JwtPayload,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean => {
  if (typeof payload.exp !== 'number') return false
  return payload.exp - nowSeconds < REFRESH_BEFORE_EXPIRY_SECONDS
}

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    throw new Error('Invalid or expired token')
  }
}
