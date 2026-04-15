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

/**
 * Get total production_output supply being delivered to a destination planet for a ticker.
 * Used to deduct from demand so hubs don't double-count what production already covers.
 */
async function getOutputSupplyAtDest(
  userId: number,
  destinationPlanetId: string,
  commodityTicker: string,
  targetDays: number,
  assumeMaxCondition: boolean
): Promise<number> {
  // Find production_output lines targeting this destination
  const outputLines = await db
    .select()
    .from(supplyChainLines)
    .where(
      and(
        eq(supplyChainLines.userId, userId),
        eq(supplyChainLines.destinationPlanetId, destinationPlanetId),
        eq(supplyChainLines.commodityTicker, commodityTicker),
        eq(supplyChainLines.lineSource, 'production_output')
      )
    )

  if (outputLines.length === 0) return 0

  let total = 0
  for (const ol of outputLines) {
    total += await calculateOutputSupply(ol, userId, targetDays, assumeMaxCondition)
  }
  return total
}

/**
 * Calculate demand (or supply) for a single supply chain line based on its lineSource.
 * Returns the calculated amount, or the fixed demand if set.
 *
 * For demand lines (consumables, inputs, repair), the result is reduced by any
 * production_output supply already being delivered to the same destination planet.
 *
 * @param planetId - Override which location to resolve as the planet.
 *   For demand lines this is destinationPlanetId (default).
 *   For production_output lines the caller should pass sourceLocationId (the producing planet).
 */
export async function calculateLineDemand(
  line: {
    commodityTicker: string
    destinationPlanetId: string
    lineSource: string | null
    demand: number | null
    demandRate?: string | null
  },
  userId: number,
  targetDays: number,
  assumeMaxCondition = true,
  planetId?: string,
  /** Skip deducting production_output supply (used internally to avoid circular calls) */
  skipOutputDeduction = false
): Promise<number> {
  // Fixed demand overrides calculation
  if (line.demand !== null) {
    return line.demandRate === 'daily' ? Math.ceil(line.demand * targetDays) : line.demand
  }

  if (!line.lineSource) return 0

  // Resolve planet to userPlanetId
  const resolvedPlanetId = planetId ?? line.destinationPlanetId
  const [planet] = await db
    .select({ id: fioUserPlanets.id })
    .from(fioUserPlanets)
    .where(
      and(eq(fioUserPlanets.userId, userId), eq(fioUserPlanets.planetNaturalId, resolvedPlanetId))
    )

  if (!planet) return 0

  // Calculate raw demand based on lineSource
  let rawDemand = 0

  if (line.lineSource === 'consumables') {
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
    rawDemand = totalRate > 0 ? Math.ceil(totalRate * targetDays) : 0
  } else if (line.lineSource === 'inputs') {
    // Production input needs — matches Refined PRUN's XIT BURN approach:
    // Net out on-site production of the same material (split-base scenarios).
    const { dailyInput, dailyOutput } = await getProductionRates(
      planet.id,
      line.commodityTicker,
      assumeMaxCondition
    )
    const netDaily = dailyInput - dailyOutput
    rawDemand = netDaily > 0 ? Math.ceil(netDaily * targetDays) : 0
  } else if (line.lineSource === 'production_output') {
    // Net production surplus after local workforce burn.
    const { dailyInput, dailyOutput } = await getProductionRates(
      planet.id,
      line.commodityTicker,
      assumeMaxCondition
    )
    const netProd = dailyOutput - dailyInput
    if (netProd <= 0) return 0
    const localBurnRates = await getAllBurnRates(planet.id, new Set([line.commodityTicker]))
    const netDaily = netProd - (localBurnRates[line.commodityTicker] ?? 0)
    return netDaily > 0 ? Math.ceil(netDaily * targetDays) : 0
  } else if (line.lineSource === 'repair') {
    // Repair material costs using true construction costs and Refined PRUN formula
    const buildingRows = await db
      .select({
        buildingCreated: fioPlanetBuildings.buildingCreated,
        buildingLastRepair: fioPlanetBuildings.buildingLastRepair,
        repairMaterials: fioPlanetBuildings.repairMaterials,
        constructionCosts: fioPlanetBuildings.constructionCosts,
      })
      .from(fioPlanetBuildings)
      .where(eq(fioPlanetBuildings.userPlanetId, planet.id))

    if (targetDays === 0) {
      // Use current repair materials directly (exact game values)
      for (const row of buildingRows) {
        const materials = row.repairMaterials as {
          MaterialTicker: string
          MaterialAmount: number
        }[]
        for (const mat of materials) {
          if (mat.MaterialTicker === line.commodityTicker) {
            rawDemand += mat.MaterialAmount
          }
        }
      }
    } else {
      // Project forward using Refined PRUN formula:
      // condition(age) = age > 180 ? 0 : 1 - age/180
      // repairCost = ceil(CC * (1 - condition)) = ceil(CC * min(age, 180) / 180)
      const now = new Date()
      for (const row of buildingRows) {
        // Skip infrastructure buildings (no repair materials = no workforce)
        const repairMats = row.repairMaterials as {
          MaterialTicker: string
          MaterialAmount: number
        }[]
        if (repairMats.length === 0) continue

        const referenceDate = row.buildingLastRepair ?? row.buildingCreated
        const daysSinceRepair = (now.getTime() - referenceDate.getTime()) / 86_400_000
        const plannedAge = daysSinceRepair + targetDays

        // Get true construction cost for this material from stored data
        const ccMats = row.constructionCosts as {
          MaterialTicker: string
          MaterialAmount: number
        }[]
        const ccEntry = ccMats.find(m => m.MaterialTicker === line.commodityTicker)
        if (!ccEntry || ccEntry.MaterialAmount <= 0) continue

        // Refined PRUN formula
        const clampedAge = Math.min(plannedAge, 180)
        rawDemand += Math.ceil((ccEntry.MaterialAmount * clampedAge) / 180)
      }
    }
  }

  if (rawDemand <= 0) return 0

  // Deduct production_output supply already being delivered to this destination.
  // This prevents double-counting: if Etherwind supplies H2O to KW-689c,
  // BEN's demand line for KW-689c should be reduced by that amount.
  // Skipped when called from calculateOutputSupply to avoid circular dependency.
  if (line.lineSource !== 'production_output' && !skipOutputDeduction) {
    const outputSupply = await getOutputSupplyAtDest(
      userId,
      line.destinationPlanetId,
      line.commodityTicker,
      targetDays,
      assumeMaxCondition
    )
    rawDemand = Math.max(0, rawDemand - outputSupply)
  }

  return rawDemand
}

/**
 * Calculate surplus-aware supply for a production_output line.
 *
 * For each output destination, looks up demand at that hub. Allocates production
 * smallest-demand-first: each destination gets min(its_demand, remaining_production).
 * After all demand is served, remaining surplus is split evenly among destinations
 * with no demand (pure surplus hubs).
 *
 * Returns the allocation for the specific line passed in.
 */
export async function calculateOutputSupply(
  line: {
    commodityTicker: string
    sourceLocationId: string
    destinationPlanetId: string
    demand: number | null
    demandRate?: string | null
  },
  userId: number,
  targetDays: number,
  assumeMaxCondition = true
): Promise<number> {
  // Fixed demand overrides calculation
  if (line.demand !== null) {
    return line.demandRate === 'daily' ? Math.ceil(line.demand * targetDays) : line.demand
  }

  // 1. Resolve planet
  const [planet] = await db
    .select({ id: fioUserPlanets.id })
    .from(fioUserPlanets)
    .where(
      and(
        eq(fioUserPlanets.userId, userId),
        eq(fioUserPlanets.planetNaturalId, line.sourceLocationId)
      )
    )
  if (!planet) return 0

  // 2. Net daily production at the planet, minus local workforce burn
  const { dailyInput, dailyOutput } = await getProductionRates(
    planet.id,
    line.commodityTicker,
    assumeMaxCondition
  )
  const netProductionDaily = dailyOutput - dailyInput
  if (netProductionDaily <= 0) return 0

  // Subtract local workforce burn at the producing planet
  const localBurnRates = await getAllBurnRates(planet.id, new Set([line.commodityTicker]))
  const localBurn = localBurnRates[line.commodityTicker] ?? 0
  const netDaily = netProductionDaily - localBurn
  if (netDaily <= 0) return 0
  const totalProduction = Math.ceil(netDaily * targetDays)

  // 3. Find all production_output lines from this planet for this ticker
  const outputLines = await db
    .select()
    .from(supplyChainLines)
    .where(
      and(
        eq(supplyChainLines.userId, userId),
        eq(supplyChainLines.sourceLocationId, line.sourceLocationId),
        eq(supplyChainLines.commodityTicker, line.commodityTicker),
        eq(supplyChainLines.lineSource, 'production_output')
      )
    )

  if (outputLines.length === 0) return totalProduction

  // 4. For each output destination, calculate total demand at that hub
  const destDemands: { destId: string; demand: number }[] = []
  for (const ol of outputLines) {
    // Fixed-demand output lines don't participate in auto-allocation
    if (ol.demand !== null) continue

    // Calculate actual consumption of this material at the destination.
    // This includes workforce burn + production input needs (net of on-site production).
    const [destPlanet] = await db
      .select({ id: fioUserPlanets.id })
      .from(fioUserPlanets)
      .where(
        and(
          eq(fioUserPlanets.userId, userId),
          eq(fioUserPlanets.planetNaturalId, ol.destinationPlanetId)
        )
      )

    let destDemand = 0
    if (destPlanet) {
      // Workforce burn (consumables)
      const workforceRows = await db
        .select({ needs: fioPlanetWorkforce.needs })
        .from(fioPlanetWorkforce)
        .where(eq(fioPlanetWorkforce.userPlanetId, destPlanet.id))
      for (const row of workforceRows) {
        const needs = row.needs as {
          MaterialTicker: string
          UnitsPerInterval: number
        }[]
        for (const need of needs) {
          if (need.MaterialTicker === line.commodityTicker) {
            destDemand += need.UnitsPerInterval
          }
        }
      }
      destDemand = destDemand > 0 ? Math.ceil(destDemand * targetDays) : 0

      // Production input needs (net consumption)
      const { dailyInput: destInput, dailyOutput: destOutput } = await getProductionRates(
        destPlanet.id,
        line.commodityTicker,
        assumeMaxCondition
      )
      const netInput = destInput - destOutput
      if (netInput > 0) {
        destDemand += Math.ceil(netInput * targetDays)
      }
    }
    destDemands.push({ destId: ol.destinationPlanetId, demand: destDemand })
  }

  // 5. Subtract fixed-demand output lines from available production
  let available = totalProduction
  for (const ol of outputLines) {
    if (ol.demand !== null) available -= ol.demand
  }
  available = Math.max(0, available)

  if (destDemands.length === 0) return 0 // All lines are fixed-demand

  // 6. Fair-share allocation: split evenly among demand destinations first,
  //    capped at each one's actual demand. Redistribute leftovers smallest-first.
  //    Surplus (after all demand served) goes to zero-demand destinations.
  const demandDests = destDemands.filter(d => d.demand > 0)
  const surplusDests = destDemands.filter(d => d.demand === 0)
  const allocations = new Map<string, number>()
  let remaining = available

  if (demandDests.length > 0) {
    // Sort ascending so smaller demands get filled first during redistribution
    demandDests.sort((a, b) => a.demand - b.demand)

    // Iteratively allocate fair shares — when a dest takes less than its share,
    // the leftover is redistributed among the remaining dests
    const allocated = new Map<string, number>()
    const unallocated = [...demandDests]
    let pool = remaining

    while (unallocated.length > 0 && pool > 0) {
      const fairShare = pool / unallocated.length
      const nextRound: typeof unallocated = []

      for (const dest of unallocated) {
        const prevAlloc = allocated.get(dest.destId) ?? 0
        const stillNeeds = dest.demand - prevAlloc
        const alloc = Math.min(stillNeeds, fairShare)
        allocated.set(dest.destId, prevAlloc + Math.ceil(alloc))
        pool -= alloc
        if (prevAlloc + alloc < dest.demand && alloc >= fairShare) {
          nextRound.push(dest) // Still has unmet demand, keep in next round
        }
      }

      // If nothing changed this round, break to avoid infinite loop
      if (nextRound.length === unallocated.length) break
      unallocated.length = 0
      unallocated.push(...nextRound)
    }

    for (const dest of demandDests) {
      const alloc = allocated.get(dest.destId) ?? 0
      allocations.set(dest.destId, alloc)
      remaining -= alloc
    }
  }

  // Distribute remaining surplus evenly among zero-demand destinations
  remaining = Math.max(0, remaining)
  if (remaining > 0 && surplusDests.length > 0) {
    const perDest = Math.ceil(remaining / surplusDests.length)
    for (const dest of surplusDests) {
      allocations.set(dest.destId, perDest)
    }
  } else if (remaining > 0 && demandDests.length > 0) {
    // All dests had demand but there's still surplus — split evenly among all
    const perDest = Math.ceil(remaining / demandDests.length)
    for (const dest of demandDests) {
      allocations.set(dest.destId, (allocations.get(dest.destId) ?? 0) + perDest)
    }
  }

  return allocations.get(line.destinationPlanetId) ?? 0
}

/**
 * Calculate the deficit for a commodity at a source location using supply chain lines.
 *
 * deficit = max(0, total_demand - total_supply - (dest_stock - reserved) - source_stock)
 */
export async function calculateDeficit(
  userId: number,
  sourceLocationId: string,
  commodityTicker: string,
  targetDays: number
): Promise<number> {
  // Get demand/reserve lines where this hub is the source
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

  // Get production_output lines where this hub is the destination
  // (production_output lines have source=planet, destination=hub)
  const outputLines = await db
    .select()
    .from(supplyChainLines)
    .where(
      and(
        eq(supplyChainLines.userId, userId),
        eq(supplyChainLines.destinationPlanetId, sourceLocationId),
        eq(supplyChainLines.commodityTicker, commodityTicker),
        eq(supplyChainLines.lineSource, 'production_output')
      )
    )

  if (lines.length === 0 && outputLines.length === 0) return 0

  const demandLines = lines.filter(l => l.mode === 'demand')
  const reserveLines = lines.filter(l => l.mode === 'reserve')

  // Sum demand from need lines
  let totalDemand = 0
  for (const line of demandLines) {
    totalDemand += await calculateLineDemand(line, userId, targetDays)
  }

  // Sum supply from production_output lines (planet is sourceLocationId)
  let totalSupply = 0
  for (const line of outputLines) {
    totalSupply += await calculateOutputSupply(line, userId, targetDays)
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

  return Math.max(0, totalDemand - totalSupply - (totalDestStock - totalReserved) - sourceStock)
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
