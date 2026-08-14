import type { Request, Response } from 'express'
import { JWT_EXPIRES_IN_SECONDS } from './jwt.js'
import { setContextValue } from './requestContext.js'
import { createLogger } from './logger.js'

const log = createLogger({ service: 'auth-cookie' })

/**
 * Session cookie handling.
 *
 * ## Why a cookie and not `Authorization: Bearer` from localStorage
 *
 * The JWT used to live in `localStorage`, which made *credential propagation a
 * job for application code*: after a login in one tab, every other tab kept
 * sending the token it had captured at page load. Keeping tabs in agreement
 * needed a `storage` listener, a stale-token retry, and a guard on the auth
 * failure bus — and none of that helps a tab running an older bundle, because
 * the fix has to already be loaded to run. That produced a login loop where a
 * weeks-old tab's background poll 401'd, called `localStorage.removeItem('jwt')`,
 * and destroyed the session a *different* tab had just established.
 *
 * A cookie moves propagation into the browser's cookie jar, which is shared by
 * every tab on the origin and updated by the `Set-Cookie` on login regardless of
 * what JS any tab happens to be running. A stale tab's next request carries the
 * new session automatically, and — because the cookie is `httpOnly` — no amount
 * of old JS can delete it. The whole class of bug goes away rather than being
 * patched again.
 *
 * `httpOnly` also closes the XSS token-theft window that was previously an
 * accepted risk (the token was readable by any script on the origin).
 *
 * ## Attributes
 *
 * - `httpOnly`  Not readable from JS. The point of the exercise.
 * - `sameSite: 'strict'`  See the note below — this is the one attribute here
 *   with a non-obvious dependency on how OAuth is wired.
 * - `secure`  Always on except in local dev over plain HTTP.
 * - `path: '/'`  Sent to both the SPA and the API.
 * - `maxAge`  Mirrors the JWT lifetime so the cookie and its contents expire
 *   together; the JWT's own `exp` remains the authority.
 *
 * ## Why `SameSite=Strict` is safe here
 *
 * `Strict` withholds the cookie on *every* cross-site request, including
 * top-level GET navigations. That normally breaks OAuth returns, and an earlier
 * version of this comment claimed exactly that — incorrectly.
 *
 * It does not break here because **Discord's `redirect_uri` points at the SPA,
 * not the API** (`discord.redirectUri` = `/discord/callback`). The sequence:
 *
 *   1. Cross-site top-level GET from discord.com to `/discord/callback`. This
 *      only loads the JS bundle and needs no cookie.
 *   2. The bundle calls `GET /api/discord/callback?code=...`. The page origin is
 *      now our own, so this is same-site and the cookie is sent normally.
 *   3. That response sets the session cookie. `SameSite` governs *sending*, not
 *      *setting*, so it does not interfere.
 *
 * The cross-site hop never needs a cookie, which is what makes `Strict` free.
 *
 * **This is load-bearing.** `discord.redirectUri` is a runtime DB setting, so
 * repointing it at an API endpoint requires no code review — and would silently
 * break Discord login under `Strict`, because step 1 would then be a cross-site
 * request that *does* need the session. If that ever changes, this attribute has
 * to be revisited.
 *
 * Bot-generated links (`/link-discord?token=`, `/reset-password?token=`) are
 * unaffected for the same reason as step 1: they are top-level navigations that
 * only fetch the bundle, and they carry their own credential in the URL.
 *
 * A *logged-in* user clicking one from Discord or an email client also stays
 * logged in, which is worth spelling out because it is the obvious worry with
 * `Strict` and the intuition points the wrong way. Verified by observation: the
 * cross-site navigation request carries **no** `Cookie` header, but the document
 * it returns is a static SPA shell that does not need one. Every request the
 * bundle then makes is same-site, so the session is attached from the first XHR
 * onward and the user never sees a signed-out state.
 *
 * The property this relies on is that no *server-rendered, auth-dependent*
 * response is ever served on a cross-site navigation. That holds because the SPA
 * is a static bundle. It would stop holding the moment any page is rendered
 * server-side based on the session.
 */
export const AUTH_COOKIE_NAME = 'kawa_session'

/**
 * Non-sensitive companion cookie signalling "a session cookie should exist".
 *
 * The SPA cannot read the httpOnly session cookie, but its router guards need a
 * synchronous answer to "are we logged in?" before any request completes. This
 * readable flag provides it. It carries no credential and is never trusted by
 * the API — it only decides which screen to render first; every real
 * authorisation check happens server-side against the session cookie.
 */
export const AUTH_PRESENT_COOKIE_NAME = 'kawa_session_present'

function isSecureEnvironment(): boolean {
  // Local dev serves the SPA over http://localhost, where a `secure` cookie
  // would be dropped by the browser.
  //
  // `COOKIE_SECURE` overrides the NODE_ENV inference, which is too blunt on its
  // own: any HTTPS deployment running with a non-production NODE_ENV (a staging
  // or preview app) would silently issue the session cookie without `Secure`,
  // allowing it to leak over a plaintext downgrade.
  const override = process.env.COOKIE_SECURE
  if (override) return override !== 'false'

  return process.env.NODE_ENV === 'production'
}

/** Attach the session cookie (and its readable companion) to a response. */
export function setAuthCookie(res: Response, token: string): void {
  const secure = isSecureEnvironment()
  const maxAge = JWT_EXPIRES_IN_SECONDS * 1000

  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge,
  })

  // Deliberately NOT httpOnly: the SPA reads this. Contains no credential.
  res.cookie(AUTH_PRESENT_COOKIE_NAME, '1', {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge,
  })
}

/** Clear both cookies. Attributes must match those used when setting them. */
export function clearAuthCookie(res: Response): void {
  const secure = isSecureEnvironment()
  const options = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' }

  res.clearCookie(AUTH_COOKIE_NAME, options)
  res.clearCookie(AUTH_PRESENT_COOKIE_NAME, { ...options, httpOnly: false })
}

/**
 * Request the session cookie be issued for the current request.
 *
 * Controllers do not hold the Express `Response` (tsoa hands them typed bodies),
 * so they record the intent here and `requestContextMiddleware` applies it in
 * `writeHead`. Same mechanism the sliding-refresh path already uses.
 */
export function issueAuthCookie(token: string): void {
  setContextValue('refreshedToken', token)
}

/** Request that the session cookies be cleared for the current request. */
export function revokeAuthCookie(): void {
  setContextValue('clearAuthCookie', true)
}

/**
 * Extract the bearer token from a request.
 *
 * The cookie is preferred, with `Authorization: Bearer` retained as a fallback
 * so that (a) already-loaded bundles keep working through the transition rather
 * than being force-logged-out by the deploy, and (b) scripts and API clients
 * that legitimately use a header keep working.
 *
 * ## Retiring the fallback
 *
 * (a) is temporary and (b) is not, but the two are indistinguishable here. The
 * associated debt — this fallback, `X-Refreshed-Token`, `AuthResponse.token`,
 * `tokenRefreshCache.ts` and the web app's `jwt` localStorage redaction — can
 * only be removed once no *browser* still authenticates by header.
 *
 * The `bearer-fallback` log line below is the trigger for that. Nothing else
 * measures when the transition is complete, and a guess is how this kind of debt
 * becomes permanent. When it stops appearing from browser user-agents for longer
 * than the cookie's 24h lifetime, the cleanup is safe.
 */
export function getTokenFromRequest(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies
  const fromCookie = cookies?.[AUTH_COOKIE_NAME]
  if (fromCookie) return fromCookie

  const header = req.headers.authorization
  if (!header) return undefined

  // Require the `Bearer <token>` form. An earlier version also accepted a bare
  // token, which misparsed malformed headers — `"Bearer"` alone yielded the
  // string "Bearer" as the token, and `"Bearer  x"` (double space) did the same.
  // Nothing in this codebase sends a bare token, so the tolerance only served to
  // turn malformed input into a confusing signature-verification failure.
  const match = /^Bearer +(\S+)$/i.exec(header.trim())
  if (!match) return undefined

  // The user-agent distinguishes a stale browser bundle (debt to be retired)
  // from a script or API client (a permanent, legitimate caller). Never log the
  // token itself.
  log.info(
    {
      authSource: 'bearer-fallback',
      path: req.originalUrl,
      userAgent: req.headers['user-agent'],
    },
    'legacy header auth'
  )

  return match[1]
}
