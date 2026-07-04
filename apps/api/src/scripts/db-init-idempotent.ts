#!/usr/bin/env tsx
// Idempotent database initialization script
// Safe to run multiple times - only seeds/syncs if database is empty
// Commodities only sync on empty DB; locations/stations always sync (needed for price_lists FK)

import { client, fioCommodities, db } from '../db/index.js'
import { seedRolesAndPermissions, seedPriceLists } from '../db/seedCore.js'
import { createLogger } from '../utils/logger.js'
import { syncCommodities, syncLocations, syncStations } from '@kawakawa/services/fio'

const log = createLogger({ script: 'db-init-idempotent' })

async function checkIfDatabaseNeedsInit(): Promise<boolean> {
  try {
    // Check if fio_commodities table has data
    const result = await db.select({ ticker: fioCommodities.ticker }).from(fioCommodities).limit(1)
    return result.length === 0
  } catch {
    // If query fails, table might not exist yet - needs initialization
    log.info('Could not check fio_commodities table, assuming database needs initialization')
    return true
  }
}

async function runSeed() {
  log.info('Seeding roles and permissions')
  const result = await seedRolesAndPermissions()
  log.info(result, 'Seeded roles and permissions')

  log.info('Seeding price lists')
  await seedPriceLists()

  log.info('Seeding complete')
}

async function main() {
  log.info('Checking if database needs initialization')

  try {
    const needsInit = await checkIfDatabaseNeedsInit()

    if (needsInit) {
      log.info('Database is empty - running full FIO sync')

      log.info('Syncing FIO commodities')
      await syncCommodities()
    } else {
      log.info('Database already has data - skipping FIO commodity sync')
    }

    // Always sync locations and stations - seed needs locations for price_lists FK
    // These use upserts so they're safe to run on existing data
    log.info('Syncing FIO locations')
    await syncLocations()

    log.info('Syncing FIO stations')
    await syncStations()

    // Always run seed - it uses upserts so it's safe to run on existing data
    // This ensures new roles, permissions, and role-permission mappings are added
    log.info('Running seed (upserts roles, permissions, price lists)')
    await runSeed()

    log.info('Database initialization complete')
  } finally {
    await client.end()
  }
}

main().catch(async error => {
  log.error({ err: error }, 'Database initialization failed')
  try {
    await client.end()
  } catch {
    // Ignore connection close errors
  }
  process.exit(1)
})
