import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Guards the cache policy in nginx.conf.
 *
 * Real incident this encodes: tabs left open across deploys kept running weeks-old
 * JavaScript. Because the old bundle predated the auth fixes, its 401 handler
 * cleared shared credentials and logged out *other* tabs — and every subsequent
 * fix for that bug shipped to a bundle those tabs never loaded.
 *
 * The invariant: hashed assets may be cached forever, but the HTML that points at
 * them must be revalidated on every load. Caching index.html pins a browser to a
 * stale bundle indefinitely and makes the app unfixable by deploy.
 */
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const conf = readFileSync(join(webRoot, 'nginx.conf'), 'utf8')

/** Extract the body of a `location <match> { ... }` block. */
function locationBlock(match: string): string {
  const index = conf.indexOf(`location ${match}`)
  if (index === -1) throw new Error(`location ${match} not found in nginx.conf`)
  const start = conf.indexOf('{', index)
  let depth = 0
  for (let i = start; i < conf.length; i++) {
    if (conf[i] === '{') depth++
    if (conf[i] === '}') {
      depth--
      if (depth === 0) return conf.slice(start + 1, i)
    }
  }
  throw new Error(`unterminated location ${match}`)
}

describe('nginx cache policy', () => {
  it('serves index.html with no-cache so new deploys are picked up', () => {
    const block = locationBlock('= /index.html')
    expect(block).toMatch(/Cache-Control\s+"no-cache/)
  })

  it('does not mark index.html immutable or long-lived', () => {
    const block = locationBlock('= /index.html')
    expect(block).not.toContain('immutable')
    expect(block).not.toMatch(/expires\s+1y/)
  })

  /**
   * Content-hashed filenames make this safe, and it is what keeps the app fast —
   * the no-cache above applies only to the HTML entry point.
   */
  it('still caches hashed static assets immutably', () => {
    const block = locationBlock('~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$')
    expect(block).toContain('immutable')
    expect(block).toMatch(/expires\s+1y/)
  })

  it('re-includes security headers in the index.html block', () => {
    // nginx drops inherited add_header directives in any block that sets its own,
    // so a location adding Cache-Control silently loses the CSP without this.
    expect(locationBlock('= /index.html')).toContain('security-headers.conf')
  })
})
