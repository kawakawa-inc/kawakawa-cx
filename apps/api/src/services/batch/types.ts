/**
 * Batch process framework types.
 *
 * A batch process is a one-time or idempotent task that runs at deployment.
 * Examples: data migrations, cleanup jobs, backfills.
 */

export interface BatchResult {
  /** Number of items processed */
  processed: number
  /** Number of items skipped (already done, not applicable, etc.) */
  skipped: number
  /** Errors encountered (non-fatal) */
  errors: string[]
}

export interface BatchProcess {
  /** Unique identifier for this batch process (used for tracking) */
  id: string
  /** Human-readable description */
  description: string
  /**
   * Check whether this batch process needs to run.
   * Return false to skip entirely (e.g., nothing to migrate).
   */
  shouldRun: () => Promise<boolean>
  /**
   * Execute the batch process.
   * Should be idempotent — safe to run multiple times.
   */
  execute: () => Promise<BatchResult>
}
