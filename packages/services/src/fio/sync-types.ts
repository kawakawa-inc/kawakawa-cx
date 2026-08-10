// Shared types for FIO sync operations

import type { FioErrorCode } from '@kawakawa/types'

export interface SyncResult {
  success: boolean
  inserted: number
  updated: number
  errors: string[]
  /**
   * Classification of why the sync failed, when `errors` is non-empty.
   *
   * Set by the sync module because only it knows whether a failure came from
   * FIO (auth, availability) or from storing the response locally. Callers
   * that re-throw should carry this through so the worker doesn't have to
   * re-derive it from a joined error string.
   */
  errorCode?: FioErrorCode
}
