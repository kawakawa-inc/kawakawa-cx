// Demand order recalculation service
// Recalculates quantity for demand buy orders and limitQuantity for demand sell order reserves

import { eq, and, inArray } from 'drizzle-orm'
import {
  db,
  buyOrders,
  buyOrderPlanets,
  sellOrders,
  sellOrderPlanets,
  fioPlanetWorkforce,
  fioPlanetBuildings,
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
 * Get current stock of a commodity at a location for a user.
 * Sums across all storage types (base store, warehouse, etc.)
 */
export async function getStockAtLocation(
  userId: number,
  commodityTicker: string,
  locationId: string
): Promise<number> {
  const inventory = await db
    .select({ quantity: fioInventory.quantity })
    .from(fioInventory)
    .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
    .where(
      and(
        eq(fioUserStorage.userId, userId),
        eq(fioInventory.commodityTicker, commodityTicker),
        eq(fioUserStorage.locationId, locationId)
      )
    )

  return inventory.reduce((sum, item) => sum + item.quantity, 0)
}

/**
 * Calculate burn need for a commodity across linked planets.
 * Burns are daily rates multiplied by target days.
 */
export async function calculateBurnNeed(
  commodityTicker: string,
  userPlanetIds: number[],
  targetDays: number
): Promise<number> {
  if (userPlanetIds.length === 0 || targetDays <= 0) return 0

  const workforceRows = await db
    .select({ needs: fioPlanetWorkforce.needs })
    .from(fioPlanetWorkforce)
    .where(inArray(fioPlanetWorkforce.userPlanetId, userPlanetIds))

  let totalRate = 0
  for (const row of workforceRows) {
    const needs = row.needs as {
      MaterialTicker: string
      UnitsPerInterval: number
      Essential: boolean
    }[]

    for (const need of needs) {
      if (need.MaterialTicker === commodityTicker) {
        totalRate += need.UnitsPerInterval
      }
    }
  }

  return totalRate > 0 ? Math.ceil(totalRate * targetDays) : 0
}

/**
 * Calculate repair need for a commodity across linked planets.
 * Repair needs are absolute amounts from RepairMaterials.
 */
export async function calculateRepairNeed(
  commodityTicker: string,
  userPlanetIds: number[]
): Promise<number> {
  if (userPlanetIds.length === 0) return 0

  const buildingRows = await db
    .select({ repairMaterials: fioPlanetBuildings.repairMaterials })
    .from(fioPlanetBuildings)
    .where(inArray(fioPlanetBuildings.userPlanetId, userPlanetIds))

  let totalNeed = 0
  for (const row of buildingRows) {
    const materials = row.repairMaterials as {
      MaterialTicker: string
      MaterialAmount: number
    }[]

    for (const mat of materials) {
      if (mat.MaterialTicker === commodityTicker) {
        totalNeed += mat.MaterialAmount
      }
    }
  }

  return totalNeed
}

/**
 * Recalculate quantity for a single demand buy order.
 * Returns the new quantity, or null if the order is not a demand order.
 */
export async function recalculateSingleDemandOrder(orderId: number): Promise<number | null> {
  const [order] = await db.select().from(buyOrders).where(eq(buyOrders.id, orderId))

  if (!order || order.sourceMode !== 'demand') return null

  // Get linked planet IDs
  const links = await db
    .select({ userPlanetId: buyOrderPlanets.userPlanetId })
    .from(buyOrderPlanets)
    .where(eq(buyOrderPlanets.buyOrderId, orderId))

  const userPlanetIds = links.map(l => l.userPlanetId)

  // Calculate total need based on demand source
  let totalNeed = 0
  if (order.demandSource === 'burn') {
    totalNeed = await calculateBurnNeed(order.commodityTicker, userPlanetIds, order.targetDays ?? 0)
  } else if (order.demandSource === 'repair') {
    totalNeed = await calculateRepairNeed(order.commodityTicker, userPlanetIds)
  }

  // Get current stock at order location
  const stock = await getStockAtLocation(order.userId, order.commodityTicker, order.locationId)

  // Calculate new quantity
  const newQuantity = Math.max(0, totalNeed - stock)

  // Update if changed
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
 * Called after FIO sync to update all demand orders with fresh data.
 */
export async function recalculateDemandOrders(userId: number): Promise<RecalculationResult> {
  const result: RecalculationResult = {
    ordersProcessed: 0,
    ordersUpdated: 0,
    errors: [],
  }

  // Fetch all demand orders for this user
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
    {
      userId,
      processed: result.ordersProcessed,
      updated: result.ordersUpdated,
      errors: result.errors.length,
    },
    'Recalculated demand buy orders'
  )

  return result
}

// ==================== SELL ORDER RESERVE RECALCULATION ====================

/**
 * Recalculate limitQuantity for a single demand-reserve sell order.
 * Returns the new limitQuantity, or null if the order is not a demand reserve.
 *
 * Formula: limitQuantity = ceil(sum(burn_rate_per_linked_planet) * targetDays)
 * (No stock offset — reserve is the raw amount to hold back)
 */
export async function recalculateSingleDemandReserve(orderId: number): Promise<number | null> {
  const [order] = await db.select().from(sellOrders).where(eq(sellOrders.id, orderId))

  if (!order || order.reserveSource !== 'demand') return null

  // Get linked planet IDs
  const links = await db
    .select({ userPlanetId: sellOrderPlanets.userPlanetId })
    .from(sellOrderPlanets)
    .where(eq(sellOrderPlanets.sellOrderId, orderId))

  const userPlanetIds = links.map(l => l.userPlanetId)

  // Calculate total need based on demand source
  let totalNeed = 0
  if (order.reserveDemandSource === 'burn') {
    totalNeed = await calculateBurnNeed(
      order.commodityTicker,
      userPlanetIds,
      order.reserveTargetDays ?? 0
    )
  } else if (order.reserveDemandSource === 'repair') {
    totalNeed = await calculateRepairNeed(order.commodityTicker, userPlanetIds)
  }

  // Update if changed (no stock offset — reserve is the raw burn/repair amount)
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
    {
      userId,
      processed: result.ordersProcessed,
      updated: result.ordersUpdated,
      errors: result.errors.length,
    },
    'Recalculated demand sell order reserves'
  )

  return result
}
