import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAll = vi.hoisted(() => vi.fn())

vi.mock('@kawakawa/services/settings', () => ({
  settingsService: { getAll: mockGetAll },
}))

/**
 * `getWebUrl` caches in module scope with no reset hook, so each case needs a
 * fresh module instance.
 */
async function loadWebUrl(configured: string | undefined) {
  vi.resetModules()
  mockGetAll.mockReset()
  mockGetAll.mockResolvedValue(configured === undefined ? {} : { 'app.webUrl': configured })
  const { getWebUrl } = await import('./config.js')
  return getWebUrl()
}

describe('getWebUrl', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  /**
   * The bug this guards against: `app.webUrl` is admin-editable free text and
   * was stored as `http://localhost:5173/`. Callers append `/link-discord`,
   * yielding `//link-discord?token=...`, which does not match the
   * `/link-discord` route — so the SPA's catch-all redirected to /market while
   * *keeping the query string*. The result looked like a broken route rather
   * than a malformed URL, which is a genuinely nasty thing to debug.
   */
  it('strips a trailing slash so callers can append a path', async () => {
    await expect(loadWebUrl('http://localhost:5173/')).resolves.toBe('http://localhost:5173')
  })

  it('strips repeated trailing slashes', async () => {
    await expect(loadWebUrl('https://kawakawa.cx///')).resolves.toBe('https://kawakawa.cx')
  })

  it('leaves a well-formed URL alone', async () => {
    await expect(loadWebUrl('https://kawakawa.cx')).resolves.toBe('https://kawakawa.cx')
  })

  it('tolerates surrounding whitespace from hand-entered config', async () => {
    await expect(loadWebUrl('  https://kawakawa.cx/  ')).resolves.toBe('https://kawakawa.cx')
  })

  it('preserves a sub-path deployment, minus the trailing slash', async () => {
    await expect(loadWebUrl('https://kawakawa.cx/app/')).resolves.toBe('https://kawakawa.cx/app')
  })

  it('falls back to the dev default when unset', async () => {
    await expect(loadWebUrl(undefined)).resolves.toBe('http://localhost:5173')
  })

  it('falls back when the setting is blank', async () => {
    await expect(loadWebUrl('   ')).resolves.toBe('http://localhost:5173')
  })

  /** The generated links must be routable, not merely slash-free. */
  it('builds a link that matches the SPA route', async () => {
    const webUrl = await loadWebUrl('http://localhost:5173/')
    expect(`${webUrl}/link-discord?token=abc`).toBe('http://localhost:5173/link-discord?token=abc')
  })
})
