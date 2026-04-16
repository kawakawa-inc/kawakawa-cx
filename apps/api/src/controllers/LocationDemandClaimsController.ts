import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Security,
  Tags,
  Request,
  Body,
  Path,
  SuccessResponse,
} from 'tsoa'
import type {
  LocationDemandClaim,
  CreateLocationDemandClaimRequest,
  UpdateLocationDemandClaimRequest,
  ClaimCategory,
  ClaimSource,
  DemandRate,
} from '@kawakawa/types'
import { db, locationDemandClaims } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound } from '../utils/errors.js'

function toClaimResponse(row: typeof locationDemandClaims.$inferSelect): LocationDemandClaim {
  return {
    id: row.id,
    locationId: row.locationId,
    commodityTicker: row.commodityTicker,
    quantity: row.quantity,
    rate: row.rate as DemandRate,
    category: row.category as ClaimCategory,
    note: row.note,
    source: row.source as ClaimSource,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

@Route('logistics/claims')
@Tags('Logistics')
@Security('jwt')
export class LocationDemandClaimsController extends Controller {
  /**
   * List all location demand claims for the current user.
   */
  @Get()
  public async listClaims(
    @Request() request: { user: JwtPayload }
  ): Promise<LocationDemandClaim[]> {
    const rows = await db
      .select()
      .from(locationDemandClaims)
      .where(eq(locationDemandClaims.userId, request.user.userId))
    return rows.map(toClaimResponse)
  }

  /**
   * Create a new location demand claim.
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createClaim(
    @Body() body: CreateLocationDemandClaimRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<LocationDemandClaim> {
    if (body.quantity <= 0) throw BadRequest('quantity must be positive')

    const [inserted] = await db
      .insert(locationDemandClaims)
      .values({
        userId: request.user.userId,
        locationId: body.locationId,
        commodityTicker: body.commodityTicker,
        quantity: body.quantity,
        rate: body.rate,
        category: body.category,
        note: body.note ?? null,
        source: 'manual',
      })
      .returning()

    this.setStatus(201)
    return toClaimResponse(inserted)
  }

  /**
   * Update an existing location demand claim.
   */
  @Put('{id}')
  public async updateClaim(
    @Path() id: number,
    @Body() body: UpdateLocationDemandClaimRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<LocationDemandClaim> {
    const userId = request.user.userId
    const [existing] = await db
      .select()
      .from(locationDemandClaims)
      .where(and(eq(locationDemandClaims.id, id), eq(locationDemandClaims.userId, userId)))
    if (!existing) throw NotFound('Claim not found')

    if (body.quantity !== undefined && body.quantity <= 0) {
      throw BadRequest('quantity must be positive')
    }

    const [updated] = await db
      .update(locationDemandClaims)
      .set({
        quantity: body.quantity ?? existing.quantity,
        rate: body.rate ?? existing.rate,
        category: body.category ?? existing.category,
        note: body.note !== undefined ? body.note : existing.note,
        updatedAt: new Date(),
      })
      .where(eq(locationDemandClaims.id, id))
      .returning()

    return toClaimResponse(updated)
  }

  /**
   * Delete a location demand claim.
   */
  @Delete('{id}')
  public async deleteClaim(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean }> {
    const userId = request.user.userId
    const [existing] = await db
      .select({ id: locationDemandClaims.id })
      .from(locationDemandClaims)
      .where(and(eq(locationDemandClaims.id, id), eq(locationDemandClaims.userId, userId)))
    if (!existing) throw NotFound('Claim not found')

    await db.delete(locationDemandClaims).where(eq(locationDemandClaims.id, id))
    return { success: true }
  }
}
