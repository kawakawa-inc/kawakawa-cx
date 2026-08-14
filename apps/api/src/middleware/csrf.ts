import type { Request, Response, NextFunction } from 'express'
import { AUTH_COOKIE_NAME } from '../utils/authCookie.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'csrf' })

/**
 * Origin-based CSRF protection for cookie-authenticated mutations.
 *
 * `Authorization: Bearer` was inherently CSRF-immune: a cross-site form or image
 * cannot make the browser attach a header. Cookies *are* sent automatically, so
 * moving the session into a cookie introduces a risk that did not exist before
 * and has to be closed deliberately.
 *
 * Two layers:
 *
 *  1. `SameSite=Strict` on the session cookie (see `utils/authCookie.ts`). This
 *     stops the browser sending the session on *any* cross-site request, which
 *     covers the classic attack outright.
 *  2. This middleware, which verifies `Origin`/`Referer` on every state-changing
 *     request.
 *
 * Layer 1 does the real work; layer 2 is a backstop, not a peer. It matters for
 * browsers old enough to ignore `SameSite`, and — more realistically — for the
 * day someone relaxes the cookie to `Lax` or `None` for an embed or a
 * subdomain, at which point layer 1 quietly stops protecting mutations and this
 * is all that is left. An earlier version of this comment called the two layers
 * "both required", which overstated an `Origin` check: it is a header comparison
 * and it has already been found failing open once (it trusted
 * `x-forwarded-host`, which the client controls).
 *
 * Deliberately *not* a synchroniser-token scheme: a token would have to be
 * readable by JS and echoed back, reintroducing the shared mutable client state
 * this migration exists to remove. Same-origin checking gets the same result for
 * a same-origin app with no moving parts.
 *
 * Safe methods (GET/HEAD/OPTIONS) are exempt — they must not mutate. Requests
 * with no cookie are exempt because they cannot be riding an ambient session;
 * they still have to pass normal authentication.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Origins permitted to make mutating requests.
 *
 * Configured, never inferred from the request. An earlier version derived the
 * expected host from `x-forwarded-host`, which the client controls: sending
 * `X-Forwarded-Host: evil.example` alongside `Origin: https://evil.example` made
 * the two agree and passed the check. That reduced this middleware to decoration
 * — the whole point of layer 2 is to hold when layer 1 (`SameSite`) does not.
 *
 * `APP_ORIGIN` is the app's own public origin; `ALLOWED_ORIGINS` is an additive
 * comma-separated list for deployment-specific extras (staging, preview apps).
 */
function expectedOrigins(): string[] {
  const configured = [process.env.APP_ORIGIN, process.env.ALLOWED_ORIGINS]
    .filter((v): v is string => Boolean(v))
    .join(',')

  return configured
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .map(o => {
      // Normalise through URL so a trailing slash or stray path in the env var
      // cannot cause a silent mismatch against `url.origin`.
      try {
        return new URL(o).origin
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

/**
 * True when `candidate` is an origin this deployment accepts mutations from.
 *
 * Compares the **full origin** (scheme + host + port), not the host alone: on an
 * HTTPS deployment a match on host only would accept `http://kawakawa.cx`, which
 * is exactly the downgrade an active network attacker wants.
 *
 * With nothing configured this falls back to comparing against the request's own
 * `Host`. That fallback exists for local dev, where the Vite proxy forwards the
 * browser's `Host` unchanged and the comparison therefore matches.
 *
 * It is **not** a safe default for a deployed environment. Behind an ingress
 * `Host` is an internal name (`kawa-api.internal:3000`) while `Origin` is the
 * public domain, so the fallback rejects every legitimate mutation — loud and
 * total, not degraded. It is also weaker in principle than what it replaced:
 * `Authorization: Bearer` was *structurally* CSRF-immune, so any origin check is
 * a step down from that, not an equal. Set `APP_ORIGIN` everywhere but local dev;
 * `warnIfCsrfMisconfigured` says so at boot.
 */
function isAllowedOrigin(req: Request, candidate: string): boolean {
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return false
  }

  const expected = expectedOrigins()
  if (expected.length > 0) return expected.includes(url.origin)

  const host = req.headers.host
  return Boolean(host) && url.host === host
}

/**
 * Warn at boot when no origin is configured.
 *
 * Deliberately not gated on `NODE_ENV === 'production'`. The deployment most
 * likely to be misconfigured is a staging or preview app on HTTPS running a
 * non-production `NODE_ENV` — exactly the one a production-only check would stay
 * silent for. Local dev is the only place the `Host` fallback actually works, and
 * a line in the dev log is a cheap price for covering everything else.
 */
export function warnIfCsrfMisconfigured(): void {
  if (expectedOrigins().length > 0) return

  log.warn(
    { csrfConfig: 'missing-app-origin' },
    'APP_ORIGIN is not set; CSRF origin checks fall back to Host comparison. ' +
      'This only works when the client and API share a Host (local dev). ' +
      'Behind an ingress it rejects all mutations.'
  )
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next()

  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies
  // No session cookie means nothing ambient to abuse. Bearer-authenticated
  // callers (scripts, API clients) are unaffected by CSRF by construction.
  if (!cookies?.[AUTH_COOKIE_NAME]) return next()

  const origin = req.headers.origin
  const referer = req.headers.referer

  // A same-origin fetch from any supported browser sends Origin on mutations.
  const candidate = origin || referer
  if (!candidate) {
    log.warn(
      { path: req.originalUrl, method: req.method, csrfFailure: 'missing-origin' },
      'CSRF check failed'
    )
    res.status(403).json({ message: 'Missing Origin header on state-changing request' })
    return
  }

  if (!isAllowedOrigin(req, candidate)) {
    log.warn(
      { path: req.originalUrl, method: req.method, csrfFailure: 'origin-mismatch' },
      'CSRF check failed'
    )
    res.status(403).json({ message: 'Cross-origin request rejected' })
    return
  }

  next()
}
