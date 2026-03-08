/**
 * Invoice Service for Discord Bot
 * Handles invoice operations for the /buy and /sell commands with user detection
 */
import {
  db,
  invoices,
  invoiceLineItems,
  orderReservations,
  users,
  userDiscordProfiles,
} from '@kawakawa/db'
import { eq, and, or, ne, desc, inArray, sql } from 'drizzle-orm'
import type {
  InvoiceStatus,
  InvoiceDirection,
  Currency,
  InvoiceLineItem,
  InvoiceSummary,
} from '@kawakawa/types'
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
  submittedAt: Date | null
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
  return buildInvoiceSummaries(drafts, 'sent')
}

/**
 * Get invoices sent TO a user (inbox) that need their attention.
 * Returns pending and confirmed invoices where the user is the counterparty.
 */
export async function getInboxInvoices(userId: number): Promise<InvoiceSummary[]> {
  const received = await db.query.invoices.findMany({
    where: and(
      eq(invoices.counterpartyUserId, userId),
      or(eq(invoices.status, 'pending'), eq(invoices.status, 'confirmed'))
    ),
    orderBy: [desc(invoices.updatedAt)],
  })
  return buildInvoiceSummaries(received, 'received')
}

/**
 * Get invoices a user has submitted (non-draft, user is the creator).
 */
export async function getSentInvoices(userId: number): Promise<InvoiceSummary[]> {
  const sent = await db.query.invoices.findMany({
    where: and(eq(invoices.userId, userId), ne(invoices.status, 'draft')),
    orderBy: [desc(invoices.updatedAt)],
  })
  return buildInvoiceSummaries(sent, 'sent')
}

/**
 * Build InvoiceSummary[] from raw invoice rows.
 * Shared by getDraftInvoices, getInboxInvoices, getSentInvoices.
 */
async function buildInvoiceSummaries(
  invoiceRows: Array<{
    id: number
    userId: number
    counterpartyUserId: number
    status: string
    name: string | null
    createdAt: Date
    updatedAt: Date
  }>,
  direction: InvoiceDirection
): Promise<InvoiceSummary[]> {
  if (invoiceRows.length === 0) return []

  // For 'sent' invoices, the "other party" is counterpartyUserId
  // For 'received' invoices, the "other party" is userId (the creator)
  const otherPartyIds = [
    ...new Set(invoiceRows.map(d => (direction === 'sent' ? d.counterpartyUserId : d.userId))),
  ]
  const otherParties = await db.query.users.findMany({
    where: inArray(users.id, otherPartyIds),
  })
  const otherPartyMap = new Map(otherParties.map(u => [u.id, u]))
  const fioUsernameMap = await getFioUsernames(otherPartyIds)

  // Get line item counts and totals for each invoice, grouped by order type
  const invoiceIds = invoiceRows.map(d => d.id)
  const lineItemStats = await db
    .select({
      invoiceId: invoiceLineItems.invoiceId,
      itemCount: sql<number>`count(*)::int`,
      currency: invoiceLineItems.currency,
      total: sql<number>`sum(${invoiceLineItems.quantity} * ${invoiceLineItems.unitPrice}::numeric)::numeric`,
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
    const tickerSet = commodityTickersMap.get(stat.invoiceId)
    if (!tickerSet) continue
    tickerSet.add(stat.commodityTicker)
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
    const entry = statsMap.get(stat.invoiceId)
    if (!entry) continue
    entry.itemCount += stat.itemCount
    const total = parseFloat(stat.total?.toString() ?? '0')
    entry.totalsByCurrency.set(
      stat.currency,
      (entry.totalsByCurrency.get(stat.currency) ?? 0) + total
    )

    if (stat.orderType === 'sell') {
      entry.buyItemCount += stat.itemCount
      entry.buyTotalsByCurrency.set(stat.currency, total)
    } else {
      entry.sellItemCount += stat.itemCount
      entry.sellTotalsByCurrency.set(stat.currency, total)
    }
  }

  return invoiceRows.map(row => {
    const otherPartyId = direction === 'sent' ? row.counterpartyUserId : row.userId
    const otherParty = otherPartyMap.get(otherPartyId)
    const fioUsername = fioUsernameMap.get(otherPartyId)
    const stats = statsMap.get(row.id) ?? {
      itemCount: 0,
      buyItemCount: 0,
      sellItemCount: 0,
      totalsByCurrency: new Map(),
      buyTotalsByCurrency: new Map(),
      sellTotalsByCurrency: new Map(),
    }
    const commodityTickers = Array.from(commodityTickersMap.get(row.id) ?? [])

    return {
      id: row.id,
      counterpartyUserId: otherPartyId,
      counterpartyName: fioUsername ?? otherParty?.displayName ?? otherParty?.username ?? 'Unknown',
      status: row.status as InvoiceStatus,
      direction,
      name: row.name,
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  })
}

/**
 * Get invoice with full details.
 * Accessible by both the creator (userId) and the counterparty.
 */
export async function getInvoiceWithDetails(
  invoiceId: number,
  userId: number
): Promise<InvoiceWithDetails | null> {
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, invoiceId),
      or(eq(invoices.userId, userId), eq(invoices.counterpartyUserId, userId))
    ),
  })

  if (!invoice) {
    return null
  }

  // The "other party" depends on which side the caller is on
  const otherPartyId = invoice.userId === userId ? invoice.counterpartyUserId : invoice.userId
  const counterparty = await db.query.users.findFirst({
    where: eq(users.id, otherPartyId),
  })

  const fioUsernameMap = await getFioUsernames([otherPartyId])
  const counterpartyFioUsername = fioUsernameMap.get(otherPartyId) ?? null

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
    submittedAt: invoice.submittedAt,
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
 * Find existing line items in an invoice matching commodity and location
 */
export async function findExistingLineItems(
  invoiceId: number,
  commodityTicker: string,
  locationId: string
): Promise<
  {
    id: number
    quantity: number
    unitPrice: string
    currency: Currency
  }[]
> {
  const items = await db.query.invoiceLineItems.findMany({
    where: and(
      eq(invoiceLineItems.invoiceId, invoiceId),
      eq(invoiceLineItems.commodityTicker, commodityTicker),
      eq(invoiceLineItems.locationId, locationId)
    ),
  })

  return items.map(item => ({
    id: item.id,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    currency: item.currency,
  }))
}

/**
 * Update an existing line item's quantity
 */
export async function updateLineItemQuantity(
  lineItemId: number,
  newQuantity: number
): Promise<void> {
  await db
    .update(invoiceLineItems)
    .set({
      quantity: newQuantity,
      updatedAt: new Date(),
    })
    .where(eq(invoiceLineItems.id, lineItemId))
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

    // Add notes on a separate line if present
    if (item.notes) {
      lines.push(`   💬 *${item.notes}*`)
    }
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

/**
 * Find a user by their Discord ID (for resolving Discord mentions like <@123456>).
 */
export async function findUserByDiscordId(discordId: string): Promise<{
  userId: number
  username: string
  displayName: string | null
  fioUsername: string | null
} | null> {
  const profile = await db.query.userDiscordProfiles.findFirst({
    where: eq(userDiscordProfiles.discordId, discordId),
    with: { user: true },
  })

  if (!profile || !profile.user) return null

  const fioMap = await getFioUsernames([profile.user.id])
  return {
    userId: profile.user.id,
    username: profile.user.username,
    displayName: profile.user.displayName,
    fioUsername: fioMap.get(profile.user.id) ?? null,
  }
}

// ==================== INVOICE STATE TRANSITIONS ====================

/**
 * Result of an invoice state transition
 */
export interface InvoiceTransitionResult {
  success: boolean
  error?: string
}

/**
 * Confirm an invoice (counterparty accepts).
 * Transitions: invoice pending -> confirmed, reservations pending -> confirmed.
 */
export async function confirmInvoice(
  invoiceId: number,
  counterpartyUserId: number
): Promise<InvoiceTransitionResult> {
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, invoiceId),
      eq(invoices.counterpartyUserId, counterpartyUserId),
      eq(invoices.status, 'pending')
    ),
  })

  if (!invoice) {
    return {
      success: false,
      error: 'Invoice not found, not sent to you, or not in pending status.',
    }
  }

  // Confirm all linked reservations
  const items = await db.query.invoiceLineItems.findMany({
    where: eq(invoiceLineItems.invoiceId, invoiceId),
  })

  for (const item of items) {
    if (item.reservationId) {
      await db
        .update(orderReservations)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(
          and(eq(orderReservations.id, item.reservationId), eq(orderReservations.status, 'pending'))
        )
    }
  }

  // Update invoice status
  await db
    .update(invoices)
    .set({ status: 'confirmed', updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))

  return { success: true }
}

/**
 * Reject an invoice (counterparty declines).
 * Transitions: invoice pending -> cancelled, reservations pending -> rejected.
 */
export async function rejectInvoice(
  invoiceId: number,
  counterpartyUserId: number
): Promise<InvoiceTransitionResult> {
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, invoiceId),
      eq(invoices.counterpartyUserId, counterpartyUserId),
      eq(invoices.status, 'pending')
    ),
  })

  if (!invoice) {
    return {
      success: false,
      error: 'Invoice not found, not sent to you, or not in pending status.',
    }
  }

  // Reject all linked reservations
  const items = await db.query.invoiceLineItems.findMany({
    where: eq(invoiceLineItems.invoiceId, invoiceId),
  })

  for (const item of items) {
    if (item.reservationId) {
      await db
        .update(orderReservations)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(
          and(eq(orderReservations.id, item.reservationId), eq(orderReservations.status, 'pending'))
        )
    }
  }

  // Cancel the invoice
  await db
    .update(invoices)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))

  return { success: true }
}

/**
 * Cancel an invoice (creator withdraws).
 * Works for draft, pending, or confirmed invoices.
 * Cancels all linked reservations that aren't already fulfilled.
 */
export async function cancelInvoice(
  invoiceId: number,
  userId: number
): Promise<InvoiceTransitionResult> {
  const invoice = await db.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)),
  })

  if (!invoice) {
    return { success: false, error: 'Invoice not found or you are not the creator.' }
  }

  const terminalStatuses: string[] = ['fulfilled', 'partially_fulfilled', 'cancelled']
  if (terminalStatuses.includes(invoice.status)) {
    return { success: false, error: `Cannot cancel an invoice with status "${invoice.status}".` }
  }

  // Cancel all linked reservations that aren't already in a terminal state
  const items = await db.query.invoiceLineItems.findMany({
    where: eq(invoiceLineItems.invoiceId, invoiceId),
  })

  for (const item of items) {
    if (item.reservationId) {
      await db
        .update(orderReservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(orderReservations.id, item.reservationId),
            inArray(orderReservations.status, ['pending', 'confirmed'])
          )
        )
    }
  }

  // Cancel the invoice
  await db
    .update(invoices)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))

  return { success: true }
}

/**
 * Get the status emoji for an invoice status
 */
export function getInvoiceStatusEmoji(status: InvoiceStatus): string {
  switch (status) {
    case 'draft':
      return '📝'
    case 'pending':
      return '📤'
    case 'confirmed':
      return '✅'
    case 'fulfilled':
      return '🎉'
    case 'partially_fulfilled':
      return '⚠️'
    case 'cancelled':
      return '❌'
    default:
      return '❓'
  }
}

/**
 * Get a human-readable label for an invoice status
 */
export function getInvoiceStatusLabel(status: InvoiceStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'pending':
      return 'Pending'
    case 'confirmed':
      return 'Confirmed'
    case 'fulfilled':
      return 'Fulfilled'
    case 'partially_fulfilled':
      return 'Partially Fulfilled'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}
