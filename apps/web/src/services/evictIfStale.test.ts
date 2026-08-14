import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Coverage for the stale-bundle self-eviction path.
 *
 * This is the mechanism that makes the whole cookie migration deployable: a tab
 * left open across a deploy runs old JS forever, and that is how a weeks-old
 * bundle stayed alive long enough to keep clearing shared credentials on every
 * 401. Fixes shipped repeatedly and never reached the tabs that needed them,
 * because a fix has to be loaded to run.
 *
 * Two properties matter and neither was covered:
 *  - it must use the *unauthenticated* version endpoint, since the tab most in
 *    need of eviction is the one whose session has already lapsed; and
 *  - it must not be able to reload in a loop.
 *
 * `__APP_VERSION__` is defined as 'test' by vitest.config.ts, so the real
 * `BUILD_VERSION === 'dev'` short-circuit does not apply here.
 */

const reload = vi.fn()

beforeEach(() => {
  vi.resetModules()
  reload.mockClear()
  // jsdom's location is not writable; replace just the reload method.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Fresh module instance so the `hasReloadedForVersion` guard starts unset. */
async function loadService() {
  return await import('./syncService')
}

function stubFetch(impl: (url: string) => Promise<Response> | Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => Promise.resolve(impl(String(input))))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const jsonResponse = (body: unknown): Response => ({ ok: true, json: async () => body }) as Response

describe('evictIfStale', () => {
  it('reloads when the deployed version differs from this bundle', async () => {
    stubFetch(() => jsonResponse({ appVersion: 'a-newer-sha' }))
    const { evictIfStale } = await loadService()

    await evictIfStale()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('queries the unauthenticated version endpoint', async () => {
    // Deliberately not /api/sync/state: that requires a session, so an expired
    // tab would 401 before it could read appVersion.
    const fetchMock = stubFetch(() => jsonResponse({ appVersion: 'a-newer-sha' }))
    const { evictIfStale } = await loadService()

    await evictIfStale()

    expect(fetchMock).toHaveBeenCalledWith('/api/sync/version')
  })

  it('does nothing when the versions match', async () => {
    stubFetch(() => jsonResponse({ appVersion: 'test' }))
    const { evictIfStale } = await loadService()

    await evictIfStale()

    expect(reload).not.toHaveBeenCalled()
  })

  /**
   * The guard against a reload loop. If the served bundle somehow keeps
   * reporting the old version — an intermediary ignoring the no-cache header on
   * index.html — an unguarded implementation would reload endlessly.
   */
  it('reloads at most once per page load', async () => {
    stubFetch(() => jsonResponse({ appVersion: 'a-newer-sha' }))
    const { evictIfStale } = await loadService()

    await evictIfStale()
    await evictIfStale()
    await evictIfStale()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the API is unreachable', async () => {
    stubFetch(() => {
      throw new TypeError('network down')
    })
    const { evictIfStale } = await loadService()

    await expect(evictIfStale()).resolves.toBeUndefined()
    expect(reload).not.toHaveBeenCalled()
  })

  it('stays quiet on a non-ok response', async () => {
    stubFetch(() => ({ ok: false, json: async () => ({}) }) as Response)
    const { evictIfStale } = await loadService()

    await evictIfStale()

    expect(reload).not.toHaveBeenCalled()
  })

  it('stays quiet when the payload has no version', async () => {
    stubFetch(() => jsonResponse({}))
    const { evictIfStale } = await loadService()

    await evictIfStale()

    expect(reload).not.toHaveBeenCalled()
  })
})
