#!/usr/bin/env tsx
// CLI script that enqueues FIO syncs through the queue.
//
// The actual work is done by the @kawakawa/sync-worker daemon, in a *separate
// process*. This script only populates the queue and returns immediately, so
// anything that depends on the synced data must wait for the queue to drain —
// see `pnpm fio:wait` (scripts/wait-for-sync.ts), which the Makefile reset
// targets run straight after this one.
//
// Note: prices sync still runs directly — it's not part of the queue
// (read-heavy, doesn't compete with per-user syncs for rate limits).
//
// Usage:
//   pnpm fio:sync                     # enqueue all (commodities, locations, stations, users)
//   pnpm fio:sync commodities         # just commodities
//   pnpm fio:sync prices [field]      # run prices sync inline (no queue)
//
// 'all' deliberately excludes prices: it runs inline and needs commodities to
// already be in the database, which in 'all' mode are only queued. Run it as
// its own step after `fio:wait` (the `fio-sync` Makefile target does this).

import { syncFioExchangePrices, type FioPriceField } from '@kawakawa/services/fio'
import { db, users, client } from '../db/index.js'
import * as userSettingsService from '@kawakawa/services/user-settings'
import { enqueue, enqueueUserFullSync } from '@kawakawa/services/sync-queue'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'sync-fio' })

const SYNC_TYPES = ['commodities', 'locations', 'stations', 'prices', 'users', 'all'] as const
type SyncType = (typeof SYNC_TYPES)[number]

const VALID_PRICE_FIELDS: FioPriceField[] = ['MMBuy', 'MMSell', 'PriceAverage', 'Ask', 'Bid']

async function main() {
  const args = process.argv.slice(2)
  const syncType: SyncType = (args[0] as SyncType) || 'all'

  if (!SYNC_TYPES.includes(syncType)) {
    log.error({ syncType, validTypes: SYNC_TYPES }, 'Invalid sync type')
    process.exit(1)
  }

  log.info({ syncType }, 'Enqueuing FIO sync')

  try {
    if (syncType === 'commodities' || syncType === 'all') {
      const id = await enqueue({ jobType: 'commodities', source: 'system' })
      log.info({ jobId: id }, 'Enqueued commodities')
    }

    if (syncType === 'locations' || syncType === 'all') {
      const id = await enqueue({ jobType: 'locations', source: 'system' })
      log.info({ jobId: id }, 'Enqueued locations')
    }

    if (syncType === 'stations' || syncType === 'all') {
      const id = await enqueue({ jobType: 'stations', source: 'system' })
      log.info({ jobId: id }, 'Enqueued stations')
    }

    // Prices runs inline while commodities is merely *enqueued*, so in 'all'
    // mode against a fresh database prices used to run first and always fail
    // with "No commodities found in database". Skip it there and let the
    // follow-up `fio:wait` + an explicit `fio:sync:prices` handle it, rather
    // than emitting a guaranteed error that trains people to ignore the log.
    if (syncType === 'prices') {
      // Prices sync is run inline — it's heavy and has its own rate story.
      const priceFieldArg = args[1]
      const priceField: FioPriceField =
        priceFieldArg && VALID_PRICE_FIELDS.includes(priceFieldArg as FioPriceField)
          ? (priceFieldArg as FioPriceField)
          : 'PriceAverage'

      log.info({ priceField }, 'Running prices sync (inline, not queued)')
      const pricesResult = await syncFioExchangePrices(undefined, priceField)
      if (pricesResult.success) {
        log.info({ totalUpdated: pricesResult.totalUpdated }, 'Prices sync completed')
      } else {
        log.error({ errors: pricesResult.errors }, 'Prices sync failed')
        process.exitCode = 1
      }
    }

    if (syncType === 'users' || syncType === 'all') {
      const allUsers = await db.select({ userId: users.id, username: users.username }).from(users)

      let enqueued = 0
      for (const user of allUsers) {
        const fioAutoSync = (await userSettingsService.getSetting(
          user.userId,
          'fio.autoSync'
        )) as boolean
        if (!fioAutoSync) continue

        const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(user.userId)
        if (!fioUsername || !fioApiKey) continue

        await enqueueUserFullSync(user.userId, { source: 'system', notify: false })
        enqueued++
      }
      log.info({ enqueued }, 'Enqueued user syncs')
    }

    log.info('Enqueue complete — worker will process jobs in API process')
  } catch (error) {
    log.error({ err: error }, 'Fatal error during enqueue')
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
