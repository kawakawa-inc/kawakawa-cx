import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import type { Currency } from '@kawakawa/types'
import {
  db,
  priceLists,
  prices,
  priceAdjustments,
  importConfigs,
  fioLocations,
  priceListVersions,
} from '../db/index.js'
import { eq, and, ilike, sql } from 'drizzle-orm'
import { NotFound, BadRequest, Conflict } from '../utils/errors.js'

export type PriceListType = 'fio' | 'custom'

export interface PriceListDefinition {
  code: string
  name: string
  description: string | null
  type: PriceListType
  currency: Currency
  defaultLocationId: string | null
  defaultLocationName: string | null
  isActive: boolean
  currentVersion: number
  createdAt: Date
  updatedAt: Date
  priceCount?: number
  importConfigCount?: number
}

interface CreatePriceListRequest {
  code: string
  name: string
  description?: string | null
  type: PriceListType
  currency: Currency
  /** Default location for the initial version (required) */
  defaultLocationId: string
  isActive?: boolean
}

interface UpdatePriceListRequest {
  name?: string
  description?: string | null
  currency?: Currency
  isActive?: boolean
}

@Route('price-lists')
@Tags('Pricing')
export class PriceListsController extends Controller {
  /**
   * Get all price list definitions
   */
  @Get()
  public async getPriceLists(): Promise<PriceListDefinition[]> {
    const results = await db
      .select({
        code: priceLists.code,
        name: priceLists.name,
        description: priceLists.description,
        type: priceLists.type,
        currency: priceLists.currency,
        defaultLocationId: priceListVersions.defaultLocationId,
        defaultLocationName: fioLocations.name,
        isActive: priceLists.isActive,
        currentVersion: priceLists.currentVersion,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(
        priceListVersions,
        and(
          eq(priceListVersions.priceListCode, priceLists.code),
          eq(priceListVersions.version, priceLists.currentVersion)
        )
      )
      .leftJoin(fioLocations, eq(priceListVersions.defaultLocationId, fioLocations.naturalId))
      .orderBy(priceLists.code)

    // Get counts for each price list using SQL aggregation (count only current version prices)
    const [priceCountRows, configCountRows] = await Promise.all([
      db
        .select({
          priceListCode: prices.priceListCode,
          count: sql<number>`count(*)::int`,
        })
        .from(prices)
        .groupBy(prices.priceListCode),
      db
        .select({
          priceListCode: importConfigs.priceListCode,
          count: sql<number>`count(*)::int`,
        })
        .from(importConfigs)
        .groupBy(importConfigs.priceListCode),
    ])

    const priceCounts = new Map(priceCountRows.map(r => [r.priceListCode, r.count]))
    const configCounts = new Map(configCountRows.map(r => [r.priceListCode, r.count]))

    return results.map(r => ({
      ...r,
      priceCount: priceCounts.get(r.code) || 0,
      importConfigCount: configCounts.get(r.code) || 0,
    }))
  }

  /**
   * Get a specific price list definition
   * @param code The price list code
   */
  @Get('{code}')
  public async getPriceList(@Path() code: string): Promise<PriceListDefinition> {
    const results = await db
      .select({
        code: priceLists.code,
        name: priceLists.name,
        description: priceLists.description,
        type: priceLists.type,
        currency: priceLists.currency,
        defaultLocationId: priceListVersions.defaultLocationId,
        defaultLocationName: fioLocations.name,
        isActive: priceLists.isActive,
        currentVersion: priceLists.currentVersion,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(
        priceListVersions,
        and(
          eq(priceListVersions.priceListCode, priceLists.code),
          eq(priceListVersions.version, priceLists.currentVersion)
        )
      )
      .leftJoin(fioLocations, eq(priceListVersions.defaultLocationId, fioLocations.naturalId))
      .where(eq(priceLists.code, code.toUpperCase()))
      .limit(1)

    if (results.length === 0) {
      throw NotFound(`Price list '${code.toUpperCase()}' not found`)
    }

    // Get price count
    const priceCountResult = await db
      .select({ id: prices.id })
      .from(prices)
      .where(eq(prices.priceListCode, code.toUpperCase()))

    // Get import config count
    const configCountResult = await db
      .select({ id: importConfigs.id })
      .from(importConfigs)
      .where(eq(importConfigs.priceListCode, code.toUpperCase()))

    return {
      ...results[0],
      priceCount: priceCountResult.length,
      importConfigCount: configCountResult.length,
    }
  }

  /**
   * Create a new price list
   * @param body The price list data
   */
  @Post()
  @Security('jwt', ['prices.manage'])
  @SuccessResponse('201', 'Created')
  public async createPriceList(@Body() body: CreatePriceListRequest): Promise<PriceListDefinition> {
    const code = body.code.toUpperCase()

    // Check if code already exists
    const existing = await db
      .select({ code: priceLists.code })
      .from(priceLists)
      .where(eq(priceLists.code, code))
      .limit(1)

    if (existing.length > 0) {
      throw Conflict(`Price list '${code}' already exists`)
    }

    if (!body.defaultLocationId) {
      throw BadRequest('defaultLocationId is required')
    }

    // Validate location (case-insensitive lookup)
    const locationResult = await db
      .select({ naturalId: fioLocations.naturalId })
      .from(fioLocations)
      .where(ilike(fioLocations.naturalId, body.defaultLocationId))
      .limit(1)

    if (locationResult.length === 0) {
      throw BadRequest(`Location '${body.defaultLocationId}' not found`)
    }
    const resolvedLocationId = locationResult[0].naturalId

    await db.insert(priceLists).values({
      code,
      name: body.name,
      description: body.description ?? null,
      type: body.type,
      currency: body.currency,
      isActive: body.isActive ?? true,
    })

    // Create initial version 1 metadata with the default location
    await db.insert(priceListVersions).values({
      priceListCode: code,
      version: 1,
      label: 'Initial version',
      defaultLocationId: resolvedLocationId,
      promotedAt: new Date(),
    })

    this.setStatus(201)
    return this.getPriceList(code)
  }

  /**
   * Update an existing price list
   * @param code The price list code
   * @param body The fields to update
   */
  @Put('{code}')
  @Security('jwt', ['prices.manage'])
  public async updatePriceList(
    @Path() code: string,
    @Body() body: UpdatePriceListRequest
  ): Promise<PriceListDefinition> {
    const upperCode = code.toUpperCase()

    // Check if price list exists
    const existing = await db
      .select({ code: priceLists.code, type: priceLists.type })
      .from(priceLists)
      .where(eq(priceLists.code, upperCode))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Price list '${upperCode}' not found`)
    }

    // Don't allow changing currency on FIO price lists (they have fixed currencies)
    if (existing[0].type === 'fio' && body.currency !== undefined) {
      throw BadRequest('Cannot change currency on FIO price lists')
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    await db.update(priceLists).set(updateData).where(eq(priceLists.code, upperCode))

    return this.getPriceList(upperCode)
  }

  /**
   * Delete a price list and all associated data
   * @param code The price list code
   */
  @Delete('{code}')
  @Security('jwt', ['prices.manage'])
  @SuccessResponse('204', 'Deleted')
  public async deletePriceList(@Path() code: string): Promise<void> {
    const upperCode = code.toUpperCase()

    // Check if price list exists
    const existing = await db
      .select({ code: priceLists.code, type: priceLists.type })
      .from(priceLists)
      .where(eq(priceLists.code, upperCode))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Price list '${upperCode}' not found`)
    }

    // Don't allow deleting FIO price lists (they're managed by the system)
    if (existing[0].type === 'fio') {
      throw BadRequest('Cannot delete FIO price lists - they are system-managed')
    }

    // Delete associated prices
    await db.delete(prices).where(eq(prices.priceListCode, upperCode))

    // Delete associated adjustments
    await db.delete(priceAdjustments).where(eq(priceAdjustments.priceListCode, upperCode))

    // Import configs are deleted by cascade (FK has onDelete: cascade)

    // Delete the price list itself
    await db.delete(priceLists).where(eq(priceLists.code, upperCode))

    this.setStatus(204)
  }
}
