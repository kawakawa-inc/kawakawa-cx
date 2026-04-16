// Unified FIO sync for a single user
// Syncs inventory + planet data
// Used by both the async API endpoint and the hourly cron job

import { syncUserInventory } from './sync-user-inventory.js'
import { syncUserPlanets } from './sync-user-planets.js'
import type { UserInventorySyncResult } from './sync-user-inventory.js'
import type { PlanetSyncResult } from './sync-user-planets.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ service: 'fio-sync', entity: 'user-all' })

export interface SyncUserAllOptions {
  excludedLocations?: string[]
  excludedPlanets?: string[]
}

export interface SyncUserAllResult {
  success: boolean
  inventory: UserInventorySyncResult
  planets: PlanetSyncResult
  errors: string[]
}

/**
 * Sync all FIO data for a single user.
 *
 * Steps (sequential):
 * 1. Sync inventory from FIO (GroupHub endpoint)
 * 2. Sync planet data (sites, workforce, production)
 */
export async function syncUserAll(
  userId: number,
  fioApiKey: string,
  fioUsername: string,
  options: SyncUserAllOptions = {}
): Promise<SyncUserAllResult> {
  const allErrors: string[] = []

  log.info({ userId }, 'Starting full FIO sync')

  // 1. Sync inventory
  const inventoryResult = await syncUserInventory(userId, fioApiKey, fioUsername, {
    excludedLocations: options.excludedLocations ?? [],
  })
  if (inventoryResult.errors.length > 0) {
    allErrors.push(...inventoryResult.errors)
  }

  // 2. Sync planet data
  const planetsResult = await syncUserPlanets(userId, fioApiKey, fioUsername, {
    excludedPlanets: options.excludedPlanets ?? [],
  })
  if (planetsResult.errors.length > 0) {
    allErrors.push(...planetsResult.errors)
  }

  const success = allErrors.length === 0

  log.info(
    {
      userId,
      success,
      inventoryItems: inventoryResult.inserted,
      planetsSynced: planetsResult.planetsSynced,
      errorCount: allErrors.length,
    },
    'Full FIO sync completed'
  )

  return {
    success,
    inventory: inventoryResult,
    planets: planetsResult,
    errors: allErrors,
  }
}
