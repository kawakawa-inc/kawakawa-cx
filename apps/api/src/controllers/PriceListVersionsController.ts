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
import {
  db,
  priceLists,
  prices,
  priceListVersions,
  importConfigs,
  fioLocations,
} from '../db/index.js'
import { eq, and, ilike, sql, max } from 'drizzle-orm'
import { NotFound, BadRequest } from '../utils/errors.js'
import { resolveVersion } from '../services/price-version.js'

interface VersionSummary {
  id: number
  version: number
  label: string | null
  description: string | null
  defaultLocationId: string
  defaultLocationName: string | null
  priceCount: number
  isCurrent: boolean
  isLatest: boolean
  createdAt: Date
  promotedAt: Date | null
}

interface VersionDetail extends VersionSummary {
  createdByUserId: number | null
}

interface CreateVersionRequest {
  label?: string
  description?: string
  /** Required: default location for this version (e.g., 'BEN'). Use 'current' to inherit from the current version. */
  defaultLocationId: string
  copyFrom?: number | 'current' | 'latest'
}

interface UpdateVersionRequest {
  label?: string | null
  description?: string | null
  defaultLocationId?: string
}

interface PriceDiffEntry {
  commodityTicker: string
  locationId: string
  oldPrice: string | null
  newPrice: string | null
}

interface VersionDiff {
  added: PriceDiffEntry[]
  removed: PriceDiffEntry[]
  changed: PriceDiffEntry[]
  unchanged: number
}

@Route('price-lists')
@Tags('Pricing')
export class PriceListVersionsController extends Controller {
  /**
   * List all versions for a price list
   */
  @Get('{code}/versions')
  public async getVersions(@Path() code: string): Promise<VersionSummary[]> {
    const priceListCode = code.toUpperCase()

    const priceList = await db
      .select({ code: priceLists.code, currentVersion: priceLists.currentVersion })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceList.length === 0) {
      throw NotFound(`Price list '${priceListCode}' not found`)
    }

    const currentVersion = priceList[0].currentVersion

    // Get all versions with price counts and the default location's display name
    const versions = await db
      .select({
        id: priceListVersions.id,
        version: priceListVersions.version,
        label: priceListVersions.label,
        description: priceListVersions.description,
        defaultLocationId: priceListVersions.defaultLocationId,
        defaultLocationName: fioLocations.name,
        createdAt: priceListVersions.createdAt,
        promotedAt: priceListVersions.promotedAt,
        priceCount: sql<number>`(
          SELECT count(*)::int FROM prices
          WHERE prices.price_list_code = ${priceListVersions.priceListCode}
            AND prices.version = ${priceListVersions.version}
        )`,
      })
      .from(priceListVersions)
      .leftJoin(fioLocations, eq(priceListVersions.defaultLocationId, fioLocations.naturalId))
      .where(eq(priceListVersions.priceListCode, priceListCode))
      .orderBy(priceListVersions.version)

    const latestVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) : 1

    return versions.map(v => ({
      id: v.id,
      version: v.version,
      label: v.label,
      description: v.description,
      defaultLocationId: v.defaultLocationId,
      defaultLocationName: v.defaultLocationName,
      priceCount: v.priceCount,
      isCurrent: v.version === currentVersion,
      isLatest: v.version === latestVersion,
      createdAt: v.createdAt,
      promotedAt: v.promotedAt,
    }))
  }

  /**
   * Get a specific version's details
   */
  @Get('{code}/versions/{version}')
  public async getVersion(@Path() code: string, @Path() version: number): Promise<VersionDetail> {
    const priceListCode = code.toUpperCase()

    const priceList = await db
      .select({ code: priceLists.code, currentVersion: priceLists.currentVersion })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceList.length === 0) {
      throw NotFound(`Price list '${priceListCode}' not found`)
    }

    const versionRow = await db
      .select({
        id: priceListVersions.id,
        version: priceListVersions.version,
        label: priceListVersions.label,
        description: priceListVersions.description,
        defaultLocationId: priceListVersions.defaultLocationId,
        defaultLocationName: fioLocations.name,
        createdByUserId: priceListVersions.createdByUserId,
        createdAt: priceListVersions.createdAt,
        promotedAt: priceListVersions.promotedAt,
        priceCount: sql<number>`(
          SELECT count(*)::int FROM prices
          WHERE prices.price_list_code = ${priceListVersions.priceListCode}
            AND prices.version = ${priceListVersions.version}
        )`,
      })
      .from(priceListVersions)
      .leftJoin(fioLocations, eq(priceListVersions.defaultLocationId, fioLocations.naturalId))
      .where(
        and(
          eq(priceListVersions.priceListCode, priceListCode),
          eq(priceListVersions.version, version)
        )
      )
      .limit(1)

    if (versionRow.length === 0) {
      throw NotFound(`Version ${version} not found for price list '${priceListCode}'`)
    }

    const latestVersionResult = await db
      .select({ maxVersion: max(priceListVersions.version) })
      .from(priceListVersions)
      .where(eq(priceListVersions.priceListCode, priceListCode))

    const latestVersion = latestVersionResult[0]?.maxVersion ?? version

    const v = versionRow[0]
    return {
      id: v.id,
      version: v.version,
      label: v.label,
      description: v.description,
      defaultLocationId: v.defaultLocationId,
      defaultLocationName: v.defaultLocationName,
      createdByUserId: v.createdByUserId,
      priceCount: v.priceCount,
      isCurrent: v.version === priceList[0].currentVersion,
      isLatest: v.version === latestVersion,
      createdAt: v.createdAt,
      promotedAt: v.promotedAt,
    }
  }

  /**
   * Create a new version for a price list
   */
  @Post('{code}/versions')
  @Security('jwt', ['prices.manage'])
  @SuccessResponse(201)
  public async createVersion(
    @Path() code: string,
    @Body() body: CreateVersionRequest
  ): Promise<VersionDetail> {
    const priceListCode = code.toUpperCase()

    // Verify price list exists and is custom (not FIO)
    const priceList = await db
      .select({
        code: priceLists.code,
        type: priceLists.type,
        currentVersion: priceLists.currentVersion,
      })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceList.length === 0) {
      throw NotFound(`Price list '${priceListCode}' not found`)
    }

    if (priceList[0].type === 'fio') {
      throw BadRequest('Cannot create versions for FIO price lists')
    }

    if (!body.defaultLocationId) {
      throw BadRequest('defaultLocationId is required')
    }

    // Validate location (case-insensitive lookup against fio_locations)
    const locationResult = await db
      .select({ naturalId: fioLocations.naturalId })
      .from(fioLocations)
      .where(ilike(fioLocations.naturalId, body.defaultLocationId))
      .limit(1)

    if (locationResult.length === 0) {
      throw BadRequest(`Location '${body.defaultLocationId}' not found`)
    }
    const resolvedLocationId = locationResult[0].naturalId

    // Determine next version number
    const maxVersionResult = await db
      .select({ maxVersion: max(priceListVersions.version) })
      .from(priceListVersions)
      .where(eq(priceListVersions.priceListCode, priceListCode))

    const nextVersion = (maxVersionResult[0]?.maxVersion ?? 0) + 1

    // Create the version metadata
    await db.insert(priceListVersions).values({
      priceListCode,
      version: nextVersion,
      label: body.label ?? null,
      description: body.description ?? null,
      defaultLocationId: resolvedLocationId,
    })

    // Copy prices and import configs from source version if requested
    if (body.copyFrom !== undefined) {
      const sourceVersion = await resolveVersion(
        priceListCode,
        body.copyFrom === 'current'
          ? undefined
          : body.copyFrom === 'latest'
            ? 'latest'
            : body.copyFrom
      )

      await db.execute(sql`
        INSERT INTO prices (price_list_code, version, commodity_ticker, location_id, price, source, source_reference)
        SELECT price_list_code, ${nextVersion}, commodity_ticker, location_id, price, source, source_reference
        FROM prices
        WHERE price_list_code = ${priceListCode} AND version = ${sourceVersion}
      `)

      await db.execute(sql`
        INSERT INTO import_configs (price_list_code, version, name, source_type, format, sheets_url, sheet_gid, config)
        SELECT price_list_code, ${nextVersion}, name, source_type, format, sheets_url, sheet_gid, config
        FROM import_configs
        WHERE price_list_code = ${priceListCode} AND version = ${sourceVersion}
      `)
    }

    this.setStatus(201)
    return this.getVersion(code, nextVersion)
  }

  /**
   * Promote a version to current
   */
  /**
   * Update a version's editable fields (label, description, defaultLocationId)
   */
  @Put('{code}/versions/{version}')
  @Security('jwt', ['prices.manage'])
  public async updateVersion(
    @Path() code: string,
    @Path() version: number,
    @Body() body: UpdateVersionRequest
  ): Promise<VersionDetail> {
    const priceListCode = code.toUpperCase()

    // Verify version exists
    const versionRow = await db
      .select({ id: priceListVersions.id })
      .from(priceListVersions)
      .where(
        and(
          eq(priceListVersions.priceListCode, priceListCode),
          eq(priceListVersions.version, version)
        )
      )
      .limit(1)

    if (versionRow.length === 0) {
      throw NotFound(`Version ${version} not found for price list '${priceListCode}'`)
    }

    const updateData: Record<string, unknown> = {}

    if (body.label !== undefined) updateData.label = body.label
    if (body.description !== undefined) updateData.description = body.description

    if (body.defaultLocationId !== undefined) {
      const locationResult = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(ilike(fioLocations.naturalId, body.defaultLocationId))
        .limit(1)

      if (locationResult.length === 0) {
        throw BadRequest(`Location '${body.defaultLocationId}' not found`)
      }
      updateData.defaultLocationId = locationResult[0].naturalId
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .update(priceListVersions)
        .set(updateData)
        .where(
          and(
            eq(priceListVersions.priceListCode, priceListCode),
            eq(priceListVersions.version, version)
          )
        )
    }

    return this.getVersion(code, version)
  }

  @Post('{code}/versions/{version}/promote')
  @Security('jwt', ['prices.manage'])
  public async promoteVersion(
    @Path() code: string,
    @Path() version: number
  ): Promise<VersionDetail> {
    const priceListCode = code.toUpperCase()

    // Verify price list exists and is custom
    const priceList = await db
      .select({ code: priceLists.code, type: priceLists.type })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceList.length === 0) {
      throw NotFound(`Price list '${priceListCode}' not found`)
    }

    if (priceList[0].type === 'fio') {
      throw BadRequest('Cannot promote versions for FIO price lists')
    }

    // Verify version exists
    const versionRow = await db
      .select({ id: priceListVersions.id })
      .from(priceListVersions)
      .where(
        and(
          eq(priceListVersions.priceListCode, priceListCode),
          eq(priceListVersions.version, version)
        )
      )
      .limit(1)

    if (versionRow.length === 0) {
      throw NotFound(`Version ${version} not found for price list '${priceListCode}'`)
    }

    // Update current version pointer
    await db
      .update(priceLists)
      .set({ currentVersion: version, updatedAt: new Date() })
      .where(eq(priceLists.code, priceListCode))

    // Record promotion timestamp
    await db
      .update(priceListVersions)
      .set({ promotedAt: new Date() })
      .where(
        and(
          eq(priceListVersions.priceListCode, priceListCode),
          eq(priceListVersions.version, version)
        )
      )

    return this.getVersion(code, version)
  }

  /**
   * Delete a version (cannot delete the current version)
   */
  @Delete('{code}/versions/{version}')
  @Security('jwt', ['prices.manage'])
  @SuccessResponse(204)
  public async deleteVersion(@Path() code: string, @Path() version: number): Promise<void> {
    const priceListCode = code.toUpperCase()

    // Verify price list exists
    const priceList = await db
      .select({ code: priceLists.code, currentVersion: priceLists.currentVersion })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceList.length === 0) {
      throw NotFound(`Price list '${priceListCode}' not found`)
    }

    if (priceList[0].currentVersion === version) {
      throw BadRequest('Cannot delete the current version. Promote a different version first.')
    }

    // Verify version exists
    const versionRow = await db
      .select({ id: priceListVersions.id })
      .from(priceListVersions)
      .where(
        and(
          eq(priceListVersions.priceListCode, priceListCode),
          eq(priceListVersions.version, version)
        )
      )
      .limit(1)

    if (versionRow.length === 0) {
      throw NotFound(`Version ${version} not found for price list '${priceListCode}'`)
    }

    // Delete all prices and import configs for this version
    await db
      .delete(prices)
      .where(and(eq(prices.priceListCode, priceListCode), eq(prices.version, version)))

    await db
      .delete(importConfigs)
      .where(
        and(eq(importConfigs.priceListCode, priceListCode), eq(importConfigs.version, version))
      )

    // Delete the version metadata
    await db
      .delete(priceListVersions)
      .where(
        and(
          eq(priceListVersions.priceListCode, priceListCode),
          eq(priceListVersions.version, version)
        )
      )

    this.setStatus(204)
  }

  /**
   * Compare two versions of a price list
   */
  @Get('{code}/versions/{version}/diff/{otherVersion}')
  public async diffVersions(
    @Path() code: string,
    @Path() version: number,
    @Path() otherVersion: number
  ): Promise<VersionDiff> {
    const priceListCode = code.toUpperCase()

    // Verify price list exists
    const priceList = await db
      .select({ code: priceLists.code })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceList.length === 0) {
      throw NotFound(`Price list '${priceListCode}' not found`)
    }

    // Fetch prices for both versions
    const [pricesA, pricesB] = await Promise.all([
      db
        .select({
          commodityTicker: prices.commodityTicker,
          locationId: prices.locationId,
          price: prices.price,
        })
        .from(prices)
        .where(and(eq(prices.priceListCode, priceListCode), eq(prices.version, version))),
      db
        .select({
          commodityTicker: prices.commodityTicker,
          locationId: prices.locationId,
          price: prices.price,
        })
        .from(prices)
        .where(and(eq(prices.priceListCode, priceListCode), eq(prices.version, otherVersion))),
    ])

    // Index prices by key for comparison
    const mapA = new Map(pricesA.map(p => [`${p.commodityTicker}:${p.locationId}`, p.price]))
    const mapB = new Map(pricesB.map(p => [`${p.commodityTicker}:${p.locationId}`, p.price]))

    const added: PriceDiffEntry[] = []
    const removed: PriceDiffEntry[] = []
    const changed: PriceDiffEntry[] = []
    let unchanged = 0

    // Find removed and changed (in A but not in B, or different)
    for (const [key, priceA] of mapA) {
      const [commodityTicker, locationId] = key.split(':')
      const priceB = mapB.get(key)
      if (priceB === undefined) {
        removed.push({ commodityTicker, locationId, oldPrice: priceA, newPrice: null })
      } else if (priceA !== priceB) {
        changed.push({ commodityTicker, locationId, oldPrice: priceA, newPrice: priceB })
      } else {
        unchanged++
      }
    }

    // Find added (in B but not in A)
    for (const [key, priceB] of mapB) {
      if (!mapA.has(key)) {
        const [commodityTicker, locationId] = key.split(':')
        added.push({ commodityTicker, locationId, oldPrice: null, newPrice: priceB })
      }
    }

    return { added, removed, changed, unchanged }
  }
}
