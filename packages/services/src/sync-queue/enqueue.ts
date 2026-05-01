// Enqueue logic — dedup + priority-upgrade + child-fanout.

import { db, syncJobs } from '@kawakawa/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { createLogger } from '../utils/logger.js'
import { wakeWorker } from './worker.js'
import * as notificationService from '../notifications/notification-service.js'

const log = createLogger({ service: 'sync-queue', entity: 'enqueue' })

export type JobType =
  | 'user-inventory'
  | 'user-planets-list'
  | 'planet-detail'
  | 'cache-recompute'
  | 'commodities'
  | 'locations'
  | 'stations'
  | 'user-ships'

export type JobSource = 'user' | 'system'

export interface EnqueueInput {
  jobType: JobType
  userId?: number | null
  payload?: Record<string, unknown>
  source?: JobSource
  priority?: number
  parentJobId?: number | null
  notifyOnComplete?: boolean
  /**
   * Fire a "sync queued" notification to the user when a NEW job is inserted
   * (not when this enqueue call dedups into an existing job). Silent for
   * system-scheduled work and child jobs.
   */
  notifyOnQueue?: boolean
}

const PRIORITY_DEFAULTS: Record<JobSource, number> = {
  user: 200,
  system: 100,
}

/**
 * Build a dedup signature for (userId, jobType, payload).
 * Currently only the planetNaturalId field on planet-detail payloads matters;
 * other job types are deduped purely by (userId, jobType).
 */
function payloadSignature(jobType: JobType, payload: Record<string, unknown>): string | null {
  if (jobType === 'planet-detail') {
    const id = payload.planetNaturalId
    return typeof id === 'string' ? id : null
  }
  return null
}

/**
 * Enqueue a job, collapsing duplicates. If an unfinished job already exists
 * for (userId, jobType, payload-signature), we:
 *  1. Bump its priority if the new request is higher priority,
 *  2. Set notifyOnComplete=true if the new request wants notification,
 * and return that existing job's ID.
 */
export async function enqueue(input: EnqueueInput): Promise<number> {
  const source = input.source ?? 'system'
  const priority = input.priority ?? PRIORITY_DEFAULTS[source]
  const payload = input.payload ?? {}
  const sig = payloadSignature(input.jobType, payload)

  // Find an existing unfinished job matching this signature
  const existingRows = await db
    .select()
    .from(syncJobs)
    .where(
      and(
        input.userId !== undefined && input.userId !== null
          ? eq(syncJobs.userId, input.userId)
          : sql`${syncJobs.userId} IS NULL`,
        eq(syncJobs.jobType, input.jobType),
        inArray(syncJobs.status, ['pending', 'running'])
      )
    )

  const match = existingRows.find(row => {
    if (sig === null) return true
    const rowSig = payloadSignature(input.jobType, (row.payload ?? {}) as Record<string, unknown>)
    return rowSig === sig
  })

  if (match) {
    const updates: Partial<typeof syncJobs.$inferInsert> = {}
    if (priority > match.priority) updates.priority = priority
    if (input.notifyOnComplete && !match.notifyOnComplete) updates.notifyOnComplete = true
    if (Object.keys(updates).length > 0) {
      await db.update(syncJobs).set(updates).where(eq(syncJobs.id, match.id))
      log.info({ jobId: match.id, updates }, 'Upgraded existing queued job')
    } else {
      log.debug({ jobId: match.id }, 'Duplicate enqueue ignored')
    }
    return match.id
  }

  const [inserted] = await db
    .insert(syncJobs)
    .values({
      jobType: input.jobType,
      userId: input.userId ?? null,
      payload,
      priority,
      source,
      parentJobId: input.parentJobId ?? null,
      notifyOnComplete: input.notifyOnComplete ?? false,
    })
    .returning({ id: syncJobs.id })

  log.info(
    {
      jobId: inserted.id,
      jobType: input.jobType,
      userId: input.userId,
      source,
      priority,
    },
    'Enqueued job'
  )

  if (input.notifyOnQueue && input.userId) {
    await notificationService.create(
      input.userId,
      'sync_queued',
      'FIO sync queued',
      describeJobType(input.jobType),
      { jobId: inserted.id, jobType: input.jobType }
    )
  }

  wakeWorker()
  return inserted.id
}

function describeJobType(jobType: JobType): string {
  switch (jobType) {
    case 'user-inventory':
      return "We're syncing your FIO inventory"
    case 'user-planets-list':
      return "We're syncing your planet data"
    case 'planet-detail':
      return "We're syncing a planet's details"
    case 'cache-recompute':
      return "We're refreshing your burn/repair numbers"
    case 'commodities':
      return "We're syncing the commodity catalog"
    case 'locations':
      return "We're syncing locations"
    case 'stations':
      return "We're syncing stations"
    case 'user-ships':
      return "We're syncing your ships"
  }
}

/**
 * Convenience: enqueue the kickoff jobs for a full user sync.
 * (Inventory + planets-list; planets-list fans out planet-detail jobs
 * which fan out a cache-recompute job.)
 */
export async function enqueueUserFullSync(
  userId: number,
  options: { source?: JobSource; notify?: boolean } = {}
): Promise<{ inventoryJobId: number; planetsJobId: number; shipsJobId: number }> {
  const source = options.source ?? 'user'
  const notify = options.notify ?? source === 'user'

  // Fire the "queued" notification only once (on the inventory job) —
  // otherwise a single sync would generate multiple "queued" notifications.
  const [inventoryJobId, planetsJobId, shipsJobId] = await Promise.all([
    enqueue({
      jobType: 'user-inventory',
      userId,
      source,
      notifyOnComplete: notify,
      notifyOnQueue: notify,
    }),
    enqueue({
      jobType: 'user-planets-list',
      userId,
      source,
      notifyOnComplete: notify,
    }),
    enqueue({
      jobType: 'user-ships',
      userId,
      source,
      // Ship sync is small and silent — don't add a notification.
      notifyOnComplete: false,
    }),
  ])
  return { inventoryJobId, planetsJobId, shipsJobId }
}

/**
 * Convenience: enqueue all three global syncs.
 */
export async function enqueueGlobalSyncs(options: { source?: JobSource } = {}): Promise<number[]> {
  const source = options.source ?? 'system'
  return Promise.all([
    enqueue({ jobType: 'commodities', source }),
    enqueue({ jobType: 'locations', source }),
    enqueue({ jobType: 'stations', source }),
  ])
}
