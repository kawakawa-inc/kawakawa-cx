import { Controller, Get, Route, Security, Tags, Request } from 'tsoa'
import { db, fioUserPlanets } from '../db/index.js'
import { eq } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'

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
}
