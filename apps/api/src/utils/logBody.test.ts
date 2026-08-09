import { describe, it, expect } from 'vitest'
import { stringifyForLog, MAX_LOGGED_BODY_CHARS } from './logBody.js'

/**
 * Regression tests for the log-index field explosion.
 *
 * Request/response bodies used to be logged as objects. OpenSearch dynamically
 * mapped a field per key of every domain object it saw; `log.resBody.*` alone
 * grew to 441 fields and took the index to its 1000-field ceiling. Past that,
 * OpenSearch rejects any document containing a new field — which silently threw
 * away entire log lines, including the JWT auth diagnostics.
 */
describe('stringifyForLog', () => {
  it('serialises an object to a single string, not a nested structure', () => {
    const result = stringifyForLog({ id: 1, commodityTicker: 'FEO', nested: { a: 1 } })

    expect(typeof result).toBe('string')
    expect(result).toBe('{"id":1,"commodityTicker":"FEO","nested":{"a":1}}')
  })

  it('passes strings through unchanged', () => {
    expect(stringifyForLog('already a string')).toBe('already a string')
  })

  it('truncates oversized bodies and says by how much', () => {
    const body = { data: 'x'.repeat(MAX_LOGGED_BODY_CHARS * 2) }
    const result = stringifyForLog(body)

    expect(result.length).toBeLessThan(MAX_LOGGED_BODY_CHARS + 60)
    expect(result).toContain('truncated')
  })

  it('truncates oversized plain strings', () => {
    const result = stringifyForLog('y'.repeat(MAX_LOGGED_BODY_CHARS * 2))
    expect(result).toHaveLength(MAX_LOGGED_BODY_CHARS)
  })

  it('survives circular structures instead of throwing inside the logger', () => {
    const circular: Record<string, unknown> = { name: 'loop' }
    circular.self = circular

    expect(stringifyForLog(circular)).toBe('[unserializable]')
  })

  it('handles values JSON.stringify returns undefined for', () => {
    expect(stringifyForLog(undefined)).toBe('undefined')
    expect(stringifyForLog(() => {})).toBe('() => {\n    }')
  })

  it('preserves null and primitives as valid JSON', () => {
    expect(stringifyForLog(null)).toBe('null')
    expect(stringifyForLog(42)).toBe('42')
    expect(stringifyForLog([1, 2])).toBe('[1,2]')
  })
})
