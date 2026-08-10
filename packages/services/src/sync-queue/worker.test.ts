// Tests for the worker's failure handling: retry vs fail-fast, the persisted
// error code, and who gets notified. This is the path that decides whether a
// member with a revoked FIO key ever finds out.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateSet = vi.fn()

/**
 * Rows the mocked "existing unread notification" lookup returns.
 * A mutable holder rather than a mockReturnValue, because the chain is
 * rebuilt on every call and would otherwise clobber per-test setup.
 */
let unreadNotificationRows: unknown[] = []

vi.mock('@kawakawa/db', () => ({
  db: {
    update: vi.fn(() => ({
      set: (patch: unknown) => {
        updateSet(patch)
        return { where: vi.fn().mockResolvedValue(undefined) }
      },
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => unreadNotificationRows),
        })),
      })),
    })),
    transaction: vi.fn(),
  },
  syncJobs: { id: 'id', attempts: 'attempts' },
  notifications: { id: 'id', userId: 'user_id', type: 'type', isRead: 'is_read', data: 'data' },
}))

const createNotification = vi.fn()
vi.mock('../notifications/notification-service.js', () => ({
  create: (...args: unknown[]) => createNotification(...args),
}))

vi.mock('./handlers.js', () => ({
  handleJob: vi.fn(),
  onJobDone: vi.fn(),
}))

import { __testing } from './worker.js'
import { FioSyncFailure } from '../fio/fio-error.js'
import { FioApiError } from '../fio/client.js'

const { handleFailure } = __testing

function job(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    jobType: 'user-inventory',
    userId: 5,
    source: 'user',
    attempts: 1,
    maxAttempts: 3,
    payload: {},
    ...overrides,
  } as never
}

describe('worker handleFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unreadNotificationRows = []
  })

  describe('retry policy', () => {
    it('schedules a retry for a transient failure with attempts left', async () => {
      await handleFailure(job({ attempts: 1 }), 'FIO down', 'fio_unavailable')

      const patch = updateSet.mock.calls[0][0]
      expect(patch.status).toBe('pending')
      expect(patch.errorCode).toBe('fio_unavailable')
      expect(patch.nextAttemptAt).toBeInstanceOf(Date)
    })

    it('gives up on a transient failure once attempts are exhausted', async () => {
      await handleFailure(job({ attempts: 3, maxAttempts: 3 }), 'FIO down', 'fio_unavailable')

      expect(updateSet.mock.calls[0][0].status).toBe('failed')
    })

    it('fails immediately on a revoked API key instead of burning retries', async () => {
      // The whole point: an invalid key fails identically every time, so
      // retrying just delays telling the user.
      await handleFailure(job({ attempts: 1, maxAttempts: 3 }), 'HTTP 401', 'invalid_credentials')

      const patch = updateSet.mock.calls[0][0]
      expect(patch.status).toBe('failed')
      expect(patch.errorCode).toBe('invalid_credentials')
      expect(patch.finishedAt).toBeInstanceOf(Date)
    })

    it('fails immediately when credentials are missing', async () => {
      await handleFailure(job({ attempts: 1 }), 'no creds', 'no_credentials')

      expect(updateSet.mock.calls[0][0].status).toBe('failed')
    })

    it('still retries rate limiting, which does resolve on its own', async () => {
      await handleFailure(job({ attempts: 1 }), 'slow down', 'rate_limited')

      expect(updateSet.mock.calls[0][0].status).toBe('pending')
    })

    it('backs off exponentially', async () => {
      const before = Date.now()
      await handleFailure(job({ attempts: 2 }), 'FIO down', 'network')

      const delay = (updateSet.mock.calls[0][0].nextAttemptAt as Date).getTime() - before
      // base 10s * 2^(2-1) = 20s
      expect(delay).toBeGreaterThanOrEqual(19_000)
      expect(delay).toBeLessThanOrEqual(21_000)
    })
  })

  describe('notifications', () => {
    it('notifies the user with a friendly title, not the raw FIO error', async () => {
      await handleFailure(job({ source: 'user' }), 'HTTP 401: ', 'invalid_credentials')

      expect(createNotification).toHaveBeenCalledTimes(1)
      const [userId, type, title, detail, data] = createNotification.mock.calls[0]
      expect(userId).toBe(5)
      expect(type).toBe('sync_failed')
      expect(title).toBe('FIO rejected your API key')
      expect(detail).toContain('fio.fnar.net')
      expect(data).toMatchObject({ errorCode: 'invalid_credentials', userActionable: true })
    })

    it('notifies for system-scheduled syncs too', async () => {
      // Previously these were silent, so auto-sync users never learned their
      // key had been revoked.
      await handleFailure(job({ source: 'system' }), 'HTTP 401', 'invalid_credentials')

      expect(createNotification).toHaveBeenCalledTimes(1)
    })

    it('suppresses duplicate system notifications while one is unread', async () => {
      unreadNotificationRows = [{ id: 1 }]

      await handleFailure(job({ source: 'system' }), 'HTTP 401', 'invalid_credentials')

      expect(createNotification).not.toHaveBeenCalled()
    })

    it('always notifies user-requested syncs, even with an unread duplicate', async () => {
      // The UI waits on this notification to stop its spinner.
      unreadNotificationRows = [{ id: 1 }]

      await handleFailure(job({ source: 'user' }), 'HTTP 401', 'invalid_credentials')

      expect(createNotification).toHaveBeenCalledTimes(1)
    })

    it('does not notify on a retry, only on the final failure', async () => {
      await handleFailure(job({ attempts: 1 }), 'FIO down', 'fio_unavailable')

      expect(createNotification).not.toHaveBeenCalled()
    })

    it('skips notification when the job has no user (global sync)', async () => {
      await handleFailure(job({ userId: null, source: 'system' }), 'boom', 'fio_unavailable')

      expect(createNotification).not.toHaveBeenCalled()
    })
  })
})

describe('worker error classification wiring', () => {
  it('classifies a FIO 401 thrown by the client as invalid_credentials', () => {
    expect(__testing.classify(new FioApiError('x', 401))).toBe('invalid_credentials')
  })

  it('preserves a code carried by FioSyncFailure', () => {
    expect(__testing.classify(new FioSyncFailure('x', 'data'))).toBe('data')
  })
})
