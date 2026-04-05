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
  FioWorkforceType,
  FioProductionLine,
} from './types.js'
import type { SyncResult } from './sync-types.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ service: 'fio-sync', entity: 'user-planets' })

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
      // Check exclusion
      if (
        excludedPlanets.has(planet.PlanetNaturalId.toLowerCase()) ||
        excludedPlanets.has(planet.PlanetName.toLowerCase())
      ) {
        result.skippedExcludedPlanets++
        log.debug(
          { planetId: planet.PlanetNaturalId, planetName: planet.PlanetName },
          'Skipping excluded planet'
        )
        continue
      }

      try {
        await syncPlanet(client, userId, fioApiKey, fioUsername, planet, result)
        syncedPlanetIds.push(planet.PlanetNaturalId)
        result.planetsSynced++
      } catch (error) {
        const errorMsg = `Failed to sync planet ${planet.PlanetNaturalId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        log.error({ planetId: planet.PlanetNaturalId, err: error }, 'Failed to sync planet')
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
  const planetId = planet.PlanetNaturalId

  // Fetch all three endpoints in parallel
  const [siteData, workforceData, productionData] = await Promise.all([
    client.getUserSiteData<FioSiteResponse>(fioApiKey, fioUsername, planetId).catch(error => {
      result.errors.push(
        `Failed to fetch site data for ${planetId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      log.warn({ planetId, err: error }, 'Failed to fetch site data')
      return null
    }),
    client.getUserWorkforce<FioWorkforceType[]>(fioApiKey, fioUsername, planetId).catch(error => {
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
  ])

  // Upsert the planet record (preserves ID for junction table references)
  const [planetRecord] = await db
    .insert(fioUserPlanets)
    .values({
      userId,
      planetNaturalId: planetId,
      planetName: planet.PlanetName,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [fioUserPlanets.userId, fioUserPlanets.planetNaturalId],
      set: { planetName: planet.PlanetName, lastSyncedAt: new Date() },
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

  // Store workforce
  if (workforceData) {
    for (const wfType of workforceData) {
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
      workforceTypes: workforceData?.length ?? 0,
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
