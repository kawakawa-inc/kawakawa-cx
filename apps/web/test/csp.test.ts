import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Guards the Content-Security-Policy in security-headers.conf against drift.
 *
 * The policy is only as good as its weakest directive, and it is very easy to
 * "fix" a console error by pasting in 'unsafe-inline'/'unsafe-eval' — which
 * would quietly remove most of the XSS protection the header exists to provide.
 * These tests fail loudly if that happens, and also verify that the built
 * bundle doesn't actually need the escape hatches.
 */

// This suite lives outside src/ because it inspects build output and nginx
// config with Node APIs, which the browser-targeted tsconfig in src/ excludes.
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const conf = readFileSync(join(webRoot, 'security-headers.conf'), 'utf8')

function directive(name: string): string {
  const csp = /add_header Content-Security-Policy "([^"]+)"/.exec(conf)?.[1]
  if (!csp) throw new Error('Content-Security-Policy header not found')
  const found = csp
    .split(';')
    .map(d => d.trim())
    .find(d => d === name || d.startsWith(`${name} `))
  return found ?? ''
}

describe('Content-Security-Policy', () => {
  it('defines a policy with a deny-by-default fallback', () => {
    expect(directive('default-src')).toBe("default-src 'self'")
  })

  it('keeps script-src strict — no unsafe-inline or unsafe-eval', () => {
    const scriptSrc = directive('script-src')
    expect(scriptSrc).toBe("script-src 'self'")
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('unsafe-eval')
  })

  it('restricts connect-src to same-origin so a token cannot be POSTed offsite', () => {
    expect(directive('connect-src')).toBe("connect-src 'self'")
  })

  it('sets the remaining hardening directives', () => {
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('base-uri')).toBe("base-uri 'self'")
    expect(directive('form-action')).toBe("form-action 'self'")
  })

  it('allows exactly the third-party origins the app really uses', () => {
    // Discord avatars are rendered as <img> on the account/register screens.
    expect(directive('img-src')).toContain('https://cdn.discordapp.com')
    // Google Fonts: the stylesheet, then the font files it points at.
    expect(directive('style-src')).toContain('https://fonts.googleapis.com')
    expect(directive('font-src')).toContain('https://fonts.gstatic.com')
  })

  it('marks headers as `always` so they are sent on error responses too', () => {
    // Match a full directive: quoted value may itself contain semicolons.
    const headers = conf.match(/add_header\s+\S+\s+(?:"[^"]*"|\S+)\s*[^;]*;/g) ?? []
    expect(headers.length).toBeGreaterThan(0)
    for (const header of headers) {
      expect(header).toMatch(/\salways;$/)
    }
  })
})

/**
 * These assertions justify `script-src 'self'` empirically. If a future
 * dependency starts emitting inline scripts or calling eval, the bundle would
 * break at runtime under the CSP — better to fail here, at build time.
 *
 * Skipped when dist/ hasn't been built (e.g. a bare `vitest` run).
 */
const distDir = join(webRoot, 'dist')
const distBuilt = existsSync(join(distDir, 'index.html'))

describe.skipIf(!distBuilt)('built bundle is CSP-compatible', () => {
  it('emits no inline <script> in index.html', () => {
    const html = readFileSync(join(distDir, 'index.html'), 'utf8')
    const inlineBodies = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map(m => m[1].trim())
      .filter(Boolean)
    expect(inlineBodies).toEqual([])
  })

  it('does not rely on eval, new Function, workers, or blob URLs', () => {
    const assets = join(distDir, 'assets')
    const js = readdirSync(assets).filter((f: string) => f.endsWith('.js'))
    expect(js.length).toBeGreaterThan(0)

    for (const file of js) {
      const src = readFileSync(join(assets, file), 'utf8')
      expect(src, `${file} uses eval()`).not.toMatch(/\beval\(/)
      expect(src, `${file} uses new Function()`).not.toMatch(/new Function\(/)
      expect(src, `${file} uses new Worker()`).not.toMatch(/new Worker\(/)
      expect(src, `${file} uses createObjectURL`).not.toMatch(/createObjectURL/)
    }
  })
})
