import { describe, it, expect } from 'vitest'
import {
  classifyFioError,
  describeFioError,
  isRetryableFioError,
  FioSyncFailure,
} from './fio-error.js'
import { FioApiError } from './client.js'

describe('classifyFioError', () => {
  describe('from HTTP status codes', () => {
    it.each([
      [401, 'invalid_credentials'],
      [403, 'invalid_credentials'],
      [404, 'not_found'],
      [429, 'rate_limited'],
      [500, 'fio_unavailable'],
      [502, 'fio_unavailable'],
      [503, 'fio_unavailable'],
    ])('classifies HTTP %i as %s', (status, expected) => {
      expect(classifyFioError(new FioApiError('boom', status))).toBe(expected)
    })

    it('falls back to unknown for unhandled 4xx', () => {
      expect(classifyFioError(new FioApiError('boom', 418))).toBe('unknown')
    })
  })

  it('honours an explicit code on FioSyncFailure', () => {
    expect(classifyFioError(new FioSyncFailure('nope', 'no_credentials'))).toBe('no_credentials')
  })

  describe('from message text', () => {
    // The worker joins result.errors[] into a plain Error, so the status code
    // is only recoverable from the message at that point.
    it('recovers the status from a joined error string', () => {
      const joined = new Error(
        'Failed to sync inventory for user 4: FIO API request failed (HTTP 401): no details'
      )
      expect(classifyFioError(joined)).toBe('invalid_credentials')
    })

    it('detects a missing-credentials error', () => {
      expect(classifyFioError(new Error('User 7 has no FIO credentials configured'))).toBe(
        'no_credentials'
      )
    })

    it.each(['fetch failed', 'connect ECONNREFUSED 1.2.3.4:443', 'socket hang up'])(
      'classifies %s as a network error',
      message => {
        expect(classifyFioError(new Error(message))).toBe('network')
      }
    )

    it('returns unknown for anything unrecognised', () => {
      expect(classifyFioError(new Error('something weird'))).toBe('unknown')
    })

    it('handles non-Error throws', () => {
      expect(classifyFioError('a bare string')).toBe('unknown')
    })
  })
})

describe('isRetryableFioError', () => {
  it.each(['no_credentials', 'invalid_credentials', 'not_found', 'data'] as const)(
    'does not retry %s',
    code => {
      expect(isRetryableFioError(code)).toBe(false)
    }
  )

  it.each(['rate_limited', 'fio_unavailable', 'network', 'unknown'] as const)(
    'retries %s',
    code => {
      expect(isRetryableFioError(code)).toBe(true)
    }
  )
})

describe('describeFioError', () => {
  it('produces a user-facing description without leaking the raw error', () => {
    const described = describeFioError({
      code: 'invalid_credentials',
      jobType: 'user-inventory',
      rawMessage: 'FIO API request failed (HTTP 401): no details',
      failedAt: new Date('2026-01-02T03:04:05.000Z'),
    })

    expect(described.code).toBe('invalid_credentials')
    expect(described.userActionable).toBe(true)
    expect(described.title).not.toContain('401')
    expect(described.detail).toContain('fio.fnar.net')
    // The raw text is kept for diagnostics, just not in the headline.
    expect(described.rawMessage).toContain('HTTP 401')
    expect(described.failedAt).toBe('2026-01-02T03:04:05.000Z')
  })

  it('marks infrastructure failures as not user-actionable', () => {
    const described = describeFioError({
      code: 'fio_unavailable',
      jobType: 'user-inventory',
      rawMessage: null,
      failedAt: new Date(),
    })

    expect(described.userActionable).toBe(false)
  })

  it('falls back to the unknown description for an unrecognised code', () => {
    const described = describeFioError({
      // Simulates a row written by a newer version of the worker.
      code: 'something_new' as never,
      jobType: 'user-inventory',
      rawMessage: null,
      failedAt: new Date(),
    })

    expect(described.title).toBe('FIO sync failed')
    expect(described.userActionable).toBe(false)
  })
})

describe('FioApiError.fromResponse', () => {
  it('includes the status code when FIO sends an empty statusText', async () => {
    // This is the real 401 shape from FIO: no statusText, no body.
    const response = new Response('', { status: 401, statusText: '' })
    const error = await FioApiError.fromResponse(response)

    expect(error.statusCode).toBe(401)
    expect(error.message).toContain('401')
    expect(classifyFioError(error)).toBe('invalid_credentials')
  })

  it('uses the response body when statusText is empty but a body exists', async () => {
    const response = new Response('Invalid API key', { status: 401, statusText: '' })
    const error = await FioApiError.fromResponse(response)

    expect(error.message).toContain('Invalid API key')
  })
})
