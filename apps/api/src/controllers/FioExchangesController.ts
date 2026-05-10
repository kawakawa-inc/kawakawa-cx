import { Controller, Get, Route, Tags } from 'tsoa'
import type { Currency } from '@kawakawa/types'
import { db, priceLists, priceListVersions, fioLocations } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import type { PriceListType } from './PriceListsController.js'

export interface FioExchangeResponse {
  code: string
  name: string
  description: string | null
  type: PriceListType
  currency: Currency
  defaultLocationId: string | null
  defaultLocationName: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  // Backwards compatibility - alias for defaultLocationId
  locationId: string | null
}

@Route('fio-exchanges')
@Tags('Pricing')
export class FioExchangesController extends Controller {
  /**
   * Get all price lists (exchanges)
   * Returns all exchange codes with their location mappings
   */
  @Get()
  public async getFioExchanges(): Promise<FioExchangeResponse[]> {
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

    return results.map(r => ({
      code: r.code,
      name: r.name,
      description: r.description,
      type: r.type,
      currency: r.currency,
      defaultLocationId: r.defaultLocationId,
      defaultLocationName: r.defaultLocationName,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // Backwards compatibility
      locationId: r.defaultLocationId,
    }))
  }
}
