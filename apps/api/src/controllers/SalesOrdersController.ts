import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import type { Currency, SalesOrderStatus } from '@kawakawa/types'
import {
  db,
  salesOrders,
  salesOrderItems,
  packageInputs,
  fioCommodities,
  pickupLocations,
  fioLocations,
  users,
} from '../db/index.js'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import type { JwtPayload } from '../utils/jwt.js'
import { calculatePackagePrice } from '../services/package-price-calculator.js'
import { notificationService } from '@kawakawa/services/notifications'
import { getInventoryForUsers } from '@kawakawa/services/market'

interface SalesOrderItemDto {
  id: number
  packageId: number | null
  packageName: string
  quantity: number
  unitPrice: number | null
  lineTotal: number | null
}

interface SalesOrderResponse {
  id: number
  status: SalesOrderStatus
  requestedByUserId: number
  requestedByName: string | null
  claimedByUserId: number | null
  claimedByName: string | null
  customerName: string | null
  notes: string | null
  priceListCode: string | null
  version: number | null
  currency: Currency | null
  pickupLocationId: string | null
  pickupLocationName: string | null
  pickupFee: number
  packagesSubtotal: number
  grandTotal: number
  claimedAt: string | null
  slipGeneratedAt: string | null
  fulfilledAt: string | null
  createdAt: string
  updatedAt: string
  items: SalesOrderItemDto[]
  // Per-viewer action flags (relative to the authenticated caller), so the UI
  // doesn't have to re-derive the ownership/lifecycle rules the guards enforce.
  isRequestor: boolean
  isClaimer: boolean
  canClaim: boolean
  canFulfill: boolean
  canCancel: boolean
  // Claimer can generate the customer sales slip once they've claimed it.
  canGenerateSlip: boolean
}

interface SalesOrderItemRequest {
  packageId: number
  quantity: number
}

// One material line in the readiness check: how much the order needs vs. how
// much the claimer holds at the pickup location.
interface ReadinessLine {
  commodityTicker: string
  commodityName: string | null
  needed: number
  available: number
  shortfall: number // max(0, needed - available)
}

interface SalesOrderReadinessResponse {
  salesOrderId: number
  locationId: string | null
  locationName: string | null
  // FIO freshness: when the claimer's inventory at this location was last
  // uploaded to FIO, so the UI can warn if it's stale/absent.
  inventoryUploadedAt: string | null
  ready: boolean // true if nothing is short
  lines: ReadinessLine[]
  shortfalls: ReadinessLine[] // subset with shortfall > 0, for quick display
}

// The customer-facing "sales slip" generated from a claimed order.
interface SalesSlipLine {
  packageName: string
  quantity: number
  unitPrice: number | null
  lineTotal: number | null
}

interface SalesSlipDocument {
  salesOrderId: number
  customerName: string | null
  currency: Currency | null
  lines: SalesSlipLine[]
  pickupLocationName: string | null
  pickupFee: number
  total: number
  slipGeneratedAt: string | null
}

interface CreateSalesOrderRequest {
  priceListCode: string
  locationId: string
  version?: number | null
  customerName?: string | null
  notes?: string | null
  pickupLocationId?: string | null
  items: SalesOrderItemRequest[]
}

type SalesOrderRow = typeof salesOrders.$inferSelect

function num(v: string | null): number | null {
  return v !== null ? parseFloat(v) : null
}

// ---- Pure state-transition guards (exported for unit testing) ----
// Each throws an HttpError when the transition is not allowed for the given
// order/actor, or returns void when permitted. Kept free of DB access so they
// can be tested in isolation, mirroring the house pattern of exported
// validators (validateInputs, calculateInvoiceStatus, ...).

interface GuardOrder {
  status: SalesOrderStatus
  requestedByUserId: number
  claimedByUserId: number | null
}

function assertClaimable(order: GuardOrder): void {
  if (order.status !== 'open') {
    throw BadRequest(`Only open orders can be claimed (this order is ${order.status})`)
  }
}

function assertFulfillable(order: GuardOrder, actorUserId: number): void {
  if (order.status !== 'claimed') {
    throw BadRequest(`Only claimed orders can be fulfilled (this order is ${order.status})`)
  }
  if (order.claimedByUserId !== actorUserId) {
    throw Forbidden('Only the member who claimed this order can fulfill it')
  }
}

function assertCancellable(order: GuardOrder, actorUserId: number): void {
  if (order.status === 'fulfilled' || order.status === 'cancelled') {
    throw BadRequest(`Cannot cancel a ${order.status} order`)
  }
  if (order.requestedByUserId !== actorUserId && order.claimedByUserId !== actorUserId) {
    throw Forbidden('Only the requestor or claimer can cancel this order')
  }
}

// Pure needed-vs-available diff → readiness lines, sorted shortfall-first.
// Extracted for unit testing; the endpoint supplies the two maps + names.
function computeReadinessLines(
  needed: Map<string, number>,
  available: Map<string, number>,
  names: Map<string, string>
): ReadinessLine[] {
  return [...needed.entries()]
    .map(([commodityTicker, need]) => {
      const have = available.get(commodityTicker) ?? 0
      return {
        commodityTicker,
        commodityName: names.get(commodityTicker) ?? null,
        needed: need,
        available: have,
        shortfall: Math.max(0, need - have),
      }
    })
    .sort((a, b) => b.shortfall - a.shortfall || a.commodityTicker.localeCompare(b.commodityTicker))
}

// Validate + dedupe create-request items into a package-id → total-quantity map.
function normalizeItems(items: SalesOrderItemRequest[] | undefined): Map<number, number> {
  if (!items || items.length === 0) {
    throw BadRequest('A sales order must have at least one package')
  }
  const byPackage = new Map<number, number>()
  for (const item of items) {
    if (!Number.isInteger(item.packageId)) throw BadRequest('Invalid packageId')
    const qty = Math.floor(item.quantity)
    if (!Number.isFinite(item.quantity) || qty <= 0) {
      throw BadRequest('Each package quantity must be > 0')
    }
    byPackage.set(item.packageId, (byPackage.get(item.packageId) ?? 0) + qty)
  }
  return byPackage
}

function toResponse(
  row: SalesOrderRow & {
    requestedByName?: string | null
    claimedByName?: string | null
    pickupLocationName?: string | null
  },
  items: SalesOrderItemDto[],
  viewerUserId: number
): SalesOrderResponse {
  const packagesSubtotal = parseFloat(row.packagesSubtotal)
  const pickupFee = parseFloat(row.pickupFee)
  const isRequestor = row.requestedByUserId === viewerUserId
  const isClaimer = row.claimedByUserId === viewerUserId
  const active = row.status !== 'fulfilled' && row.status !== 'cancelled'
  return {
    id: row.id,
    status: row.status,
    requestedByUserId: row.requestedByUserId,
    requestedByName: row.requestedByName ?? null,
    claimedByUserId: row.claimedByUserId,
    claimedByName: row.claimedByName ?? null,
    customerName: row.customerName,
    notes: row.notes,
    priceListCode: row.priceListCode,
    version: row.version,
    currency: row.currency,
    pickupLocationId: row.pickupLocationId,
    pickupLocationName: row.pickupLocationName ?? null,
    pickupFee,
    packagesSubtotal,
    grandTotal: Math.round((packagesSubtotal + pickupFee) * 100) / 100,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    slipGeneratedAt: row.slipGeneratedAt?.toISOString() ?? null,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items,
    isRequestor,
    isClaimer,
    canClaim: row.status === 'open',
    canFulfill: row.status === 'claimed' && isClaimer,
    canCancel: active && (isRequestor || isClaimer),
    canGenerateSlip: (row.status === 'claimed' || row.status === 'fulfilled') && isClaimer,
  }
}

/**
 * Expand a sales order's package items into a combined material requirement:
 * for each item, its package's bill of materials (packageInputs) times the
 * ordered quantity, summed per commodity ticker across all items. Items whose
 * package was deleted (packageId null) contribute nothing.
 */
async function expandOrderMaterials(salesOrderId: number): Promise<Map<string, number>> {
  const items = await db
    .select({ packageId: salesOrderItems.packageId, quantity: salesOrderItems.quantity })
    .from(salesOrderItems)
    .where(eq(salesOrderItems.salesOrderId, salesOrderId))

  const needed = new Map<string, number>()
  const packageIds = [
    ...new Set(items.map(i => i.packageId).filter((v): v is number => v !== null)),
  ]
  if (packageIds.length === 0) return needed

  const inputs = await db
    .select({
      packageId: packageInputs.packageId,
      commodityTicker: packageInputs.commodityTicker,
      quantity: packageInputs.quantity,
    })
    .from(packageInputs)
    .where(inArray(packageInputs.packageId, packageIds))

  const inputsByPackage = new Map<number, { commodityTicker: string; quantity: number }[]>()
  for (const inp of inputs) {
    const list = inputsByPackage.get(inp.packageId) ?? []
    list.push({ commodityTicker: inp.commodityTicker, quantity: inp.quantity })
    inputsByPackage.set(inp.packageId, list)
  }

  for (const item of items) {
    if (item.packageId === null) continue
    const bom = inputsByPackage.get(item.packageId) ?? []
    for (const line of bom) {
      needed.set(
        line.commodityTicker,
        (needed.get(line.commodityTicker) ?? 0) + line.quantity * item.quantity
      )
    }
  }
  return needed
}

async function loadItems(orderIds: number[]): Promise<Map<number, SalesOrderItemDto[]>> {
  const out = new Map<number, SalesOrderItemDto[]>()
  if (orderIds.length === 0) return out
  const rows = await db
    .select()
    .from(salesOrderItems)
    .where(inArray(salesOrderItems.salesOrderId, orderIds))
    .orderBy(salesOrderItems.id)
  for (const r of rows) {
    const unitPrice = num(r.unitPrice)
    const list = out.get(r.salesOrderId) ?? []
    list.push({
      id: r.id,
      packageId: r.packageId,
      packageName: r.packageName,
      quantity: r.quantity,
      unitPrice,
      lineTotal: unitPrice !== null ? Math.round(unitPrice * r.quantity * 100) / 100 : null,
    })
    out.set(r.salesOrderId, list)
  }
  return out
}

// Loads a sales order + its items + the display names/pickup name needed for a
// full response. Throws NotFound if missing.
async function loadOrderResponse(id: number, viewerUserId: number): Promise<SalesOrderResponse> {
  const requestedBy = users
  const [row] = await db
    .select({
      order: salesOrders,
      requestedByName: requestedBy.displayName,
      pickupLocationName: fioLocations.name,
    })
    .from(salesOrders)
    .leftJoin(requestedBy, eq(salesOrders.requestedByUserId, requestedBy.id))
    .leftJoin(fioLocations, eq(salesOrders.pickupLocationId, fioLocations.naturalId))
    .where(eq(salesOrders.id, id))
    .limit(1)
  if (!row) throw NotFound(`Sales order ${id} not found`)

  let claimedByName: string | null = null
  if (row.order.claimedByUserId !== null) {
    const [claimer] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, row.order.claimedByUserId))
      .limit(1)
    claimedByName = claimer?.displayName ?? null
  }

  const itemsMap = await loadItems([id])
  return toResponse(
    {
      ...row.order,
      requestedByName: row.requestedByName,
      claimedByName,
      pickupLocationName: row.pickupLocationName,
    },
    itemsMap.get(id) ?? [],
    viewerUserId
  )
}

@Route('sales-orders')
@Tags('Sales Orders')
@Security('jwt')
export class SalesOrdersController extends Controller {
  /**
   * List sales orders. Defaults to the open queue; pass filters to narrow.
   * @param status Filter by status (open/claimed/fulfilled/cancelled)
   * @param mine If true, only orders the caller requested or claimed
   */
  @Get()
  @Security('jwt', ['sales_orders.view'])
  public async listSalesOrders(
    @Request() request: { user: JwtPayload },
    @Query() status?: SalesOrderStatus,
    @Query() mine?: boolean
  ): Promise<SalesOrderResponse[]> {
    const userId = request.user.userId
    const requestedBy = users

    const conditions = []
    if (status) conditions.push(eq(salesOrders.status, status))

    const rows = await db
      .select({
        order: salesOrders,
        requestedByName: requestedBy.displayName,
        pickupLocationName: fioLocations.name,
      })
      .from(salesOrders)
      .leftJoin(requestedBy, eq(salesOrders.requestedByUserId, requestedBy.id))
      .leftJoin(fioLocations, eq(salesOrders.pickupLocationId, fioLocations.naturalId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(salesOrders.createdAt))

    let filtered = rows
    if (mine) {
      filtered = rows.filter(
        r => r.order.requestedByUserId === userId || r.order.claimedByUserId === userId
      )
    }

    // Resolve claimer display names in one batch.
    const claimerIds = [
      ...new Set(filtered.map(r => r.order.claimedByUserId).filter((v): v is number => v !== null)),
    ]
    const claimerNames = new Map<number, string>()
    if (claimerIds.length > 0) {
      const claimers = await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, claimerIds))
      for (const c of claimers) claimerNames.set(c.id, c.displayName)
    }

    const itemsMap = await loadItems(filtered.map(r => r.order.id))
    return filtered.map(r =>
      toResponse(
        {
          ...r.order,
          requestedByName: r.requestedByName,
          claimedByName:
            r.order.claimedByUserId !== null
              ? (claimerNames.get(r.order.claimedByUserId) ?? null)
              : null,
          pickupLocationName: r.pickupLocationName,
        },
        itemsMap.get(r.order.id) ?? [],
        userId
      )
    )
  }

  /** Get a single sales order with its line items. */
  @Get('{id}')
  @Security('jwt', ['sales_orders.view'])
  public async getSalesOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SalesOrderResponse> {
    return loadOrderResponse(id, request.user.userId)
  }

  /**
   * Create + submit a new sales order to the queue. Unit prices are
   * (re)computed server-side from the given price list/version/location so the
   * order snapshot is authoritative, not client-supplied.
   */
  @Post()
  @Security('jwt', ['sales_orders.create'])
  @SuccessResponse('201', 'Created')
  public async createSalesOrder(
    @Body() body: CreateSalesOrderRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SalesOrderResponse> {
    if (!body.priceListCode?.trim()) throw BadRequest('priceListCode is required')
    if (!body.locationId?.trim()) throw BadRequest('locationId is required')

    // Validate + dedupe items.
    const byPackage = normalizeItems(body.items)

    const version = body.version ?? undefined
    let currency: Currency | null = null
    let packagesSubtotal = 0
    const itemsToInsert: {
      packageId: number
      packageName: string
      quantity: number
      unitPrice: string | null
    }[] = []

    for (const [packageId, quantity] of byPackage) {
      // Recompute the authoritative price snapshot for this package.
      const breakdown = await calculatePackagePrice(
        packageId,
        body.priceListCode,
        body.locationId,
        version
      )
      currency = breakdown.currency
      const unitPrice = breakdown.salePrice
      if (unitPrice !== null) {
        packagesSubtotal += Math.round(unitPrice * quantity * 100) / 100
      }
      itemsToInsert.push({
        packageId,
        packageName: breakdown.packageName,
        quantity,
        unitPrice: unitPrice !== null ? unitPrice.toFixed(2) : null,
      })
    }
    packagesSubtotal = Math.round(packagesSubtotal * 100) / 100

    // Snapshot the pickup fee (currency must match the order currency to apply).
    const pickupLocationId = body.pickupLocationId ? body.pickupLocationId.trim() : null
    let pickupFee = 0
    if (pickupLocationId) {
      const [loc] = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, pickupLocationId))
        .limit(1)
      if (!loc) throw BadRequest(`Unknown pickup location: ${pickupLocationId}`)
      const [fee] = await db
        .select()
        .from(pickupLocations)
        .where(eq(pickupLocations.locationId, pickupLocationId))
        .limit(1)
      if (fee && (currency === null || fee.currency === currency)) {
        pickupFee = parseFloat(fee.extraFee)
      }
    }

    const result = await db.transaction(async tx => {
      const [order] = await tx
        .insert(salesOrders)
        .values({
          requestedByUserId: request.user.userId,
          status: 'open',
          customerName: body.customerName?.trim() || null,
          notes: body.notes?.trim() || null,
          priceListCode: body.priceListCode.toUpperCase(),
          version: body.version ?? null,
          currency,
          pickupLocationId,
          pickupFee: pickupFee.toFixed(2),
          packagesSubtotal: packagesSubtotal.toFixed(2),
        })
        .returning()
      await tx
        .insert(salesOrderItems)
        .values(itemsToInsert.map(i => ({ ...i, salesOrderId: order.id })))
      return order
    })

    this.setStatus(201)
    return loadOrderResponse(result.id, request.user.userId)
  }

  /** Claim an open order off the queue, assigning it to the caller. */
  @Post('{id}/claim')
  @Security('jwt', ['sales_orders.claim'])
  public async claimSalesOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SalesOrderResponse> {
    const userId = request.user.userId
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).limit(1)
    if (!order) throw NotFound(`Sales order ${id} not found`)
    assertClaimable(order)

    await db
      .update(salesOrders)
      .set({
        status: 'claimed',
        claimedByUserId: userId,
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(salesOrders.id, id))

    await this.notifyRequestor(
      order,
      userId,
      'sales_order_claimed',
      'Sales Order Claimed',
      'claimed your sales order'
    )
    return loadOrderResponse(id, userId)
  }

  /** Mark a claimed order fulfilled (delivered + contracted). Claimer only. */
  @Post('{id}/fulfill')
  @Security('jwt', ['sales_orders.claim'])
  public async fulfillSalesOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SalesOrderResponse> {
    const userId = request.user.userId
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).limit(1)
    if (!order) throw NotFound(`Sales order ${id} not found`)
    assertFulfillable(order, userId)

    await db
      .update(salesOrders)
      .set({ status: 'fulfilled', fulfilledAt: new Date(), updatedAt: new Date() })
      .where(eq(salesOrders.id, id))

    await this.notifyRequestor(
      order,
      userId,
      'sales_order_fulfilled',
      'Sales Order Fulfilled',
      'fulfilled your sales order'
    )
    return loadOrderResponse(id, userId)
  }

  /**
   * Cancel an order. The requestor can cancel an open or claimed order; the
   * claimer can release (cancel) an order they claimed.
   */
  @Post('{id}/cancel')
  @Security('jwt', ['sales_orders.view'])
  public async cancelSalesOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SalesOrderResponse> {
    const userId = request.user.userId
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).limit(1)
    if (!order) throw NotFound(`Sales order ${id} not found`)
    assertCancellable(order, userId)
    const isRequestor = order.requestedByUserId === userId

    await db
      .update(salesOrders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(salesOrders.id, id))

    // Notify the other party, if there is one.
    const notifyUserId = isRequestor ? order.claimedByUserId : order.requestedByUserId
    if (notifyUserId !== null && notifyUserId !== userId) {
      const [actor] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      await notificationService.create(
        notifyUserId,
        'sales_order_cancelled',
        'Sales Order Cancelled',
        `${actor?.displayName ?? 'Someone'} cancelled sales order #${id}`,
        { salesOrderId: id, actorUserId: userId }
      )
    }
    return loadOrderResponse(id, userId)
  }

  /**
   * FIO readiness for a claimed order: expand the ordered packages to their
   * combined bill of materials and compare against the claimer's on-hand
   * inventory at the pickup location (falling back to all their locations if
   * the order has no pickup location), highlighting shortfalls to source.
   */
  @Get('{id}/readiness')
  @Security('jwt', ['sales_orders.view'])
  public async getSalesOrderReadiness(@Path() id: number): Promise<SalesOrderReadinessResponse> {
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).limit(1)
    if (!order) throw NotFound(`Sales order ${id} not found`)

    // Whose stock we're measuring against: the claimer (the one fulfilling).
    const holderUserId = order.claimedByUserId
    const needed = await expandOrderMaterials(id)

    // On-hand at the pickup location (or across all the holder's locations when
    // no pickup location is set on the order).
    const available = new Map<string, number>()
    let inventoryUploadedAt: Date | null = null
    if (holderUserId !== null && needed.size > 0) {
      const inv = await getInventoryForUsers([holderUserId])
      for (const [key, info] of inv) {
        const [uid, ticker, locationId] = key.split(':')
        if (Number(uid) !== holderUserId) continue
        if (order.pickupLocationId && locationId !== order.pickupLocationId) continue
        available.set(ticker, (available.get(ticker) ?? 0) + info.quantity)
        if (
          info.fioUploadedAt &&
          (!inventoryUploadedAt || info.fioUploadedAt > inventoryUploadedAt)
        ) {
          inventoryUploadedAt = info.fioUploadedAt
        }
      }
    }

    // Commodity display names for the needed tickers.
    const tickers = [...needed.keys()]
    const nameRows =
      tickers.length > 0
        ? await db
            .select({ ticker: fioCommodities.ticker, name: fioCommodities.name })
            .from(fioCommodities)
            .where(inArray(fioCommodities.ticker, tickers))
        : []
    const names = new Map(nameRows.map(r => [r.ticker, r.name]))

    const lines = computeReadinessLines(needed, available, names)
    const shortfalls = lines.filter(l => l.shortfall > 0)

    let locationName: string | null = null
    if (order.pickupLocationId) {
      const [loc] = await db
        .select({ name: fioLocations.name })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, order.pickupLocationId))
        .limit(1)
      locationName = loc?.name ?? null
    }

    return {
      salesOrderId: id,
      locationId: order.pickupLocationId,
      locationName,
      inventoryUploadedAt: inventoryUploadedAt?.toISOString() ?? null,
      ready: shortfalls.length === 0,
      lines,
      shortfalls,
    }
  }

  /**
   * Generate (and record) the customer-facing "sales slip" for a claimed
   * order. This is the priced document the claimer hands the external customer
   * — it is NOT a member-to-member `invoices` row. Marks the order's slip as
   * generated (idempotent).
   */
  @Post('{id}/slip')
  @Security('jwt', ['sales_orders.claim'])
  public async generateSalesSlip(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SalesSlipDocument> {
    const userId = request.user.userId
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, id)).limit(1)
    if (!order) throw NotFound(`Sales order ${id} not found`)
    if (order.status !== 'claimed' && order.status !== 'fulfilled') {
      throw BadRequest(`Only claimed orders can have a sales slip (this order is ${order.status})`)
    }
    if (order.claimedByUserId !== userId) {
      throw Forbidden('Only the member who claimed this order can generate its sales slip')
    }

    // Record the first slip-generation timestamp (idempotent: keep original).
    const slipGeneratedAt = order.slipGeneratedAt ?? new Date()
    if (!order.slipGeneratedAt) {
      await db
        .update(salesOrders)
        .set({ slipGeneratedAt, updatedAt: new Date() })
        .where(eq(salesOrders.id, id))
    }

    const itemsMap = await loadItems([id])
    const items = itemsMap.get(id) ?? []
    const pickupFee = parseFloat(order.pickupFee)
    const packagesSubtotal = parseFloat(order.packagesSubtotal)

    let pickupLocationName: string | null = null
    if (order.pickupLocationId) {
      const [loc] = await db
        .select({ name: fioLocations.name })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, order.pickupLocationId))
        .limit(1)
      pickupLocationName = loc?.name ?? null
    }

    return {
      salesOrderId: id,
      customerName: order.customerName,
      currency: order.currency,
      lines: items.map(i => ({
        packageName: i.packageName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
      pickupLocationName,
      pickupFee,
      total: Math.round((packagesSubtotal + pickupFee) * 100) / 100,
      slipGeneratedAt: slipGeneratedAt.toISOString(),
    }
  }

  /** Notify the order's requestor that an action was taken by another member. */
  private async notifyRequestor(
    order: SalesOrderRow,
    actorUserId: number,
    type: 'sales_order_claimed' | 'sales_order_fulfilled',
    title: string,
    verb: string
  ): Promise<void> {
    if (order.requestedByUserId === actorUserId) return
    const [actor] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, actorUserId))
      .limit(1)
    await notificationService.create(
      order.requestedByUserId,
      type,
      title,
      `${actor?.displayName ?? 'Someone'} ${verb} #${order.id}`,
      { salesOrderId: order.id, actorUserId }
    )
  }
}

// Exported for unit testing
export {
  assertClaimable,
  assertFulfillable,
  assertCancellable,
  normalizeItems,
  computeReadinessLines,
}
