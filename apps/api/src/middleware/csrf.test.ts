import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { csrfProtection, warnIfCsrfMisconfigured } from './csrf.js'
import { AUTH_COOKIE_NAME } from '../utils/authCookie.js'

const logWarn = vi.hoisted(() => vi.fn())

vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({ warn: logWarn, info: vi.fn(), error: vi.fn() }),
}))

function mockRequest(init: {
  method?: string
  cookies?: Record<string, string>
  origin?: string
  referer?: string
  host?: string
  forwardedHost?: string
}): Request {
  const headers: Record<string, string> = {}
  if (init.origin) headers.origin = init.origin
  if (init.referer) headers.referer = init.referer
  if (init.host) headers.host = init.host
  if (init.forwardedHost) headers['x-forwarded-host'] = init.forwardedHost

  return {
    method: init.method ?? 'POST',
    cookies: init.cookies,
    headers,
    originalUrl: '/sell-orders',
  } as unknown as Request
}

function mockResponse(): Response & {
  status: ReturnType<typeof vi.fn>
  json: ReturnType<typeof vi.fn>
} {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  }
  res.status.mockReturnValue(res)
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
  }
}

const SESSION = { [AUTH_COOKIE_NAME]: 'jwt-value' }

describe('csrfProtection', () => {
  let next: NextFunction

  beforeEach(() => {
    next = vi.fn()
    delete process.env.ALLOWED_ORIGINS
    delete process.env.APP_ORIGIN
  })

  it('allows same-origin mutations', () => {
    const req = mockRequest({
      cookies: SESSION,
      origin: 'https://kawakawa.cx',
      host: 'kawakawa.cx',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects cross-origin mutations that ride the session cookie', () => {
    const req = mockRequest({
      cookies: SESSION,
      origin: 'https://evil.example',
      host: 'kawakawa.cx',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('rejects cookie-authenticated mutations with no Origin or Referer', () => {
    const req = mockRequest({ cookies: SESSION, host: 'kawakawa.cx' })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('falls back to Referer when Origin is absent', () => {
    const req = mockRequest({
      cookies: SESSION,
      referer: 'https://kawakawa.cx/inventory',
      host: 'kawakawa.cx',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  /**
   * The expected origin is configured, never taken from the request.
   *
   * A previous version derived it from `x-forwarded-host`, which the client
   * controls: sending `X-Forwarded-Host: evil.example` alongside a matching
   * `Origin` made the two agree and passed the check, reducing this middleware to
   * decoration. A browser cannot set that header, so `SameSite` was still
   * carrying the real defence — but this layer exists precisely for when the
   * cookie attribute does not hold.
   */
  it('ignores a spoofed x-forwarded-host', () => {
    process.env.APP_ORIGIN = 'https://kawakawa.cx'
    const req = mockRequest({
      cookies: SESSION,
      origin: 'https://evil.example',
      host: 'kawakawa.cx',
      forwardedHost: 'evil.example',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  /**
   * In production `APP_ORIGIN` is set from DigitalOcean's `${APP_URL}` bindable
   * variable rather than a hardcoded literal, so its exact form is the platform's
   * to choose. Normalising through `URL().origin` means a trailing slash or a
   * default port cannot cause a silent mismatch.
   */
  it.each(['https://kawakawa.cx', 'https://kawakawa.cx/', 'https://kawakawa.cx:443'])(
    'normalises the configured origin %j',
    configured => {
      process.env.APP_ORIGIN = configured
      const req = mockRequest({
        cookies: SESSION,
        origin: 'https://kawakawa.cx',
        host: 'kawa-api.internal:3000',
      })
      const res = mockResponse()

      csrfProtection(req, res, next)

      expect(next).toHaveBeenCalled()
    }
  )

  it('allows the configured APP_ORIGIN regardless of the internal Host', () => {
    // Behind DO's ingress the API sees an internal host, not the public one.
    process.env.APP_ORIGIN = 'https://kawakawa.cx'
    const req = mockRequest({
      cookies: SESSION,
      origin: 'https://kawakawa.cx',
      host: 'kawa-api.internal:3000',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  /**
   * Host-only comparison would accept this. On an HTTPS deployment that is the
   * downgrade an active network attacker wants, so compare full origins.
   */
  it('rejects an http Origin against an https APP_ORIGIN', () => {
    process.env.APP_ORIGIN = 'https://kawakawa.cx'
    const req = mockRequest({
      cookies: SESSION,
      origin: 'http://kawakawa.cx',
      host: 'kawakawa.cx',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  /**
   * The `Host` fallback exists for local dev, where the Vite proxy forwards the
   * browser's Host unchanged so the comparison matches. It is not a safe default
   * anywhere else — behind an ingress Host is an internal name and this rejects
   * every mutation — which is why `warnIfCsrfMisconfigured` fires at boot in all
   * environments, not just production.
   */
  it('falls back to Host comparison when no origin is configured', () => {
    const req = mockRequest({
      cookies: SESSION,
      origin: 'https://kawakawa.cx',
      host: 'kawakawa.cx',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('tolerates a trailing slash and whitespace in configured origins', () => {
    process.env.ALLOWED_ORIGINS = ' https://staging.kawakawa.cx/ , https://preview.kawakawa.cx '
    const req = mockRequest({
      cookies: SESSION,
      origin: 'https://preview.kawakawa.cx',
      host: 'kawa-api.internal:3000',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it.each(['GET', 'HEAD', 'OPTIONS'])('exempts safe method %s', method => {
    const req = mockRequest({ method, cookies: SESSION, host: 'kawakawa.cx' })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  /**
   * Bearer-authenticated callers (scripts, API clients) are CSRF-immune by
   * construction: nothing attaches the header ambiently. They must keep working.
   */
  it('exempts requests with no session cookie', () => {
    const req = mockRequest({ method: 'POST', host: 'kawakawa.cx' })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('allows origins listed in ALLOWED_ORIGINS', () => {
    process.env.ALLOWED_ORIGINS = 'https://staging.kawakawa.cx'
    const req = mockRequest({
      cookies: SESSION,
      origin: 'https://staging.kawakawa.cx',
      host: 'kawakawa.cx',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  /**
   * `POST /auth/logout` is deliberately unauthenticated and idempotent, and it
   * clears cookies purely on being called. It must still not be callable
   * cross-site: an attacker forcing a logout is a nuisance, and the reasoning
   * that currently prevents it (POST-only, plus `SameSite=Strict`) is spread
   * across three files and one attribute change away from breaking. Pin it here.
   */
  it('rejects a cross-origin logout that rides the session cookie', () => {
    process.env.APP_ORIGIN = 'https://kawakawa.cx'
    const req = mockRequest({
      method: 'POST',
      cookies: SESSION,
      origin: 'https://evil.example',
      host: 'kawakawa.cx',
    })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('rejects a malformed Origin value', () => {
    const req = mockRequest({ cookies: SESSION, origin: 'not-a-url', host: 'kawakawa.cx' })
    const res = mockResponse()

    csrfProtection(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('warnIfCsrfMisconfigured', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    logWarn.mockClear()
    delete process.env.ALLOWED_ORIGINS
    delete process.env.APP_ORIGIN
    process.env.NODE_ENV = originalNodeEnv
  })

  /**
   * The warning used to be gated on `NODE_ENV === 'production'`, which stayed
   * silent for the deployment most likely to be misconfigured: a staging or
   * preview app on HTTPS running a non-production NODE_ENV.
   */
  it('warns outside production too', () => {
    process.env.NODE_ENV = 'staging'

    warnIfCsrfMisconfigured()

    expect(logWarn).toHaveBeenCalledWith(
      { csrfConfig: 'missing-app-origin' },
      expect.stringContaining('APP_ORIGIN is not set')
    )
  })

  it('stays quiet when APP_ORIGIN is configured', () => {
    process.env.APP_ORIGIN = 'https://kawakawa.cx'

    warnIfCsrfMisconfigured()

    expect(logWarn).not.toHaveBeenCalled()
  })

  it('accepts ALLOWED_ORIGINS alone as configuration', () => {
    process.env.ALLOWED_ORIGINS = 'https://staging.kawakawa.cx'

    warnIfCsrfMisconfigured()

    expect(logWarn).not.toHaveBeenCalled()
  })
})
