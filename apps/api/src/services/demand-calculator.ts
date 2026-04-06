// Demand order recalculation service
// Uses supply_chain_lines to calculate demand for buy orders and sell order reserves

import { eq, and } from 'drizzle-orm'
import {
  db,
  buyOrders,
  sellOrders,
  supplyChainLines,
  fioUserPlanets,
  fioPlanetWorkforce,
  fioPlanetBuildings,
  fioPlanetProduction,
  fioInventory,
  fioUserStorage,
} from '../db/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'demand-calculator' })

export interface RecalculationResult {
  ordersProcessed: number
  ordersUpdated: number
  errors: string[]
}

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
 * Calculate demand for a single supply chain line based on its demandSource.
 * Returns the calculated demand amount, or the fixed demand if set.
 */
export async function calculateLineDemand(
  line: {
    commodityTicker: string
    destinationPlanetId: string
    demandSource: string | null
    demand: number | null
  },
  userId: number,
  targetDays: number
): Promise<number> {
  // Fixed demand overrides calculation
  if (line.demand !== null) return line.demand

  if (!line.demandSource) return 0

  // Resolve destinationPlanetId to userPlanetId
  const [planet] = await db
    .select({ id: fioUserPlanets.id })
    .from(fioUserPlanets)
    .where(
      and(
        eq(fioUserPlanets.userId, userId),
        eq(fioUserPlanets.planetNaturalId, line.destinationPlanetId)
      )
    )

  if (!planet) return 0

  if (line.demandSource === 'consumables') {
    // Workforce burn rate * target days
    const workforceRows = await db
      .select({ needs: fioPlanetWorkforce.needs })
      .from(fioPlanetWorkforce)
      .where(eq(fioPlanetWorkforce.userPlanetId, planet.id))

    let totalRate = 0
    for (const row of workforceRows) {
      const needs = row.needs as {
        MaterialTicker: string
        UnitsPerInterval: number
        Essential: boolean
      }[]
      for (const need of needs) {
        if (need.MaterialTicker === line.commodityTicker) {
          totalRate += need.UnitsPerInterval
        }
      }
    }
    return totalRate > 0 ? Math.ceil(totalRate * targetDays) : 0
  }

  if (line.demandSource === 'inputs') {
    // Production input needs
    const productionRows = await db
      .select({
        condition: fioPlanetProduction.condition,
        orders: fioPlanetProduction.orders,
      })
      .from(fioPlanetProduction)
      .where(eq(fioPlanetProduction.userPlanetId, planet.id))

    let totalNeed = 0
    const hoursInPeriod = 24 * targetDays
    for (const row of productionRows) {
      const orders = row.orders as {
        Recurring: boolean
        DurationMs: number
        Inputs: { MaterialTicker: string; MaterialAmount: number }[]
      }[]
      for (const order of orders) {
        if (!order.Recurring || order.DurationMs <= 0) continue
        const durationHours = order.DurationMs / 3_600_000
        const runs = hoursInPeriod / durationHours
        for (const input of order.Inputs) {
          if (input.MaterialTicker === line.commodityTicker) {
            totalNeed += Math.ceil(input.MaterialAmount * runs)
          }
        }
      }
    }
    return totalNeed
  }

  if (line.demandSource === 'repair') {
    // Repair material costs
    const buildingRows = await db
      .select({ repairMaterials: fioPlanetBuildings.repairMaterials })
      .from(fioPlanetBuildings)
      .where(eq(fioPlanetBuildings.userPlanetId, planet.id))

    let totalNeed = 0
    for (const row of buildingRows) {
      const materials = row.repairMaterials as {
        MaterialTicker: string
        MaterialAmount: number
      }[]
      for (const mat of materials) {
        if (mat.MaterialTicker === line.commodityTicker) {
          totalNeed += mat.MaterialAmount
        }
      }
    }
    return totalNeed
  }

  return 0
}

/**
 * Calculate the deficit for a commodity at a source location using supply chain lines.
 *
 * deficit = max(0, total_demand - (dest_stock - reserved) - source_stock)
 */
export async function calculateDeficit(
  userId: number,
  sourceLocationId: string,
  commodityTicker: string,
  targetDays: number
): Promise<number> {
  // Get all supply chain lines for this source + commodity
  const lines = await db
    .select()
    .from(supplyChainLines)
    .where(
      and(
        eq(supplyChainLines.userId, userId),
        eq(supplyChainLines.sourceLocationId, sourceLocationId),
        eq(supplyChainLines.commodityTicker, commodityTicker)
      )
    )

  if (lines.length === 0) return 0

  const demandLines = lines.filter(l => l.mode === 'demand')
  const reserveLines = lines.filter(l => l.mode === 'reserve')

  // Sum demand from all demand lines
  let totalDemand = 0
  for (const line of demandLines) {
    totalDemand += await calculateLineDemand(line, userId, targetDays)
  }

  // Sum destination stock and reserved amounts per destination
  // Group by destination to avoid double-counting
  const destinations = new Map<string, { storageTypes: Set<string>; reserved: number }>()
  for (const line of [...demandLines, ...reserveLines]) {
    const dest = destinations.get(line.destinationPlanetId) ?? {
      storageTypes: new Set<string>(),
      reserved: 0,
    }
    const lineStorageTypes = line.destinationStorageTypes as string[]
    for (const st of lineStorageTypes) {
      dest.storageTypes.add(st)
    }
    destinations.set(line.destinationPlanetId, dest)
  }

  // Add reserved amounts
  for (const line of reserveLines) {
    const dest = destinations.get(line.destinationPlanetId)!
    dest.reserved += line.demand ?? 0
  }

  // Calculate available stock at destinations
  let totalDestStock = 0
  let totalReserved = 0
  for (const [destPlanetId, destInfo] of destinations) {
    const stock = await getFilteredStock(
      userId,
      commodityTicker,
      destPlanetId,
      Array.from(destInfo.storageTypes)
    )
    totalDestStock += stock
    totalReserved += destInfo.reserved
  }

  // Get source stock (union of all sourceStorageTypes across lines)
  const sourceStorageTypes = new Set<string>()
  for (const line of lines) {
    const lineSourceTypes = line.sourceStorageTypes as string[]
    for (const st of lineSourceTypes) {
      sourceStorageTypes.add(st)
    }
  }
  const sourceStock = await getFilteredStock(
    userId,
    commodityTicker,
    sourceLocationId,
    Array.from(sourceStorageTypes)
  )

  return Math.max(0, totalDemand - (totalDestStock - totalReserved) - sourceStock)
}

// ==================== BUY ORDER RECALCULATION ====================

/**
 * Recalculate quantity for a single demand buy order using supply chain lines.
 */
export async function recalculateSingleDemandOrder(orderId: number): Promise<number | null> {
  const [order] = await db.select().from(buyOrders).where(eq(buyOrders.id, orderId))

  if (!order || order.sourceMode !== 'demand') return null

  const newQuantity = await calculateDeficit(
    order.userId,
    order.locationId,
    order.commodityTicker,
    order.targetDays ?? 0
  )

  if (newQuantity !== order.quantity) {
    await db
      .update(buyOrders)
      .set({ quantity: newQuantity, updatedAt: new Date() })
      .where(eq(buyOrders.id, orderId))
  }

  return newQuantity
}

/**
 * Recalculate quantity for all demand buy orders owned by a user.
 */
export async function recalculateDemandOrders(userId: number): Promise<RecalculationResult> {
  const result: RecalculationResult = {
    ordersProcessed: 0,
    ordersUpdated: 0,
    errors: [],
  }

  const demandOrders = await db
    .select()
    .from(buyOrders)
    .where(and(eq(buyOrders.userId, userId), eq(buyOrders.sourceMode, 'demand')))

  if (demandOrders.length === 0) return result

  for (const order of demandOrders) {
    try {
      const newQuantity = await recalculateSingleDemandOrder(order.id)
      result.ordersProcessed++
      if (newQuantity !== null && newQuantity !== order.quantity) {
        result.ordersUpdated++
      }
    } catch (error) {
      const errorMsg = `Failed to recalculate order ${order.id} (${order.commodityTicker}): ${error instanceof Error ? error.message : 'Unknown error'}`
      result.errors.push(errorMsg)
      log.error({ orderId: order.id, err: error }, 'Failed to recalculate demand order')
    }
  }

  log.info(
    { userId, processed: result.ordersProcessed, updated: result.ordersUpdated },
    'Recalculated demand buy orders'
  )

  return result
}

// ==================== SELL ORDER RESERVE RECALCULATION ====================

/**
 * Recalculate limitQuantity for a single demand-reserve sell order.
 * Uses supply chain lines to determine how much to reserve.
 *
 * For sell order reserves, the calculation is similar but updates limitQuantity
 * and doesn't subtract source stock (reserve is the raw demand amount).
 */
export async function recalculateSingleDemandReserve(orderId: number): Promise<number | null> {
  const [order] = await db.select().from(sellOrders).where(eq(sellOrders.id, orderId))

  if (!order || order.reserveSource !== 'demand') return null

  // Get supply chain lines for this location + commodity
  const lines = await db
    .select()
    .from(supplyChainLines)
    .where(
      and(
        eq(supplyChainLines.userId, order.userId),
        eq(supplyChainLines.sourceLocationId, order.locationId),
        eq(supplyChainLines.commodityTicker, order.commodityTicker),
        eq(supplyChainLines.mode, 'demand')
      )
    )

  let totalNeed = 0
  for (const line of lines) {
    totalNeed += await calculateLineDemand(line, order.userId, order.reserveTargetDays ?? 0)
  }

  if (totalNeed !== order.limitQuantity) {
    await db
      .update(sellOrders)
      .set({ limitQuantity: totalNeed, updatedAt: new Date() })
      .where(eq(sellOrders.id, orderId))
  }

  return totalNeed
}

/**
 * Recalculate limitQuantity for all demand-reserve sell orders owned by a user.
 */
export async function recalculateDemandReserves(userId: number): Promise<RecalculationResult> {
  const result: RecalculationResult = {
    ordersProcessed: 0,
    ordersUpdated: 0,
    errors: [],
  }

  const demandReserves = await db
    .select()
    .from(sellOrders)
    .where(and(eq(sellOrders.userId, userId), eq(sellOrders.reserveSource, 'demand')))

  if (demandReserves.length === 0) return result

  for (const order of demandReserves) {
    try {
      const newQuantity = await recalculateSingleDemandReserve(order.id)
      result.ordersProcessed++
      if (newQuantity !== null && newQuantity !== order.limitQuantity) {
        result.ordersUpdated++
      }
    } catch (error) {
      const errorMsg = `Failed to recalculate sell order reserve ${order.id} (${order.commodityTicker}): ${error instanceof Error ? error.message : 'Unknown error'}`
      result.errors.push(errorMsg)
      log.error({ orderId: order.id, err: error }, 'Failed to recalculate demand reserve')
    }
  }

  log.info(
    { userId, processed: result.ordersProcessed, updated: result.ordersUpdated },
    'Recalculated demand sell order reserves'
  )

  return result
}
