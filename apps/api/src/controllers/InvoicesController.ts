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
  InvoiceDirection,
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

import type { ReservationStatus } from '@kawakawa/types'

// Request to update invoice
interface UpdateInvoiceRequest {
  name?: string
  notes?: string
}

// Stored status in database (matches invoiceStatusEnum in schema)
type StoredInvoiceStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'fulfilled'
  | 'partially_fulfilled'
  | 'cancelled'

/**
 * Calculate display status from reservation states
 * - draft: Invoice not yet submitted (no reservations)
 * - pending: Submitted but some reservations still pending
 * - confirmed: All reservations confirmed (but not fulfilled)
 * - fulfilled: All reservations fulfilled
 * - partially_fulfilled: Some reservations fulfilled, some in other states
 * - cancelled: All reservations cancelled
 */
function calculateInvoiceStatus(
  dbStatus: StoredInvoiceStatus,
  reservationStatuses: (ReservationStatus | null)[]
): InvoiceStatus {
  // Draft invoices stay draft
  if (dbStatus === 'draft') {
    return 'draft'
  }

  // If no line items or no reservations yet, treat as pending
  const statuses = reservationStatuses.filter((s): s is ReservationStatus => s !== null)
  if (statuses.length === 0) {
    return 'pending'
  }

  // Count by status
  const counts = {
    pending: 0,
    confirmed: 0,
    fulfilled: 0,
    cancelled: 0,
    rejected: 0,
    expired: 0,
  }
  for (const status of statuses) {
    counts[status]++
  }

  const total = statuses.length

  // All cancelled (including rejected/expired as "cancelled-like")
  const cancelledLike = counts.cancelled + counts.rejected + counts.expired
  if (cancelledLike === total) {
    return 'cancelled'
  }

  // All fulfilled
  if (counts.fulfilled === total) {
    return 'fulfilled'
  }

  // Some fulfilled, some in other states
  if (counts.fulfilled > 0) {
    return 'partially_fulfilled'
  }

  // All confirmed (none pending, none fulfilled)
  if (counts.confirmed === total - cancelledLike && counts.pending === 0) {
    return 'confirmed'
  }

  // Otherwise pending (some still pending)
  return 'pending'
}

/**
 * Resolve the effective unit price for an order.
 * Price list takes precedence over custom price when set (matches MarketController).
 */
async function resolveOrderPrice(
  order: { price: string; priceListCode: string | null },
  commodityTicker: string,
  locationId: string,
  currency: Currency
): Promise<number> {
  if (order.priceListCode) {
    const effPrice = await calculateEffectivePriceWithFallback(
      order.priceListCode,
      commodityTicker,
      locationId,
      currency
    )
    if (effPrice?.finalPrice != null) return effPrice.finalPrice
  }
  return parseFloat(order.price)
}

@Route('invoices')
@Tags('Invoices')
@Security('jwt')
export class InvoicesController extends Controller {
  /**
   * Get all invoices for the current user (both sent and received)
   * @param status Filter by stored invoice status (draft, submitted, cancelled)
   * @param direction Filter by direction: 'sent' (user created) or 'received' (sent to user)
   */
  @Get()
  public async getInvoices(
    @Request() request: { user: JwtPayload },
    @Query() status?: StoredInvoiceStatus,
    @Query() direction?: InvoiceDirection
  ): Promise<InvoiceSummary[]> {
    const userId = request.user.userId

    // Build where conditions based on direction filter
    // - sent: user is the owner (userId)
    // - received: user is the counterparty AND status is not draft (only show submitted+)
    // - no filter: both sent and received
    let whereCondition
    if (direction === 'sent') {
      whereCondition = status
        ? and(eq(invoices.userId, userId), eq(invoices.status, status))
        : eq(invoices.userId, userId)
    } else if (direction === 'received') {
      // Only show received invoices that are pending or later (not drafts)
      const receivedCondition = and(
        eq(invoices.counterpartyUserId, userId),
        or(
          eq(invoices.status, 'pending'),
          eq(invoices.status, 'confirmed'),
          eq(invoices.status, 'fulfilled'),
          eq(invoices.status, 'partially_fulfilled'),
          eq(invoices.status, 'cancelled')
        )
      )
      whereCondition = status
        ? and(receivedCondition, eq(invoices.status, status))
        : receivedCondition
    } else {
      // Both sent and received
      const sentCondition = eq(invoices.userId, userId)
      const receivedCondition = and(
        eq(invoices.counterpartyUserId, userId),
        or(
          eq(invoices.status, 'pending'),
          eq(invoices.status, 'confirmed'),
          eq(invoices.status, 'fulfilled'),
          eq(invoices.status, 'partially_fulfilled'),
          eq(invoices.status, 'cancelled')
        )
      )
      const bothCondition = or(sentCondition, receivedCondition)
      whereCondition = status ? and(bothCondition, eq(invoices.status, status)) : bothCondition
    }

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
      .where(whereCondition)
      .orderBy(sql`${invoices.updatedAt} DESC`)

    if (invoiceRows.length === 0) {
      return []
    }

    // Get all user names needed (both owners and counterparties)
    const allUserIds = [
      ...new Set([
        ...invoiceRows.map(i => i.userId),
        ...invoiceRows.map(i => i.counterpartyUserId),
      ]),
    ]
    const userRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(or(...allUserIds.map(id => eq(users.id, id)))!)

    const userMap = new Map(userRows.map(u => [u.id, u.displayName]))

    // Get line item counts and totals per invoice, grouped by order type
    const invoiceIds = invoiceRows.map(i => i.id)
    const lineItemStats = await db
      .select({
        invoiceId: invoiceLineItems.invoiceId,
        count: sql<number>`COUNT(*)::int`,
        currency: invoiceLineItems.currency,
        total: sql<number>`SUM(${invoiceLineItems.quantity} * ${invoiceLineItems.unitPrice})::numeric`,
        // 'sell' when sellOrderId is set (user buying), 'buy' when buyOrderId is set (user selling)
        orderType: sql<string>`CASE WHEN ${invoiceLineItems.sellOrderId} IS NOT NULL THEN 'sell' ELSE 'buy' END`,
      })
      .from(invoiceLineItems)
      .where(or(...invoiceIds.map(id => eq(invoiceLineItems.invoiceId, id)))!)
      .groupBy(
        invoiceLineItems.invoiceId,
        invoiceLineItems.currency,
        sql`CASE WHEN ${invoiceLineItems.sellOrderId} IS NOT NULL THEN 'sell' ELSE 'buy' END`
      )

    // Get unique commodity tickers per invoice for search
    const commodityTickersPerInvoice = await db
      .select({
        invoiceId: invoiceLineItems.invoiceId,
        commodityTickers: sql<string[]>`ARRAY_AGG(DISTINCT ${invoiceLineItems.commodityTicker})`,
      })
      .from(invoiceLineItems)
      .where(or(...invoiceIds.map(id => eq(invoiceLineItems.invoiceId, id)))!)
      .groupBy(invoiceLineItems.invoiceId)

    const commodityTickersMap = new Map(
      commodityTickersPerInvoice.map(r => [r.invoiceId, r.commodityTickers])
    )

    // Group totals by invoice with buy/sell breakdown
    const invoiceStatsMap = new Map<
      number,
      {
        itemCount: number
        buyItemCount: number
        sellItemCount: number
        totalsByCurrency: { currency: Currency; total: number }[]
        buyTotalsByCurrency: { currency: Currency; total: number }[]
        sellTotalsByCurrency: { currency: Currency; total: number }[]
      }
    >()
    for (const stat of lineItemStats) {
      if (!invoiceStatsMap.has(stat.invoiceId)) {
        invoiceStatsMap.set(stat.invoiceId, {
          itemCount: 0,
          buyItemCount: 0,
          sellItemCount: 0,
          totalsByCurrency: [],
          buyTotalsByCurrency: [],
          sellTotalsByCurrency: [],
        })
      }
      const stats = invoiceStatsMap.get(stat.invoiceId)!
      stats.itemCount += stat.count
      const currencyTotal = { currency: stat.currency, total: parseFloat(String(stat.total)) }
      stats.totalsByCurrency.push(currencyTotal)

      // Separate buy vs sell totals and counts
      // orderType='sell' means user is BUYING (from a sell order)
      // orderType='buy' means user is SELLING (to a buy order)
      if (stat.orderType === 'sell') {
        stats.buyItemCount += stat.count
        stats.buyTotalsByCurrency.push(currencyTotal)
      } else {
        stats.sellItemCount += stat.count
        stats.sellTotalsByCurrency.push(currencyTotal)
      }
    }

    // Merge currency totals (in case same currency appears in both buy and sell)
    for (const stats of invoiceStatsMap.values()) {
      const mergedTotals = new Map<Currency, number>()
      for (const t of stats.totalsByCurrency) {
        mergedTotals.set(t.currency, (mergedTotals.get(t.currency) ?? 0) + t.total)
      }
      stats.totalsByCurrency = Array.from(mergedTotals.entries()).map(([currency, total]) => ({
        currency,
        total,
      }))
    }

    // Get reservation statuses per invoice (for calculating invoice status)
    const reservationStatusRows = await db
      .select({
        invoiceId: invoiceLineItems.invoiceId,
        reservationStatus: orderReservations.status,
      })
      .from(invoiceLineItems)
      .leftJoin(orderReservations, eq(invoiceLineItems.reservationId, orderReservations.id))
      .where(or(...invoiceIds.map(id => eq(invoiceLineItems.invoiceId, id)))!)

    // Group reservation statuses by invoice ID
    const invoiceReservationStatuses = new Map<number, (ReservationStatus | null)[]>()
    for (const row of reservationStatusRows) {
      if (!invoiceReservationStatuses.has(row.invoiceId)) {
        invoiceReservationStatuses.set(row.invoiceId, [])
      }
      invoiceReservationStatuses.get(row.invoiceId)!.push(row.reservationStatus)
    }

    return invoiceRows.map(inv => {
      // Determine direction and the "other party" based on who the current user is
      const isSent = inv.userId === userId
      const direction: InvoiceDirection = isSent ? 'sent' : 'received'
      // For sent invoices, counterparty is who we're sending to
      // For received invoices, counterparty is who sent it to us
      const otherPartyId = isSent ? inv.counterpartyUserId : inv.userId

      // Calculate status from reservation states
      const reservationStatuses = invoiceReservationStatuses.get(inv.id) ?? []
      const calculatedStatus = calculateInvoiceStatus(inv.status, reservationStatuses)

      const stats = invoiceStatsMap.get(inv.id)
      return {
        id: inv.id,
        counterpartyUserId: otherPartyId,
        counterpartyName: userMap.get(otherPartyId) ?? 'Unknown',
        status: calculatedStatus,
        direction,
        name: inv.name,
        itemCount: stats?.itemCount ?? 0,
        buyItemCount: stats?.buyItemCount ?? 0,
        sellItemCount: stats?.sellItemCount ?? 0,
        totalsByCurrency: stats?.totalsByCurrency ?? [],
        buyTotalsByCurrency: stats?.buyTotalsByCurrency ?? [],
        sellTotalsByCurrency: stats?.sellTotalsByCurrency ?? [],
        commodityTickers: commodityTickersMap.get(inv.id) ?? [],
        createdAt: inv.createdAt.toISOString(),
        updatedAt: inv.updatedAt.toISOString(),
      }
    })
  }

  /**
   * Get a specific invoice by ID with all line items
   * Invoice owner can always view. Counterparty can view submitted+ invoices.
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

    // Determine if user is owner or counterparty
    const isOwner = invoice.userId === userId
    const isCounterparty = invoice.counterpartyUserId === userId

    if (!isOwner && !isCounterparty) {
      throw Forbidden('You do not have access to this invoice')
    }

    // Counterparty can only view submitted+ invoices (not drafts)
    if (isCounterparty && invoice.status === 'draft') {
      throw Forbidden('You do not have access to this invoice')
    }

    // Determine direction and who the "other party" is from current user's perspective
    const direction: InvoiceDirection = isOwner ? 'sent' : 'received'
    const otherPartyId = isOwner ? invoice.counterpartyUserId : invoice.userId

    // Get the other party's name
    const [otherParty] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, otherPartyId))

    // Get line items with reservation status
    const lineItemRows = await db
      .select({
        id: invoiceLineItems.id,
        invoiceId: invoiceLineItems.invoiceId,
        sellOrderId: invoiceLineItems.sellOrderId,
        buyOrderId: invoiceLineItems.buyOrderId,
        reservationId: invoiceLineItems.reservationId,
        commodityTicker: invoiceLineItems.commodityTicker,
        locationId: invoiceLineItems.locationId,
        quantity: invoiceLineItems.quantity,
        unitPrice: invoiceLineItems.unitPrice,
        currency: invoiceLineItems.currency,
        priceListCode: invoiceLineItems.priceListCode,
        notes: invoiceLineItems.notes,
        createdAt: invoiceLineItems.createdAt,
        reservationStatus: orderReservations.status,
      })
      .from(invoiceLineItems)
      .leftJoin(orderReservations, eq(invoiceLineItems.reservationId, orderReservations.id))
      .where(eq(invoiceLineItems.invoiceId, id))
      .orderBy(invoiceLineItems.createdAt)

    const lineItems: InvoiceLineItem[] = lineItemRows.map(li => ({
      id: li.id,
      invoiceId: li.invoiceId,
      sellOrderId: li.sellOrderId,
      buyOrderId: li.buyOrderId,
      reservationId: li.reservationId,
      reservationStatus: li.reservationStatus ?? null,
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

    // Calculate totals by currency with buy/sell breakdown
    const currencyTotals = new Map<Currency, number>()
    const buyCurrencyTotals = new Map<Currency, number>()
    const sellCurrencyTotals = new Map<Currency, number>()

    for (const li of lineItems) {
      const current = currencyTotals.get(li.currency) ?? 0
      currencyTotals.set(li.currency, current + li.totalValue)

      // orderType='sell' means user is BUYING (from a sell order)
      // orderType='buy' means user is SELLING (to a buy order)
      if (li.orderType === 'sell') {
        const buyCurrent = buyCurrencyTotals.get(li.currency) ?? 0
        buyCurrencyTotals.set(li.currency, buyCurrent + li.totalValue)
      } else {
        const sellCurrent = sellCurrencyTotals.get(li.currency) ?? 0
        sellCurrencyTotals.set(li.currency, sellCurrent + li.totalValue)
      }
    }

    const totalsByCurrency = Array.from(currencyTotals.entries()).map(([currency, total]) => ({
      currency,
      total,
    }))
    const buyTotalsByCurrency = Array.from(buyCurrencyTotals.entries()).map(
      ([currency, total]) => ({
        currency,
        total,
      })
    )
    const sellTotalsByCurrency = Array.from(sellCurrencyTotals.entries()).map(
      ([currency, total]) => ({ currency, total })
    )

    // Calculate status from reservation states
    const reservationStatuses = lineItems.map(li => li.reservationStatus)
    const calculatedStatus = calculateInvoiceStatus(invoice.status, reservationStatuses)

    // Calculate buy/sell counts
    const buyItemCount = lineItems.filter(li => li.orderType === 'sell').length
    const sellItemCount = lineItems.filter(li => li.orderType === 'buy').length

    // Extract unique commodity tickers
    const commodityTickers = [...new Set(lineItems.map(li => li.commodityTicker))]

    return {
      id: invoice.id,
      counterpartyUserId: otherPartyId,
      counterpartyName: otherParty?.displayName ?? 'Unknown',
      status: calculatedStatus,
      direction,
      name: invoice.name,
      notes: invoice.notes,
      itemCount: lineItems.length,
      buyItemCount,
      sellItemCount,
      totalsByCurrency,
      buyTotalsByCurrency,
      sellTotalsByCurrency,
      commodityTickers,
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
      status: 'draft' as const, // New invoices are always draft
      direction: 'sent' as const,
      name: newInvoice.name,
      notes: newInvoice.notes,
      itemCount: 0,
      buyItemCount: 0,
      sellItemCount: 0,
      totalsByCurrency: [],
      buyTotalsByCurrency: [],
      sellTotalsByCurrency: [],
      commodityTickers: [],
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
      status: 'draft' as const, // New invoices are always draft
      direction: 'sent' as const,
      name: invoice.name,
      notes: invoice.notes,
      itemCount: 0,
      buyItemCount: 0,
      sellItemCount: 0,
      totalsByCurrency: [],
      buyTotalsByCurrency: [],
      sellTotalsByCurrency: [],
      commodityTickers: [],
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

    // Check if this order already exists in the invoice - if so, update quantity instead
    if (body.sellOrderId || body.buyOrderId) {
      const existingConditions = [eq(invoiceLineItems.invoiceId, id)]
      if (body.sellOrderId) {
        existingConditions.push(eq(invoiceLineItems.sellOrderId, body.sellOrderId))
      } else {
        existingConditions.push(eq(invoiceLineItems.buyOrderId, body.buyOrderId!))
      }

      const [existingLineItem] = await db
        .select()
        .from(invoiceLineItems)
        .where(and(...existingConditions))

      if (existingLineItem) {
        // Update existing line item quantity instead of creating duplicate
        const [updated] = await db
          .update(invoiceLineItems)
          .set({
            quantity: body.quantity,
            notes: body.notes ?? existingLineItem.notes,
            updatedAt: new Date(),
          })
          .where(eq(invoiceLineItems.id, existingLineItem.id))
          .returning()

        // Update invoice timestamp
        await db.update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, id))

        return {
          id: updated.id,
          invoiceId: updated.invoiceId,
          sellOrderId: updated.sellOrderId,
          buyOrderId: updated.buyOrderId,
          reservationId: updated.reservationId,
          reservationStatus: null, // Draft line items have no reservation
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

        // Get effective price — price list takes precedence over custom price
        unitPrice = await resolveOrderPrice(order, commodityTicker, locationId, currency)
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

        unitPrice = await resolveOrderPrice(order, commodityTicker, locationId, currency)
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

      unitPrice = await resolveOrderPrice(order, commodityTicker, locationId, currency)
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

      unitPrice = await resolveOrderPrice(order, commodityTicker, locationId, currency)
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
      reservationStatus: null, // Newly added line items have no reservation yet
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
      reservationStatus: null, // Only draft invoices can update line items
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
        status: 'pending',
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
      'invoice_submitted',
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
   * Cancel a pending invoice
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

    if (invoice.status !== 'pending') {
      throw BadRequest('Only pending invoices can be cancelled')
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
      'invoice_cancelled',
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
