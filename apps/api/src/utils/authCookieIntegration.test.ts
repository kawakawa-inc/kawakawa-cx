import { describe, it, expect } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { requestContextMiddleware } from '../middleware/requestContext.js'
import { issueAuthCookie, revokeAuthCookie, AUTH_COOKIE_NAME } from './authCookie.js'

/**
 * End-to-end coverage of the cookie-issuing chain that controllers actually use.
 *
 * `AuthController.test.ts` mocks `utils/authCookie.js` wholesale, which verifies
 * that login *calls* `issueAuthCookie` but not that a `Set-Cookie` ever reaches
 * the browser. The real path has four links:
 *
 *   controller -> issueAuthCookie -> setContextValue -> writeHead -> Set-Cookie
 *
 * Every link is in a different file, none is exercised together anywhere else,
 * and a break in the middle would leave every login silently sessionless while
 * the mocked unit tests stayed green. These are real HTTP round-trips against the
 * real middleware for that reason.
 */
async function withServer(
  configure: (app: express.Express) => void,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = express()
  app.use(requestContextMiddleware)
  configure(app)

  const server = app.listen(0)
  try {
    await new Promise<void>(resolve => server.once('listening', () => resolve()))
    const { port } = server.address() as AddressInfo
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

/**
 * Stand-in for a controller body. Controllers never touch the Express response —
 * they call `issueAuthCookie` and return a typed body, exactly as modelled here.
 */
function loginLikeHandler(app: express.Express, token = 'session-jwt') {
  app.post('/login', (_req, res) => {
    issueAuthCookie(token)
    res.status(200).json({ token, user: { id: 1 } })
  })
}

describe('auth cookie issuance (integration)', () => {
  it('turns a controller-side issueAuthCookie into a Set-Cookie on the wire', async () => {
    await withServer(loginLikeHandler, async base => {
      const res = await fetch(`${base}/login`, { method: 'POST' })
      const cookies = res.headers.getSetCookie()

      const session = cookies.find(c => c.startsWith(`${AUTH_COOKIE_NAME}=`))
      expect(session).toBeDefined()
      expect(session).toContain('session-jwt')
      expect(session).toContain('HttpOnly')
      // See `authCookie.ts` for why Strict is safe despite the OAuth flow.
      expect(session).toContain('SameSite=Strict')
      expect(session).toContain('Path=/')
    })
  })

  it('sets the readable presence flag alongside it', async () => {
    await withServer(loginLikeHandler, async base => {
      const res = await fetch(`${base}/login`, { method: 'POST' })
      const present = res.headers.getSetCookie().find(c => c.startsWith('kawa_session_present='))

      expect(present).toBeDefined()
      // The SPA reads this synchronously in its router guards, so it must NOT be
      // httpOnly — and must never carry the credential.
      expect(present).not.toContain('HttpOnly')
      expect(present).not.toContain('session-jwt')
    })
  })

  /**
   * The registration and Discord-callback paths issue the session the same way,
   * including on responses that tsoa answers without `json()`.
   */
  it('issues the cookie on a 204 response', async () => {
    await withServer(
      app => {
        app.post('/link', (_req, res) => {
          issueAuthCookie('session-jwt')
          res.status(204).end()
        })
      },
      async base => {
        const res = await fetch(`${base}/link`, { method: 'POST' })
        expect(res.status).toBe(204)
        expect(res.headers.getSetCookie().some(c => c.startsWith(`${AUTH_COOKIE_NAME}=`))).toBe(
          true
        )
      }
    )
  })

  it('clears both cookies when a controller revokes the session', async () => {
    await withServer(
      app => {
        app.post('/logout', (_req, res) => {
          revokeAuthCookie()
          res.status(200).json({ message: 'Logged out' })
        })
      },
      async base => {
        const res = await fetch(`${base}/logout`, { method: 'POST' })
        const cookies = res.headers.getSetCookie()

        expect(cookies).toHaveLength(2)
        // Clearing is expressed as an immediate expiry.
        expect(cookies.every(c => /Expires=Thu, 01 Jan 1970/.test(c))).toBe(true)
      }
    )
  })

  /**
   * A request that neither issues nor revokes must not emit `Set-Cookie` at all.
   * Emitting one unconditionally would rewrite the session on every response,
   * which is how a partial refresh could clobber a good cookie.
   */
  it('emits no Set-Cookie when the controller does neither', async () => {
    await withServer(
      app => {
        app.get('/thing', (_req, res) => {
          res.status(200).json({ ok: true })
        })
      },
      async base => {
        const res = await fetch(`${base}/thing`)
        expect(res.headers.getSetCookie()).toEqual([])
      }
    )
  })
})
