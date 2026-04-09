// Sync user planet data (buildings, workforce, production) from FIO API
// Used for supply planning: repair costs, workforce burn, production inputs
import { eq, and, notInArray } from 'drizzle-orm'
import {
  db,
  fioUserPlanets,
  fioPlanetBuildings,
  fioPlanetWorkforce,
  fioPlanetProduction,
} from '../../db/index.js'
import { FioClient } from './client.js'
import type {
  FioRainPlanet,
  FioSiteResponse,
  FioWorkforceResponse,
  FioProductionLine,
  FioBuildingDefinition,
  FioPlanetData,
} from './types.js'
import type { SyncResult } from './sync-types.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ service: 'fio-sync', entity: 'user-planets' })

// Cache building definitions during a sync run (static game data)
const buildingDefCache = new Map<string, FioBuildingDefinition>()
let cachedCmArea: number | null = null

async function getBuildingDef(
  client: FioClient,
  ticker: string
): Promise<FioBuildingDefinition | null> {
  if (buildingDefCache.has(ticker)) return buildingDefCache.get(ticker)!
  try {
    const def = await client.getBuildingDefinition<FioBuildingDefinition>(ticker)
    buildingDefCache.set(ticker, def)
    return def
  } catch {
    return null
  }
}

async function getCmArea(client: FioClient): Promise<number> {
  if (cachedCmArea !== null) return cachedCmArea
  const cm = await getBuildingDef(client, 'CM')
  cachedCmArea = cm?.AreaCost ?? 25 // 25 is the known CM area
  return cachedCmArea
}

/**
 * Compute true construction costs for a building.
 * = base building materials + environmental materials scaled by building area.
 */
function computeConstructionCosts(
  buildingDef: FioBuildingDefinition | null,
  planetBuildReqs: Map<string, number>,
  cmArea: number
): { MaterialTicker: string; MaterialAmount: number }[] {
  const costs = new Map<string, number>()

  // Base building materials
  if (buildingDef) {
    for (const cost of buildingDef.BuildingCosts) {
      costs.set(cost.CommodityTicker, (costs.get(cost.CommodityTicker) ?? 0) + cost.Amount)
    }

    // Environmental materials: floor(planet_req * building_area / cm_area)
    const area = buildingDef.AreaCost
    for (const [ticker, amount] of planetBuildReqs) {
      const envCost = Math.floor((amount * area) / cmArea)
      if (envCost <= 0) continue
      costs.set(ticker, (costs.get(ticker) ?? 0) + envCost)
    }
  }

  return [...costs.entries()].map(([MaterialTicker, MaterialAmount]) => ({
    MaterialTicker,
    MaterialAmount,
  }))
}

export interface PlanetSyncResult extends SyncResult {
  planetsFound: number
  planetsSynced: number
  skippedExcludedPlanets: number
  buildingsSynced: number
  workforceTypesSynced: number
  productionLinesSynced: number
}

export interface SyncUserPlanetsOptions {
  excludedPlanets?: string[] // Planet NaturalIds to exclude
}

/**
 * Sync a user's planet data (buildings, workforce, production) from FIO API
 *
 * Fetches from three endpoints per planet:
 * - /sites/{User}/{Planet} - building condition, repair/reclaimable materials
 * - /workforce/{User}/{Planet} - workforce population and burn rates
 * - /production/{User}/{Planet} - production lines with orders
 *
 * Planets are processed sequentially to avoid FIO rate limits,
 * but the three endpoints per planet are fetched in parallel.
 */
export async function syncUserPlanets(
  userId: number,
  fioApiKey: string,
  fioUsername: string,
  options: SyncUserPlanetsOptions = {}
): Promise<PlanetSyncResult> {
  const result: PlanetSyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
    planetsFound: 0,
    planetsSynced: 0,
    skippedExcludedPlanets: 0,
    buildingsSynced: 0,
    workforceTypesSynced: 0,
    productionLinesSynced: 0,
  }

  const excludedPlanets = new Set((options.excludedPlanets || []).map(p => p.toLowerCase()))

  try {
    // 1. Fetch planet list
    const client = new FioClient()
    const planets = await client.getUserPlanets<FioRainPlanet[]>(fioApiKey, fioUsername)
    result.planetsFound = planets.length

    log.info({ userId, planetsFound: planets.length }, 'Fetched user planets')

    // Track which planets were synced (for cleanup of removed planets)
    const syncedPlanetIds: string[] = []

    // 2. Process each planet sequentially (avoid FIO rate limits)
    for (const planet of planets) {
      // Skip planets with missing identifiers (bad FIO data)
      if (!planet.NaturalId) {
        log.warn({ planet }, 'Skipping planet with missing NaturalId')
        continue
      }

      // Check exclusion
      if (
        excludedPlanets.has(planet.NaturalId.toLowerCase()) ||
        (planet.Name && excludedPlanets.has(planet.Name.toLowerCase()))
      ) {
        result.skippedExcludedPlanets++
        log.debug(
          { planetId: planet.NaturalId, planetName: planet.Name },
          'Skipping excluded planet'
        )
        continue
      }

      try {
        await syncPlanet(client, userId, fioApiKey, fioUsername, planet, result)
        syncedPlanetIds.push(planet.NaturalId)
        result.planetsSynced++
      } catch (error) {
        const errorMsg = `Failed to sync planet ${planet.NaturalId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        log.error({ planetId: planet.NaturalId, err: error }, 'Failed to sync planet')
      }
    }

    // 3. Clean up planets that are no longer in the user's planet list
    if (syncedPlanetIds.length > 0) {
      await db
        .delete(fioUserPlanets)
        .where(
          and(
            eq(fioUserPlanets.userId, userId),
            notInArray(fioUserPlanets.planetNaturalId, syncedPlanetIds)
          )
        )
    } else {
      // User has no planets (or all excluded) — delete all planet data
      await db.delete(fioUserPlanets).where(eq(fioUserPlanets.userId, userId))
    }

    result.inserted =
      result.buildingsSynced + result.workforceTypesSynced + result.productionLinesSynced
    result.success = result.errors.length === 0

    log.info(
      {
        userId,
        planetsSynced: result.planetsSynced,
        buildings: result.buildingsSynced,
        workforceTypes: result.workforceTypesSynced,
        productionLines: result.productionLinesSynced,
      },
      'Synced user planet data'
    )

    return result
  } catch (error) {
    const errorMsg = `Failed to sync planets for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    log.error({ userId, err: error }, 'Failed to sync user planets')
    return result
  }
}

/**
 * Sync a single planet's data (buildings, workforce, production)
 * Fetches all three endpoints in parallel, then stores results.
 */
async function syncPlanet(
  client: FioClient,
  userId: number,
  fioApiKey: string,
  fioUsername: string,
  planet: FioRainPlanet,
  result: PlanetSyncResult
): Promise<void> {
  const planetId = planet.NaturalId

  // Fetch user data + planet info in parallel
  const [siteData, workforceData, productionData, planetData] = await Promise.all([
    client.getUserSiteData<FioSiteResponse>(fioApiKey, fioUsername, planetId).catch(error => {
      result.errors.push(
        `Failed to fetch site data for ${planetId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      log.warn({ planetId, err: error }, 'Failed to fetch site data')
      return null
    }),
    client.getUserWorkforce<FioWorkforceResponse>(fioApiKey, fioUsername, planetId).catch(error => {
      result.errors.push(
        `Failed to fetch workforce data for ${planetId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      log.warn({ planetId, err: error }, 'Failed to fetch workforce data')
      return null
    }),
    client.getUserProduction<FioProductionLine[]>(fioApiKey, fioUsername, planetId).catch(error => {
      result.errors.push(
        `Failed to fetch production data for ${planetId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      log.warn({ planetId, err: error }, 'Failed to fetch production data')
      return null
    }),
    client.getPlanetData<FioPlanetData>(planetId).catch(error => {
      log.warn({ planetId, err: error }, 'Failed to fetch planet data for construction costs')
      return null
    }),
  ])

  // Build lookup for planet environmental costs and CM area
  const planetBuildReqs = new Map<string, number>()
  if (planetData?.BuildRequirements) {
    for (const req of planetData.BuildRequirements) {
      planetBuildReqs.set(req.MaterialTicker, req.MaterialAmount)
    }
  }
  // CM area (needed for scaling environmental costs per building area)
  const cmArea = await getCmArea(client)

  // Upsert the planet record (preserves ID for junction table references)
  const [planetRecord] = await db
    .insert(fioUserPlanets)
    .values({
      userId,
      planetNaturalId: planetId,
      planetName: planet.Name || planetId,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [fioUserPlanets.userId, fioUserPlanets.planetNaturalId],
      set: { planetName: planet.Name || planetId, lastSyncedAt: new Date() },
    })
    .returning({ id: fioUserPlanets.id })

  const userPlanetId = planetRecord.id

  // Delete existing children before re-inserting (planet ID is preserved)
  await db.delete(fioPlanetBuildings).where(eq(fioPlanetBuildings.userPlanetId, userPlanetId))
  await db.delete(fioPlanetWorkforce).where(eq(fioPlanetWorkforce.userPlanetId, userPlanetId))
  await db.delete(fioPlanetProduction).where(eq(fioPlanetProduction.userPlanetId, userPlanetId))

  // Store buildings
  if (siteData?.Buildings) {
    for (const building of siteData.Buildings) {
      try {
        // Compute true construction costs from building definition + planet env
        const buildingDef = await getBuildingDef(client, building.BuildingTicker)
        const constructionCosts = computeConstructionCosts(buildingDef, planetBuildReqs, cmArea)

        await db.insert(fioPlanetBuildings).values({
          userPlanetId,
          buildingId: building.BuildingId,
          buildingTicker: building.BuildingTicker,
          buildingCreated: new Date(building.BuildingCreated),
          buildingLastRepair: building.BuildingLastRepair
            ? new Date(building.BuildingLastRepair)
            : null,
          condition: String(building.Condition),
          repairMaterials: building.RepairMaterials,
          reclaimableMaterials: building.ReclaimableMaterials,
          constructionCosts,
        })
        result.buildingsSynced++
      } catch (error) {
        const errorMsg = `Failed to insert building ${building.BuildingTicker} at ${planetId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        log.error(
          { buildingTicker: building.BuildingTicker, planetId, err: error },
          'Failed to insert building'
        )
      }
    }
  }

  // Store workforce (API returns { Workforces: [...] } wrapper)
  if (workforceData?.Workforces) {
    for (const wfType of workforceData.Workforces) {
      try {
        await db.insert(fioPlanetWorkforce).values({
          userPlanetId,
          workforceType: wfType.WorkforceTypeName,
          population: wfType.Population,
          required: wfType.Required,
          needs: wfType.WorkforceNeeds,
        })
        result.workforceTypesSynced++
      } catch (error) {
        const errorMsg = `Failed to insert workforce ${wfType.WorkforceTypeName} at ${planetId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        log.error(
          { workforceType: wfType.WorkforceTypeName, planetId, err: error },
          'Failed to insert workforce'
        )
      }
    }
  }

  // Store production lines
  if (productionData) {
    for (const line of productionData) {
      try {
        await db.insert(fioPlanetProduction).values({
          userPlanetId,
          lineType: line.Type,
          capacity: line.Capacity,
          condition: String(line.Condition),
          efficiency: String(line.Efficiency),
          orders: line.Orders,
        })
        result.productionLinesSynced++
      } catch (error) {
        const errorMsg = `Failed to insert production line ${line.Type} at ${planetId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        log.error({ lineType: line.Type, planetId, err: error }, 'Failed to insert production line')
      }
    }
  }

  log.debug(
    {
      planetId,
      buildings: siteData?.Buildings?.length ?? 0,
      workforceTypes: workforceData?.Workforces?.length ?? 0,
      productionLines: productionData?.length ?? 0,
    },
    'Synced planet data'
  )
}

/**
 * Get all synced planet data for a user
 */
export async function getUserPlanetData(userId: number) {
  return db.query.fioUserPlanets.findMany({
    where: eq(fioUserPlanets.userId, userId),
    with: {
      buildings: true,
      workforce: true,
      production: true,
    },
  })
}
