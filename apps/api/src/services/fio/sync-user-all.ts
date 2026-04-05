// Unified FIO sync for a single user
// Syncs inventory + planet data + recalculates demand buy orders + demand sell order reserves
// Used by both the async API endpoint and the hourly cron job

import { syncUserInventory } from './sync-user-inventory.js'
import { syncUserPlanets } from './sync-user-planets.js'
import { recalculateDemandOrders, recalculateDemandReserves } from '../demand-calculator.js'
import type { UserInventorySyncResult } from './sync-user-inventory.js'
import type { PlanetSyncResult } from './sync-user-planets.js'
import type { RecalculationResult } from '../demand-calculator.js'
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
  demandOrders: RecalculationResult
  demandReserves: RecalculationResult
  errors: string[]
}

/**
 * Sync all FIO data for a single user and recalculate demand orders.
 *
 * Steps (sequential):
 * 1. Sync inventory from FIO (GroupHub endpoint)
 * 2. Sync planet data (sites, workforce, production)
 * 3. Recalculate all demand buy order quantities
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

  // 3. Recalculate demand buy orders
  const demandResult = await recalculateDemandOrders(userId)
  if (demandResult.errors.length > 0) {
    allErrors.push(...demandResult.errors)
  }

  // 4. Recalculate demand sell order reserves
  const reserveResult = await recalculateDemandReserves(userId)
  if (reserveResult.errors.length > 0) {
    allErrors.push(...reserveResult.errors)
  }

  const success = allErrors.length === 0

  log.info(
    {
      userId,
      success,
      inventoryItems: inventoryResult.inserted,
      planetsSynced: planetsResult.planetsSynced,
      demandOrdersUpdated: demandResult.ordersUpdated,
      demandReservesUpdated: reserveResult.ordersUpdated,
      errorCount: allErrors.length,
    },
    'Full FIO sync completed'
  )

  return {
    success,
    inventory: inventoryResult,
    planets: planetsResult,
    demandOrders: demandResult,
    demandReserves: reserveResult,
    errors: allErrors,
  }
}
