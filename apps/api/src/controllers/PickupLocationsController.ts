import { Body, Controller, Delete, Get, Path, Post, Put, Route, Security, Tags } from 'tsoa'
import type { Currency } from '@kawakawa/types'
import { db, pickupLocations, fioLocations } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { BadRequest, NotFound } from '../utils/errors.js'

// A flat shipping surcharge for customers picking a package up at a given
// location (e.g. Proxion = +5,000, BEN = no row at all = free). Shared across
// every package that lists that location as its pickup point.
interface PickupLocationResponse {
  locationId: string
  locationName: string
  extraFee: number
  currency: Currency
  description: string | null
  createdAt: Date
  updatedAt: Date
}

interface CreatePickupLocationRequest {
  locationId: string
  extraFee: number
  currency: Currency
  description?: string | null
}

interface UpdatePickupLocationRequest {
  extraFee?: number
  currency?: Currency
  description?: string | null
}

function toResponse(
  row: typeof pickupLocations.$inferSelect,
  locationName: string
): PickupLocationResponse {
  return {
    locationId: row.locationId,
    locationName,
    extraFee: parseFloat(row.extraFee),
    currency: row.currency,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

@Route('pickup-locations')
@Tags('Pricing')
export class PickupLocationsController extends Controller {
  /** List every location with a configured pickup fee. */
  @Get()
  @Security('jwt', ['packages.view'])
  public async listPickupLocations(): Promise<PickupLocationResponse[]> {
    const rows = await db
      .select({
        locationId: pickupLocations.locationId,
        extraFee: pickupLocations.extraFee,
        currency: pickupLocations.currency,
        description: pickupLocations.description,
        createdAt: pickupLocations.createdAt,
        updatedAt: pickupLocations.updatedAt,
        locationName: fioLocations.name,
      })
      .from(pickupLocations)
      .innerJoin(fioLocations, eq(pickupLocations.locationId, fioLocations.naturalId))
      .orderBy(fioLocations.name)

    return rows.map(r => toResponse(r, r.locationName))
  }

  /** Set (or replace) the pickup fee for a location. */
  @Post()
  @Security('jwt', ['packages.manage'])
  public async createPickupLocation(
    @Body() body: CreatePickupLocationRequest
  ): Promise<PickupLocationResponse> {
    if (!body.locationId?.trim()) {
      throw BadRequest('locationId is required')
    }
    if (!Number.isFinite(body.extraFee) || body.extraFee < 0) {
      throw BadRequest('extraFee must be a non-negative number')
    }
    // Location natural IDs are case-sensitive (e.g. planet IDs like
    // "UV-351a" have a meaningful lowercase suffix) — trim only.
    const locationId = body.locationId.trim()

    const [location] = await db
      .select({ naturalId: fioLocations.naturalId, name: fioLocations.name })
      .from(fioLocations)
      .where(eq(fioLocations.naturalId, locationId))
      .limit(1)
    if (!location) {
      throw BadRequest(`Unknown location: ${locationId}`)
    }

    const [row] = await db
      .insert(pickupLocations)
      .values({
        locationId,
        extraFee: body.extraFee.toFixed(2),
        currency: body.currency,
        description: body.description ?? null,
      })
      .onConflictDoUpdate({
        target: pickupLocations.locationId,
        set: {
          extraFee: body.extraFee.toFixed(2),
          currency: body.currency,
          description: body.description ?? null,
          updatedAt: new Date(),
        },
      })
      .returning()

    this.setStatus(201)
    return toResponse(row, location.name)
  }

  /** Update an existing location's pickup fee. */
  @Put('{locationId}')
  @Security('jwt', ['packages.manage'])
  public async updatePickupLocation(
    @Path() locationId: string,
    @Body() body: UpdatePickupLocationRequest
  ): Promise<PickupLocationResponse> {
    const id = locationId.trim()
    const [existing] = await db
      .select()
      .from(pickupLocations)
      .where(eq(pickupLocations.locationId, id))
      .limit(1)
    if (!existing) throw NotFound(`No pickup fee configured for location ${id}`)

    if (body.extraFee !== undefined && (!Number.isFinite(body.extraFee) || body.extraFee < 0)) {
      throw BadRequest('extraFee must be a non-negative number')
    }

    const updateData: Partial<typeof pickupLocations.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    }
    if (body.extraFee !== undefined) updateData.extraFee = body.extraFee.toFixed(2)
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.description !== undefined) updateData.description = body.description

    const [row] = await db
      .update(pickupLocations)
      .set(updateData)
      .where(eq(pickupLocations.locationId, id))
      .returning()

    const [location] = await db
      .select({ name: fioLocations.name })
      .from(fioLocations)
      .where(eq(fioLocations.naturalId, id))
      .limit(1)

    return toResponse(row, location?.name ?? id)
  }

  /** Remove a location's pickup fee (packages using it fall back to free/unset). */
  @Delete('{locationId}')
  @Security('jwt', ['packages.manage'])
  public async deletePickupLocation(@Path() locationId: string): Promise<void> {
    const id = locationId.trim()
    const [existing] = await db
      .select({ locationId: pickupLocations.locationId })
      .from(pickupLocations)
      .where(eq(pickupLocations.locationId, id))
      .limit(1)
    if (!existing) throw NotFound(`No pickup fee configured for location ${id}`)

    await db.delete(pickupLocations).where(eq(pickupLocations.locationId, id))
    this.setStatus(204)
  }
}
