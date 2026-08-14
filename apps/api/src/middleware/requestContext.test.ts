import { describe, it, expect } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { requestContextMiddleware, type ResponseWithBody } from './requestContext.js'
import { setContextValue } from '../utils/requestContext.js'

/**
 * These are real HTTP round-trips rather than mocks, because the bug being
 * guarded against lives in the interaction between Express's response methods:
 * hooking `json()` looks correct in isolation but never fires for `.end()`,
 * which is how tsoa answers every void-returning (204) endpoint.
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

/** Stand-in for the auth middleware minting a replacement token. */
const issueToken = (app: express.Express, token = 'refreshed-abc') => {
  app.use((_req, _res, next) => {
    setContextValue('refreshedToken', token)
    next()
  })
}

describe('requestContextMiddleware', () => {
  it('sends X-Refreshed-Token on a JSON response', async () => {
    await withServer(
      app => {
        issueToken(app)
        app.get('/thing', (_req, res) => {
          res.status(200).json({ ok: true })
        })
      },
      async base => {
        const res = await fetch(`${base}/thing`)
        expect(res.headers.get('x-refreshed-token')).toBe('refreshed-abc')
      }
    )
  })

  it('sends X-Refreshed-Token on a 204 that never calls json()', async () => {
    // Regression: tsoa's express template answers void handlers with
    // `response.status(204).end()`. Hooking json() dropped the header here.
    await withServer(
      app => {
        issueToken(app)
        app.delete('/thing', (_req, res) => {
          res.status(204).end()
        })
      },
      async base => {
        const res = await fetch(`${base}/thing`, { method: 'DELETE' })
        expect(res.status).toBe(204)
        expect(res.headers.get('x-refreshed-token')).toBe('refreshed-abc')
      }
    )
  })

  it('sends X-Refreshed-Token on a non-JSON body', async () => {
    await withServer(
      app => {
        issueToken(app)
        app.get('/thing', (_req, res) => {
          res.status(200).send('plain')
        })
      },
      async base => {
        const res = await fetch(`${base}/thing`)
        expect(res.headers.get('x-refreshed-token')).toBe('refreshed-abc')
      }
    )
  })

  it('omits the header when no token was issued', async () => {
    await withServer(
      app => {
        app.get('/thing', (_req, res) => {
          res.status(200).json({ ok: true })
        })
      },
      async base => {
        const res = await fetch(`${base}/thing`)
        expect(res.headers.get('x-refreshed-token')).toBeNull()
      }
    )
  })

  it('captures the response body for the HTTP logger', async () => {
    let captured: unknown
    await withServer(
      app => {
        app.get('/thing', (_req, res) => {
          res.status(200).json({ ok: true })
          captured = (res as ResponseWithBody)._resBody
        })
      },
      async base => {
        await fetch(`${base}/thing`)
      }
    )
    expect(captured).toEqual({ ok: true })
  })

  /**
   * The sliding renewal must land in the cookie jar, not just a header. This is
   * what makes a stale tab recover on its own: the jar is shared across tabs and
   * updated by the browser, with no cooperation from the page's JavaScript.
   */
  it('re-issues the session as a Set-Cookie on renewal', async () => {
    await withServer(
      app => {
        issueToken(app)
        app.get('/thing', (_req, res) => {
          res.status(200).json({ ok: true })
        })
      },
      async base => {
        const res = await fetch(`${base}/thing`)
        const cookies = res.headers.getSetCookie()

        const session = cookies.find(c => c.startsWith('kawa_session='))
        expect(session).toContain('refreshed-abc')
        expect(session).toContain('HttpOnly')
        // See `authCookie.ts` for why Strict is safe despite the OAuth flow.
        expect(session).toContain('SameSite=Strict')

        // The readable presence flag rides along so guards can see the session.
        expect(cookies.some(c => c.startsWith('kawa_session_present='))).toBe(true)
      }
    )
  })

  it('sets the session cookie on a 204 that never calls json()', async () => {
    await withServer(
      app => {
        issueToken(app)
        app.delete('/thing', (_req, res) => {
          res.status(204).end()
        })
      },
      async base => {
        const res = await fetch(`${base}/thing`, { method: 'DELETE' })
        expect(res.headers.getSetCookie().some(c => c.startsWith('kawa_session='))).toBe(true)
      }
    )
  })

  it('clears both cookies when logout is requested', async () => {
    await withServer(
      app => {
        app.use((_req, _res, next) => {
          setContextValue('clearAuthCookie', true)
          next()
        })
        app.post('/logout', (_req, res) => {
          res.status(200).json({ ok: true })
        })
      },
      async base => {
        const res = await fetch(`${base}/logout`, { method: 'POST' })
        const cookies = res.headers.getSetCookie()
        expect(cookies.some(c => c.startsWith('kawa_session='))).toBe(true)
        expect(cookies.some(c => c.startsWith('kawa_session_present='))).toBe(true)
        // Cleared cookies are expressed as an immediate expiry.
        expect(cookies.every(c => /Expires=Thu, 01 Jan 1970/.test(c))).toBe(true)
      }
    )
  })

  /**
   * `DELETE /account` does both in one request: the auth middleware slides the
   * token past the refresh threshold, then the controller revokes the cookie.
   * Emitting both pairs left the outcome to the browser's last-wins ordering,
   * which is one reorder away from handing a deleted user a fresh 24h session.
   */
  it('lets revocation win when a request both refreshes and revokes', async () => {
    await withServer(
      app => {
        issueToken(app)
        app.delete('/account', (_req, res) => {
          setContextValue('clearAuthCookie', true)
          res.status(204).end()
        })
      },
      async base => {
        const res = await fetch(`${base}/account`, { method: 'DELETE' })
        const cookies = res.headers.getSetCookie()

        // Exactly one Set-Cookie per cookie — no contradictory pair.
        expect(cookies).toHaveLength(2)
        expect(cookies.every(c => /Expires=Thu, 01 Jan 1970/.test(c))).toBe(true)
        expect(cookies.some(c => c.includes('refreshed-abc'))).toBe(false)

        // The legacy header is still emitted for pre-cookie bundles; harmless
        // here because the user row is gone.
        expect(res.headers.get('x-refreshed-token')).toBe('refreshed-abc')
      }
    )
  })

  it('signals role drift with X-Roles-Changed', async () => {
    await withServer(
      app => {
        app.use((_req, _res, next) => {
          setContextValue('rolesChanged', true)
          next()
        })
        app.get('/thing', (_req, res) => {
          res.status(200).json({ ok: true })
        })
      },
      async base => {
        const res = await fetch(`${base}/thing`)
        expect(res.headers.get('x-roles-changed')).toBe('1')
      }
    )
  })

  it('isolates context between concurrent requests', async () => {
    await withServer(
      app => {
        app.get('/a', (_req, res) => {
          setContextValue('refreshedToken', 'token-a')
          setTimeout(() => res.status(200).json({ r: 'a' }), 25)
        })
        app.get('/b', (_req, res) => {
          setContextValue('refreshedToken', 'token-b')
          res.status(200).json({ r: 'b' })
        })
      },
      async base => {
        const [a, b] = await Promise.all([fetch(`${base}/a`), fetch(`${base}/b`)])
        expect(a.headers.get('x-refreshed-token')).toBe('token-a')
        expect(b.headers.get('x-refreshed-token')).toBe('token-b')
      }
    )
  })
})
