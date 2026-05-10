import jwt from 'jsonwebtoken'

const JWT_EXPIRES_IN = '7d' // 7 days

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
}

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    throw new Error('Invalid or expired token')
  }
}
