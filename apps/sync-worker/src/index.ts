// FIO sync-worker daemon entrypoint.
//
// Runs the sync queue worker + scheduler in its own process so FIO-bound
// work is serialized through one processor and can be scaled or stopped
// independently of the API.
//
// Both the worker and scheduler live in `@kawakawa/services/sync-queue`; this
// app is just the runtime that calls `startWorker()` and `startScheduler()`
// and keeps the process alive.

import {
  startWorker,
  startScheduler,
  stopWorker,
  stopScheduler,
} from '@kawakawa/services/sync-queue'
import { createLogger } from '@kawakawa/services/utils'

const log = createLogger({ service: 'sync-worker' })

if (!process.env.DATABASE_URL) {
  log.fatal('DATABASE_URL is not set — sync-worker cannot start')
  process.exit(1)
}

log.info(
  {
    nodeEnv: process.env.NODE_ENV,
    userIntervalMs: process.env.SYNC_USER_INTERVAL_MS,
    globalIntervalMs: process.env.SYNC_GLOBAL_INTERVAL_MS,
  },
  'Starting sync-worker daemon'
)

startWorker()
startScheduler()

// Graceful shutdown — finish the in-flight job (if any) before exit.
function shutdown(signal: string): void {
  log.info({ signal }, 'Shutdown signal received, stopping worker and scheduler')
  stopScheduler()
  stopWorker()
  // Give in-flight work ~10s to complete, then exit.
  setTimeout(() => {
    log.info('Exiting')
    process.exit(0)
  }, 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Keep the event loop alive — the worker loop uses setTimeout between polls,
// which would otherwise leave nothing pinning the process open once idle.
setInterval(() => {
  /* noop keep-alive */
}, 60_000)
