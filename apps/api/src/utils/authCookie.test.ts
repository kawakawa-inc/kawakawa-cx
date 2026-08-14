import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Request, Response } from 'express'
import {
  AUTH_COOKIE_NAME,
  AUTH_PRESENT_COOKIE_NAME,
  setAuthCookie,
  clearAuthCookie,
  getTokenFromRequest,
  issueAuthCookie,
  revokeAuthCookie,
} from './authCookie.js'
import { requestContext, getContextValue } from './requestContext.js'

const logInfo = vi.hoisted(() => vi.fn())

vi.mock('./logger.js', () => ({
  createLogger: () => ({ info: logInfo, warn: vi.fn(), error: vi.fn() }),
}))

function mockResponse(): Response & {
  cookie: ReturnType<typeof vi.fn>
  clearCookie: ReturnType<typeof vi.fn>
} {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>
    clearCookie: ReturnType<typeof vi.fn>
  }
}

function mockRequest(init: {
  cookies?: Record<string, string>
  authorization?: string
  userAgent?: string
}): Request {
  const headers: Record<string, string> = {}
  if (init.authorization) headers.authorization = init.authorization
  if (init.userAgent) headers['user-agent'] = init.userAgent

  return {
    cookies: init.cookies,
    headers,
    originalUrl: '/account/profile',
  } as unknown as Request
}

describe('authCookie', () => {
  const originalEnv = process.env.NODE_ENV

  /**
   * The SPA hardcodes these names (`apps/web/src/services/session.ts`) because it
   * cannot import from the API package. Renaming one side silently signs every
   * user out, so pin the literals here.
   */
  it('uses the cookie names the SPA expects', () => {
    expect(AUTH_COOKIE_NAME).toBe('kawa_session')
    expect(AUTH_PRESENT_COOKIE_NAME).toBe('kawa_session_present')
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  describe('setAuthCookie', () => {
    it('sets the session cookie httpOnly so scripts cannot read or delete it', () => {
      const res = mockResponse()
      setAuthCookie(res, 'jwt-value')

      const [name, value, options] = res.cookie.mock.calls[0]
      expect(name).toBe(AUTH_COOKIE_NAME)
      expect(value).toBe('jwt-value')
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/' })
    })

    /**
     * SameSite is the first line of CSRF defence introduced by moving the
     * session into a cookie. A Bearer header could not be sent cross-site; a
     * cookie can, unless this attribute stops it.
     *
     * `strict` rather than `lax`: `lax` still permits the cookie on cross-site
     * top-level GET navigations, and this app needs no such thing. Discord's
     * `redirect_uri` targets the SPA (`/discord/callback`), so the only
     * cross-site hop loads a static bundle and needs no cookie — see the note in
     * `authCookie.ts`. Asserted rather than assumed because the attribute is one
     * edit away from being weakened by someone who believes the OAuth flow
     * requires `lax`; it does not.
     */
    it('uses SameSite=Strict to block all cross-site sends', () => {
      const res = mockResponse()
      setAuthCookie(res, 'jwt-value')
      expect(res.cookie.mock.calls[0][2]).toMatchObject({ sameSite: 'strict' })
    })

    /**
     * The presence flag is read by router guards to decide which screen to
     * render first. If it survived a cross-site navigation while the session
     * cookie did not, guards would render a signed-in shell with no working
     * session — so its SameSite must match, not merely be "at least as strict".
     */
    it('gives the presence flag the same SameSite as the session', () => {
      const res = mockResponse()
      setAuthCookie(res, 'jwt-value')

      const sessionOptions = res.cookie.mock.calls[0][2]
      const presenceOptions = res.cookie.mock.calls[1][2]
      expect(presenceOptions.sameSite).toBe(sessionOptions.sameSite)
    })

    it('also sets a readable presence flag that is not httpOnly', () => {
      const res = mockResponse()
      setAuthCookie(res, 'jwt-value')

      const [name, value, options] = res.cookie.mock.calls[1]
      expect(name).toBe(AUTH_PRESENT_COOKIE_NAME)
      expect(options).toMatchObject({ httpOnly: false })
      // Must never carry the credential itself.
      expect(value).not.toContain('jwt-value')
    })

    it('marks cookies secure in production', () => {
      process.env.NODE_ENV = 'production'
      const res = mockResponse()
      setAuthCookie(res, 'jwt-value')
      expect(res.cookie.mock.calls[0][2]).toMatchObject({ secure: true })
    })

    it('does not mark cookies secure outside production (local HTTP dev)', () => {
      process.env.NODE_ENV = 'development'
      const res = mockResponse()
      setAuthCookie(res, 'jwt-value')
      expect(res.cookie.mock.calls[0][2]).toMatchObject({ secure: false })
    })
  })

  describe('clearAuthCookie', () => {
    it('clears both cookies', () => {
      const res = mockResponse()
      clearAuthCookie(res)

      const names = res.clearCookie.mock.calls.map(call => call[0])
      expect(names).toEqual([AUTH_COOKIE_NAME, AUTH_PRESENT_COOKIE_NAME])
    })

    /**
     * A browser only removes a cookie when the clearing `Set-Cookie` carries the
     * same `Path`, `Secure`, `SameSite` and `HttpOnly` attributes it was set
     * with. A mismatch fails *silently* — logout appears to work and the session
     * stays live — so pin the parity rather than trusting the two call sites to
     * stay in step.
     */
    it.each([
      ['development', false],
      ['production', true],
    ])('clears with attributes matching those used to set (%s)', (env, secure) => {
      process.env.NODE_ENV = env

      const setRes = mockResponse()
      setAuthCookie(setRes, 'jwt-value')
      const clearRes = mockResponse()
      clearAuthCookie(clearRes)

      for (const [index, name] of [AUTH_COOKIE_NAME, AUTH_PRESENT_COOKIE_NAME].entries()) {
        // `cookie(name, value, options)` but `clearCookie(name, options)` — the
        // options argument sits at a different index in each.
        const setOptions = setRes.cookie.mock.calls[index][2]
        const clearOptions = clearRes.clearCookie.mock.calls[index][1]

        expect(clearOptions, `${name} clear options`).toMatchObject({
          httpOnly: setOptions.httpOnly,
          secure,
          sameSite: setOptions.sameSite,
          path: setOptions.path,
        })
      }
    })
  })

  /**
   * Controllers do not hold the Express `Response` (tsoa hands them typed
   * bodies), so they record intent in the request context and
   * `requestContextMiddleware` applies it in `writeHead`. These two functions are
   * what every controller actually calls, so pin the context keys the middleware
   * reads — a rename on either side silently stops issuing or clearing cookies.
   */
  describe('issueAuthCookie / revokeAuthCookie', () => {
    it('records the token for the middleware to apply', () => {
      requestContext.run(new Map(), () => {
        issueAuthCookie('new-token')
        expect(getContextValue<string>('refreshedToken')).toBe('new-token')
      })
    })

    it('records the revocation for the middleware to apply', () => {
      requestContext.run(new Map(), () => {
        revokeAuthCookie()
        expect(getContextValue<boolean>('clearAuthCookie')).toBe(true)
      })
    })

    /**
     * Both are no-ops outside a request context rather than throwing: a
     * background job calling into shared controller logic must not crash.
     */
    it('does not throw when called outside a request context', () => {
      expect(() => issueAuthCookie('t')).not.toThrow()
      expect(() => revokeAuthCookie()).not.toThrow()
    })
  })

  describe('getTokenFromRequest', () => {
    it('reads the token from the session cookie', () => {
      const req = mockRequest({ cookies: { [AUTH_COOKIE_NAME]: 'from-cookie' } })
      expect(getTokenFromRequest(req)).toBe('from-cookie')
    })

    /**
     * The Bearer fallback exists so that bundles loaded before this migration
     * keep working instead of every open tab being force-logged-out by the
     * deploy — the precise failure mode this whole change is meant to end.
     */
    it('falls back to the Authorization header for pre-migration clients', () => {
      const req = mockRequest({ authorization: 'Bearer from-header' })
      expect(getTokenFromRequest(req)).toBe('from-header')
    })

    it('prefers the cookie when both are present', () => {
      const req = mockRequest({
        cookies: { [AUTH_COOKIE_NAME]: 'from-cookie' },
        authorization: 'Bearer from-header',
      })
      expect(getTokenFromRequest(req)).toBe('from-cookie')
    })

    /**
     * This log line is the *trigger* for retiring the Bearer fallback and the
     * rest of the transition debt (`X-Refreshed-Token`, `AuthResponse.token`,
     * `tokenRefreshCache.ts`). Nothing else measures when no browser is still
     * authenticating by header, and without a measurement the cleanup gets
     * guessed at, deferred, and never done. Pinned so it cannot be dropped as
     * noise.
     */
    it('logs the bearer fallback so the transition debt has a retirement signal', () => {
      logInfo.mockClear()

      getTokenFromRequest(
        mockRequest({ authorization: 'Bearer from-header', userAgent: 'Mozilla' })
      )

      expect(logInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          authSource: 'bearer-fallback',
          path: '/account/profile',
          userAgent: 'Mozilla',
        }),
        expect.any(String)
      )
    })

    it('does not log when the cookie is used', () => {
      logInfo.mockClear()

      getTokenFromRequest(mockRequest({ cookies: { [AUTH_COOKIE_NAME]: 'from-cookie' } }))

      expect(logInfo).not.toHaveBeenCalled()
    })

    it('does not log a malformed authorization header', () => {
      logInfo.mockClear()

      getTokenFromRequest(mockRequest({ authorization: 'Basic dXNlcjpwYXNz' }))

      expect(logInfo).not.toHaveBeenCalled()
    })

    /**
     * A bare token used to be accepted, which meant malformed headers parsed to
     * nonsense (`"Bearer"` alone became the token `"Bearer"`). Nothing sends one.
     */
    it.each(['bare-token', 'Bearer', 'Bearer ', ''])(
      'rejects the malformed authorization header %j',
      header => {
        expect(getTokenFromRequest(mockRequest({ authorization: header }))).toBeUndefined()
      }
    )

    it('tolerates extra whitespace around a well-formed header', () => {
      expect(getTokenFromRequest(mockRequest({ authorization: '  Bearer   tok  ' }))).toBe('tok')
    })

    it('rejects a non-Bearer authorization scheme', () => {
      const req = mockRequest({ authorization: 'Basic dXNlcjpwYXNz' })
      expect(getTokenFromRequest(req)).toBeUndefined()
    })

    it('returns undefined when neither cookie nor header is present', () => {
      expect(getTokenFromRequest(mockRequest({}))).toBeUndefined()
    })

    it('ignores an empty session cookie', () => {
      const req = mockRequest({ cookies: { [AUTH_COOKIE_NAME]: '' } })
      expect(getTokenFromRequest(req)).toBeUndefined()
    })
  })
})
