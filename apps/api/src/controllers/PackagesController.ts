import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import type { Currency } from '@kawakawa/types'
import { db, packages, packageInputs, fioCommodities, users } from '../db/index.js'
import { eq, and, inArray } from 'drizzle-orm'
import { BadRequest, NotFound } from '../utils/errors.js'
import type { JwtPayload } from '../utils/jwt.js'
import type { PackageType, PackagePricingMode } from '../services/package-price-calculator.js'
import {
  calculateAllPackagePrices,
  calculatePackagePrice,
  type PackagePriceBreakdown,
} from '../services/package-price-calculator.js'

type PackageRow = typeof packages.$inferSelect

interface PackageInputDto {
  commodityTicker: string
  commodityName: string | null
  quantity: number
}

interface PackageResponse {
  id: number
  name: string
  type: PackageType
  salePrice: number | null
  currency: Currency | null
  pricingMode: PackagePricingMode
  marginMultiplier: number | null
  /** One of the BoM commodity tickers, used as the package's visual icon. */
  iconCommodityTicker: string | null
  description: string | null
  isActive: boolean
  createdByUserId: number | null
  createdByUsername: string | null
  createdAt: Date
  updatedAt: Date
  inputs: PackageInputDto[]
}

interface PackageInputRequest {
  commodityTicker: string
  quantity: number
}

interface CreatePackageRequest {
  name: string
  type?: PackageType
  salePrice?: number | null
  currency?: Currency | null
  /** Defaults to 'fixed'. 'margin' requires marginMultiplier. */
  pricingMode?: PackagePricingMode
  /** Required (and must be > 0) when pricingMode is 'margin'. */
  marginMultiplier?: number | null
  /** Optional BoM commodity ticker to use as the package's icon. */
  iconCommodityTicker?: string | null
  description?: string | null
  isActive?: boolean
  inputs: PackageInputRequest[]
}

interface UpdatePackageRequest {
  name?: string
  type?: PackageType
  salePrice?: number | null
  currency?: Currency | null
  pricingMode?: PackagePricingMode
  marginMultiplier?: number | null
  iconCommodityTicker?: string | null
  description?: string | null
  isActive?: boolean
  /** If provided, fully replaces the package's existing material lines. */
  inputs?: PackageInputRequest[]
}

interface NormalizedInput {
  commodityTicker: string
  quantity: number
}

/**
 * Normalize and validate the raw input lines: uppercase tickers, require a
 * positive integer quantity, reject duplicate tickers, and verify every
 * ticker exists in fioCommodities. Throws BadRequest on any violation.
 */
async function validateInputs(inputs: PackageInputRequest[]): Promise<NormalizedInput[]> {
  if (!inputs || inputs.length === 0) {
    throw BadRequest('A package must have at least one material line')
  }

  const normalized: NormalizedInput[] = inputs.map((line, i) => {
    const lineNum = i + 1
    if (!line.commodityTicker) {
      throw BadRequest(`Line ${lineNum}: commodityTicker is required`)
    }
    const quantity = Math.floor(line.quantity)
    if (!Number.isFinite(line.quantity) || quantity <= 0) {
      throw BadRequest(
        `Line ${lineNum} (${line.commodityTicker.toUpperCase()}): quantity must be > 0`
      )
    }
    return { commodityTicker: line.commodityTicker.toUpperCase(), quantity }
  })

  const tickers = normalized.map(n => n.commodityTicker)
  const uniqueTickers = new Set(tickers)
  if (uniqueTickers.size !== tickers.length) {
    throw BadRequest('Duplicate commodityTicker values are not allowed within a package')
  }

  const found = await db
    .select({ ticker: fioCommodities.ticker })
    .from(fioCommodities)
    .where(inArray(fioCommodities.ticker, [...uniqueTickers]))
  const foundSet = new Set(found.map(f => f.ticker))
  const missing = tickers.filter(t => !foundSet.has(t))
  if (missing.length > 0) {
    throw BadRequest(`Unknown commodity ticker(s): ${[...new Set(missing)].join(', ')}`)
  }

  return normalized
}

/**
 * Resolve the requested icon ticker against a package's material lines. The
 * icon must be one of the package's own inputs (uppercased); an empty/missing
 * value clears it. Throws BadRequest if it isn't in the BoM.
 */
function resolveIconTicker(
  requested: string | null | undefined,
  inputs: NormalizedInput[]
): string | null {
  if (!requested) return null
  const upper = requested.toUpperCase()
  if (!inputs.some(i => i.commodityTicker === upper)) {
    throw BadRequest(`Icon commodity ${upper} must be one of the package's materials`)
  }
  return upper
}

async function loadInputsForPackages(
  packageIds: number[]
): Promise<Map<number, PackageInputDto[]>> {
  const out = new Map<number, PackageInputDto[]>()
  if (packageIds.length === 0) return out
  const rows = await db
    .select({
      packageId: packageInputs.packageId,
      commodityTicker: packageInputs.commodityTicker,
      commodityName: fioCommodities.name,
      quantity: packageInputs.quantity,
    })
    .from(packageInputs)
    .leftJoin(fioCommodities, eq(packageInputs.commodityTicker, fioCommodities.ticker))
    .where(inArray(packageInputs.packageId, packageIds))
    .orderBy(packageInputs.commodityTicker)
  for (const r of rows) {
    const list = out.get(r.packageId) ?? []
    list.push({
      commodityTicker: r.commodityTicker,
      commodityName: r.commodityName,
      quantity: r.quantity,
    })
    out.set(r.packageId, list)
  }
  return out
}

function toResponse(
  row: PackageRow & { createdByUsername?: string | null },
  inputs: PackageInputDto[]
): PackageResponse {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    salePrice: row.salePrice !== null ? parseFloat(row.salePrice) : null,
    currency: row.currency,
    pricingMode: row.pricingMode,
    marginMultiplier: row.marginMultiplier !== null ? parseFloat(row.marginMultiplier) : null,
    iconCommodityTicker: row.iconCommodityTicker,
    description: row.description,
    isActive: row.isActive,
    createdByUserId: row.createdByUserId,
    createdByUsername: row.createdByUsername ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    inputs,
  }
}

interface EffectivePricingFields {
  salePrice: number | null | undefined
  currency: Currency | null | undefined
  pricingMode: PackagePricingMode
  marginMultiplier: number | null | undefined
}

/**
 * Validate the *effective* (post-merge, for updates) pricing fields of a
 * package: salePrice/currency must be provided together (or both omitted —
 * a package can be a draft with no price yet), and a positive marginMultiplier
 * is required whenever pricingMode is 'margin'. Throws BadRequest on violation.
 */
function validatePricing(fields: EffectivePricingFields): void {
  const hasSalePrice = fields.salePrice != null
  const hasCurrency = fields.currency != null
  if (hasSalePrice !== hasCurrency) {
    throw BadRequest('salePrice and currency must be provided together')
  }

  if (fields.pricingMode === 'margin') {
    const m = fields.marginMultiplier
    if (m == null || !Number.isFinite(m) || m <= 0) {
      throw BadRequest('marginMultiplier must be a positive number when pricingMode is "margin"')
    }
  }
}

@Route('packages')
@Tags('Pricing')
export class PackagesController extends Controller {
  /**
   * List packages (bills of materials sold as a bundle, e.g. ships).
   * @param type Filter by package type ('ship' or 'building')
   * @param activeOnly Only return active packages (default: true when omitted, pass false to include inactive)
   */
  @Get()
  @Security('jwt', ['packages.view'])
  public async listPackages(
    @Query() type?: PackageType,
    @Query() activeOnly?: boolean
  ): Promise<PackageResponse[]> {
    const conditions = []
    if (type) conditions.push(eq(packages.type, type))
    if (activeOnly !== false) conditions.push(eq(packages.isActive, true))

    const rows = await db
      .select({
        id: packages.id,
        name: packages.name,
        type: packages.type,
        salePrice: packages.salePrice,
        currency: packages.currency,
        pricingMode: packages.pricingMode,
        marginMultiplier: packages.marginMultiplier,
        iconCommodityTicker: packages.iconCommodityTicker,
        description: packages.description,
        isActive: packages.isActive,
        createdByUserId: packages.createdByUserId,
        createdByUsername: users.username,
        createdAt: packages.createdAt,
        updatedAt: packages.updatedAt,
      })
      .from(packages)
      .leftJoin(users, eq(packages.createdByUserId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(packages.name)

    const inputsMap = await loadInputsForPackages(rows.map(r => r.id))
    return rows.map(r => toResponse(r, inputsMap.get(r.id) ?? []))
  }

  /**
   * Compute price breakdowns for every active package against a price list,
   * comparing the summed material cost to each package's listed sale price.
   * @param priceListCode The price list to price materials against
   * @param locationId Location to price at (defaults to the version's default location)
   * @param version Price list version (defaults to the price list's current version)
   * @param type Filter by package type
   */
  @Get('price')
  @Security('jwt', ['packages.view'])
  public async getAllPackagePrices(
    @Query() priceListCode: string,
    @Query() locationId?: string,
    @Query() version?: number,
    @Query() type?: PackageType
  ): Promise<PackagePriceBreakdown[]> {
    if (!priceListCode) {
      throw BadRequest('priceListCode is required')
    }
    return calculateAllPackagePrices(priceListCode, locationId, version, type)
  }

  /** Get a single package with its material lines. */
  @Get('{id}')
  @Security('jwt', ['packages.view'])
  public async getPackage(@Path() id: number): Promise<PackageResponse> {
    const [row] = await db
      .select({
        id: packages.id,
        name: packages.name,
        type: packages.type,
        salePrice: packages.salePrice,
        currency: packages.currency,
        pricingMode: packages.pricingMode,
        marginMultiplier: packages.marginMultiplier,
        iconCommodityTicker: packages.iconCommodityTicker,
        description: packages.description,
        isActive: packages.isActive,
        createdByUserId: packages.createdByUserId,
        createdByUsername: users.username,
        createdAt: packages.createdAt,
        updatedAt: packages.updatedAt,
      })
      .from(packages)
      .leftJoin(users, eq(packages.createdByUserId, users.id))
      .where(eq(packages.id, id))
      .limit(1)
    if (!row) throw NotFound(`Package with ID ${id} not found`)

    const inputsMap = await loadInputsForPackages([id])
    return toResponse(row, inputsMap.get(id) ?? [])
  }

  /**
   * Compute the price breakdown for a single package against a price list,
   * comparing the summed material cost to its listed sale price.
   * @param id The package ID
   * @param priceListCode The price list to price materials against
   * @param locationId Location to price at (defaults to the version's default location)
   * @param version Price list version (defaults to the price list's current version)
   */
  @Get('{id}/price')
  @Security('jwt', ['packages.view'])
  public async getPackagePrice(
    @Path() id: number,
    @Query() priceListCode: string,
    @Query() locationId?: string,
    @Query() version?: number
  ): Promise<PackagePriceBreakdown> {
    if (!priceListCode) {
      throw BadRequest('priceListCode is required')
    }
    return calculatePackagePrice(id, priceListCode, locationId, version)
  }

  /** Create a new package with its material lines. */
  @Post()
  @Security('jwt', ['packages.manage'])
  @SuccessResponse('201', 'Created')
  public async createPackage(
    @Body() body: CreatePackageRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<PackageResponse> {
    if (!body.name?.trim()) {
      throw BadRequest('name is required')
    }
    const pricingMode = body.pricingMode ?? 'fixed'
    validatePricing({
      salePrice: body.salePrice,
      currency: body.currency,
      pricingMode,
      marginMultiplier: body.marginMultiplier,
    })
    const normalizedInputs = await validateInputs(body.inputs)
    const iconCommodityTicker = resolveIconTicker(body.iconCommodityTicker, normalizedInputs)

    const result = await db.transaction(async tx => {
      const [row] = await tx
        .insert(packages)
        .values({
          name: body.name.trim(),
          type: body.type ?? 'ship',
          salePrice: body.salePrice != null ? body.salePrice.toFixed(2) : null,
          currency: body.currency ?? null,
          pricingMode,
          marginMultiplier:
            pricingMode === 'margin' && body.marginMultiplier != null
              ? body.marginMultiplier.toFixed(4)
              : null,
          iconCommodityTicker,
          description: body.description ?? null,
          isActive: body.isActive ?? true,
          createdByUserId: request.user.userId,
        })
        .returning()
      const inputRows = await tx
        .insert(packageInputs)
        .values(normalizedInputs.map(i => ({ ...i, packageId: row.id })))
        .returning()
      return { row, inputRows }
    })

    this.setStatus(201)
    return toResponse(
      { ...result.row, createdByUsername: null },
      result.inputRows.map(r => ({
        commodityTicker: r.commodityTicker,
        commodityName: null,
        quantity: r.quantity,
      }))
    )
  }

  /**
   * Update a package. When `inputs` is supplied, it fully replaces the
   * existing material lines.
   */
  @Put('{id}')
  @Security('jwt', ['packages.manage'])
  public async updatePackage(
    @Path() id: number,
    @Body() body: UpdatePackageRequest
  ): Promise<PackageResponse> {
    const [existing] = await db.select().from(packages).where(eq(packages.id, id)).limit(1)
    if (!existing) throw NotFound(`Package with ID ${id} not found`)

    if (body.name !== undefined && !body.name.trim()) {
      throw BadRequest('name cannot be empty')
    }

    // Validate against the *effective* (post-merge) pricing fields, since a
    // PUT may only touch one of salePrice/currency/pricingMode/marginMultiplier
    // at a time (e.g. isActive-only updates) but they must remain consistent.
    const effectivePricingMode = body.pricingMode ?? existing.pricingMode
    const effectiveSalePrice = body.salePrice !== undefined ? body.salePrice : existing.salePrice
    const effectiveCurrency = body.currency !== undefined ? body.currency : existing.currency
    const effectiveMarginMultiplier =
      body.marginMultiplier !== undefined
        ? body.marginMultiplier
        : existing.marginMultiplier != null
          ? parseFloat(existing.marginMultiplier)
          : null
    validatePricing({
      salePrice: effectiveSalePrice != null ? parseFloat(String(effectiveSalePrice)) : null,
      currency: effectiveCurrency,
      pricingMode: effectivePricingMode,
      marginMultiplier: effectiveMarginMultiplier,
    })

    let normalizedInputs: NormalizedInput[] | null = null
    if (body.inputs !== undefined) {
      normalizedInputs = await validateInputs(body.inputs)
    }

    const updateData: Partial<PackageRow> & { updatedAt: Date } = {
      updatedAt: new Date(),
    }

    // Icon resolution: the icon must always be one of the (post-update) BoM
    // tickers. We reconcile against whichever input set will be in effect —
    // the replacement `inputs` if given, otherwise the package's existing ones.
    if (body.iconCommodityTicker !== undefined || normalizedInputs !== null) {
      const effectiveInputs =
        normalizedInputs ??
        (
          await db
            .select({ commodityTicker: packageInputs.commodityTicker })
            .from(packageInputs)
            .where(eq(packageInputs.packageId, id))
        ).map(r => ({ commodityTicker: r.commodityTicker, quantity: 1 }))
      // Requested icon (explicit) or the existing one (when only inputs changed).
      const requestedIcon =
        body.iconCommodityTicker !== undefined
          ? body.iconCommodityTicker
          : existing.iconCommodityTicker
      const inBom =
        requestedIcon != null &&
        effectiveInputs.some(i => i.commodityTicker === requestedIcon.toUpperCase())
      // Explicit request is validated (throws if not in BoM); an existing icon
      // that fell out of the BoM after an input replace is silently cleared.
      updateData.iconCommodityTicker =
        body.iconCommodityTicker !== undefined
          ? resolveIconTicker(body.iconCommodityTicker, effectiveInputs)
          : inBom
            ? requestedIcon
            : null
    }
    if (body.name !== undefined) updateData.name = body.name.trim()
    if (body.type !== undefined) updateData.type = body.type
    if (body.salePrice !== undefined) {
      updateData.salePrice = body.salePrice != null ? body.salePrice.toFixed(2) : null
    }
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.pricingMode !== undefined) {
      updateData.pricingMode = body.pricingMode
      // Switching to 'fixed' without an explicit marginMultiplier clears the
      // now-unused stored multiplier.
      if (body.pricingMode === 'fixed' && body.marginMultiplier === undefined) {
        updateData.marginMultiplier = null
      }
    }
    if (body.marginMultiplier !== undefined) {
      updateData.marginMultiplier =
        effectivePricingMode === 'margin' && body.marginMultiplier != null
          ? body.marginMultiplier.toFixed(4)
          : null
    }
    if (body.description !== undefined) updateData.description = body.description
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    await db.transaction(async tx => {
      await tx.update(packages).set(updateData).where(eq(packages.id, id))
      if (normalizedInputs) {
        await tx.delete(packageInputs).where(eq(packageInputs.packageId, id))
        await tx.insert(packageInputs).values(normalizedInputs.map(i => ({ ...i, packageId: id })))
      }
    })

    return this.getPackage(id)
  }

  /** Delete a package (and its material lines, via cascade). */
  @Delete('{id}')
  @Security('jwt', ['packages.manage'])
  @SuccessResponse('204', 'Deleted')
  public async deletePackage(@Path() id: number): Promise<void> {
    const [existing] = await db
      .select({ id: packages.id })
      .from(packages)
      .where(eq(packages.id, id))
      .limit(1)
    if (!existing) throw NotFound(`Package with ID ${id} not found`)

    await db.delete(packages).where(eq(packages.id, id))
    this.setStatus(204)
  }
}

// Exported for unit testing
export { validateInputs, validatePricing, resolveIconTicker }
