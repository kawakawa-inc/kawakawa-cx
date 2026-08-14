import type { Request, Response, NextFunction } from 'express'
import { requestContext, getContextValue } from '../utils/requestContext.js'
import { setAuthCookie, clearAuthCookie } from '../utils/authCookie.js'

/** Response augmented with the captured body used by the HTTP logger. */
export interface ResponseWithBody extends Response {
  _resBody?: unknown
}

/**
 * Wraps every request in an AsyncLocalStorage context and, on the way out:
 *
 *  - captures the response body for the HTTP logger (redacted downstream), and
 *  - re-issues the session cookie when the auth middleware minted a new JWT.
 *
 * The refreshed token is written in `writeHead`, not in `json()`. tsoa answers
 * void-returning endpoints with `.end()` and never calls `.json()`, so hooking
 * `json()` silently dropped it on every 204 — which matters now that tokens are
 * re-issued on a sliding schedule rather than only on role changes. `writeHead`
 * is the single choke point all response paths funnel through.
 *
 * Sliding renewal is a `Set-Cookie`, so it lands in the shared cookie jar and
 * every tab picks it up for free. `X-Refreshed-Token` is still emitted alongside
 * it for bundles predating the cookie migration, which read that header and
 * store the value themselves.
 *
 * Renewal and revocation are mutually exclusive, with revocation winning — see
 * the comment at the branch below.
 */
export function requestContextMiddleware(_req: Request, res: Response, next: NextFunction): void {
  requestContext.run(new Map(), () => {
    // Intercept json() purely to capture the body for logging.
    const originalJson = res.json.bind(res)
    res.json = (body: unknown) => {
      ;(res as ResponseWithBody)._resBody = body
      return originalJson(body)
    }

    const originalWriteHead = res.writeHead.bind(res)
    res.writeHead = ((...args: Parameters<Response['writeHead']>) => {
      if (!res.headersSent) {
        const refreshedToken = getContextValue<string>('refreshedToken')

        // Revocation wins. A single request can ask for both: `DELETE /account`
        // slides the token past the 12h refresh threshold in the auth middleware
        // and *then* revokes the cookie in the controller. Emitting both pairs
        // left the outcome to browser last-wins ordering — one reorder away from
        // handing a deleted user a fresh 24h session.
        if (getContextValue<boolean>('clearAuthCookie')) {
          clearAuthCookie(res)
        } else if (refreshedToken) {
          setAuthCookie(res, refreshedToken)
        }

        // Legacy: pre-cookie bundles read this header and store the value
        // themselves. Emitted outside the branch above because an old bundle
        // still needs it, and it is harmless on a revocation — the user row is
        // gone, so the token authenticates nothing.
        if (refreshedToken) {
          res.setHeader('X-Refreshed-Token', refreshedToken)
        }
        // The SPA can no longer decode the JWT to notice its roles changed, so
        // tell it outright and let it refetch the profile.
        if (getContextValue<boolean>('rolesChanged')) {
          res.setHeader('X-Roles-Changed', '1')
        }
      }
      return originalWriteHead(...args)
    }) as Response['writeHead']

    next()
  })
}
