// Demand calculator service
// Provides stock filtering, production rates, and burn rates
// Used by the logistics solver and supply calculator

import { eq, and } from 'drizzle-orm'
import {
  db,
  fioUserPlanets,
  fioPlanetWorkforce,
  fioPlanetProduction,
  fioInventory,
  fioUserStorage,
} from '../db/index.js'

/**
 * Get stock of a commodity at a location filtered by storage types.
 */
export async function getFilteredStock(
  userId: number,
  commodityTicker: string,
  locationId: string,
  storageTypes: string[]
): Promise<number> {
  const inventory = await db
    .select({
      quantity: fioInventory.quantity,
      storageType: fioUserStorage.type,
    })
    .from(fioInventory)
    .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
    .where(
      and(
        eq(fioUserStorage.userId, userId),
        eq(fioInventory.commodityTicker, commodityTicker),
        eq(fioUserStorage.locationId, locationId)
      )
    )

  return inventory
    .filter(item => storageTypes.includes(item.storageType))
    .reduce((sum, item) => sum + item.quantity, 0)
}

/**
 * Calculate daily production input and output rates for a commodity at a planet.
 * Shared between 'inputs' (net consumption) and 'production_output' (net supply).
 */
async function getProductionRates(
  userPlanetDbId: number,
  commodityTicker: string,
  assumeMaxCondition: boolean
): Promise<{ dailyInput: number; dailyOutput: number }> {
  const productionRows = await db
    .select({
      capacity: fioPlanetProduction.capacity,
      condition: fioPlanetProduction.condition,
      orders: fioPlanetProduction.orders,
    })
    .from(fioPlanetProduction)
    .where(eq(fioPlanetProduction.userPlanetId, userPlanetDbId))

  let dailyInput = 0
  let dailyOutput = 0
  for (const row of productionRows) {
    const capacity = row.capacity
    if (capacity <= 0) continue

    const orders = row.orders as {
      Recurring: boolean
      StartedEpochMs: number | null
      DurationMs: number
      Inputs: { MaterialTicker: string; MaterialAmount: number }[]
      Outputs: { MaterialTicker: string; MaterialAmount: number }[]
    }[]

    const uniqueOrders = orders.filter(o => o.Recurring && o.DurationMs > 0 && !o.StartedEpochMs)
    if (uniqueOrders.length === 0) continue

    const conditionFactor = assumeMaxCondition ? Number(row.condition) : 1
    const totalDurationDays =
      (uniqueOrders.reduce((sum, o) => sum + o.DurationMs, 0) * conditionFactor) / 86_400_000

    for (const order of uniqueOrders) {
      for (const input of order.Inputs) {
        if (input.MaterialTicker === commodityTicker) {
          dailyInput += (input.MaterialAmount * capacity) / totalDurationDays
        }
      }
      for (const output of order.Outputs ?? []) {
        if (output.MaterialTicker === commodityTicker) {
          dailyOutput += (output.MaterialAmount * capacity) / totalDurationDays
        }
      }
    }
  }

  return { dailyInput, dailyOutput }
}

/**
 * Get production input/output rates for multiple tickers at a planet in one pass.
 */
export async function getAllProductionRates(
  userPlanetDbId: number,
  tickers: Set<string>,
  assumeMaxCondition: boolean
): Promise<Record<string, { dailyInput: number; dailyOutput: number }>> {
  const productionRows = await db
    .select({
      capacity: fioPlanetProduction.capacity,
      condition: fioPlanetProduction.condition,
      orders: fioPlanetProduction.orders,
    })
    .from(fioPlanetProduction)
    .where(eq(fioPlanetProduction.userPlanetId, userPlanetDbId))

  const rates: Record<string, { dailyInput: number; dailyOutput: number }> = {}
  for (const ticker of tickers) rates[ticker] = { dailyInput: 0, dailyOutput: 0 }

  for (const row of productionRows) {
    if (row.capacity <= 0) continue
    const orders = row.orders as {
      Recurring: boolean
      StartedEpochMs: number | null
      DurationMs: number
      Inputs: { MaterialTicker: string; MaterialAmount: number }[]
      Outputs: { MaterialTicker: string; MaterialAmount: number }[]
    }[]
    const uniqueOrders = orders.filter(o => o.Recurring && o.DurationMs > 0 && !o.StartedEpochMs)
    if (uniqueOrders.length === 0) continue

    const conditionFactor = assumeMaxCondition ? Number(row.condition) : 1
    const totalDurationDays =
      (uniqueOrders.reduce((sum, o) => sum + o.DurationMs, 0) * conditionFactor) / 86_400_000

    for (const order of uniqueOrders) {
      for (const input of order.Inputs) {
        if (tickers.has(input.MaterialTicker)) {
          rates[input.MaterialTicker].dailyInput +=
            (input.MaterialAmount * row.capacity) / totalDurationDays
        }
      }
      for (const output of order.Outputs ?? []) {
        if (tickers.has(output.MaterialTicker)) {
          rates[output.MaterialTicker].dailyOutput +=
            (output.MaterialAmount * row.capacity) / totalDurationDays
        }
      }
    }
  }

  return rates
}

/**
 * Get workforce burn rates for multiple tickers at a planet in one pass.
 */
export async function getAllBurnRates(
  userPlanetDbId: number,
  tickers: Set<string>
): Promise<Record<string, number>> {
  const workforceRows = await db
    .select({ needs: fioPlanetWorkforce.needs })
    .from(fioPlanetWorkforce)
    .where(eq(fioPlanetWorkforce.userPlanetId, userPlanetDbId))

  const rates: Record<string, number> = {}
  for (const row of workforceRows) {
    const needs = row.needs as { MaterialTicker: string; UnitsPerInterval: number }[]
    for (const need of needs) {
      if (tickers.has(need.MaterialTicker)) {
        rates[need.MaterialTicker] = (rates[need.MaterialTicker] ?? 0) + need.UnitsPerInterval
      }
    }
  }
  return rates
}
