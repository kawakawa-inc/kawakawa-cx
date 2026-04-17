import {
  Controller,
  Get,
  Post,
  Delete,
  Route,
  Security,
  Tags,
  Request,
  Body,
  Path,
  Query,
  SuccessResponse,
} from 'tsoa'
import { db, fioUserPlanets, shoppingLists } from '../db/index.js'
import { eq, desc } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'
import { syncUserPlanets } from '../services/fio/sync-user-planets.js'
import { getUserPlanetData } from '../services/fio/sync-user-planets.js'
import { calculateSupply, calculatePlanetSupply } from '../services/supply-calculator.js'
import { toPlanetInput, getRepairableTickers } from '../services/planet-data-helpers.js'
import * as userSettingsService from '../services/userSettingsService.js'
import type {
  PlanetOverride,
  PlanetOverrides,
  PlanetSupplyResult,
  SupplyCalculationOptions,
  SupplyCalculationResult,
} from '@kawakawa/types'

interface PlanetSyncResponse {
  success: boolean
  planetsFound: number
  planetsSynced: number
  skippedExcludedPlanets: number
  buildingsSynced: number
  workforceTypesSynced: number
  productionLinesSynced: number
  errors: string[]
}

interface UserPlanetSummary {
  id: number
  planetNaturalId: string
  planetName: string
  lastSyncedAt: string
}

@Route('supply-planning')
@Tags('Supply Planning')
@Security('jwt')
export class SupplyPlanningController extends Controller {
  /**
   * Sync planet data (buildings, workforce, production) from FIO
   * Requires FIO credentials to be configured in user settings
   */
  @Post('sync')
  @SuccessResponse('200', 'Sync completed')
  public async syncPlanetData(
    @Request() request: { user: JwtPayload }
  ): Promise<PlanetSyncResponse> {
    const userId = request.user.userId

    const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(userId)

    if (!fioUsername || !fioApiKey) {
      this.setStatus(400)
      throw BadRequest(
        'FIO credentials not configured. Please set your FIO username and API key in Settings.'
      )
    }

    const excludedPlanets = ((await userSettingsService.getSetting(
      userId,
      'burnRepair.excludedPlanets'
    )) ?? []) as string[]

    const result = await syncUserPlanets(userId, fioApiKey, fioUsername, {
      excludedPlanets,
    })

    return {
      success: result.success,
      planetsFound: result.planetsFound,
      planetsSynced: result.planetsSynced,
      skippedExcludedPlanets: result.skippedExcludedPlanets,
      buildingsSynced: result.buildingsSynced,
      workforceTypesSynced: result.workforceTypesSynced,
      productionLinesSynced: result.productionLinesSynced,
      errors: result.errors,
    }
  }

  /**
   * List synced planets with last sync timestamps
   */
  @Get('planets')
  public async getPlanets(@Request() request: { user: JwtPayload }): Promise<UserPlanetSummary[]> {
    const userId = request.user.userId

    const planets = await db
      .select({
        id: fioUserPlanets.id,
        planetNaturalId: fioUserPlanets.planetNaturalId,
        planetName: fioUserPlanets.planetName,
        lastSyncedAt: fioUserPlanets.lastSyncedAt,
      })
      .from(fioUserPlanets)
      .where(eq(fioUserPlanets.userId, userId))
      .orderBy(fioUserPlanets.planetName)

    return planets.map(p => ({
      id: p.id,
      planetNaturalId: p.planetNaturalId,
      planetName: p.planetName,
      lastSyncedAt: p.lastSyncedAt.toISOString(),
    }))
  }

  /**
   * Get the most recent planet data sync time
   */
  @Get('last-sync')
  public async getLastSyncTime(
    @Request() request: { user: JwtPayload }
  ): Promise<{ lastSyncedAt: string | null }> {
    const userId = request.user.userId

    const [planet] = await db
      .select({ lastSyncedAt: fioUserPlanets.lastSyncedAt })
      .from(fioUserPlanets)
      .where(eq(fioUserPlanets.userId, userId))
      .orderBy(desc(fioUserPlanets.lastSyncedAt))
      .limit(1)

    return {
      lastSyncedAt: planet?.lastSyncedAt?.toISOString() ?? null,
    }
  }

  /**
   * Clear all planet data for the current user
   */
  @Delete()
  @SuccessResponse('200', 'Planet data cleared')
  public async clearPlanetData(
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean; deletedPlanets: number }> {
    const userId = request.user.userId

    const planets = await db
      .select({ id: fioUserPlanets.id })
      .from(fioUserPlanets)
      .where(eq(fioUserPlanets.userId, userId))

    // Cascade delete handles buildings, workforce, production
    await db.delete(fioUserPlanets).where(eq(fioUserPlanets.userId, userId))

    return {
      success: true,
      deletedPlanets: planets.length,
    }
  }

  /**
   * Calculate supply needs using the user's saved settings
   */
  @Get('calculate')
  public async calculateSupplyFromSettings(
    @Request() request: { user: JwtPayload }
  ): Promise<SupplyCalculationResult> {
    const userId = request.user.userId
    const options = await this.resolveCalculationOptions(userId)
    return this.runCalculation(userId, options)
  }

  /**
   * Calculate supply needs with custom options (overrides saved settings)
   */
  @Post('calculate')
  public async calculateSupplyCustom(
    @Body()
    body: {
      repairDays?: number
      burnDays?: number
      includeProduction?: boolean
      planetOverrides?: Record<string, PlanetOverride>
    },
    @Request() request: { user: JwtPayload }
  ): Promise<SupplyCalculationResult> {
    const userId = request.user.userId
    const defaults = await this.resolveCalculationOptions(userId)
    const options: SupplyCalculationOptions = {
      repairDays: body.repairDays ?? defaults.repairDays,
      burnDays: body.burnDays ?? defaults.burnDays,
      includeProduction: body.includeProduction ?? defaults.includeProduction,
      planetOverrides: body.planetOverrides ?? defaults.planetOverrides,
    }
    return this.runCalculation(userId, options)
  }

  /**
   * Calculate supply needs for a single planet
   */
  @Get('calculate/{planetId}')
  public async calculatePlanetSupplyEndpoint(
    @Path() planetId: string,
    @Request() request: { user: JwtPayload }
  ): Promise<PlanetSupplyResult> {
    const userId = request.user.userId
    const options = await this.resolveCalculationOptions(userId)

    const allPlanets = await getUserPlanetData(userId)
    const planetData = allPlanets.find(p => p.planetNaturalId === planetId)
    if (!planetData) {
      this.setStatus(404)
      throw NotFound(`Planet ${planetId} not found. Have you synced your planet data?`)
    }

    const repairableTickers = await getRepairableTickers()
    const input = toPlanetInput(planetData)
    return calculatePlanetSupply(input, options, repairableTickers)
  }

  /**
   * Resolve calculation options from user settings
   */
  private async resolveCalculationOptions(userId: number): Promise<SupplyCalculationOptions> {
    const repairDays =
      ((await userSettingsService.getSetting(userId, 'burnRepair.repairDays')) as number) ?? 0
    const burnDays =
      ((await userSettingsService.getSetting(userId, 'burnRepair.burnDays')) as number) ?? 7
    const includeProduction =
      ((await userSettingsService.getSetting(userId, 'burnRepair.includeProduction')) as boolean) ??
      false

    const overridesRaw =
      ((await userSettingsService.getSetting(userId, 'burnRepair.planetOverrides')) as string) ??
      '{}'
    let planetOverrides: PlanetOverrides = {}
    try {
      planetOverrides = typeof overridesRaw === 'string' ? JSON.parse(overridesRaw) : overridesRaw
    } catch {
      // Invalid JSON, use empty overrides
    }

    return { repairDays, burnDays, includeProduction, planetOverrides }
  }

  /**
   * Run the supply calculation for all synced planets
   */
  private async runCalculation(
    userId: number,
    options: SupplyCalculationOptions
  ): Promise<SupplyCalculationResult> {
    const planetData = await getUserPlanetData(userId)
    if (planetData.length === 0) {
      return {
        planets: [],
        aggregatedMaterials: {},
        repairMaterials: {},
        burnMaterials: {},
        productionMaterials: {},
      }
    }

    const repairableTickers = await getRepairableTickers()
    const inputs = planetData.map(p => toPlanetInput(p))
    return calculateSupply(inputs, options, repairableTickers)
  }

  /**
   * Generate a shopping list from supply calculation results
   */
  @Post('generate-list')
  @SuccessResponse('201', 'Shopping list created')
  public async generateShoppingList(
    @Body()
    body: {
      name?: string
      includeRepair?: boolean
      includeBurn?: boolean
      includeProduction?: boolean
      notes?: string
    },
    @Request() request: { user: JwtPayload }
  ): Promise<{ id: number; name: string; materials: Record<string, number> }> {
    const userId = request.user.userId
    const options = await this.resolveCalculationOptions(userId)

    // Override includeProduction if specified in body
    if (body.includeProduction !== undefined) {
      options.includeProduction = body.includeProduction
    }

    const calcResult = await this.runCalculation(userId, options)

    // Build materials map from selected categories
    const materials: Record<string, number> = {}
    const includeRepair = body.includeRepair ?? true
    const includeBurn = body.includeBurn ?? true
    const includeProduction = body.includeProduction ?? options.includeProduction

    if (includeRepair) {
      for (const [ticker, qty] of Object.entries(calcResult.repairMaterials)) {
        materials[ticker] = (materials[ticker] ?? 0) + qty
      }
    }
    if (includeBurn) {
      for (const [ticker, qty] of Object.entries(calcResult.burnMaterials)) {
        materials[ticker] = (materials[ticker] ?? 0) + qty
      }
    }
    if (includeProduction) {
      for (const [ticker, qty] of Object.entries(calcResult.productionMaterials)) {
        materials[ticker] = (materials[ticker] ?? 0) + qty
      }
    }

    if (Object.keys(materials).length === 0) {
      this.setStatus(400)
      throw BadRequest(
        'No materials to add to shopping list. Check your supply settings and synced data.'
      )
    }

    const listName = body.name ?? `Supply Plan ${new Date().toISOString().split('T')[0]}`

    const [list] = await db
      .insert(shoppingLists)
      .values({
        userId,
        name: listName,
        materials,
        notes: body.notes ?? null,
      })
      .returning({ id: shoppingLists.id, name: shoppingLists.name })

    this.setStatus(201)
    return { id: list.id, name: list.name, materials }
  }
}
