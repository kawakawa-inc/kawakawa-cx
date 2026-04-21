// In-process scheduler for cadenced FIO syncs.
//
// Replaces the external DigitalOcean cron job by running the same enqueue
// logic inside the API process. Dedup in the enqueue layer means multiple
// API instances are safe — worst case they race to enqueue and one wins.

import { db, users } from '@kawakawa/db'
import * as userSettingsService from '../user-settings/user-settings-service.js'
import { enqueue, enqueueUserFullSync } from './enqueue.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'sync-queue', entity: 'scheduler' })

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const USER_SYNC_INTERVAL_MS = Number(process.env.SYNC_USER_INTERVAL_MS) || HOUR_MS
const GLOBAL_SYNC_INTERVAL_MS = Number(process.env.SYNC_GLOBAL_INTERVAL_MS) || DAY_MS
/** Delay before the first user-sync run after API boot (avoids thundering restarts). */
const USER_SYNC_STARTUP_DELAY_MS = Number(process.env.SYNC_STARTUP_DELAY_MS) || 60_000

let userSyncTimer: ReturnType<typeof setInterval> | null = null
let globalSyncTimer: ReturnType<typeof setInterval> | null = null
let startupTimer: ReturnType<typeof setTimeout> | null = null

export function startScheduler(): void {
  if (userSyncTimer || globalSyncTimer || startupTimer) {
    log.warn('Scheduler already running')
    return
  }

  log.info(
    {
      userIntervalMs: USER_SYNC_INTERVAL_MS,
      globalIntervalMs: GLOBAL_SYNC_INTERVAL_MS,
      startupDelayMs: USER_SYNC_STARTUP_DELAY_MS,
    },
    'Sync queue scheduler started'
  )

  // Global syncs run at boot and then daily — the catalogs don't change often.
  void scheduleGlobalSyncs()
  globalSyncTimer = setInterval(() => {
    void scheduleGlobalSyncs()
  }, GLOBAL_SYNC_INTERVAL_MS)

  // User syncs wait a bit after boot, then run on the hourly cadence.
  // The delay prevents a burst if the API restarts frequently during deploys.
  startupTimer = setTimeout(() => {
    startupTimer = null
    void scheduleUserSyncs()
    userSyncTimer = setInterval(() => {
      void scheduleUserSyncs()
    }, USER_SYNC_INTERVAL_MS)
  }, USER_SYNC_STARTUP_DELAY_MS)
}

export function stopScheduler(): void {
  if (userSyncTimer) {
    clearInterval(userSyncTimer)
    userSyncTimer = null
  }
  if (globalSyncTimer) {
    clearInterval(globalSyncTimer)
    globalSyncTimer = null
  }
  if (startupTimer) {
    clearTimeout(startupTimer)
    startupTimer = null
  }
  log.info('Sync queue scheduler stopped')
}

async function scheduleGlobalSyncs(): Promise<void> {
  try {
    await Promise.all([
      enqueue({ jobType: 'commodities', source: 'system' }),
      enqueue({ jobType: 'locations', source: 'system' }),
      enqueue({ jobType: 'stations', source: 'system' }),
    ])
    log.info('Scheduled global syncs')
  } catch (err) {
    log.error({ err }, 'Failed to schedule global syncs')
  }
}

async function scheduleUserSyncs(): Promise<void> {
  try {
    const allUsers = await db.select({ userId: users.id }).from(users)

    let enqueued = 0
    let skipped = 0
    for (const user of allUsers) {
      const autoSync = (await userSettingsService.getSetting(
        user.userId,
        'fio.autoSync'
      )) as boolean
      if (!autoSync) {
        skipped++
        continue
      }

      const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(user.userId)
      if (!fioUsername || !fioApiKey) {
        skipped++
        continue
      }

      await enqueueUserFullSync(user.userId, { source: 'system', notify: false })
      enqueued++
    }

    log.info({ enqueued, skipped, total: allUsers.length }, 'Scheduled user syncs')
  } catch (err) {
    log.error({ err }, 'Failed to schedule user syncs')
  }
}
