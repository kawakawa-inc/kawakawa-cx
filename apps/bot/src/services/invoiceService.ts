/**
 * Invoice Service for Discord Bot
 * Handles invoice operations for the /buy and /sell commands with user detection
 */
import { db, invoices, invoiceLineItems, orderReservations, users } from '@kawakawa/db'
import { eq, and, desc, inArray, sql } from 'drizzle-orm'
import type { InvoiceStatus, Currency, InvoiceLineItem, InvoiceSummary } from '@kawakawa/types'
import { getFioUsernames } from './userSettings.js'
import { formatLocation } from './locationService.js'
import type { LocationDisplayMode } from '@kawakawa/types'

/**
 * Line item to add to an invoice
 */
export interface InvoiceLineItemInput {
  sellOrderId?: number
  buyOrderId?: number
  commodityTicker: string
  locationId: string
  quantity: number
  unitPrice: number
  currency: Currency
  priceListCode: string | null
  notes?: string
}

/**
 * Invoice with full details for display
 */
export interface InvoiceWithDetails {
  id: number
  userId: number
  counterpartyUserId: number
  counterpartyName: string
  counterpartyFioUsername: string | null
  status: InvoiceStatus
  name: string | null
  notes: string | null
  itemCount: number
  totalsByCurrency: { currency: Currency; total: number }[]
  lineItems: InvoiceLineItemDetails[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Line item with display details
 */
export interface InvoiceLineItemDetails {
  id: number
  commodityTicker: string
  locationId: string
  quantity: number
  unitPrice: number
  currency: Currency
  priceListCode: string | null
  orderType: 'sell' | 'buy'
  totalValue: number
  notes: string | null
}

/**
 * Result of submitting an invoice
 */
export interface SubmitInvoiceResult {
  success: boolean
  reservationCount: number
  error?: string
}

/**
 * Get or create a draft invoice for a user with a specific counterparty
 */
export async function getOrCreateInvoice(
  userId: number,
  counterpartyUserId: number
): Promise<{ id: number; isNew: boolean }> {
  // Look for existing draft invoice with this counterparty
  const existing = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.userId, userId),
      eq(invoices.counterpartyUserId, counterpartyUserId),
      eq(invoices.status, 'draft')
    ),
  })

  if (existing) {
    return { id: existing.id, isNew: false }
  }

  // Create new invoice
  const [newInvoice] = await db
    .insert(invoices)
    .values({
      userId,
      counterpartyUserId,
      status: 'draft',
    })
    .returning({ id: invoices.id })

  return { id: newInvoice.id, isNew: true }
}

/**
 * Add line items to an invoice
 */
export async function addLineItems(
  invoiceId: number,
  items: InvoiceLineItemInput[]
): Promise<InvoiceLineItem[]> {
  if (items.length === 0) {
    return []
  }

  const values = items.map(item => ({
    invoiceId,
    sellOrderId: item.sellOrderId ?? null,
    buyOrderId: item.buyOrderId ?? null,
    commodityTicker: item.commodityTicker,
    locationId: item.locationId,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toString(),
    currency: item.currency,
    priceListCode: item.priceListCode,
    notes: item.notes ?? null,
  }))

  const inserted = await db.insert(invoiceLineItems).values(values).returning()

  return inserted.map(item => ({
    id: item.id,
    invoiceId: item.invoiceId,
    sellOrderId: item.sellOrderId,
    buyOrderId: item.buyOrderId,
    reservationId: item.reservationId,
    reservationStatus: null, // New line items don't have reservations yet
    commodityTicker: item.commodityTicker,
    locationId: item.locationId,
    quantity: item.quantity,
    unitPrice: parseFloat(item.unitPrice),
    currency: item.currency,
    priceListCode: item.priceListCode,
    notes: item.notes,
    orderType: (item.sellOrderId ? 'sell' : 'buy') as 'sell' | 'buy',
    totalValue: item.quantity * parseFloat(item.unitPrice),
  }))
}

/**
 * Get all draft invoices for a user
 */
export async function getDraftInvoices(userId: number): Promise<InvoiceSummary[]> {
  const drafts = await db.query.invoices.findMany({
    where: and(eq(invoices.userId, userId), eq(invoices.status, 'draft')),
    orderBy: [desc(invoices.updatedAt)],
  })

  if (drafts.length === 0) {
    return []
  }

  // Get counterparty info
  const counterpartyIds = [...new Set(drafts.map(d => d.counterpartyUserId))]
  const counterparties = await db.query.users.findMany({
    where: inArray(users.id, counterpartyIds),
  })
  const counterpartyMap = new Map(counterparties.map(u => [u.id, u]))

  // Get FIO usernames
  const fioUsernameMap = await getFioUsernames(counterpartyIds)

  // Get line item counts and totals for each invoice, grouped by order type
  const invoiceIds = drafts.map(d => d.id)
  const lineItemStats = await db
    .select({
      invoiceId: invoiceLineItems.invoiceId,
      itemCount: sql<number>`count(*)::int`,
      currency: invoiceLineItems.currency,
      total: sql<number>`sum(${invoiceLineItems.quantity} * ${invoiceLineItems.unitPrice}::numeric)::numeric`,
      // 'sell' when sellOrderId is set (user buying), 'buy' when buyOrderId is set (user selling)
      orderType: sql<string>`CASE WHEN ${invoiceLineItems.sellOrderId} IS NOT NULL THEN 'sell' ELSE 'buy' END`,
    })
    .from(invoiceLineItems)
    .where(inArray(invoiceLineItems.invoiceId, invoiceIds))
    .groupBy(
      invoiceLineItems.invoiceId,
      invoiceLineItems.currency,
      sql`CASE WHEN ${invoiceLineItems.sellOrderId} IS NOT NULL THEN 'sell' ELSE 'buy' END`
    )

  // Get commodity tickers for each invoice
  const commodityStats = await db
    .select({
      invoiceId: invoiceLineItems.invoiceId,
      commodityTicker: invoiceLineItems.commodityTicker,
    })
    .from(invoiceLineItems)
    .where(inArray(invoiceLineItems.invoiceId, invoiceIds))
    .groupBy(invoiceLineItems.invoiceId, invoiceLineItems.commodityTicker)

  // Build commodity tickers map
  const commodityTickersMap = new Map<number, Set<string>>()
  for (const stat of commodityStats) {
    if (!commodityTickersMap.has(stat.invoiceId)) {
      commodityTickersMap.set(stat.invoiceId, new Set())
    }
    commodityTickersMap.get(stat.invoiceId)!.add(stat.commodityTicker)
  }

  // Build stats map with buy/sell breakdown
  const statsMap = new Map<
    number,
    {
      itemCount: number
      buyItemCount: number
      sellItemCount: number
      totalsByCurrency: Map<Currency, number>
      buyTotalsByCurrency: Map<Currency, number>
      sellTotalsByCurrency: Map<Currency, number>
    }
  >()
  for (const stat of lineItemStats) {
    if (!statsMap.has(stat.invoiceId)) {
      statsMap.set(stat.invoiceId, {
        itemCount: 0,
        buyItemCount: 0,
        sellItemCount: 0,
        totalsByCurrency: new Map(),
        buyTotalsByCurrency: new Map(),
        sellTotalsByCurrency: new Map(),
      })
    }
    const entry = statsMap.get(stat.invoiceId)!
    entry.itemCount += stat.itemCount
    const total = parseFloat(stat.total?.toString() ?? '0')
    entry.totalsByCurrency.set(
      stat.currency,
      (entry.totalsByCurrency.get(stat.currency) ?? 0) + total
    )

    // Separate buy vs sell totals and counts
    // orderType='sell' means user is BUYING (from a sell order)
    // orderType='buy' means user is SELLING (to a buy order)
    if (stat.orderType === 'sell') {
      entry.buyItemCount += stat.itemCount
      entry.buyTotalsByCurrency.set(stat.currency, total)
    } else {
      entry.sellItemCount += stat.itemCount
      entry.sellTotalsByCurrency.set(stat.currency, total)
    }
  }

  return drafts.map(draft => {
    const counterparty = counterpartyMap.get(draft.counterpartyUserId)
    const fioUsername = fioUsernameMap.get(draft.counterpartyUserId)
    const stats = statsMap.get(draft.id) ?? {
      itemCount: 0,
      buyItemCount: 0,
      sellItemCount: 0,
      totalsByCurrency: new Map(),
      buyTotalsByCurrency: new Map(),
      sellTotalsByCurrency: new Map(),
    }
    const commodityTickers = Array.from(commodityTickersMap.get(draft.id) ?? [])

    return {
      id: draft.id,
      counterpartyUserId: draft.counterpartyUserId,
      counterpartyName:
        fioUsername ?? counterparty?.displayName ?? counterparty?.username ?? 'Unknown',
      status: draft.status as InvoiceStatus,
      direction: 'sent' as const, // User's own drafts are always 'sent'
      name: draft.name,
      itemCount: stats.itemCount,
      buyItemCount: stats.buyItemCount,
      sellItemCount: stats.sellItemCount,
      totalsByCurrency: Array.from(stats.totalsByCurrency.entries()).map(([currency, total]) => ({
        currency,
        total,
      })),
      buyTotalsByCurrency: Array.from(stats.buyTotalsByCurrency.entries()).map(
        ([currency, total]) => ({ currency, total })
      ),
      sellTotalsByCurrency: Array.from(stats.sellTotalsByCurrency.entries()).map(
        ([currency, total]) => ({ currency, total })
      ),
      commodityTickers,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    }
  })
}

/**
 * Get invoice with full details
 */
export async function getInvoiceWithDetails(
  invoiceId: number,
  userId: number
): Promise<InvoiceWithDetails | null> {
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)),
  })

  if (!invoice) {
    return null
  }

  // Get counterparty info
  const counterparty = await db.query.users.findFirst({
    where: eq(users.id, invoice.counterpartyUserId),
  })

  const fioUsernameMap = await getFioUsernames([invoice.counterpartyUserId])
  const counterpartyFioUsername = fioUsernameMap.get(invoice.counterpartyUserId) ?? null

  // Get line items
  const items = await db.query.invoiceLineItems.findMany({
    where: eq(invoiceLineItems.invoiceId, invoiceId),
    orderBy: [desc(invoiceLineItems.createdAt)],
  })

  // Calculate totals by currency
  const totalsByCurrency = new Map<Currency, number>()
  const lineItems: InvoiceLineItemDetails[] = items.map(item => {
    const unitPrice = parseFloat(item.unitPrice)
    const totalValue = item.quantity * unitPrice
    const currentTotal = totalsByCurrency.get(item.currency) ?? 0
    totalsByCurrency.set(item.currency, currentTotal + totalValue)

    return {
      id: item.id,
      commodityTicker: item.commodityTicker,
      locationId: item.locationId,
      quantity: item.quantity,
      unitPrice,
      currency: item.currency,
      priceListCode: item.priceListCode,
      orderType: (item.sellOrderId ? 'sell' : 'buy') as 'sell' | 'buy',
      totalValue,
      notes: item.notes,
    }
  })

  return {
    id: invoice.id,
    userId: invoice.userId,
    counterpartyUserId: invoice.counterpartyUserId,
    counterpartyName:
      counterpartyFioUsername ?? counterparty?.displayName ?? counterparty?.username ?? 'Unknown',
    counterpartyFioUsername,
    status: invoice.status as InvoiceStatus,
    name: invoice.name,
    notes: invoice.notes,
    itemCount: items.length,
    totalsByCurrency: Array.from(totalsByCurrency.entries()).map(([currency, total]) => ({
      currency,
      total,
    })),
    lineItems,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  }
}

/**
 * Submit an invoice - creates reservations for all line items
 */
export async function submitInvoice(
  invoiceId: number,
  userId: number
): Promise<SubmitInvoiceResult> {
  // Get the invoice
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, invoiceId),
      eq(invoices.userId, userId),
      eq(invoices.status, 'draft')
    ),
  })

  if (!invoice) {
    return {
      success: false,
      reservationCount: 0,
      error: 'Invoice not found or not in draft status.',
    }
  }

  // Get line items
  const items = await db.query.invoiceLineItems.findMany({
    where: eq(invoiceLineItems.invoiceId, invoiceId),
  })

  if (items.length === 0) {
    return { success: false, reservationCount: 0, error: 'Invoice has no line items.' }
  }

  // Default expiration: 3 days from now
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

  // Create reservations for each line item
  let reservationCount = 0
  for (const item of items) {
    const [reservation] = await db
      .insert(orderReservations)
      .values({
        sellOrderId: item.sellOrderId,
        buyOrderId: item.buyOrderId,
        counterpartyUserId: invoice.counterpartyUserId,
        quantity: item.quantity,
        status: 'pending',
        notes: item.notes,
        expiresAt,
      })
      .returning({ id: orderReservations.id })

    // Link reservation to line item
    await db
      .update(invoiceLineItems)
      .set({ reservationId: reservation.id, updatedAt: new Date() })
      .where(eq(invoiceLineItems.id, item.id))

    reservationCount++
  }

  // Update invoice status to pending (awaiting counterparty confirmation)
  await db
    .update(invoices)
    .set({ status: 'pending', submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))

  return { success: true, reservationCount }
}

/**
 * Format invoice summary for Discord embed
 */
export async function formatInvoiceForEmbed(
  invoice: InvoiceWithDetails,
  _locationDisplayMode: LocationDisplayMode
): Promise<{ name: string; value: string }> {
  const statusEmoji =
    invoice.status === 'draft'
      ? '📝'
      : invoice.status === 'pending'
        ? '📤'
        : invoice.status === 'confirmed'
          ? '🤝'
          : invoice.status === 'fulfilled'
            ? '✅'
            : invoice.status === 'partially_fulfilled'
              ? '⏳'
              : '❌' // cancelled

  const lines: string[] = []
  lines.push(`Partner: **${invoice.counterpartyName}**`)
  lines.push(`Status: ${statusEmoji} ${invoice.status}`)
  lines.push(`Items: ${invoice.itemCount}`)

  if (invoice.totalsByCurrency.length > 0) {
    const totals = invoice.totalsByCurrency
      .map(t => `${t.total.toFixed(2)} ${t.currency}`)
      .join(', ')
    lines.push(`Total: ${totals}`)
  }

  return {
    name: `Invoice #${invoice.id}`,
    value: lines.join('\n'),
  }
}

/**
 * Format line items for Discord embed
 */
export async function formatLineItemsForEmbed(
  items: InvoiceLineItemDetails[],
  locationDisplayMode: LocationDisplayMode
): Promise<string[]> {
  const lines: string[] = []

  for (const item of items) {
    const location = await formatLocation(item.locationId, locationDisplayMode)
    const typeEmoji = item.orderType === 'buy' ? '📥' : '📤'
    const line = `${typeEmoji} ${item.quantity}x **${item.commodityTicker}** @ ${location} - ${item.unitPrice.toFixed(2)} ${item.currency}/u = ${item.totalValue.toFixed(2)} ${item.currency}`
    lines.push(line)
  }

  return lines
}

/**
 * Find user by username, display name, or FIO username
 * Returns the user ID if found, null otherwise
 */
export async function findUserByName(name: string): Promise<{
  userId: number
  username: string
  displayName: string | null
  fioUsername: string | null
} | null> {
  // Try exact username match first
  const byUsername = await db.query.users.findFirst({
    where: eq(users.username, name.toLowerCase()),
  })

  if (byUsername) {
    const fioMap = await getFioUsernames([byUsername.id])
    return {
      userId: byUsername.id,
      username: byUsername.username,
      displayName: byUsername.displayName,
      fioUsername: fioMap.get(byUsername.id) ?? null,
    }
  }

  // Try display name match (case-insensitive)
  const allUsers = await db.query.users.findMany()
  const byDisplayName = allUsers.find(
    u => u.displayName && u.displayName.toLowerCase() === name.toLowerCase()
  )

  if (byDisplayName) {
    const fioMap = await getFioUsernames([byDisplayName.id])
    return {
      userId: byDisplayName.id,
      username: byDisplayName.username,
      displayName: byDisplayName.displayName,
      fioUsername: fioMap.get(byDisplayName.id) ?? null,
    }
  }

  // Try FIO username match
  const fioMap = await getFioUsernames(allUsers.map(u => u.id))
  for (const user of allUsers) {
    const fioUsername = fioMap.get(user.id)
    if (fioUsername && fioUsername.toLowerCase() === name.toLowerCase()) {
      return {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        fioUsername,
      }
    }
  }

  return null
}
