import jwt from 'jsonwebtoken'

const JWT_EXPIRES_IN = '7d' // 7 days

/** Lazy-read JWT_SECRET from env to avoid IIFE timing issues with secret injection on some platforms */
function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return 'fallback-secret-for-development-only'
  }
  throw new Error('JWT_SECRET environment variable is required in production')
}

export interface JwtPayload {
  userId: number
  username: string
  roles: string[]
  /** Bumped on password change to invalidate all existing tokens. Defaults to 0 for legacy tokens. */
  tokenVersion?: number
}

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN })
}

export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload
  } catch {
    throw new Error('Invalid or expired token')
  }
}
