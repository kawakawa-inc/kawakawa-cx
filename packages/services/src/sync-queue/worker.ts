// Sync queue worker — single-threaded polling loop with row-level locking.
//
// `SELECT ... FOR UPDATE SKIP LOCKED` is used so that if we ever scale to
// multiple API instances, they won't race for the same job.

import { db, syncJobs } from '@kawakawa/db'
import { eq, isNull, sql } from 'drizzle-orm'
import { createLogger } from '../utils/logger.js'
import { handleJob, onJobDone } from './handlers.js'
import * as notificationService from '../notifications/notification-service.js'

const log = createLogger({ service: 'sync-queue', entity: 'worker' })

const POLL_INTERVAL_MS = 2_000
const INTER_JOB_DELAY_MS = 200 // brief cooldown between jobs to avoid hammering FIO
const RETRY_BASE_MS = 10_000 // base * 2^(attempts-1): 10s, 20s, 40s

let running = false
let wakeUpResolver: (() => void) | null = null
let loopPromise: Promise<void> | null = null

/** Poke the worker so it picks up a new job immediately. */
export function wakeWorker(): void {
  if (wakeUpResolver) {
    wakeUpResolver()
    wakeUpResolver = null
  }
}

/**
 * Stop the worker. Returns a promise that resolves once the loop has fully
 * exited — immediately if the queue is idle, or after the in-flight job
 * completes if one is running.
 */
export function stopWorker(): Promise<void> {
  running = false
  wakeWorker()
  return loopPromise ?? Promise.resolve()
}

/** Start the worker loop. Call once on API boot. */
export function startWorker(): void {
  if (running) {
    log.warn('Worker already running')
    return
  }
  running = true
  log.info('Sync queue worker started')
  loopPromise = loop()
}

async function loop(): Promise<void> {
  while (running) {
    try {
      const ran = await tryProcessOne()
      await sleepOrWake(ran ? INTER_JOB_DELAY_MS : POLL_INTERVAL_MS)
    } catch (err) {
      log.error({ err }, 'Worker loop error')
      await sleepOrWake(POLL_INTERVAL_MS)
    }
  }
  log.info('Sync queue worker stopped')
}

function sleepOrWake(ms: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      wakeUpResolver = null
      resolve()
    }, ms)
    wakeUpResolver = () => {
      clearTimeout(timer)
      resolve()
    }
  })
}

/**
 * Claim the next ready job (if any) and process it. Returns true if a job
 * was claimed (so the loop should immediately check for more work), false
 * if the queue was empty (so the loop should sleep).
 */
async function tryProcessOne(): Promise<boolean> {
  const claimed = await db.transaction(async tx => {
    const [next] = await tx.execute<{ id: number }>(sql`
      SELECT id FROM sync_jobs
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY priority DESC, next_attempt_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `)
    if (!next) return null

    await tx
      .update(syncJobs)
      .set({
        status: 'running',
        startedAt: new Date(),
        attempts: sql`${syncJobs.attempts} + 1`,
      })
      .where(eq(syncJobs.id, next.id))

    const [job] = await tx.select().from(syncJobs).where(eq(syncJobs.id, next.id))
    return job
  })

  if (!claimed) return false

  log.info(
    {
      jobId: claimed.id,
      jobType: claimed.jobType,
      userId: claimed.userId,
      attempt: claimed.attempts,
    },
    'Processing job'
  )

  try {
    await handleJob(claimed)
    await markDone(claimed.id)
    await onJobDone(claimed)

    if (claimed.notifyOnComplete && claimed.userId) {
      await notificationService.create(
        claimed.userId,
        'sync_completed',
        'FIO sync complete',
        describeJob(claimed),
        { jobId: claimed.id, jobType: claimed.jobType }
      )
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log.warn({ jobId: claimed.id, err: errMsg }, 'Job failed')
    await handleFailure(claimed, errMsg)
  }

  return true
}

async function markDone(jobId: number): Promise<void> {
  await db
    .update(syncJobs)
    .set({ status: 'done', finishedAt: new Date(), error: null })
    .where(eq(syncJobs.id, jobId))
}

async function handleFailure(job: typeof syncJobs.$inferSelect, errMsg: string): Promise<void> {
  const finalAttempt = job.attempts >= job.maxAttempts
  if (finalAttempt) {
    await db
      .update(syncJobs)
      .set({ status: 'failed', finishedAt: new Date(), error: errMsg })
      .where(eq(syncJobs.id, job.id))

    if (job.userId && job.source === 'user') {
      await notificationService.create(
        job.userId,
        'sync_failed',
        'FIO sync failed',
        `${describeJob(job)}: ${errMsg}`,
        { jobId: job.id, jobType: job.jobType }
      )
    }
    return
  }

  // Schedule retry with exponential backoff: base * 2^(attempts-1)
  const backoffMs = RETRY_BASE_MS * Math.pow(2, job.attempts - 1)
  await db
    .update(syncJobs)
    .set({
      status: 'pending',
      startedAt: null,
      error: errMsg,
      nextAttemptAt: new Date(Date.now() + backoffMs),
    })
    .where(eq(syncJobs.id, job.id))
  log.info({ jobId: job.id, attempt: job.attempts, backoffMs }, 'Job scheduled for retry')
}

function describeJob(job: typeof syncJobs.$inferSelect): string {
  switch (job.jobType) {
    case 'user-inventory':
      return 'Inventory sync'
    case 'user-planets-list':
      return 'Planet list sync'
    case 'planet-detail': {
      const p = (job.payload as Record<string, unknown>)?.planetNaturalId
      return `Planet detail ${p ?? ''}`.trim()
    }
    case 'cache-recompute':
      return 'Burn/repair cache recompute'
    case 'commodities':
      return 'Commodities sync'
    case 'locations':
      return 'Locations sync'
    case 'stations':
      return 'Stations sync'
    case 'user-ships':
      return 'Ships sync'
  }
}

// Unused import helper to silence lint when isNull not consumed
void isNull
