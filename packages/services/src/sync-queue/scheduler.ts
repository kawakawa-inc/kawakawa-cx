// In-process scheduler for cadenced FIO syncs.
//
// Replaces the external DigitalOcean cron job by running the same enqueue
// logic inside the API process. Dedup in the enqueue layer means multiple
// API instances are safe — worst case they race to enqueue and one wins.

import { db, users, syncJobs } from '@kawakawa/db'
import { and, eq, sql } from 'drizzle-orm'
import * as userSettingsService from '../user-settings/user-settings-service.js'
import { captureCorpStockSnapshot } from '../burn-repair/corp-stock.js'
import { enqueue, enqueueUserFullSync } from './enqueue.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'sync-queue', entity: 'scheduler' })

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** How often the scheduler checks for users due to sync. */
const USER_SYNC_INTERVAL_MS = Number(process.env.SYNC_USER_INTERVAL_MS) || 15 * MINUTE_MS
/** Only enqueue a user if their last successful sync is at least this old. */
const USER_SYNC_STALE_MS = Number(process.env.SYNC_USER_STALE_MS) || HOUR_MS
const GLOBAL_SYNC_INTERVAL_MS = Number(process.env.SYNC_GLOBAL_INTERVAL_MS) || DAY_MS
/** Delay before the first user-sync run after boot (avoids thundering restarts). */
const USER_SYNC_STARTUP_DELAY_MS = Number(process.env.SYNC_STARTUP_DELAY_MS) || 60_000
/** Daily corp-stock snapshot interval (for histogram views). */
const STOCK_SNAPSHOT_INTERVAL_MS = Number(process.env.STOCK_SNAPSHOT_INTERVAL_MS) || DAY_MS

let userSyncTimer: ReturnType<typeof setInterval> | null = null
let globalSyncTimer: ReturnType<typeof setInterval> | null = null
let stockSnapshotTimer: ReturnType<typeof setInterval> | null = null
let startupTimer: ReturnType<typeof setTimeout> | null = null

export function startScheduler(): void {
  if (userSyncTimer || globalSyncTimer || startupTimer) {
    log.warn('Scheduler already running')
    return
  }

  log.info(
    {
      userIntervalMs: USER_SYNC_INTERVAL_MS,
      userStaleMs: USER_SYNC_STALE_MS,
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

  // Corp-wide stock snapshot: capture once at boot so fresh deploys have
  // today's row, then daily. Idempotent per (ticker, UTC-day) — safe to run
  // more often than strictly needed.
  void runStockSnapshot()
  stockSnapshotTimer = setInterval(() => {
    void runStockSnapshot()
  }, STOCK_SNAPSHOT_INTERVAL_MS)

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
  if (stockSnapshotTimer) {
    clearInterval(stockSnapshotTimer)
    stockSnapshotTimer = null
  }
  if (startupTimer) {
    clearTimeout(startupTimer)
    startupTimer = null
  }
  log.info('Sync queue scheduler stopped')
}

async function runStockSnapshot(): Promise<void> {
  try {
    await captureCorpStockSnapshot()
  } catch (err) {
    log.error({ err }, 'Failed to capture corp stock snapshot')
  }
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
    const staleBefore = new Date(Date.now() - USER_SYNC_STALE_MS)

    // Most recent successful inventory sync per user. user-inventory and
    // user-planets-list are enqueued together via enqueueUserFullSync, so
    // one is a sufficient proxy for both.
    const lastSyncs = await db
      .select({
        userId: syncJobs.userId,
        lastFinished: sql<Date>`MAX(${syncJobs.finishedAt})`.as('last_finished'),
      })
      .from(syncJobs)
      .where(and(eq(syncJobs.jobType, 'user-inventory'), eq(syncJobs.status, 'done')))
      .groupBy(syncJobs.userId)

    const lastByUser = new Map<number, Date>()
    for (const row of lastSyncs) {
      if (row.userId != null && row.lastFinished) {
        lastByUser.set(row.userId, new Date(row.lastFinished))
      }
    }

    const allUsers = await db.select({ userId: users.id }).from(users)

    let enqueued = 0
    let skippedFresh = 0
    let skippedSettings = 0
    for (const user of allUsers) {
      const last = lastByUser.get(user.userId)
      if (last && last > staleBefore) {
        skippedFresh++
        continue
      }

      const autoSync = (await userSettingsService.getSetting(
        user.userId,
        'fio.autoSync'
      )) as boolean
      if (!autoSync) {
        skippedSettings++
        continue
      }

      const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(user.userId)
      if (!fioUsername || !fioApiKey) {
        skippedSettings++
        continue
      }

      await enqueueUserFullSync(user.userId, { source: 'system', notify: false })
      enqueued++
    }

    log.info(
      { enqueued, skippedFresh, skippedSettings, total: allUsers.length },
      'Scheduled user syncs'
    )
  } catch (err) {
    log.error({ err }, 'Failed to schedule user syncs')
  }
}
