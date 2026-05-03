import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Query,
  Route,
  Security,
  Tags,
  Request,
  SuccessResponse,
} from 'tsoa'
import type {
  ReservationWithDetails,
  CreateSellOrderReservationRequest,
  CreateBuyOrderReservationRequest,
  UpdateReservationStatusRequest,
  ReservationStatus,
  NotificationType,
  OrderReservationSummary,
} from '@kawakawa/types'
import {
  db,
  orderReservations,
  buyOrders,
  sellOrders,
  users,
  invoiceLineItems,
} from '../db/index.js'
import { eq, or, and, isNull, inArray, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { notificationService } from '@kawakawa/services/notifications'
import { hasPermission } from '../utils/permissionService.js'
import {
  calculateEffectivePriceWithFallback,
  calculateEffectivePriceBatch,
} from '../services/price-calculator.js'

interface ReservationResponse {
  id: number
  sellOrderId: number | null
  buyOrderId: number | null
  counterpartyUserId: number
  quantity: number
  status: ReservationStatus
  notes: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

@Route('reservations')
@Tags('Reservations')
@Security('jwt')
export class ReservationsController extends Controller {
  /**
   * Get all reservations for the current user (as order owner or counterparty)
   * @param role Filter by role: 'owner' (my orders being reserved), 'counterparty' (my reservations), or 'all'
   * @param status Filter by reservation status
   */
  @Get()
  public async getReservations(
    @Request() request: { user: JwtPayload },
    @Query() role?: 'owner' | 'counterparty' | 'all',
    @Query() status?: ReservationStatus
  ): Promise<ReservationWithDetails[]> {
    const userId = request.user.userId
    const filterRole = role ?? 'all'

    // Get reservations with sell order info (reserving from sell orders)
    const sellOrderReservations = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        orderOwnerUserId: sellOrders.userId,
        commodityTicker: sellOrders.commodityTicker,
        locationId: sellOrders.locationId,
        price: sellOrders.price,
        currency: sellOrders.currency,
        priceListCode: sellOrders.priceListCode,
      })
      .from(orderReservations)
      .innerJoin(sellOrders, eq(orderReservations.sellOrderId, sellOrders.id))
      .where(
        filterRole === 'owner'
          ? eq(sellOrders.userId, userId)
          : filterRole === 'counterparty'
            ? eq(orderReservations.counterpartyUserId, userId)
            : or(eq(sellOrders.userId, userId), eq(orderReservations.counterpartyUserId, userId))
      )

    // Get reservations with buy order info (filling buy orders)
    const buyOrderReservations = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        orderOwnerUserId: buyOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        price: buyOrders.price,
        currency: buyOrders.currency,
        priceListCode: buyOrders.priceListCode,
      })
      .from(orderReservations)
      .innerJoin(buyOrders, eq(orderReservations.buyOrderId, buyOrders.id))
      .where(
        filterRole === 'owner'
          ? eq(buyOrders.userId, userId)
          : filterRole === 'counterparty'
            ? eq(orderReservations.counterpartyUserId, userId)
            : or(eq(buyOrders.userId, userId), eq(orderReservations.counterpartyUserId, userId))
      )

    // Combine results
    const allReservations = [...sellOrderReservations, ...buyOrderReservations]

    // Get all user IDs for name lookup
    const allUserIds = [
      ...new Set([
        ...allReservations.map(r => r.orderOwnerUserId),
        ...allReservations.map(r => r.counterpartyUserId),
      ]),
    ]

    const userRows =
      allUserIds.length > 0
        ? await db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(or(...allUserIds.map(id => eq(users.id, id)))!)
        : []

    const userMap = new Map(userRows.map(u => [u.id, u.displayName]))

    // Filter by status if provided and map to response
    let results = allReservations
    if (status) {
      results = results.filter(r => r.status === status)
    }

    // Sort by createdAt descending
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    // Batch fetch effective prices for dynamic pricing orders
    const dynamicResults = results.filter(r => r.priceListCode && parseFloat(r.price) === 0)
    const priceMap =
      dynamicResults.length > 0
        ? await calculateEffectivePriceBatch(
            dynamicResults.map(r => ({
              priceListCode: r.priceListCode!,
              ticker: r.commodityTicker,
              locationId: r.locationId,
              currency: r.currency,
            }))
          )
        : new Map()

    return results.map(r => {
      const orderPrice = parseFloat(r.price)
      const pricingMode: 'fixed' | 'dynamic' =
        r.priceListCode && orderPrice === 0 ? 'dynamic' : 'fixed'

      let effectivePrice: number | null = null
      if (pricingMode === 'dynamic' && r.priceListCode) {
        const key = `${r.priceListCode.toUpperCase()}:${r.commodityTicker.toUpperCase()}:${r.locationId}`
        effectivePrice = priceMap.get(key)?.finalPrice ?? null
      }

      return {
        id: r.id,
        sellOrderId: r.sellOrderId,
        buyOrderId: r.buyOrderId,
        counterpartyUserId: r.counterpartyUserId,
        quantity: r.quantity,
        status: r.status,
        notes: r.notes,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        orderOwnerName: userMap.get(r.orderOwnerUserId) ?? 'Unknown',
        orderOwnerUserId: r.orderOwnerUserId,
        counterpartyName: userMap.get(r.counterpartyUserId) ?? 'Unknown',
        commodityTicker: r.commodityTicker,
        locationId: r.locationId,
        price: orderPrice,
        currency: r.currency,
        pricingMode,
        effectivePrice,
        priceListCode: r.priceListCode,
        isOrderOwner: r.orderOwnerUserId === userId,
        isCounterparty: r.counterpartyUserId === userId,
      }
    })
  }

  /**
   * Get a specific reservation by ID
   */
  @Get('{id}')
  public async getReservation(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationWithDetails> {
    const userId = request.user.userId

    // Try to find as sell order reservation
    const sellResults = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        orderOwnerUserId: sellOrders.userId,
        commodityTicker: sellOrders.commodityTicker,
        locationId: sellOrders.locationId,
        price: sellOrders.price,
        currency: sellOrders.currency,
        priceListCode: sellOrders.priceListCode,
      })
      .from(orderReservations)
      .innerJoin(sellOrders, eq(orderReservations.sellOrderId, sellOrders.id))
      .where(eq(orderReservations.id, id))

    // Try to find as buy order reservation
    const buyResults = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        orderOwnerUserId: buyOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        price: buyOrders.price,
        currency: buyOrders.currency,
        priceListCode: buyOrders.priceListCode,
      })
      .from(orderReservations)
      .innerJoin(buyOrders, eq(orderReservations.buyOrderId, buyOrders.id))
      .where(eq(orderReservations.id, id))

    const r = sellResults[0] || buyResults[0]
    if (!r) {
      throw NotFound('Reservation not found')
    }

    // Only order owner or counterparty can view
    if (r.orderOwnerUserId !== userId && r.counterpartyUserId !== userId) {
      throw Forbidden('You do not have access to this reservation')
    }

    // Get user names
    const userRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(or(eq(users.id, r.orderOwnerUserId), eq(users.id, r.counterpartyUserId))!)

    const userMap = new Map(userRows.map(u => [u.id, u.displayName]))

    // Calculate effective price for dynamic pricing
    const orderPrice = parseFloat(r.price)
    const pricingMode: 'fixed' | 'dynamic' =
      r.priceListCode && orderPrice === 0 ? 'dynamic' : 'fixed'

    let effectivePrice: number | null = null
    if (pricingMode === 'dynamic' && r.priceListCode) {
      const effPrice = await calculateEffectivePriceWithFallback(
        r.priceListCode,
        r.commodityTicker,
        r.locationId,
        r.currency
      )
      effectivePrice = effPrice?.finalPrice ?? null
    }

    return {
      id: r.id,
      sellOrderId: r.sellOrderId,
      buyOrderId: r.buyOrderId,
      counterpartyUserId: r.counterpartyUserId,
      quantity: r.quantity,
      status: r.status,
      notes: r.notes,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      orderOwnerName: userMap.get(r.orderOwnerUserId) ?? 'Unknown',
      orderOwnerUserId: r.orderOwnerUserId,
      counterpartyName: userMap.get(r.counterpartyUserId) ?? 'Unknown',
      commodityTicker: r.commodityTicker,
      locationId: r.locationId,
      price: orderPrice,
      currency: r.currency,
      pricingMode,
      effectivePrice,
      priceListCode: r.priceListCode,
      isOrderOwner: r.orderOwnerUserId === userId,
      isCounterparty: r.counterpartyUserId === userId,
    }
  }

  /**
   * Get reservations against a specific sell order. Visible to the order owner
   * unconditionally; everyone else gated by the order's orderType permission
   * (orders.view_internal / orders.view_partner). Notes are only included for
   * the order owner and the reservation's own counterparty.
   *
   * @param all If true, include cancelled/rejected/expired reservations and the
   *   full fulfilled history. Default omits those and caps fulfilled to 30 days.
   */
  @Get('sell-order/{sellOrderId}')
  public async getReservationsForSellOrder(
    @Path() sellOrderId: number,
    @Request() request: { user: JwtPayload },
    @Query() all?: boolean
  ): Promise<OrderReservationSummary[]> {
    return this.getReservationsForOrder(sellOrderId, 'sell', request.user, all === true)
  }

  /**
   * Get reservations against a specific buy order. Same visibility model as
   * {@link getReservationsForSellOrder}.
   */
  @Get('buy-order/{buyOrderId}')
  public async getReservationsForBuyOrder(
    @Path() buyOrderId: number,
    @Request() request: { user: JwtPayload },
    @Query() all?: boolean
  ): Promise<OrderReservationSummary[]> {
    return this.getReservationsForOrder(buyOrderId, 'buy', request.user, all === true)
  }

  private async getReservationsForOrder(
    orderId: number,
    side: 'sell' | 'buy',
    caller: JwtPayload,
    showAll: boolean
  ): Promise<OrderReservationSummary[]> {
    // Look up the order — must exist and be active. Soft-deleted orders are
    // hidden from this endpoint to mirror the order list filter; the original
    // parties can still see their reservation via the invoice flow.
    let orderOwnerUserId: number
    let orderType: 'internal' | 'partner'
    if (side === 'sell') {
      const [order] = await db
        .select({ userId: sellOrders.userId, orderType: sellOrders.orderType })
        .from(sellOrders)
        .where(and(eq(sellOrders.id, orderId), isNull(sellOrders.deletedAt)))
      if (!order) throw NotFound('Sell order not found')
      orderOwnerUserId = order.userId
      orderType = order.orderType
    } else {
      const [order] = await db
        .select({ userId: buyOrders.userId, orderType: buyOrders.orderType })
        .from(buyOrders)
        .where(and(eq(buyOrders.id, orderId), isNull(buyOrders.deletedAt)))
      if (!order) throw NotFound('Buy order not found')
      orderOwnerUserId = order.userId
      orderType = order.orderType
    }

    // Permission gate — owner always allowed; others must hold the same view
    // permission that gates the market listing for this order's type.
    const isOwner = orderOwnerUserId === caller.userId
    if (!isOwner) {
      const viewPermission =
        orderType === 'internal' ? 'orders.view_internal' : 'orders.view_partner'
      if (!(await hasPermission(caller.roles, viewPermission))) {
        throw Forbidden(`You do not have permission to view ${orderType} order reservations`)
      }
    }

    // Default filter: only the reservations that currently impact the order's
    // available quantity — pending + confirmed. Fulfilled is excluded because
    // a fulfilled trade is closed (and once the seller's FIO has refreshed,
    // it stops affecting available anyway). Cancelled/rejected/expired never
    // impact available. The `?all=true` query param surfaces the full history.
    const sideColumn =
      side === 'sell' ? orderReservations.sellOrderId : orderReservations.buyOrderId
    const filters = [eq(sideColumn, orderId)]
    if (!showAll) {
      filters.push(inArray(orderReservations.status, ['pending', 'confirmed']))
    }

    // One query: reservations + counterparty display name + invoice id (if any).
    const rows = await db
      .select({
        id: orderReservations.id,
        status: orderReservations.status,
        quantity: orderReservations.quantity,
        counterpartyUserId: orderReservations.counterpartyUserId,
        counterpartyName: users.displayName,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        invoiceId: invoiceLineItems.invoiceId,
      })
      .from(orderReservations)
      .innerJoin(users, eq(users.id, orderReservations.counterpartyUserId))
      .leftJoin(invoiceLineItems, eq(invoiceLineItems.reservationId, orderReservations.id))
      .where(and(...filters))
      .orderBy(sql`${orderReservations.createdAt} DESC`)

    // Notes redaction: only the order owner and the reservation's own
    // counterparty see the notes. Everyone else gets null.
    //
    // canViewInvoice mirrors InvoicesController.getInvoice's access rule: an
    // invoice is viewable by its owner (the user who built the invoice — i.e.
    // the reservation's counterparty) and the invoice's counterparty (the
    // order owner). The set is the same as the notes-visibility set, so we
    // compute it once.
    return rows.map(r => {
      const isReservationCounterparty = r.counterpartyUserId === caller.userId
      const canSeePrivate = isOwner || isReservationCounterparty
      return {
        id: r.id,
        status: r.status,
        quantity: r.quantity,
        counterpartyUserId: r.counterpartyUserId,
        counterpartyName: r.counterpartyName ?? 'Unknown',
        expiresAt: r.expiresAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        invoiceId: r.invoiceId,
        canViewInvoice: r.invoiceId != null && canSeePrivate,
        notes: canSeePrivate ? r.notes : null,
      }
    })
  }

  /**
   * Create a reservation against a sell order (user wants to buy)
   */
  @Post('sell-order')
  @SuccessResponse(201, 'Reservation created')
  public async createSellOrderReservation(
    @Body() body: CreateSellOrderReservationRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    const userId = request.user.userId

    // Verify the sell order exists and is active (soft-deleted orders can't accept new reservations)
    const [sellOrder] = await db
      .select()
      .from(sellOrders)
      .where(and(eq(sellOrders.id, body.sellOrderId), isNull(sellOrders.deletedAt)))

    if (!sellOrder) {
      throw NotFound('Sell order not found')
    }

    // Cannot reserve from your own sell order
    if (sellOrder.userId === userId) {
      throw BadRequest('You cannot create a reservation against your own sell order')
    }

    // Check permission based on order type
    const userRoles = request.user.roles
    const requiredPermission =
      sellOrder.orderType === 'internal'
        ? 'reservations.place_internal'
        : 'reservations.place_partner'

    if (!(await hasPermission(userRoles, requiredPermission))) {
      throw Forbidden(
        `You do not have permission to place reservations on ${sellOrder.orderType} orders`
      )
    }

    // Validate quantity
    if (body.quantity <= 0) {
      throw BadRequest('Quantity must be greater than 0')
    }

    // Create the reservation
    const [reservation] = await db
      .insert(orderReservations)
      .values({
        sellOrderId: body.sellOrderId,
        buyOrderId: null,
        counterpartyUserId: userId,
        quantity: body.quantity,
        status: 'pending',
        notes: body.notes ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning()

    this.setStatus(201)

    // Notify the seller
    const [buyer] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))

    await notificationService.create(
      sellOrder.userId,
      'reservation_placed',
      'New Reservation',
      `${buyer?.displayName ?? 'Someone'} wants ${body.quantity} ${sellOrder.commodityTicker}`,
      {
        reservationId: reservation.id,
        sellOrderId: body.sellOrderId,
        counterpartyUserId: userId,
        quantity: body.quantity,
        commodityTicker: sellOrder.commodityTicker,
        locationId: sellOrder.locationId,
      }
    )

    return {
      id: reservation.id,
      sellOrderId: reservation.sellOrderId,
      buyOrderId: reservation.buyOrderId,
      counterpartyUserId: reservation.counterpartyUserId,
      quantity: reservation.quantity,
      status: reservation.status,
      notes: reservation.notes,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    }
  }

  /**
   * Create a reservation against a buy order (user wants to sell/fill)
   */
  @Post('buy-order')
  @SuccessResponse(201, 'Reservation created')
  public async createBuyOrderReservation(
    @Body() body: CreateBuyOrderReservationRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    const userId = request.user.userId

    // Verify the buy order exists and is active (soft-deleted orders can't accept new reservations)
    const [buyOrder] = await db
      .select()
      .from(buyOrders)
      .where(and(eq(buyOrders.id, body.buyOrderId), isNull(buyOrders.deletedAt)))

    if (!buyOrder) {
      throw NotFound('Buy order not found')
    }

    // Cannot fill your own buy order
    if (buyOrder.userId === userId) {
      throw BadRequest('You cannot create a reservation against your own buy order')
    }

    // Check permission based on order type
    const userRoles = request.user.roles
    const requiredPermission =
      buyOrder.orderType === 'internal'
        ? 'reservations.place_internal'
        : 'reservations.place_partner'

    if (!(await hasPermission(userRoles, requiredPermission))) {
      throw Forbidden(
        `You do not have permission to place reservations on ${buyOrder.orderType} orders`
      )
    }

    // Validate quantity
    if (body.quantity <= 0) {
      throw BadRequest('Quantity must be greater than 0')
    }

    // Create the reservation
    const [reservation] = await db
      .insert(orderReservations)
      .values({
        sellOrderId: null,
        buyOrderId: body.buyOrderId,
        counterpartyUserId: userId,
        quantity: body.quantity,
        status: 'pending',
        notes: body.notes ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning()

    this.setStatus(201)

    // Notify the buyer (order owner)
    const [seller] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))

    await notificationService.create(
      buyOrder.userId,
      'reservation_placed',
      'Order Fill Request',
      `${seller?.displayName ?? 'Someone'} can fill ${body.quantity} ${buyOrder.commodityTicker}`,
      {
        reservationId: reservation.id,
        buyOrderId: body.buyOrderId,
        counterpartyUserId: userId,
        quantity: body.quantity,
        commodityTicker: buyOrder.commodityTicker,
        locationId: buyOrder.locationId,
      }
    )

    return {
      id: reservation.id,
      sellOrderId: reservation.sellOrderId,
      buyOrderId: reservation.buyOrderId,
      counterpartyUserId: reservation.counterpartyUserId,
      quantity: reservation.quantity,
      status: reservation.status,
      notes: reservation.notes,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    }
  }

  /**
   * Confirm a reservation (order owner only)
   */
  @Put('{id}/confirm')
  @SuccessResponse(200, 'Reservation confirmed')
  public async confirmReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'confirmed', request.user.userId, body.notes, 'owner')
  }

  /**
   * Reject a reservation (order owner only)
   */
  @Put('{id}/reject')
  @SuccessResponse(200, 'Reservation rejected')
  public async rejectReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'rejected', request.user.userId, body.notes, 'owner')
  }

  /**
   * Mark a reservation as fulfilled (either party)
   */
  @Put('{id}/fulfill')
  @SuccessResponse(200, 'Reservation fulfilled')
  public async fulfillReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'fulfilled', request.user.userId, body.notes, 'either')
  }

  /**
   * Cancel a reservation (counterparty can cancel pending, owner can cancel any)
   */
  @Put('{id}/cancel')
  @SuccessResponse(200, 'Reservation cancelled')
  public async cancelReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'cancelled', request.user.userId, body.notes, 'either')
  }

  /**
   * Reopen a cancelled or fulfilled reservation (either party)
   */
  @Put('{id}/reopen')
  @SuccessResponse(200, 'Reservation reopened')
  public async reopenReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'pending', request.user.userId, body.notes, 'either')
  }

  /**
   * Delete a reservation (counterparty only, if pending)
   */
  @Delete('{id}')
  @SuccessResponse(204, 'Reservation deleted')
  public async deleteReservation(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    // Get the reservation
    const [reservation] = await db
      .select()
      .from(orderReservations)
      .where(eq(orderReservations.id, id))

    if (!reservation) {
      throw NotFound('Reservation not found')
    }

    // Only counterparty can delete, and only if pending
    if (reservation.counterpartyUserId !== userId) {
      throw Forbidden('Only the person who created the reservation can delete it')
    }

    if (reservation.status !== 'pending') {
      throw BadRequest('Only pending reservations can be deleted')
    }

    await db.delete(orderReservations).where(eq(orderReservations.id, id))

    this.setStatus(204)
  }

  /**
   * Helper method to update reservation status with proper authorization and notifications
   */
  private async updateReservationStatus(
    id: number,
    newStatus: ReservationStatus,
    userId: number,
    notes: string | undefined,
    allowedRole: 'owner' | 'counterparty' | 'either'
  ): Promise<ReservationResponse> {
    // Get the reservation
    const [reservation] = await db
      .select()
      .from(orderReservations)
      .where(eq(orderReservations.id, id))

    if (!reservation) {
      throw NotFound('Reservation not found')
    }

    // Get order owner info
    let orderOwnerUserId: number
    let commodityTicker: string
    let locationId: string

    if (reservation.sellOrderId) {
      const [sellOrder] = await db
        .select()
        .from(sellOrders)
        .where(eq(sellOrders.id, reservation.sellOrderId))
      if (!sellOrder) throw NotFound('Associated sell order not found')
      orderOwnerUserId = sellOrder.userId
      commodityTicker = sellOrder.commodityTicker
      locationId = sellOrder.locationId
    } else if (reservation.buyOrderId) {
      const [buyOrder] = await db
        .select()
        .from(buyOrders)
        .where(eq(buyOrders.id, reservation.buyOrderId))
      if (!buyOrder) throw NotFound('Associated buy order not found')
      orderOwnerUserId = buyOrder.userId
      commodityTicker = buyOrder.commodityTicker
      locationId = buyOrder.locationId
    } else {
      throw BadRequest('Reservation has no associated order')
    }

    const isOrderOwner = orderOwnerUserId === userId
    const isCounterparty = reservation.counterpartyUserId === userId

    // Check authorization
    if (allowedRole === 'owner' && !isOrderOwner) {
      throw Forbidden('Only the order owner can perform this action')
    }
    if (allowedRole === 'counterparty' && !isCounterparty) {
      throw Forbidden('Only the person who created the reservation can perform this action')
    }
    if (allowedRole === 'either' && !isOrderOwner && !isCounterparty) {
      throw Forbidden('You do not have access to this reservation')
    }

    // Validate status transition
    const validTransitions: Record<ReservationStatus, ReservationStatus[]> = {
      pending: ['confirmed', 'rejected', 'cancelled', 'fulfilled'],
      confirmed: ['fulfilled', 'cancelled'],
      rejected: [],
      fulfilled: ['pending'], // Allow reopening fulfilled reservations
      expired: [],
      cancelled: ['pending'], // Allow reopening cancelled reservations
    }

    if (!validTransitions[reservation.status].includes(newStatus)) {
      throw BadRequest(`Cannot transition from '${reservation.status}' to '${newStatus}'`)
    }

    // Update the reservation
    const [updated] = await db
      .update(orderReservations)
      .set({
        status: newStatus,
        notes: notes ?? reservation.notes,
        updatedAt: new Date(),
      })
      .where(eq(orderReservations.id, id))
      .returning()

    // Send notification to the other party
    const [actor] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))

    const actorName = actor?.displayName ?? 'Someone'
    const otherPartyId = isOrderOwner ? reservation.counterpartyUserId : orderOwnerUserId

    const notificationTypes: Record<
      ReservationStatus,
      { type: NotificationType; title: string; getMessage: (name: string) => string }
    > = {
      pending: {
        type: 'reservation_placed',
        title: 'New Reservation',
        getMessage: n => `${n} created a reservation`,
      },
      confirmed: {
        type: 'reservation_confirmed',
        title: 'Confirmed',
        getMessage: n => `${n} confirmed ${reservation.quantity} ${commodityTicker}`,
      },
      rejected: {
        type: 'reservation_rejected',
        title: 'Rejected',
        getMessage: n => `${n} rejected ${reservation.quantity} ${commodityTicker}`,
      },
      fulfilled: {
        type: 'reservation_fulfilled',
        title: 'Fulfilled',
        getMessage: n => `${n} fulfilled ${reservation.quantity} ${commodityTicker}`,
      },
      cancelled: {
        type: 'reservation_cancelled',
        title: 'Cancelled',
        getMessage: n => `${n} cancelled ${reservation.quantity} ${commodityTicker}`,
      },
      expired: {
        type: 'reservation_expired',
        title: 'Expired',
        getMessage: () => `${reservation.quantity} ${commodityTicker} reservation expired`,
      },
    }

    // Find the invoiceId if this reservation is linked to an invoice
    const [lineItem] = await db
      .select({ invoiceId: invoiceLineItems.invoiceId })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.reservationId, id))
      .limit(1)
    const invoiceId = lineItem?.invoiceId ?? null

    const notifConfig = notificationTypes[newStatus]
    await notificationService.create(
      otherPartyId,
      notifConfig.type,
      notifConfig.title,
      notifConfig.getMessage(actorName),
      {
        reservationId: id,
        sellOrderId: reservation.sellOrderId,
        buyOrderId: reservation.buyOrderId,
        quantity: reservation.quantity,
        commodityTicker,
        locationId,
        ...(invoiceId && { invoiceId }),
      }
    )

    return {
      id: updated.id,
      sellOrderId: updated.sellOrderId,
      buyOrderId: updated.buyOrderId,
      counterpartyUserId: updated.counterpartyUserId,
      quantity: updated.quantity,
      status: updated.status,
      notes: updated.notes,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }
  }
}
