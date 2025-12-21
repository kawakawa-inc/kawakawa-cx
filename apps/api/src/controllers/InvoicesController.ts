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
  Invoice,
  InvoiceSummary,
  InvoiceLineItem,
  InvoiceStatus,
  CreateInvoiceRequest,
  AddLineItemRequest,
  UpdateLineItemRequest,
  SubmitInvoiceResponse,
  Currency,
} from '@kawakawa/types'
import {
  db,
  invoices,
  invoiceLineItems,
  orderReservations,
  sellOrders,
  buyOrders,
  users,
} from '../db/index.js'
import { eq, and, or, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { notificationService } from '../services/notificationService.js'
import { calculateEffectivePriceWithFallback } from '../services/price-calculator.js'

// Request to update invoice
interface UpdateInvoiceRequest {
  name?: string
  notes?: string
}

@Route('invoices')
@Tags('Invoices')
@Security('jwt')
export class InvoicesController extends Controller {
  /**
   * Get all invoices for the current user
   * @param status Filter by invoice status
   */
  @Get()
  public async getInvoices(
    @Request() request: { user: JwtPayload },
    @Query() status?: InvoiceStatus
  ): Promise<InvoiceSummary[]> {
    const userId = request.user.userId

    // Get invoices with line item counts and totals
    const invoiceRows = await db
      .select({
        id: invoices.id,
        userId: invoices.userId,
        counterpartyUserId: invoices.counterpartyUserId,
        status: invoices.status,
        name: invoices.name,
        notes: invoices.notes,
        submittedAt: invoices.submittedAt,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
      })
      .from(invoices)
      .where(
        status
          ? and(eq(invoices.userId, userId), eq(invoices.status, status))
          : eq(invoices.userId, userId)
      )
      .orderBy(sql`${invoices.updatedAt} DESC`)

    if (invoiceRows.length === 0) {
      return []
    }

    // Get counterparty names
    const counterpartyIds = [...new Set(invoiceRows.map(i => i.counterpartyUserId))]
    const counterpartyRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(or(...counterpartyIds.map(id => eq(users.id, id)))!)

    const counterpartyMap = new Map(counterpartyRows.map(u => [u.id, u.displayName]))

    // Get line item counts and totals per invoice
    const invoiceIds = invoiceRows.map(i => i.id)
    const lineItemStats = await db
      .select({
        invoiceId: invoiceLineItems.invoiceId,
        count: sql<number>`COUNT(*)::int`,
        currency: invoiceLineItems.currency,
        total: sql<number>`SUM(${invoiceLineItems.quantity} * ${invoiceLineItems.unitPrice})::numeric`,
      })
      .from(invoiceLineItems)
      .where(or(...invoiceIds.map(id => eq(invoiceLineItems.invoiceId, id)))!)
      .groupBy(invoiceLineItems.invoiceId, invoiceLineItems.currency)

    // Group totals by invoice
    const invoiceStatsMap = new Map<
      number,
      { itemCount: number; totalsByCurrency: { currency: Currency; total: number }[] }
    >()
    for (const stat of lineItemStats) {
      if (!invoiceStatsMap.has(stat.invoiceId)) {
        invoiceStatsMap.set(stat.invoiceId, { itemCount: 0, totalsByCurrency: [] })
      }
      const stats = invoiceStatsMap.get(stat.invoiceId)!
      stats.itemCount += stat.count
      stats.totalsByCurrency.push({
        currency: stat.currency,
        total: parseFloat(String(stat.total)),
      })
    }

    return invoiceRows.map(inv => ({
      id: inv.id,
      counterpartyUserId: inv.counterpartyUserId,
      counterpartyName: counterpartyMap.get(inv.counterpartyUserId) ?? 'Unknown',
      status: inv.status,
      name: inv.name,
      itemCount: invoiceStatsMap.get(inv.id)?.itemCount ?? 0,
      totalsByCurrency: invoiceStatsMap.get(inv.id)?.totalsByCurrency ?? [],
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    }))
  }

  /**
   * Get a specific invoice by ID with all line items
   */
  @Get('{id}')
  public async getInvoice(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<Invoice> {
    const userId = request.user.userId

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id))

    if (!invoice) {
      throw NotFound('Invoice not found')
    }

    // Only invoice owner can view
    if (invoice.userId !== userId) {
      throw Forbidden('You do not have access to this invoice')
    }

    // Get counterparty name
    const [counterparty] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, invoice.counterpartyUserId))

    // Get line items
    const lineItemRows = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id))
      .orderBy(invoiceLineItems.createdAt)

    const lineItems: InvoiceLineItem[] = lineItemRows.map(li => ({
      id: li.id,
      invoiceId: li.invoiceId,
      sellOrderId: li.sellOrderId,
      buyOrderId: li.buyOrderId,
      reservationId: li.reservationId,
      commodityTicker: li.commodityTicker,
      locationId: li.locationId,
      quantity: li.quantity,
      unitPrice: parseFloat(li.unitPrice),
      currency: li.currency,
      priceListCode: li.priceListCode,
      notes: li.notes,
      orderType: li.sellOrderId ? 'sell' : 'buy',
      totalValue: li.quantity * parseFloat(li.unitPrice),
    }))

    // Calculate totals by currency
    const totalsByCurrency: { currency: Currency; total: number }[] = []
    const currencyTotals = new Map<Currency, number>()
    for (const li of lineItems) {
      const current = currencyTotals.get(li.currency) ?? 0
      currencyTotals.set(li.currency, current + li.totalValue)
    }
    for (const [currency, total] of currencyTotals) {
      totalsByCurrency.push({ currency, total })
    }

    return {
      id: invoice.id,
      counterpartyUserId: invoice.counterpartyUserId,
      counterpartyName: counterparty?.displayName ?? 'Unknown',
      status: invoice.status,
      name: invoice.name,
      notes: invoice.notes,
      itemCount: lineItems.length,
      totalsByCurrency,
      submittedAt: invoice.submittedAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      lineItems,
    }
  }

  /**
   * Get or create a draft invoice for a specific trading partner
   */
  @Get('for-partner/{counterpartyUserId}')
  public async getOrCreateForPartner(
    @Path() counterpartyUserId: number,
    @Request() request: { user: JwtPayload }
  ): Promise<Invoice> {
    const userId = request.user.userId

    // Cannot create invoice with yourself
    if (counterpartyUserId === userId) {
      throw BadRequest('Cannot create an invoice with yourself')
    }

    // Verify counterparty exists
    const [counterparty] = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, counterpartyUserId))

    if (!counterparty) {
      throw NotFound('User not found')
    }

    // Look for existing draft invoice
    const [existing] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.userId, userId),
          eq(invoices.counterpartyUserId, counterpartyUserId),
          eq(invoices.status, 'draft')
        )
      )

    if (existing) {
      return this.getInvoice(existing.id, request)
    }

    // Create new draft invoice
    const [newInvoice] = await db
      .insert(invoices)
      .values({
        userId,
        counterpartyUserId,
        status: 'draft',
        name: null,
        notes: null,
      })
      .returning()

    return {
      id: newInvoice.id,
      counterpartyUserId: newInvoice.counterpartyUserId,
      counterpartyName: counterparty.displayName,
      status: newInvoice.status,
      name: newInvoice.name,
      notes: newInvoice.notes,
      itemCount: 0,
      totalsByCurrency: [],
      submittedAt: null,
      createdAt: newInvoice.createdAt.toISOString(),
      updatedAt: newInvoice.updatedAt.toISOString(),
      lineItems: [],
    }
  }

  /**
   * Create a new invoice
   */
  @Post()
  @SuccessResponse(201, 'Invoice created')
  public async createInvoice(
    @Body() body: CreateInvoiceRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Invoice> {
    const userId = request.user.userId

    // Cannot create invoice with yourself
    if (body.counterpartyUserId === userId) {
      throw BadRequest('Cannot create an invoice with yourself')
    }

    // Verify counterparty exists
    const [counterparty] = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, body.counterpartyUserId))

    if (!counterparty) {
      throw NotFound('Counterparty user not found')
    }

    const [invoice] = await db
      .insert(invoices)
      .values({
        userId,
        counterpartyUserId: body.counterpartyUserId,
        status: 'draft',
        name: body.name ?? null,
        notes: body.notes ?? null,
      })
      .returning()

    this.setStatus(201)

    return {
      id: invoice.id,
      counterpartyUserId: invoice.counterpartyUserId,
      counterpartyName: counterparty.displayName,
      status: invoice.status,
      name: invoice.name,
      notes: invoice.notes,
      itemCount: 0,
      totalsByCurrency: [],
      submittedAt: null,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      lineItems: [],
    }
  }

  /**
   * Update invoice name or notes
   */
  @Put('{id}')
  public async updateInvoice(
    @Path() id: number,
    @Body() body: UpdateInvoiceRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<Invoice> {
    const userId = request.user.userId

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id))

    if (!invoice) {
      throw NotFound('Invoice not found')
    }

    if (invoice.userId !== userId) {
      throw Forbidden('You do not have access to this invoice')
    }

    if (invoice.status !== 'draft') {
      throw BadRequest('Only draft invoices can be updated')
    }

    await db
      .update(invoices)
      .set({
        name: body.name ?? invoice.name,
        notes: body.notes ?? invoice.notes,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))

    return this.getInvoice(id, request)
  }

  /**
   * Delete a draft invoice
   */
  @Delete('{id}')
  @SuccessResponse(204, 'Invoice deleted')
  public async deleteInvoice(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id))

    if (!invoice) {
      throw NotFound('Invoice not found')
    }

    if (invoice.userId !== userId) {
      throw Forbidden('You do not have access to this invoice')
    }

    if (invoice.status !== 'draft') {
      throw BadRequest('Only draft invoices can be deleted')
    }

    // Line items are deleted via cascade
    await db.delete(invoices).where(eq(invoices.id, id))

    this.setStatus(204)
  }

  /**
   * Add a line item to an invoice
   */
  @Post('{id}/items')
  @SuccessResponse(201, 'Line item added')
  public async addLineItem(
    @Path() id: number,
    @Body() body: AddLineItemRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<InvoiceLineItem> {
    const userId = request.user.userId

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id))

    if (!invoice) {
      throw NotFound('Invoice not found')
    }

    if (invoice.userId !== userId) {
      throw Forbidden('You do not have access to this invoice')
    }

    if (invoice.status !== 'draft') {
      throw BadRequest('Can only add items to draft invoices')
    }

    if (body.quantity <= 0) {
      throw BadRequest('Quantity must be greater than 0')
    }

    // Must specify either sellOrderId or buyOrderId (or reservationId for existing)
    if (!body.sellOrderId && !body.buyOrderId && !body.reservationId) {
      throw BadRequest('Must specify sellOrderId, buyOrderId, or reservationId')
    }

    let commodityTicker: string
    let locationId: string
    let unitPrice: number
    let currency: Currency
    let priceListCode: string | null
    let sellOrderId: number | null = null
    let buyOrderId: number | null = null
    let reservationId: number | null = null

    if (body.reservationId) {
      // Adding an existing reservation to the invoice
      const [reservation] = await db
        .select()
        .from(orderReservations)
        .where(eq(orderReservations.id, body.reservationId))

      if (!reservation) {
        throw NotFound('Reservation not found')
      }

      // Must be the counterparty on the reservation
      if (reservation.counterpartyUserId !== userId) {
        throw Forbidden('You can only add your own reservations to an invoice')
      }

      // Get order details
      if (reservation.sellOrderId) {
        const [order] = await db
          .select()
          .from(sellOrders)
          .where(eq(sellOrders.id, reservation.sellOrderId))
        if (!order) throw NotFound('Associated sell order not found')
        if (order.userId !== invoice.counterpartyUserId) {
          throw BadRequest('Reservation order owner must match invoice counterparty')
        }
        commodityTicker = order.commodityTicker
        locationId = order.locationId
        currency = order.currency
        priceListCode = order.priceListCode
        sellOrderId = reservation.sellOrderId

        // Get effective price
        if (priceListCode && parseFloat(order.price) === 0) {
          const effPrice = await calculateEffectivePriceWithFallback(
            priceListCode,
            commodityTicker,
            locationId,
            currency
          )
          unitPrice = effPrice?.finalPrice ?? 0
        } else {
          unitPrice = parseFloat(order.price)
        }
      } else if (reservation.buyOrderId) {
        const [order] = await db
          .select()
          .from(buyOrders)
          .where(eq(buyOrders.id, reservation.buyOrderId))
        if (!order) throw NotFound('Associated buy order not found')
        if (order.userId !== invoice.counterpartyUserId) {
          throw BadRequest('Reservation order owner must match invoice counterparty')
        }
        commodityTicker = order.commodityTicker
        locationId = order.locationId
        currency = order.currency
        priceListCode = order.priceListCode
        buyOrderId = reservation.buyOrderId

        if (priceListCode && parseFloat(order.price) === 0) {
          const effPrice = await calculateEffectivePriceWithFallback(
            priceListCode,
            commodityTicker,
            locationId,
            currency
          )
          unitPrice = effPrice?.finalPrice ?? 0
        } else {
          unitPrice = parseFloat(order.price)
        }
      } else {
        throw BadRequest('Reservation has no associated order')
      }

      reservationId = body.reservationId
    } else if (body.sellOrderId) {
      // Buying from a sell order
      const [order] = await db.select().from(sellOrders).where(eq(sellOrders.id, body.sellOrderId))
      if (!order) throw NotFound('Sell order not found')
      if (order.userId !== invoice.counterpartyUserId) {
        throw BadRequest('Sell order owner must match invoice counterparty')
      }

      commodityTicker = order.commodityTicker
      locationId = order.locationId
      currency = order.currency
      priceListCode = order.priceListCode
      sellOrderId = body.sellOrderId

      if (priceListCode && parseFloat(order.price) === 0) {
        const effPrice = await calculateEffectivePriceWithFallback(
          priceListCode,
          commodityTicker,
          locationId,
          currency
        )
        unitPrice = effPrice?.finalPrice ?? 0
      } else {
        unitPrice = parseFloat(order.price)
      }
    } else {
      // Selling to a buy order
      const [order] = await db.select().from(buyOrders).where(eq(buyOrders.id, body.buyOrderId!))
      if (!order) throw NotFound('Buy order not found')
      if (order.userId !== invoice.counterpartyUserId) {
        throw BadRequest('Buy order owner must match invoice counterparty')
      }

      commodityTicker = order.commodityTicker
      locationId = order.locationId
      currency = order.currency
      priceListCode = order.priceListCode
      buyOrderId = body.buyOrderId!

      if (priceListCode && parseFloat(order.price) === 0) {
        const effPrice = await calculateEffectivePriceWithFallback(
          priceListCode,
          commodityTicker,
          locationId,
          currency
        )
        unitPrice = effPrice?.finalPrice ?? 0
      } else {
        unitPrice = parseFloat(order.price)
      }
    }

    const [lineItem] = await db
      .insert(invoiceLineItems)
      .values({
        invoiceId: id,
        sellOrderId,
        buyOrderId,
        reservationId,
        commodityTicker,
        locationId,
        quantity: body.quantity,
        unitPrice: String(unitPrice),
        currency,
        priceListCode,
        notes: body.notes ?? null,
      })
      .returning()

    // Update invoice timestamp
    await db.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, id))

    this.setStatus(201)

    return {
      id: lineItem.id,
      invoiceId: lineItem.invoiceId,
      sellOrderId: lineItem.sellOrderId,
      buyOrderId: lineItem.buyOrderId,
      reservationId: lineItem.reservationId,
      commodityTicker: lineItem.commodityTicker,
      locationId: lineItem.locationId,
      quantity: lineItem.quantity,
      unitPrice: parseFloat(lineItem.unitPrice),
      currency: lineItem.currency,
      priceListCode: lineItem.priceListCode,
      notes: lineItem.notes,
      orderType: lineItem.sellOrderId ? 'sell' : 'buy',
      totalValue: lineItem.quantity * parseFloat(lineItem.unitPrice),
    }
  }

  /**
   * Update a line item quantity or notes
   */
  @Put('{id}/items/{itemId}')
  public async updateLineItem(
    @Path() id: number,
    @Path() itemId: number,
    @Body() body: UpdateLineItemRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<InvoiceLineItem> {
    const userId = request.user.userId

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id))

    if (!invoice) {
      throw NotFound('Invoice not found')
    }

    if (invoice.userId !== userId) {
      throw Forbidden('You do not have access to this invoice')
    }

    if (invoice.status !== 'draft') {
      throw BadRequest('Can only update items in draft invoices')
    }

    const [lineItem] = await db
      .select()
      .from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.id, itemId), eq(invoiceLineItems.invoiceId, id)))

    if (!lineItem) {
      throw NotFound('Line item not found')
    }

    if (body.quantity !== undefined && body.quantity <= 0) {
      throw BadRequest('Quantity must be greater than 0')
    }

    const [updated] = await db
      .update(invoiceLineItems)
      .set({
        quantity: body.quantity ?? lineItem.quantity,
        notes: body.notes ?? lineItem.notes,
        updatedAt: new Date(),
      })
      .where(eq(invoiceLineItems.id, itemId))
      .returning()

    // Update invoice timestamp
    await db.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, id))

    return {
      id: updated.id,
      invoiceId: updated.invoiceId,
      sellOrderId: updated.sellOrderId,
      buyOrderId: updated.buyOrderId,
      reservationId: updated.reservationId,
      commodityTicker: updated.commodityTicker,
      locationId: updated.locationId,
      quantity: updated.quantity,
      unitPrice: parseFloat(updated.unitPrice),
      currency: updated.currency,
      priceListCode: updated.priceListCode,
      notes: updated.notes,
      orderType: updated.sellOrderId ? 'sell' : 'buy',
      totalValue: updated.quantity * parseFloat(updated.unitPrice),
    }
  }

  /**
   * Remove a line item from an invoice
   */
  @Delete('{id}/items/{itemId}')
  @SuccessResponse(204, 'Line item removed')
  public async removeLineItem(
    @Path() id: number,
    @Path() itemId: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id))

    if (!invoice) {
      throw NotFound('Invoice not found')
    }

    if (invoice.userId !== userId) {
      throw Forbidden('You do not have access to this invoice')
    }

    if (invoice.status !== 'draft') {
      throw BadRequest('Can only remove items from draft invoices')
    }

    const [lineItem] = await db
      .select()
      .from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.id, itemId), eq(invoiceLineItems.invoiceId, id)))

    if (!lineItem) {
      throw NotFound('Line item not found')
    }

    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.id, itemId))

    // Update invoice timestamp
    await db.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, id))

    this.setStatus(204)
  }

  /**
   * Submit an invoice - creates reservations for all line items
   */
  @Post('{id}/submit')
  public async submitInvoice(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SubmitInvoiceResponse> {
    const userId = request.user.userId

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id))

    if (!invoice) {
      throw NotFound('Invoice not found')
    }

    if (invoice.userId !== userId) {
      throw Forbidden('You do not have access to this invoice')
    }

    if (invoice.status !== 'draft') {
      throw BadRequest('Only draft invoices can be submitted')
    }

    // Get all line items
    const lineItemRows = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id))

    if (lineItemRows.length === 0) {
      throw BadRequest('Cannot submit an empty invoice')
    }

    const errors: string[] = []
    let reservationsCreated = 0

    // Create reservations for each line item that doesn't already have one
    for (const lineItem of lineItemRows) {
      if (lineItem.reservationId) {
        // Already has a reservation, skip
        continue
      }

      try {
        const [reservation] = await db
          .insert(orderReservations)
          .values({
            sellOrderId: lineItem.sellOrderId,
            buyOrderId: lineItem.buyOrderId,
            counterpartyUserId: userId,
            quantity: lineItem.quantity,
            status: 'pending',
            notes: lineItem.notes,
            expiresAt: null,
          })
          .returning()

        // Link reservation to line item
        await db
          .update(invoiceLineItems)
          .set({ reservationId: reservation.id, updatedAt: new Date() })
          .where(eq(invoiceLineItems.id, lineItem.id))

        reservationsCreated++
      } catch (err) {
        errors.push(
          `Failed to create reservation for ${lineItem.commodityTicker}: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
      }
    }

    // Update invoice status
    await db
      .update(invoices)
      .set({
        status: 'submitted',
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))

    // Notify counterparty
    const [user] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))

    await notificationService.create(
      invoice.counterpartyUserId,
      'reservation_placed',
      'Invoice Submitted',
      `${user?.displayName ?? 'Someone'} submitted an invoice with ${lineItemRows.length} items`,
      {
        invoiceId: id,
        itemCount: lineItemRows.length,
        counterpartyUserId: userId,
      }
    )

    // Return updated invoice
    const updatedInvoice = await this.getInvoice(id, request)

    return {
      invoice: updatedInvoice,
      reservationsCreated,
      errors,
    }
  }

  /**
   * Cancel a submitted invoice
   */
  @Post('{id}/cancel')
  public async cancelInvoice(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<Invoice> {
    const userId = request.user.userId

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id))

    if (!invoice) {
      throw NotFound('Invoice not found')
    }

    if (invoice.userId !== userId) {
      throw Forbidden('You do not have access to this invoice')
    }

    if (invoice.status !== 'submitted') {
      throw BadRequest('Only submitted invoices can be cancelled')
    }

    // Cancel all pending reservations
    const lineItemRows = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id))

    for (const lineItem of lineItemRows) {
      if (lineItem.reservationId) {
        await db
          .update(orderReservations)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(
            and(
              eq(orderReservations.id, lineItem.reservationId),
              eq(orderReservations.status, 'pending')
            )
          )
      }
    }

    // Update invoice status
    await db
      .update(invoices)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(invoices.id, id))

    // Notify counterparty
    const [user] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))

    await notificationService.create(
      invoice.counterpartyUserId,
      'reservation_cancelled',
      'Invoice Cancelled',
      `${user?.displayName ?? 'Someone'} cancelled an invoice`,
      {
        invoiceId: id,
        counterpartyUserId: userId,
      }
    )

    return this.getInvoice(id, request)
  }
}
