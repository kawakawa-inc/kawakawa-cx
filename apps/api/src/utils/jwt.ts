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

/**
 * Why a token failed verification.
 *
 * `verifyToken` deliberately collapses every failure into one opaque message so
 * callers can't leak specifics to clients. That also made production 401s
 * undiagnosable — every one logged "Invalid or expired token" whether the token
 * was expired, forged, or malformed. This type carries the distinction to the
 * logs without widening what the client sees.
 */
export type TokenFailureReason = 'expired' | 'bad-signature' | 'malformed' | 'not-active-yet'

/** Error thrown by `verifyToken`, annotated with diagnostics for logging only. */
export class TokenVerificationError extends Error {
  constructor(
    readonly reason: TokenFailureReason,
    /** Claims decoded WITHOUT verifying the signature — untrusted, logs only. */
    readonly unverifiedClaims: UnverifiedClaims | null
  ) {
    super('Invalid or expired token')
    this.name = 'TokenVerificationError'
  }
}

/**
 * Claims read from an unverified token. Never use these for authorisation —
 * the signature has not been checked. Diagnostics only.
 */
export interface UnverifiedClaims {
  userId?: number
  /**
   * Named `version` rather than `tokenVersion`: the shared log redactor scrubs
   * any key containing "token", which would blank this out.
   */
  version?: number
  issuedAt?: number
  expiresAt?: number
  /** Seconds since the token expired; negative means still in date. */
  expiredAgoSeconds?: number
  /** Total lifetime the token was minted with, in seconds. */
  lifetimeSeconds?: number
}

/**
 * Decode a token without verifying it, for logging. Returns null if the token
 * isn't even parseable.
 */
function decodeUnverified(token: string, nowSeconds: number): UnverifiedClaims | null {
  try {
    const decoded = jwt.decode(token)
    if (!decoded || typeof decoded !== 'object') return null
    const claims = decoded as JwtPayload
    return {
      userId: claims.userId,
      version: claims.tokenVersion,
      issuedAt: claims.iat,
      expiresAt: claims.exp,
      ...(typeof claims.exp === 'number' ? { expiredAgoSeconds: nowSeconds - claims.exp } : {}),
      ...(typeof claims.exp === 'number' && typeof claims.iat === 'number'
        ? { lifetimeSeconds: claims.exp - claims.iat }
        : {}),
    }
  } catch {
    return null
  }
}

function classify(error: unknown): TokenFailureReason {
  if (error instanceof jwt.TokenExpiredError) return 'expired'
  if (error instanceof jwt.NotBeforeError) return 'not-active-yet'
  if (error instanceof jwt.JsonWebTokenError) {
    // jsonwebtoken uses JsonWebTokenError for both signature and structural
    // problems; the message is the only way to tell them apart.
    return error.message === 'invalid signature' ? 'bad-signature' : 'malformed'
  }
  return 'malformed'
}

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch (error) {
    const nowSeconds = Math.floor(Date.now() / 1000)
    throw new TokenVerificationError(classify(error), decodeUnverified(token, nowSeconds))
  }
}
