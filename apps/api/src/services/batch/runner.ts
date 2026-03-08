/**
 * Batch process runner.
 *
 * Discovers and runs registered batch processes at deployment.
 * Each process is checked via shouldRun() before executing.
 */
import { createLogger } from '../../utils/logger.js'
import type { BatchProcess, BatchResult } from './types.js'

const logger = createLogger({ module: 'batch-runner' })

export interface RunnerResult {
  ran: { id: string; result: BatchResult }[]
  skipped: string[]
  failed: { id: string; error: string }[]
}

/**
 * Run all registered batch processes sequentially.
 * Processes are run in order — each must complete before the next starts.
 * Failures in one process do not prevent others from running.
 */
export async function runBatchProcesses(processes: BatchProcess[]): Promise<RunnerResult> {
  const result: RunnerResult = { ran: [], skipped: [], failed: [] }

  if (processes.length === 0) return result

  logger.info({ count: processes.length }, 'Starting batch processes')

  for (const process of processes) {
    try {
      const needs = await process.shouldRun()
      if (!needs) {
        result.skipped.push(process.id)
        logger.debug({ id: process.id }, 'Batch process skipped (not needed)')
        continue
      }

      logger.info({ id: process.id, description: process.description }, 'Running batch process')
      const batchResult = await process.execute()
      result.ran.push({ id: process.id, result: batchResult })

      if (batchResult.errors.length > 0) {
        logger.warn(
          { id: process.id, errors: batchResult.errors },
          `Batch process completed with ${batchResult.errors.length} error(s)`
        )
      } else {
        logger.info(
          { id: process.id, processed: batchResult.processed, skipped: batchResult.skipped },
          'Batch process completed'
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.failed.push({ id: process.id, error: message })
      logger.error({ id: process.id, error }, 'Batch process failed')
    }
  }

  const summary = {
    ran: result.ran.length,
    skipped: result.skipped.length,
    failed: result.failed.length,
  }
  logger.info(summary, 'Batch processes complete')

  return result
}
