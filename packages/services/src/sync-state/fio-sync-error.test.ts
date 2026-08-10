import { describe, it, expect, vi, beforeEach } from 'vitest'

let latestJobRows: unknown[] = []

vi.mock('@kawakawa/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => latestJobRows),
          })),
        })),
      })),
    })),
    execute: vi.fn(async () => latestJobRows),
  },
  syncJobs: {
    userId: 'user_id',
    jobType: 'job_type',
    status: 'status',
    error: 'error',
    errorCode: 'error_code',
    finishedAt: 'finished_at',
  },
}))

import { getFioSyncError, getFioSyncErrorsForUsers } from './fio-sync-error.js'

describe('getFioSyncError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    latestJobRows = []
  })

  it('returns null when the user has never synced', async () => {
    latestJobRows = []
    expect(await getFioSyncError(1)).toBeNull()
  })

  it('returns null when the most recent sync succeeded', async () => {
    // The key behaviour: a later success clears a previous failure, so the
    // banner disappears on its own once the user fixes their key.
    latestJobRows = [
      {
        jobType: 'user-inventory',
        status: 'done',
        error: null,
        errorCode: null,
        finishedAt: new Date(),
      },
    ]

    expect(await getFioSyncError(1)).toBeNull()
  })

  it('describes the failure when the most recent sync failed', async () => {
    latestJobRows = [
      {
        jobType: 'user-inventory',
        status: 'failed',
        error: 'FIO API request failed (HTTP 401): no details',
        errorCode: 'invalid_credentials',
        finishedAt: new Date('2026-03-04T05:06:07.000Z'),
      },
    ]

    const error = await getFioSyncError(1)

    expect(error).toMatchObject({
      code: 'invalid_credentials',
      userActionable: true,
      jobType: 'user-inventory',
      failedAt: '2026-03-04T05:06:07.000Z',
    })
  })

  it('falls back to unknown for rows written before error codes existed', async () => {
    latestJobRows = [
      {
        jobType: 'user-inventory',
        status: 'failed',
        error: 'some legacy failure',
        errorCode: null,
        finishedAt: new Date(),
      },
    ]

    expect((await getFioSyncError(1))?.code).toBe('unknown')
  })
})

describe('getFioSyncErrorsForUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    latestJobRows = []
  })

  it('returns an empty map for no users without querying', async () => {
    const { db } = await import('@kawakawa/db')
    const result = await getFioSyncErrorsForUsers([])

    expect(result.size).toBe(0)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('maps only the users whose latest sync failed', async () => {
    latestJobRows = [
      {
        user_id: 1,
        job_type: 'user-inventory',
        status: 'failed',
        error: 'HTTP 401',
        error_code: 'invalid_credentials',
        finished_at: new Date('2026-03-04T00:00:00.000Z'),
      },
      {
        user_id: 2,
        job_type: 'user-inventory',
        status: 'done',
        error: null,
        error_code: null,
        finished_at: new Date(),
      },
    ]

    const result = await getFioSyncErrorsForUsers([1, 2])

    expect(result.size).toBe(1)
    expect(result.get(1)?.code).toBe('invalid_credentials')
    expect(result.has(2)).toBe(false)
  })
})
