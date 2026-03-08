import jwt from 'jsonwebtoken'

const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return 'fallback-secret-for-development-only'
  }
  throw new Error('JWT_SECRET environment variable is required in production')
})()
const JWT_EXPIRES_IN = '7d' // 7 days

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

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    return jwt.decode(token) as JwtPayload
  } catch {
    return null
  }
}
