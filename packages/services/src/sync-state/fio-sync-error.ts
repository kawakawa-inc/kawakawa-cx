// Reads the "current FIO error" for a user out of the sync_jobs history.
//
// There is no separate error table: `sync_jobs` already records the outcome of
// every sync, so the current error state is simply "did the user's most recent
// terminal job fail?". That means the error clears itself the moment a later
// sync succeeds — no extra bookkeeping to get out of step with reality.

import type { FioSyncError, FioErrorCode } from '@kawakawa/types'
import { db, syncJobs } from '@kawakawa/db'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { describeFioError } from '../fio/fio-error.js'

/**
 * Job types whose failure is worth telling the user about.
 *
 * Deliberately excludes `planet-detail`: a user with 30 planets produces 30
 * child jobs, and one of them failing shouldn't put a scary banner over their
 * whole inventory. The parent `user-planets-list` job already covers the case
 * where the fan-out itself couldn't happen.
 */
export const USER_FACING_JOB_TYPES = ['user-inventory', 'user-planets-list', 'user-ships'] as const

type TerminalJobRow = {
  jobType: string
  status: string
  error: string | null
  errorCode: string | null
  finishedAt: Date | null
}

/** Convert a terminal job row into a user-facing error, or null if it succeeded. */
function toFioSyncError(row: TerminalJobRow | undefined): FioSyncError | null {
  if (!row || row.status !== 'failed' || !row.finishedAt) return null

  return describeFioError({
    code: (row.errorCode as FioErrorCode | null) ?? 'unknown',
    jobType: row.jobType,
    rawMessage: row.error,
    failedAt: row.finishedAt,
  })
}

/**
 * The user's most recent FIO sync failure, or null if their last sync worked.
 *
 * Only terminal (done/failed) jobs are considered. A job that is mid-retry has
 * an `error` set but is not a failure yet, and surfacing it would flash a
 * warning that resolves itself seconds later.
 */
export async function getFioSyncError(userId: number): Promise<FioSyncError | null> {
  const [latest] = await db
    .select({
      jobType: syncJobs.jobType,
      status: syncJobs.status,
      error: syncJobs.error,
      errorCode: syncJobs.errorCode,
      finishedAt: syncJobs.finishedAt,
    })
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.userId, userId),
        inArray(syncJobs.jobType, [...USER_FACING_JOB_TYPES]),
        inArray(syncJobs.status, ['done', 'failed']),
        isNotNull(syncJobs.finishedAt)
      )
    )
    .orderBy(desc(syncJobs.finishedAt))
    .limit(1)

  return toFioSyncError(latest)
}

/**
 * Batched version of getFioSyncError for the admin user list.
 *
 * Uses DISTINCT ON to pull each user's latest terminal job in one round trip —
 * the per-user variant in a loop would be one query per row on every page load.
 * Users whose last sync succeeded are simply absent from the map.
 */
export async function getFioSyncErrorsForUsers(
  userIds: number[]
): Promise<Map<number, FioSyncError>> {
  const result = new Map<number, FioSyncError>()
  if (userIds.length === 0) return result

  const rows = await db.execute<{
    user_id: number
    job_type: string
    status: string
    error: string | null
    error_code: string | null
    finished_at: Date | null
  }>(sql`
    SELECT DISTINCT ON (user_id)
      user_id, job_type, status, error, error_code, finished_at
    FROM sync_jobs
    WHERE user_id IN ${userIds}
      AND job_type IN ${[...USER_FACING_JOB_TYPES]}
      AND status IN ('done', 'failed')
      AND finished_at IS NOT NULL
    ORDER BY user_id, finished_at DESC
  `)

  for (const row of rows) {
    const described = toFioSyncError({
      jobType: row.job_type,
      status: row.status,
      error: row.error,
      errorCode: row.error_code,
      finishedAt: row.finished_at ? new Date(row.finished_at) : null,
    })
    if (described) result.set(row.user_id, described)
  }

  return result
}
