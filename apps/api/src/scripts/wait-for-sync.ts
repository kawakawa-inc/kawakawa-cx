#!/usr/bin/env tsx
// Block until queued FIO reference-data jobs finish.
//
// `fio:sync` only *enqueues* — the work happens in the @kawakawa/sync-worker
// daemon, in a different process. So `make db-reset-mock`, which runs
// `fio:sync` and then immediately loads mock data, was racing it: the mock data
// references stations (BEN, ARC, HUB…) that the stations job had not written
// yet, and the load died on a foreign-key violation. The failure was
// intermittent and looked like schema drift, which is a bad way to lose an hour.
//
// Usage: tsx src/scripts/wait-for-sync.ts [timeoutSeconds]

import { db, syncJobs, client } from '../db/index.js'
import { inArray, sql } from 'drizzle-orm'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'wait-for-sync' })

/**
 * Only the reference-data jobs. Per-user syncs need real FIO credentials and
 * may legitimately fail or sit pending forever on a fresh database; blocking a
 * reset on them would hang for no benefit.
 */
const REFERENCE_JOBS = ['commodities', 'locations', 'stations'] as const

const POLL_INTERVAL_MS = 1000

/**
 * How long to tolerate zero progress before concluding nothing is consuming the
 * queue. Measured against job *state changes*, not wall clock, so a slow-but-
 * working sync is never killed — only a genuinely idle queue is.
 */
const NO_PROGRESS_TIMEOUT_MS = 30_000

async function queueState() {
  const rows = await db
    .select({
      status: syncJobs.status,
      count: sql<number>`count(*)::int`,
    })
    .from(syncJobs)
    .where(inArray(syncJobs.jobType, [...REFERENCE_JOBS]))
    .groupBy(syncJobs.status)

  const byStatus = Object.fromEntries(rows.map(r => [r.status, r.count]))
  return {
    pending: byStatus.pending ?? 0,
    running: byStatus.running ?? 0,
    done: byStatus.done ?? 0,
    failed: byStatus.failed ?? 0,
  }
}

async function main() {
  const timeoutSeconds = Number(process.argv[2]) || 300
  const deadline = Date.now() + timeoutSeconds * 1000

  log.info({ timeoutSeconds }, 'Waiting for FIO reference-data sync to finish')

  let lastSignature = ''
  let lastProgressAt = Date.now()

  for (;;) {
    const state = await queueState()
    const outstanding = state.pending + state.running

    if (outstanding === 0) {
      if (state.failed > 0) {
        log.error({ ...state }, 'FIO sync jobs failed — reference data may be incomplete')
        await client.end()
        process.exit(1)
      }
      log.info({ ...state }, 'FIO reference-data sync complete')
      await client.end()
      return
    }

    const signature = JSON.stringify(state)
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = Date.now()
      log.info({ ...state }, 'Waiting for sync jobs')
    }

    if (Date.now() - lastProgressAt > NO_PROGRESS_TIMEOUT_MS) {
      log.error(
        { ...state },
        'No queue progress — is the sync-worker running? Start it with `dev start sync-worker`'
      )
      await client.end()
      process.exit(1)
    }

    if (Date.now() > deadline) {
      log.error({ ...state, timeoutSeconds }, 'Timed out waiting for FIO sync')
      await client.end()
      process.exit(1)
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

main().catch(async error => {
  log.error({ err: error }, 'Fatal error while waiting for sync')
  await client.end()
  process.exit(1)
})
