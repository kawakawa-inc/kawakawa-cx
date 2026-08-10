// Classification of FIO sync failures.
//
// The worker persists a `FioErrorCode` alongside the raw error text so the
// frontend can render something a member can act on ("your API key was
// rejected") instead of the raw string ("FIO API request failed (HTTP 401)").
//
// Two things are derived from the code:
//   1. Whether the job is worth retrying. A revoked API key will fail
//      identically on every attempt, so burning three attempts plus backoff on
//      it is pure waste — and it delays the notification that tells the user
//      to fix it.
//   2. What the user is told, via describeFioError().

import type { FioErrorCode, FioSyncError } from '@kawakawa/types'
import { FIO_USER_ACTIONABLE_ERROR_CODES } from '@kawakawa/types'
import { FioApiError } from './client.js'

/**
 * Error raised by sync code when it already knows the classification —
 * e.g. "this user has no credentials", which never touches the network.
 */
export class FioSyncFailure extends Error {
  constructor(
    message: string,
    public code: FioErrorCode
  ) {
    super(message)
    this.name = 'FioSyncFailure'
  }
}

/**
 * Codes that will fail identically on retry. The worker marks these failed on
 * the first attempt rather than working through its backoff schedule.
 *
 * Note this is deliberately *not* the same set as
 * FIO_USER_ACTIONABLE_ERROR_CODES: `data` errors aren't user-actionable but
 * are still deterministic, and `rate_limited` is very much worth retrying.
 */
const NON_RETRYABLE_CODES: ReadonlySet<FioErrorCode> = new Set<FioErrorCode>([
  'no_credentials',
  'invalid_credentials',
  'not_found',
  'data',
])

/** Whether a failure with this code is worth another attempt. */
export function isRetryableFioError(code: FioErrorCode): boolean {
  return !NON_RETRYABLE_CODES.has(code)
}

/**
 * Map an arbitrary thrown value to a FioErrorCode.
 *
 * HTTP status is the strongest signal, so it is checked first. The string
 * matching below is a fallback for errors that reach us as plain `Error`s —
 * notably the `result.errors[]` arrays the sync-* modules join into a single
 * message, and Node's fetch failures.
 */
export function classifyFioError(err: unknown): FioErrorCode {
  if (err instanceof FioSyncFailure) return err.code

  if (err instanceof FioApiError && err.statusCode !== undefined) {
    const status = err.statusCode
    if (status === 401 || status === 403) return 'invalid_credentials'
    if (status === 404) return 'not_found'
    if (status === 429) return 'rate_limited'
    if (status >= 500) return 'fio_unavailable'
    // Other 4xx: we sent something FIO didn't like. Not the user's problem
    // and not fixable by retrying, but we don't have a better bucket.
    if (status >= 400) return 'unknown'
  }

  const message = (err instanceof Error ? err.message : String(err)).toLowerCase()

  if (message.includes('no fio credentials')) return 'no_credentials'
  if (message.includes('http 401') || message.includes('http 403')) return 'invalid_credentials'
  if (message.includes('http 429')) return 'rate_limited'
  if (/http 5\d\d/.test(message)) return 'fio_unavailable'
  if (
    message.includes('fetch failed') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('network')
  ) {
    return 'network'
  }

  return 'unknown'
}

/** Human-readable summaries. Keep these free of jargon and FIO internals. */
const DESCRIPTIONS: Record<FioErrorCode, { title: string; detail: string }> = {
  no_credentials: {
    title: 'FIO credentials not set',
    detail: 'Add your FIO username and API key in Account → FIO to start syncing your inventory.',
  },
  invalid_credentials: {
    title: 'FIO rejected your API key',
    detail:
      'Your FIO API key is no longer valid — it was most likely revoked or regenerated. Issue a new key at fio.fnar.net/settings and save it in Account → FIO.',
  },
  not_found: {
    title: 'FIO username not found',
    detail:
      "FIO has no data for this username. Check the spelling in Account → FIO, and make sure you've uploaded data to FIO at least once from the game.",
  },
  rate_limited: {
    title: 'FIO is rate limiting us',
    detail: 'Too many requests were sent to FIO. The sync will retry automatically shortly.',
  },
  fio_unavailable: {
    title: 'FIO is unavailable',
    detail:
      'FIO returned a server error. This is on their end, not yours — the sync will retry automatically.',
  },
  network: {
    title: "Couldn't reach FIO",
    detail: 'FIO could not be contacted. The sync will retry automatically.',
  },
  data: {
    title: 'FIO data could not be saved',
    detail:
      'We reached FIO but part of the response could not be stored. This usually clears on the next sync; if it persists, report it.',
  },
  unknown: {
    title: 'FIO sync failed',
    detail: 'Something went wrong during the sync. It will retry automatically.',
  },
}

/**
 * Build the user-facing payload for a failed job. `rawMessage` is carried
 * through for diagnostics but the UI leads with title/detail.
 */
export function describeFioError(params: {
  code: FioErrorCode
  jobType: string
  rawMessage: string | null
  failedAt: Date
}): FioSyncError {
  const { title, detail } = DESCRIPTIONS[params.code] ?? DESCRIPTIONS.unknown
  return {
    code: params.code,
    title,
    detail,
    userActionable: FIO_USER_ACTIONABLE_ERROR_CODES.includes(params.code),
    jobType: params.jobType,
    rawMessage: params.rawMessage,
    failedAt: params.failedAt.toISOString(),
  }
}
