#!/usr/bin/env tsx
// CLI script that enqueues FIO syncs for all users with auto-sync enabled.
// The actual sync work is done by the worker loop inside the API process;
// this script just populates the queue.
// Usage: pnpm fio:sync:users

import { db, users, client } from '../db/index.js'
import { createLogger } from '../utils/logger.js'
import * as userSettingsService from '@kawakawa/services/user-settings'
import { enqueueUserFullSync } from '@kawakawa/services/sync-queue'

const log = createLogger({ script: 'sync-all-users' })

async function main() {
  log.info('Enqueuing FIO syncs for auto-sync users')

  try {
    const allUsers = await db.select({ userId: users.id, username: users.username }).from(users)

    if (allUsers.length === 0) {
      log.info('No users found')
      return
    }

    let enqueued = 0
    let skipped = 0

    for (const user of allUsers) {
      const fioAutoSync = (await userSettingsService.getSetting(
        user.userId,
        'fio.autoSync'
      )) as boolean
      if (!fioAutoSync) {
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

    log.info({ enqueued, skipped, total: allUsers.length }, 'Sync enqueue complete')
  } catch (error) {
    log.error({ err: error }, 'Fatal error during enqueue')
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
