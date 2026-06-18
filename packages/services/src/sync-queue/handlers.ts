// Per-job-type handlers. Each handler:
//  1. Does its FIO work (throws on failure so worker can retry)
//  2. May return follow-up actions via onJobDone fanout
//
// Keep these thin — delegate real work to the existing sync-* modules.

import { db, syncJobs, users } from '@kawakawa/db'
import { eq, and, inArray, ne } from 'drizzle-orm'
import { FioClient } from '../fio/client.js'
import { syncUserInventory } from '../fio/sync-user-inventory.js'
import { syncUserPlanetsList, syncSinglePlanet } from '../fio/sync-user-planets.js'
import { syncUserShips } from '../fio/sync-user-ships.js'
import { syncCommodities } from '../fio/sync-commodities.js'
import { syncLocations } from '../fio/sync-locations.js'
import { syncStations } from '../fio/sync-stations.js'
import { computeBurnRepairCache } from '../burn-repair/burn-repair-cache.js'
import * as userSettingsService from '../user-settings/user-settings-service.js'
import { enqueue } from './enqueue.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'sync-queue', entity: 'handlers' })

type SyncJob = typeof syncJobs.$inferSelect

export async function handleJob(job: SyncJob): Promise<void> {
  switch (job.jobType) {
    case 'user-inventory':
      return handleUserInventory(job)
    case 'user-planets-list':
      return handleUserPlanetsList(job)
    case 'planet-detail':
      return handlePlanetDetail(job)
    case 'cache-recompute':
      return handleCacheRecompute(job)
    case 'commodities':
      return handleCommodities()
    case 'locations':
      return handleLocations()
    case 'stations':
      return handleStations()
    case 'user-ships':
      return handleUserShips(job)
  }
}

/**
 * Called after a job finishes successfully. Fans out child jobs
 * or follow-up jobs (e.g. cache recompute after all planet-detail done).
 */
export async function onJobDone(job: SyncJob): Promise<void> {
  if (job.jobType === 'user-planets-list') {
    // Children were enqueued inline by handleUserPlanetsList.
    return
  }

  if (job.jobType === 'planet-detail' && job.parentJobId) {
    // If this is the last sibling to finish, enqueue cache-recompute.
    const pending = await db
      .select({ id: syncJobs.id })
      .from(syncJobs)
      .where(
        and(
          eq(syncJobs.parentJobId, job.parentJobId),
          inArray(syncJobs.status, ['pending', 'running']),
          ne(syncJobs.id, job.id)
        )
      )
      .limit(1)

    if (pending.length === 0 && job.userId) {
      await enqueue({
        jobType: 'cache-recompute',
        userId: job.userId,
        source: job.source,
        // notify on the parent's notify flag; the user already got their
        // per-job notifications (or didn't, for system-scheduled)
        notifyOnComplete: false,
        parentJobId: job.parentJobId,
      })
      log.info({ userId: job.userId }, 'All planet-detail done, enqueued cache-recompute')
    }
  }
}

// ==================== handlers ====================

async function getFioCreds(userId: number): Promise<{ apiKey: string; username: string }> {
  const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(userId)
  if (!fioUsername || !fioApiKey) {
    throw new Error(`User ${userId} has no FIO credentials configured`)
  }
  return { apiKey: fioApiKey, username: fioUsername }
}

async function handleUserInventory(job: SyncJob): Promise<void> {
  if (!job.userId) throw new Error('user-inventory job missing userId')
  const { apiKey, username } = await getFioCreds(job.userId)
  const excludedLocations =
    ((await userSettingsService.getSetting(job.userId, 'fio.excludedLocations')) as string[]) ?? []
  const result = await syncUserInventory(job.userId, apiKey, username, { excludedLocations })
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('; '))
  }
  if (result.fioLastSync) {
    await db.update(users).set({ lastActiveAt: new Date(result.fioLastSync) }).where(eq(users.id, job.userId))
  }
}

async function handleUserPlanetsList(job: SyncJob): Promise<void> {
  if (!job.userId) throw new Error('user-planets-list job missing userId')
  const { apiKey, username } = await getFioCreds(job.userId)
  const excludedPlanets =
    ((await userSettingsService.getSetting(
      job.userId,
      'burnRepair.excludedPlanets'
    )) as string[]) ?? []
  const excludedSet = new Set(excludedPlanets.map(p => p.toLowerCase()))

  const client = new FioClient()
  const planets = await syncUserPlanetsList(job.userId, apiKey, username, client)

  // Fan out one planet-detail per planet, with this job as parent so we can
  // track completion for the cache-recompute trigger.
  for (const planet of planets) {
    if (!planet.naturalId) continue
    if (
      excludedSet.has(planet.naturalId.toLowerCase()) ||
      (planet.name && excludedSet.has(planet.name.toLowerCase()))
    ) {
      continue
    }
    await enqueue({
      jobType: 'planet-detail',
      userId: job.userId,
      source: job.source,
      priority: job.priority, // children inherit parent priority
      parentJobId: job.id,
      notifyOnComplete: false,
      payload: { planetNaturalId: planet.naturalId },
    })
  }
}

async function handlePlanetDetail(job: SyncJob): Promise<void> {
  if (!job.userId) throw new Error('planet-detail job missing userId')
  const payload = (job.payload ?? {}) as Record<string, unknown>
  const planetNaturalId = payload.planetNaturalId
  if (typeof planetNaturalId !== 'string') {
    throw new Error('planet-detail job missing planetNaturalId payload')
  }
  const { apiKey, username } = await getFioCreds(job.userId)
  const client = new FioClient()
  await syncSinglePlanet(job.userId, apiKey, username, planetNaturalId, client)
}

async function handleCacheRecompute(job: SyncJob): Promise<void> {
  if (!job.userId) throw new Error('cache-recompute job missing userId')
  await computeBurnRepairCache(job.userId, { force: true })
}

async function handleCommodities(): Promise<void> {
  await syncCommodities()
}

async function handleLocations(): Promise<void> {
  await syncLocations()
}

async function handleStations(): Promise<void> {
  await syncStations()
}

async function handleUserShips(job: SyncJob): Promise<void> {
  if (!job.userId) throw new Error('user-ships job missing userId')
  const { apiKey, username } = await getFioCreds(job.userId)
  const result = await syncUserShips(job.userId, apiKey, username)
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('; '))
  }
  if (result.fioLastSync) {
    await db.update(users).set({ lastActiveAt: new Date(result.fioLastSync) }).where(eq(users.id, job.userId))
  }
}
