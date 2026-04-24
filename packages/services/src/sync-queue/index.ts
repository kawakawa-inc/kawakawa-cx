// Centralized FIO sync queue.
//
// Everything FIO-bound — user syncs and global syncs alike — is enqueued here
// and processed serially by a single worker so we don't parallel-slam the FIO
// API. Jobs are persisted in `sync_jobs`, retried with exponential backoff,
// and can notify the requester on completion/failure.
//
// Public surface:
//   - enqueue(...)           — insert (or dedup) a job
//   - startWorker()          — start the polling loop (call once on API boot)
//   - wakeWorker()           — poke the worker when a new job arrives
//   - enqueueUserFullSync()  — convenience: enqueues inventory + planets-list
//   - enqueueGlobalSyncs()   — convenience: enqueues commodities/locations/stations

export {
  enqueue,
  enqueueUserFullSync,
  enqueueGlobalSyncs,
  type EnqueueInput,
  type JobType,
  type JobSource,
} from './enqueue.js'
export { startWorker, stopWorker, wakeWorker } from './worker.js'
export { startScheduler, stopScheduler } from './scheduler.js'
