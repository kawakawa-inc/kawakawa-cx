#!/usr/bin/env tsx
// Standalone batch process runner for deployment jobs.
// Runs all registered batch processes (migrations, cleanup, etc.)
// and exits. Follows the same pattern as db-init-idempotent.ts.

import { client } from '../db/index.js'
import { runBatchProcesses, batchProcesses } from '../services/batch/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'run-batch' })

async function main() {
  log.info({ processCount: batchProcesses.length }, 'Running batch processes')

  try {
    const result = await runBatchProcesses(batchProcesses)

    if (result.failed.length > 0) {
      log.error({ failed: result.failed }, 'Some batch processes failed')
      process.exit(1)
    }

    log.info({ ran: result.ran.length, skipped: result.skipped.length }, 'Batch processes complete')
  } finally {
    await client.end()
  }
}

main().catch(async error => {
  log.error({ err: error }, 'Batch runner failed')
  try {
    await client.end()
  } catch {
    // Ignore connection close errors
  }
  process.exit(1)
})
