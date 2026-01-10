/**
 * Invoice Command Handler
 * Shared logic for /buy and /sell invoice commands.
 *
 * Flow:
 * 1. Parse input with flexible token parser
 * 2. Validate required fields (commodity/qty pairs, location, user)
 * 3. Match against counterparty's orders
 * 4. Add to invoice (create if needed)
 * 5. Optionally submit if 'send' action detected
 */

import type { ChatInputCommandInteraction } from 'discord.js'
import { MessageFlags } from 'discord.js'
import { db, sellOrders, buyOrders } from '@kawakawa/db'
import { eq, and } from 'drizzle-orm'
import { parseTokens, validateForInvoice } from '@kawakawa/parser'
import { botResolvers } from '../utils/resolvers.js'
import {
  getOrCreateInvoice,
  addLineItems,
  submitInvoice,
  getInvoiceWithDetails,
  type InvoiceLineItemInput,
} from './invoiceService.js'
import { formatCommodity, formatLocation } from './display.js'
import { getOrderDisplayPrice } from '@kawakawa/services/market'
import type { LocationDisplayMode } from '@kawakawa/types'
import logger from '../utils/logger.js'

// ==================== TYPES ====================

export type OrderDirection = 'buy' | 'sell'

interface InvoiceCommandResult {
  success: boolean
  invoiceId?: number
  isNewInvoice?: boolean
  addedItems?: Array<{
    ticker: string
    quantity: number
    price: number
    currency: string
  }>
  notFoundItems?: string[]
  submitted?: boolean
  reservationCount?: number
  errors?: string[]
}

interface HandleInvoiceCommandOptions {
  interaction: ChatInputCommandInteraction
  userId: number
  input: string
  direction: OrderDirection
  locationDisplayMode: LocationDisplayMode
}

// ==================== MAIN HANDLER ====================

/**
 * Handle invoice command (/buy or /sell with counterparty)
 */
export async function handleInvoiceCommand(
  options: HandleInvoiceCommandOptions
): Promise<InvoiceCommandResult> {
  const { interaction, userId, input, direction, locationDisplayMode } = options

  // Parse input with unified parser
  const parsed = await parseTokens(input, botResolvers)

  // Validate - require location, user, and commodities for invoice mode
  const validation = validateForInvoice(parsed)

  if (!validation.valid) {
    return { success: false, errors: validation.errors }
  }

  // At this point we have:
  // - parsed.items: commodity/quantity pairs
  // - parsed.location: validated location
  // - parsed.user: validated counterparty user
  // - parsed.actions.has('send'): whether to submit immediately

  const counterparty = parsed.user!
  const locationId = parsed.location!.naturalId

  // Get or create invoice with counterparty
  const { id: invoiceId, isNew: isNewInvoice } = await getOrCreateInvoice(
    userId,
    counterparty.userId
  )

  // Convert parsed items to format expected by matchAndAddLineItems
  const parsedItems = parsed.items.map(item => ({
    ticker: item.commodity.ticker,
    commodityName: item.commodity.name,
    quantity: item.quantity ?? 0,
  }))

  // Find matching orders from counterparty
  const result = await matchAndAddLineItems({
    invoiceId,
    counterpartyUserId: counterparty.userId,
    locationId,
    parsedItems,
    direction,
  })

  // Build response
  const counterpartyName =
    counterparty.fioUsername ?? counterparty.displayName ?? counterparty.username
  const locationDisplay = await formatLocation(locationId, locationDisplayMode)

  // Handle submission if requested
  let submitted = false
  let reservationCount = 0

  if (parsed.actions.has('send') && result.addedItems.length > 0) {
    // Get full invoice to check if it has items
    const invoice = await getInvoiceWithDetails(invoiceId, userId)

    if (invoice && invoice.lineItems.length > 0) {
      const submitResult = await submitInvoice(invoiceId, userId)
      if (submitResult.success) {
        submitted = true
        reservationCount = submitResult.reservationCount ?? 0
      } else {
        result.notFoundItems.push(`Submit failed: ${submitResult.error}`)
      }
    }
  }

  // Send response
  await sendInvoiceResponse(interaction, {
    direction,
    invoiceId,
    isNewInvoice,
    counterpartyName,
    locationDisplay,
    addedItems: result.addedItems,
    notFoundItems: result.notFoundItems,
    submitted,
    reservationCount,
    unresolvedTokens: parsed.unresolved,
  })

  logger.info(
    {
      userId,
      counterpartyUserId: counterparty.userId,
      invoiceId,
      direction,
      itemsAdded: result.addedItems.length,
      submitted,
    },
    `Invoice command processed (${direction})`
  )

  return {
    success: true,
    invoiceId,
    isNewInvoice,
    addedItems: result.addedItems,
    notFoundItems: result.notFoundItems,
    submitted,
    reservationCount,
  }
}

// ==================== ORDER MATCHING ====================

interface MatchAndAddOptions {
  invoiceId: number
  counterpartyUserId: number
  locationId: string
  parsedItems: Array<{ ticker: string; commodityName: string; quantity: number }>
  direction: OrderDirection
}

interface MatchResult {
  addedItems: Array<{ ticker: string; quantity: number; price: number; currency: string }>
  notFoundItems: string[]
}

/**
 * Match parsed items against counterparty's orders and add to invoice
 */
async function matchAndAddLineItems(options: MatchAndAddOptions): Promise<MatchResult> {
  const { invoiceId, counterpartyUserId, locationId, parsedItems, direction } = options

  const addedItems: MatchResult['addedItems'] = []
  const notFoundItems: string[] = []
  const lineItems: InvoiceLineItemInput[] = []

  // For /buy: we buy FROM counterparty's sell orders
  // For /sell: we sell TO counterparty's buy orders
  if (direction === 'buy') {
    // Find counterparty's sell orders at this location
    const counterpartySellOrders = await db.query.sellOrders.findMany({
      where: and(eq(sellOrders.userId, counterpartyUserId), eq(sellOrders.locationId, locationId)),
    })

    for (const item of parsedItems) {
      const order = counterpartySellOrders.find(o => o.commodityTicker === item.ticker)

      if (!order) {
        notFoundItems.push(`${item.ticker}: no sell order from counterparty`)
        continue
      }

      // Get effective price (handles dynamic pricing)
      const priceInfo = await getOrderDisplayPrice(order)
      const price = priceInfo?.price ?? 0

      lineItems.push({
        sellOrderId: order.id,
        commodityTicker: item.ticker,
        locationId,
        quantity: item.quantity,
        unitPrice: price,
        currency: order.currency as 'CIS' | 'ICA' | 'AIC' | 'NCC',
        priceListCode: order.priceListCode,
      })

      addedItems.push({
        ticker: item.ticker,
        quantity: item.quantity,
        price,
        currency: order.currency,
      })
    }
  } else {
    // direction === 'sell'
    // Find counterparty's buy orders at this location
    const counterpartyBuyOrders = await db.query.buyOrders.findMany({
      where: and(eq(buyOrders.userId, counterpartyUserId), eq(buyOrders.locationId, locationId)),
    })

    for (const item of parsedItems) {
      const order = counterpartyBuyOrders.find(o => o.commodityTicker === item.ticker)

      if (!order) {
        notFoundItems.push(`${item.ticker}: no buy order from counterparty`)
        continue
      }

      // Get effective price (handles dynamic pricing)
      const priceInfo = await getOrderDisplayPrice(order)
      const price = priceInfo?.price ?? 0

      lineItems.push({
        buyOrderId: order.id,
        commodityTicker: item.ticker,
        locationId,
        quantity: item.quantity,
        unitPrice: price,
        currency: order.currency as 'CIS' | 'ICA' | 'AIC' | 'NCC',
        priceListCode: order.priceListCode,
      })

      addedItems.push({
        ticker: item.ticker,
        quantity: item.quantity,
        price,
        currency: order.currency,
      })
    }
  }

  // Add line items to invoice
  if (lineItems.length > 0) {
    await addLineItems(invoiceId, lineItems)
  }

  return { addedItems, notFoundItems }
}

// ==================== RESPONSE BUILDING ====================

interface ResponseOptions {
  direction: OrderDirection
  invoiceId: number
  isNewInvoice: boolean
  counterpartyName: string
  locationDisplay: string
  addedItems: Array<{ ticker: string; quantity: number; price: number; currency: string }>
  notFoundItems: string[]
  submitted: boolean
  reservationCount: number
  unresolvedTokens: string[]
}

/**
 * Send formatted response to Discord
 */
async function sendInvoiceResponse(
  interaction: ChatInputCommandInteraction,
  options: ResponseOptions
): Promise<void> {
  const {
    direction,
    invoiceId,
    isNewInvoice,
    counterpartyName,
    locationDisplay,
    addedItems,
    notFoundItems,
    submitted,
    reservationCount,
    unresolvedTokens,
  } = options

  const actionVerb = direction === 'buy' ? 'Buying from' : 'Selling to'
  const emoji = direction === 'buy' ? '🛒' : '💰'

  let response = ''

  // Header
  if (submitted) {
    response = `🎉 **Invoice #${invoiceId} sent!**\n\n`
    response += `Created **${reservationCount}** reservation${reservationCount === 1 ? '' : 's'} for **${counterpartyName}** to confirm.\n\n`
  } else if (isNewInvoice) {
    response = `📋 **Invoice #${invoiceId}** created with **${counterpartyName}**\n\n`
  } else {
    response = `✅ Added to **Invoice #${invoiceId}** (${counterpartyName})\n\n`
  }

  // Added items
  if (addedItems.length > 0) {
    response += `${emoji} ${actionVerb} ${counterpartyName} @ **${locationDisplay}**:\n`
    for (const item of addedItems) {
      const commodityDisplay = formatCommodity(item.ticker)
      const priceDisplay =
        item.price > 0 ? `${item.price.toFixed(2)} ${item.currency}` : `-- ${item.currency}`
      response += `• ${commodityDisplay} x${item.quantity.toLocaleString()} @ ${priceDisplay}\n`
    }

    // Calculate totals
    const totals = new Map<string, number>()
    for (const item of addedItems) {
      const current = totals.get(item.currency) ?? 0
      totals.set(item.currency, current + item.quantity * item.price)
    }

    if (totals.size > 0) {
      const totalStr = Array.from(totals.entries())
        .map(([currency, total]) => `${total.toFixed(2)} ${currency}`)
        .join(', ')
      response += `\n**Total**: ${totalStr}`
    }
  }

  // Not found items
  if (notFoundItems.length > 0) {
    response += `\n\n⚠️ Could not add:\n${notFoundItems.map(n => `• ${n}`).join('\n')}`
  }

  // Unresolved tokens
  if (unresolvedTokens.length > 0) {
    response += `\n\n❓ Unrecognized: ${unresolvedTokens.map(t => `"${t}"`).join(', ')}`
  }

  // Footer hint
  if (!submitted && addedItems.length > 0) {
    response += `\n\n💡 Add \`send\` to submit: \`/${direction} ... send\``
  }

  await interaction.reply({
    content: response,
    flags: MessageFlags.Ephemeral,
  })
}

// ==================== VALIDATION HELPERS ====================

/**
 * Check if input looks like invoice mode (has a user reference)
 */
export async function looksLikeInvoiceMode(input: string): Promise<boolean> {
  const parsed = await parseTokens(input, botResolvers)
  return parsed.user !== null
}
