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
  Tags,
  Request,
  SuccessResponse,
} from 'tsoa'
import type {
  Currency,
  OrderType,
  PricingMode,
  BuyOrderSourceMode,
  DemandSource,
  LinkedPlanetInfo,
} from '@kawakawa/types'
import {
  db,
  buyOrders,
  buyOrderPlanets,
  fioUserPlanets,
  fioCommodities,
  fioLocations,
  orderReservations,
} from '../db/index.js'
import { eq, and, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { hasPermission } from '../utils/permissionService.js'
import {
  calculateEffectivePriceWithFallback,
  calculateEffectivePriceBatch,
} from '../services/price-calculator.js'
import { recalculateSingleDemandOrder } from '../services/demand-calculator.js'

interface BuyOrderResponse {
  id: number
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  priceListCode: string | null
  orderType: OrderType
  sourceMode: BuyOrderSourceMode
  demandSource: DemandSource | null
  targetDays: number | null
  linkedPlanets: LinkedPlanetInfo[]
  activeReservationCount: number
  reservedQuantity: number
  fulfilledQuantity: number
  remainingQuantity: number
  pricingMode: PricingMode
  effectivePrice: number | null
  isFallback: boolean
  priceLocationId: string | null
}

interface CreateBuyOrderRequest {
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  priceListCode?: string | null
  orderType?: OrderType
  sourceMode?: BuyOrderSourceMode
  demandSource?: DemandSource
  targetDays?: number
  planetIds?: string[] // Planet NaturalIds to link (for demand mode)
}

interface UpdateBuyOrderRequest {
  quantity?: number
  price?: number
  currency?: Currency
  priceListCode?: string | null
  orderType?: OrderType
  targetDays?: number
  planetIds?: string[] // Replace linked planets
}

/**
 * Get permission name for order type
 */
function getPermissionForOrderType(orderType: OrderType): string {
  return orderType === 'partner' ? 'orders.post_partner' : 'orders.post_internal'
}

/**
 * Get display name for order type
 */
function getOrderTypeDisplay(orderType: OrderType): string {
  return orderType === 'partner' ? 'partner' : 'internal'
}

/**
 * Fetch linked planets for a list of buy order IDs
 */
async function getLinkedPlanetsForOrders(
  orderIds: number[]
): Promise<Map<number, LinkedPlanetInfo[]>> {
  if (orderIds.length === 0) return new Map()

  const links = await db
    .select({
      buyOrderId: buyOrderPlanets.buyOrderId,
      userPlanetId: buyOrderPlanets.userPlanetId,
      planetNaturalId: fioUserPlanets.planetNaturalId,
      planetName: fioUserPlanets.planetName,
    })
    .from(buyOrderPlanets)
    .innerJoin(fioUserPlanets, eq(buyOrderPlanets.userPlanetId, fioUserPlanets.id))

  const map = new Map<number, LinkedPlanetInfo[]>()
  for (const link of links) {
    if (!orderIds.includes(link.buyOrderId)) continue
    const planets = map.get(link.buyOrderId) ?? []
    planets.push({
      userPlanetId: link.userPlanetId,
      planetNaturalId: link.planetNaturalId,
      planetName: link.planetName,
    })
    map.set(link.buyOrderId, planets)
  }
  return map
}

/**
 * Link a buy order to planets by NaturalId (resolves to userPlanetId for a user)
 */
async function linkOrderToPlanets(
  buyOrderId: number,
  userId: number,
  planetNaturalIds: string[]
): Promise<void> {
  if (planetNaturalIds.length === 0) return

  // Resolve NaturalIds to userPlanetIds
  const userPlanets = await db
    .select({ id: fioUserPlanets.id, planetNaturalId: fioUserPlanets.planetNaturalId })
    .from(fioUserPlanets)
    .where(eq(fioUserPlanets.userId, userId))

  const planetMap = new Map(userPlanets.map(p => [p.planetNaturalId, p.id]))

  for (const naturalId of planetNaturalIds) {
    const userPlanetId = planetMap.get(naturalId)
    if (!userPlanetId) continue // Skip planets not synced for this user
    await db.insert(buyOrderPlanets).values({ buyOrderId, userPlanetId })
  }
}

@Route('buy-orders')
@Tags('Buy Orders')
@Security('jwt')
export class BuyOrdersController extends Controller {
  /**
   * Get all buy orders for the current user
   */
  @Get()
  public async getBuyOrders(@Request() request: { user: JwtPayload }): Promise<BuyOrderResponse[]> {
    const userId = request.user.userId

    // Build reservation stats subquery - aggregates in single pass with the main query
    // Use SQL now() instead of JavaScript Date to avoid serialization issues
    const reservationStats = db
      .select({
        buyOrderId: orderReservations.buyOrderId,
        activeCount:
          sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now()))`.as(
            'active_count'
          ),
        activeQuantity:
          sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now())), 0)`.as(
            'active_quantity'
          ),
        fulfilledQuantity:
          sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled' and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now())), 0)`.as(
            'fulfilled_quantity'
          ),
      })
      .from(orderReservations)
      .groupBy(orderReservations.buyOrderId)
      .as('reservation_stats')

    // Get all buy orders for user with reservation stats in a single query
    const orders = await db
      .select({
        id: buyOrders.id,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        quantity: buyOrders.quantity,
        price: buyOrders.price,
        currency: buyOrders.currency,
        priceListCode: buyOrders.priceListCode,
        orderType: buyOrders.orderType,
        sourceMode: buyOrders.sourceMode,
        demandSource: buyOrders.demandSource,
        targetDays: buyOrders.targetDays,
        activeReservationCount: reservationStats.activeCount,
        reservedQuantity: reservationStats.activeQuantity,
        fulfilledQuantity: reservationStats.fulfilledQuantity,
      })
      .from(buyOrders)
      .leftJoin(reservationStats, eq(buyOrders.id, reservationStats.buyOrderId))
      .where(eq(buyOrders.userId, userId))

    if (orders.length === 0) {
      return []
    }

    // Fetch linked planets for all orders
    const linkedPlanetsMap = await getLinkedPlanetsForOrders(orders.map(o => o.id))

    // Batch fetch all dynamic prices in 3 queries instead of 3-5 per order
    const priceRequests = orders
      .filter(o => o.priceListCode)
      .map(o => ({
        priceListCode: o.priceListCode!,
        ticker: o.commodityTicker,
        locationId: o.locationId,
        currency: o.currency,
      }))
    const priceMap = await calculateEffectivePriceBatch(priceRequests)

    return orders.map(order => {
      const activeCount = order.activeReservationCount ?? 0
      const reservedQty = order.reservedQuantity ?? 0
      const fulfilledQty = order.fulfilledQuantity ?? 0
      const remainingQuantity = order.quantity - reservedQty - fulfilledQty

      const pricingMode: PricingMode = order.priceListCode ? 'dynamic' : 'fixed'
      let effectivePrice: number | null = null
      let isFallback = false
      let priceLocationId: string | null = null

      if (order.priceListCode) {
        const key = `${order.priceListCode.toUpperCase()}:${order.commodityTicker.toUpperCase()}:${order.locationId}`
        const priceResult = priceMap.get(key) ?? null
        if (priceResult) {
          effectivePrice = priceResult.finalPrice
          isFallback = priceResult.isFallback ?? false
          priceLocationId = priceResult.isFallback ? priceResult.locationId : null
        }
      }

      return {
        id: order.id,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        quantity: order.quantity,
        price: parseFloat(order.price),
        currency: order.currency,
        priceListCode: order.priceListCode,
        orderType: order.orderType,
        sourceMode: order.sourceMode,
        demandSource: order.demandSource,
        targetDays: order.targetDays,
        linkedPlanets: linkedPlanetsMap.get(order.id) ?? [],
        activeReservationCount: activeCount,
        reservedQuantity: reservedQty,
        fulfilledQuantity: fulfilledQty,
        remainingQuantity,
        pricingMode,
        effectivePrice,
        isFallback,
        priceLocationId,
      }
    })
  }

  /**
   * Get a specific buy order
   */
  @Get('{id}')
  public async getBuyOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<BuyOrderResponse> {
    const userId = request.user.userId

    // Build reservation stats subquery
    const reservationStats = db
      .select({
        buyOrderId: orderReservations.buyOrderId,
        activeCount:
          sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now()))`.as(
            'active_count'
          ),
        activeQuantity:
          sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now())), 0)`.as(
            'active_quantity'
          ),
        fulfilledQuantity:
          sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled' and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now())), 0)`.as(
            'fulfilled_quantity'
          ),
      })
      .from(orderReservations)
      .groupBy(orderReservations.buyOrderId)
      .as('reservation_stats')

    const [order] = await db
      .select({
        id: buyOrders.id,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        quantity: buyOrders.quantity,
        price: buyOrders.price,
        currency: buyOrders.currency,
        priceListCode: buyOrders.priceListCode,
        orderType: buyOrders.orderType,
        sourceMode: buyOrders.sourceMode,
        demandSource: buyOrders.demandSource,
        targetDays: buyOrders.targetDays,
        activeReservationCount: reservationStats.activeCount,
        reservedQuantity: reservationStats.activeQuantity,
        fulfilledQuantity: reservationStats.fulfilledQuantity,
      })
      .from(buyOrders)
      .leftJoin(reservationStats, eq(buyOrders.id, reservationStats.buyOrderId))
      .where(and(eq(buyOrders.id, id), eq(buyOrders.userId, userId)))

    if (!order) {
      this.setStatus(404)
      throw NotFound('Buy order not found')
    }

    const activeCount = order.activeReservationCount ?? 0
    const reservedQty = order.reservedQuantity ?? 0
    const fulfilledQty = order.fulfilledQuantity ?? 0
    const remainingQuantity = order.quantity - reservedQty - fulfilledQty

    // Fetch linked planets
    const linkedPlanetsMap = await getLinkedPlanetsForOrders([order.id])

    // Calculate effective price for dynamic pricing orders
    const pricingMode: PricingMode = order.priceListCode ? 'dynamic' : 'fixed'
    let effectivePrice: number | null = null
    let isFallback = false
    let priceLocationId: string | null = null

    if (order.priceListCode) {
      const priceResult = await calculateEffectivePriceWithFallback(
        order.priceListCode,
        order.commodityTicker,
        order.locationId,
        order.currency
      )
      if (priceResult) {
        effectivePrice = priceResult.finalPrice
        isFallback = priceResult.isFallback ?? false
        priceLocationId = priceResult.isFallback ? priceResult.locationId : null
      }
    }

    return {
      id: order.id,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
      quantity: order.quantity,
      price: parseFloat(order.price),
      currency: order.currency,
      priceListCode: order.priceListCode,
      orderType: order.orderType,
      sourceMode: order.sourceMode,
      demandSource: order.demandSource,
      targetDays: order.targetDays,
      linkedPlanets: linkedPlanetsMap.get(order.id) ?? [],
      activeReservationCount: activeCount,
      reservedQuantity: reservedQty,
      fulfilledQuantity: fulfilledQty,
      remainingQuantity,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
    }
  }

  /**
   * Create a new buy order
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createBuyOrder(
    @Body() body: CreateBuyOrderRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BuyOrderResponse> {
    const userId = request.user.userId
    const userRoles = request.user.roles
    const orderType = body.orderType ?? 'internal'

    // Check permission based on order type
    const requiredPermission = getPermissionForOrderType(orderType)

    if (!(await hasPermission(userRoles, requiredPermission))) {
      this.setStatus(403)
      throw Forbidden(
        `You do not have permission to create ${getOrderTypeDisplay(orderType)} orders`
      )
    }

    const sourceMode = body.sourceMode ?? 'manual'

    // Validate demand mode requirements
    if (sourceMode === 'demand') {
      if (!body.demandSource) {
        this.setStatus(400)
        throw BadRequest('demandSource is required for demand orders (burn or repair)')
      }
      if (body.demandSource === 'burn' && (!body.targetDays || body.targetDays <= 0)) {
        this.setStatus(400)
        throw BadRequest('targetDays must be > 0 for burn demand orders')
      }
      if (!body.planetIds || body.planetIds.length === 0) {
        this.setStatus(400)
        throw BadRequest('At least one planet must be linked for demand orders')
      }
    }

    // Validate quantity (demand orders can start at 0, recalculated after creation)
    if (sourceMode === 'manual' && body.quantity <= 0) {
      this.setStatus(400)
      throw BadRequest('Quantity must be greater than 0')
    }

    // Validate commodity exists
    const [commodity] = await db
      .select({ ticker: fioCommodities.ticker })
      .from(fioCommodities)
      .where(eq(fioCommodities.ticker, body.commodityTicker))

    if (!commodity) {
      this.setStatus(400)
      throw BadRequest(`Commodity ${body.commodityTicker} not found`)
    }

    // Validate location exists
    const [location] = await db
      .select({ naturalId: fioLocations.naturalId })
      .from(fioLocations)
      .where(eq(fioLocations.naturalId, body.locationId))

    if (!location) {
      this.setStatus(400)
      throw BadRequest(`Location ${body.locationId} not found`)
    }

    // Check for duplicate buy order (same commodity/location/orderType/currency)
    const [existing] = await db
      .select({ id: buyOrders.id })
      .from(buyOrders)
      .where(
        and(
          eq(buyOrders.userId, userId),
          eq(buyOrders.commodityTicker, body.commodityTicker),
          eq(buyOrders.locationId, body.locationId),
          eq(buyOrders.orderType, orderType),
          eq(buyOrders.currency, body.currency)
        )
      )

    if (existing) {
      this.setStatus(400)
      throw BadRequest(
        `Buy order already exists for ${body.commodityTicker} at ${body.locationId} (${getOrderTypeDisplay(orderType)}, ${body.currency}). Update the existing order instead.`
      )
    }

    // Validate price based on pricing mode
    const priceListCode = body.priceListCode ?? null
    if (priceListCode) {
      // Dynamic pricing: price must be 0
      if (body.price !== 0) {
        this.setStatus(400)
        throw BadRequest('Price must be 0 when using a price list for dynamic pricing')
      }
    } else {
      // Custom pricing: price must be > 0
      if (body.price <= 0) {
        this.setStatus(400)
        throw BadRequest('Price must be greater than 0 for custom pricing')
      }
    }

    // Create buy order
    const [newOrder] = await db
      .insert(buyOrders)
      .values({
        userId,
        commodityTicker: body.commodityTicker,
        locationId: body.locationId,
        quantity: sourceMode === 'demand' ? 0 : body.quantity,
        price: body.price.toString(),
        currency: body.currency,
        priceListCode,
        orderType,
        sourceMode,
        demandSource: sourceMode === 'demand' ? body.demandSource! : null,
        targetDays: sourceMode === 'demand' ? (body.targetDays ?? null) : null,
      })
      .returning()

    // Link planets for demand orders
    if (sourceMode === 'demand' && body.planetIds) {
      await linkOrderToPlanets(newOrder.id, userId, body.planetIds)
    }

    // Recalculate quantity for demand orders
    if (sourceMode === 'demand') {
      await recalculateSingleDemandOrder(newOrder.id)
      // Re-fetch to get updated quantity
      const [updated] = await db
        .select({ quantity: buyOrders.quantity })
        .from(buyOrders)
        .where(eq(buyOrders.id, newOrder.id))
      if (updated) newOrder.quantity = updated.quantity
    }

    this.setStatus(201)

    // Fetch linked planets
    const linkedPlanetsMap = await getLinkedPlanetsForOrders([newOrder.id])

    // Calculate effective price for dynamic pricing orders
    const pricingMode: PricingMode = newOrder.priceListCode ? 'dynamic' : 'fixed'
    let effectivePrice: number | null = null
    let isFallback = false
    let priceLocationId: string | null = null

    if (newOrder.priceListCode) {
      const priceResult = await calculateEffectivePriceWithFallback(
        newOrder.priceListCode,
        newOrder.commodityTicker,
        newOrder.locationId,
        newOrder.currency
      )
      if (priceResult) {
        effectivePrice = priceResult.finalPrice
        isFallback = priceResult.isFallback ?? false
        priceLocationId = priceResult.isFallback ? priceResult.locationId : null
      }
    }

    return {
      id: newOrder.id,
      commodityTicker: newOrder.commodityTicker,
      locationId: newOrder.locationId,
      quantity: newOrder.quantity,
      price: parseFloat(newOrder.price),
      currency: newOrder.currency,
      priceListCode: newOrder.priceListCode,
      orderType: newOrder.orderType,
      sourceMode: newOrder.sourceMode,
      demandSource: newOrder.demandSource,
      targetDays: newOrder.targetDays,
      linkedPlanets: linkedPlanetsMap.get(newOrder.id) ?? [],
      activeReservationCount: 0,
      reservedQuantity: 0,
      fulfilledQuantity: 0,
      remainingQuantity: newOrder.quantity,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
    }
  }

  /**
   * Update a buy order
   */
  @Put('{id}')
  public async updateBuyOrder(
    @Path() id: number,
    @Body() body: UpdateBuyOrderRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BuyOrderResponse> {
    const userId = request.user.userId
    const userRoles = request.user.roles

    // Verify order exists and belongs to user
    const [existing] = await db
      .select()
      .from(buyOrders)
      .where(and(eq(buyOrders.id, id), eq(buyOrders.userId, userId)))

    if (!existing) {
      this.setStatus(404)
      throw NotFound('Buy order not found')
    }

    // Check permission if changing orderType
    if (body.orderType !== undefined && body.orderType !== existing.orderType) {
      const requiredPermission = getPermissionForOrderType(body.orderType)

      if (!(await hasPermission(userRoles, requiredPermission))) {
        this.setStatus(403)
        throw Forbidden(
          `You do not have permission to change this order to ${getOrderTypeDisplay(body.orderType)}`
        )
      }
    }

    // Determine final priceListCode (use existing if not provided)
    const finalPriceListCode =
      body.priceListCode !== undefined ? body.priceListCode : existing.priceListCode

    // Validate price based on pricing mode if price is being updated
    if (body.price !== undefined) {
      if (finalPriceListCode) {
        // Dynamic pricing: price must be 0
        if (body.price !== 0) {
          this.setStatus(400)
          throw BadRequest('Price must be 0 when using a price list for dynamic pricing')
        }
      } else {
        // Custom pricing: price must be > 0
        if (body.price <= 0) {
          this.setStatus(400)
          throw BadRequest('Price must be greater than 0 for custom pricing')
        }
      }
    }

    // Validate quantity — demand orders skip manual quantity validation
    if (body.quantity !== undefined && existing.sourceMode === 'manual' && body.quantity <= 0) {
      this.setStatus(400)
      throw BadRequest('Quantity must be greater than 0')
    }

    // Build update object
    const updateData: Partial<typeof buyOrders.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.quantity !== undefined && existing.sourceMode === 'manual') {
      updateData.quantity = body.quantity
    }
    if (body.price !== undefined) updateData.price = body.price.toString()
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.priceListCode !== undefined) updateData.priceListCode = body.priceListCode
    if (body.orderType !== undefined) updateData.orderType = body.orderType
    if (body.targetDays !== undefined && existing.sourceMode === 'demand') {
      updateData.targetDays = body.targetDays
    }

    // Update
    await db.update(buyOrders).set(updateData).where(eq(buyOrders.id, id))

    // Update linked planets if provided (demand orders only)
    if (body.planetIds !== undefined && existing.sourceMode === 'demand') {
      await db.delete(buyOrderPlanets).where(eq(buyOrderPlanets.buyOrderId, id))
      await linkOrderToPlanets(id, userId, body.planetIds)
    }

    // Recalculate if demand order and relevant fields changed
    if (
      existing.sourceMode === 'demand' &&
      (body.targetDays !== undefined || body.planetIds !== undefined)
    ) {
      await recalculateSingleDemandOrder(id)
    }

    // Fetch updated order with reservation stats via JOIN
    const reservationStats = db
      .select({
        buyOrderId: orderReservations.buyOrderId,
        activeCount:
          sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now()))`.as(
            'active_count'
          ),
        activeQuantity:
          sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now())), 0)`.as(
            'active_quantity'
          ),
        fulfilledQuantity:
          sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled' and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now())), 0)`.as(
            'fulfilled_quantity'
          ),
      })
      .from(orderReservations)
      .groupBy(orderReservations.buyOrderId)
      .as('reservation_stats')

    const [updated] = await db
      .select({
        id: buyOrders.id,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        quantity: buyOrders.quantity,
        price: buyOrders.price,
        currency: buyOrders.currency,
        priceListCode: buyOrders.priceListCode,
        orderType: buyOrders.orderType,
        sourceMode: buyOrders.sourceMode,
        demandSource: buyOrders.demandSource,
        targetDays: buyOrders.targetDays,
        activeReservationCount: reservationStats.activeCount,
        reservedQuantity: reservationStats.activeQuantity,
        fulfilledQuantity: reservationStats.fulfilledQuantity,
      })
      .from(buyOrders)
      .leftJoin(reservationStats, eq(buyOrders.id, reservationStats.buyOrderId))
      .where(eq(buyOrders.id, id))

    const activeCount = updated.activeReservationCount ?? 0
    const reservedQty = updated.reservedQuantity ?? 0
    const fulfilledQty = updated.fulfilledQuantity ?? 0
    const remainingQuantity = updated.quantity - reservedQty - fulfilledQty

    // Fetch linked planets
    const linkedPlanetsMap = await getLinkedPlanetsForOrders([updated.id])

    // Calculate effective price for dynamic pricing orders
    const pricingMode: PricingMode = updated.priceListCode ? 'dynamic' : 'fixed'
    let effectivePrice: number | null = null
    let isFallback = false
    let priceLocationId: string | null = null

    if (updated.priceListCode) {
      const priceResult = await calculateEffectivePriceWithFallback(
        updated.priceListCode,
        updated.commodityTicker,
        updated.locationId,
        updated.currency
      )
      if (priceResult) {
        effectivePrice = priceResult.finalPrice
        isFallback = priceResult.isFallback ?? false
        priceLocationId = priceResult.isFallback ? priceResult.locationId : null
      }
    }

    return {
      id: updated.id,
      commodityTicker: updated.commodityTicker,
      locationId: updated.locationId,
      quantity: updated.quantity,
      price: parseFloat(updated.price),
      currency: updated.currency,
      priceListCode: updated.priceListCode,
      orderType: updated.orderType,
      sourceMode: updated.sourceMode,
      demandSource: updated.demandSource,
      targetDays: updated.targetDays,
      linkedPlanets: linkedPlanetsMap.get(updated.id) ?? [],
      activeReservationCount: activeCount,
      reservedQuantity: reservedQty,
      fulfilledQuantity: fulfilledQty,
      remainingQuantity,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
    }
  }

  /**
   * Delete a buy order
   */
  @Delete('{id}')
  @SuccessResponse('204', 'Deleted')
  public async deleteBuyOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    const [existing] = await db
      .select({ id: buyOrders.id })
      .from(buyOrders)
      .where(and(eq(buyOrders.id, id), eq(buyOrders.userId, userId)))

    if (!existing) {
      this.setStatus(404)
      throw NotFound('Buy order not found')
    }

    await db.delete(buyOrders).where(eq(buyOrders.id, id))
    this.setStatus(204)
  }

  /**
   * Manually recalculate a demand buy order's quantity
   */
  @Post('{id}/recalculate')
  public async recalculateOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<{ quantity: number }> {
    const userId = request.user.userId

    const [existing] = await db
      .select({ id: buyOrders.id, sourceMode: buyOrders.sourceMode })
      .from(buyOrders)
      .where(and(eq(buyOrders.id, id), eq(buyOrders.userId, userId)))

    if (!existing) {
      this.setStatus(404)
      throw NotFound('Buy order not found')
    }

    if (existing.sourceMode !== 'demand') {
      this.setStatus(400)
      throw BadRequest('Only demand orders can be recalculated')
    }

    const newQuantity = await recalculateSingleDemandOrder(id)

    return { quantity: newQuantity ?? 0 }
  }
}
