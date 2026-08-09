import type { Request, Response, NextFunction } from 'express'
import { requestContext, getContextValue } from '../utils/requestContext.js'

/** Response augmented with the captured body used by the HTTP logger. */
export interface ResponseWithBody extends Response {
  _resBody?: unknown
}

/**
 * Wraps every request in an AsyncLocalStorage context and, on the way out:
 *
 *  - captures the response body for the HTTP logger (redacted downstream), and
 *  - emits `X-Refreshed-Token` when the auth middleware minted a new JWT.
 *
 * The token is attached in `writeHead`, not in `json()`. tsoa answers
 * void-returning endpoints with `.end()` and never calls `.json()`, so hooking
 * `json()` silently dropped the header on every 204 — which matters now that
 * tokens are re-issued on a sliding schedule rather than only on role changes.
 * `writeHead` is the single choke point all response paths funnel through.
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
        if (refreshedToken) {
          res.setHeader('X-Refreshed-Token', refreshedToken)
        }
      }
      return originalWriteHead(...args)
    }) as Response['writeHead']

    next()
  })
}
