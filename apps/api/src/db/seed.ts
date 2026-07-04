// CLI entry point for `pnpm --filter @kawakawa/api db:seed` (used by
// `make db-reset`/`db-reset-mock`). Seed data and upsert logic live in
// `seedData.ts`/`seedCore.ts`, shared with `scripts/db-init-idempotent.ts` —
// edit those, not this file, when adding roles/permissions.
import { client } from './index.js'
import { seedRolesAndPermissions } from './seedCore.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'seed' })

async function seed() {
  log.info('Seeding database')

  try {
    const result = await seedRolesAndPermissions()
    log.info(result, 'Database seeding complete')
  } catch (error) {
    log.error({ err: error }, 'Error seeding database')
    throw error
  } finally {
    await client.end()
  }
}

seed()
