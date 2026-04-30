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
import { MessageFlags, ComponentType } from 'discord.js'
import { db, sellOrders, buyOrders } from '@kawakawa/db'
import { eq, and } from 'drizzle-orm'
import { parseTokens, type ParseResult } from '@kawakawa/parser'
import { botResolvers } from '../utils/resolvers.js'
import {
  getOrCreateInvoice,
  addLineItems,
  submitInvoice,
  getInvoiceWithDetails,
  findExistingLineItems,
  updateLineItemQuantity,
  type InvoiceLineItemInput,
} from './invoiceService.js'
import { resolveLocation, formatCommodityWithMode } from './display.js'
import { getOrderDisplayPrice } from '@kawakawa/services/market'
import type { LocationDisplayMode, CommodityDisplayMode } from '@kawakawa/types'
import logger from '../utils/logger.js'
import {
  buildInvoiceConfirmationEmbed,
  buildInvoiceConfirmationButtons,
  buildInvoiceTips,
  buildIncompleteInputEmbed,
  buildUseDialogButtons,
  type InvoiceConfirmationData,
} from '../utils/orderConfirmation.js'
import { COMPONENT_TIMEOUT, MODAL_TIMEOUT } from '../utils/interactions.js'
import { getCommandPrefix } from '../adapters/messageInteraction.js'
import { createInvoiceEditModal, createQuantityNotesModal } from '../utils/modals.js'

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
  commodityDisplayMode: CommodityDisplayMode
}

// ==================== MAIN HANDLER ====================

/**
 * Handle invoice command (/buy or /sell with counterparty)
 */
export async function handleInvoiceCommand(
  options: HandleInvoiceCommandOptions
): Promise<InvoiceCommandResult> {
  const { interaction, userId, input, direction, locationDisplayMode, commodityDisplayMode } =
    options

  // Get command prefix for tips
  const prefix = getCommandPrefix(interaction)

  // Parse input with unified parser
  const parsed = await parseTokens(input, botResolvers)
  logger.debug(
    {
      handler: 'invoice',
      direction,
      input,
      parsedUser: parsed.user
        ? { username: parsed.user.username, userId: parsed.user.userId }
        : null,
      currentUserId: userId,
      items: parsed.items.map(i => ({ ticker: i.commodity.ticker, qty: i.quantity })),
      location: parsed.location?.naturalId ?? null,
      unresolved: parsed.unresolved,
      parseErrors: parsed.errors,
    },
    'invoiceHandler: parsed input'
  )

  // Block self-invoicing
  if (parsed.user && parsed.user.userId === userId) {
    logger.debug(
      { handler: 'invoice', direction, outcome: 'self-invoice blocked' },
      'invoiceHandler: self-invoice blocked'
    )
    await interaction.reply({
      content: `❌ You can't ${direction} from yourself. Use \`${prefix}orders\` to manage your own orders.`,
      flags: MessageFlags.Ephemeral,
    })
    return { success: false }
  }

  // Custom validation for invoice mode - allows missing quantities (we'll prompt)
  const missingFields: string[] = []
  const unresolvedHint =
    parsed.unresolved.length > 0 ? ` (unrecognized: ${parsed.unresolved.join(', ')})` : ''

  if (parsed.items.length === 0) {
    missingFields.push(`At least one commodity is required${unresolvedHint}`)
  }
  if (!parsed.location) {
    // Check if any unresolved tokens might be a location attempt
    if (parsed.unresolved.length > 0) {
      missingFields.push(`Could not resolve location: ${parsed.unresolved.join(', ')}`)
    } else {
      missingFields.push('Location is required')
    }
  }
  if (!parsed.user) {
    missingFields.push('Counterparty user is required')
  }

  // Check for items without quantities - we'll prompt for these
  const itemsWithoutQuantity = parsed.items.filter(
    item => item.quantity === null || item.quantity <= 0
  )

  // If critical fields are missing (commodity, location, or user), show error
  if (missingFields.length > 0) {
    logger.debug(
      {
        handler: 'invoice',
        direction,
        outcome: 'incomplete',
        missingFields,
        unresolved: parsed.unresolved,
      },
      'invoiceHandler: missing fields'
    )
    const parsedCommodities =
      parsed.items.length > 0 ? parsed.items.map(i => i.commodity.ticker) : undefined

    const incompleteEmbed = buildIncompleteInputEmbed({
      direction,
      missingFields,
      parsedValues: {
        commodities: parsedCommodities,
        location: parsed.location?.naturalId,
        quantity: parsed.items.length > 0 ? (parsed.items[0].quantity ?? undefined) : undefined,
        user: parsed.user?.username,
      },
      unresolved: parsed.unresolved.length > 0 ? parsed.unresolved : undefined,
      examples: [
        `${prefix}${direction} 100 COF 200 RAT Katoa bob send`,
        `${prefix}${direction} bob katoa COF 100 RAT 200`,
      ],
      isInvoiceMode: true,
    })

    const dialogButtons = buildUseDialogButtons('invoice_dialog')

    const dialogMessage = await interaction.reply({
      embeds: [incompleteEmbed],
      components: [dialogButtons],
      flags: MessageFlags.Ephemeral,
    })

    // Handle dialog button
    try {
      const dialogCollector = dialogMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: COMPONENT_TIMEOUT,
        filter: i => i.customId.startsWith('invoice_dialog') && i.user.id === interaction.user.id,
      })

      dialogCollector.on('collect', async buttonInteraction => {
        const action = buttonInteraction.customId.split(':')[1]

        if (action === 'cancel') {
          await buttonInteraction.update({
            content: '❌ Cancelled.',
            embeds: [],
            components: [],
          })
          dialogCollector.stop()
          return
        }

        if (action === 'dialog') {
          // Show the invoice edit modal
          const currentQuantities = parsed.items
            .map(i => `${i.commodity.ticker}:${i.quantity ?? ''}`)
            .join(', ')

          const locationMissing = !parsed.location
          const modal = createInvoiceEditModal({
            modalId: `invoice_edit:${Date.now()}`,
            title: `Edit ${direction === 'buy' ? 'Buy' : 'Sell'} Invoice`,
            direction,
            quantities: currentQuantities || undefined,
            showLocation: locationMissing,
            location: parsed.unresolved.length > 0 ? parsed.unresolved[0] : undefined,
          })

          await buttonInteraction.showModal(modal)

          // Wait for modal submission, then re-run with corrected input
          try {
            const modalInteraction = await buttonInteraction.awaitModalSubmit({
              filter: i =>
                i.customId.startsWith('invoice_edit:') && i.user.id === buttonInteraction.user.id,
              time: MODAL_TIMEOUT,
            })

            // Parse the quantities from modal (format: "FE:100" or "FE 100")
            const quantitiesStr = modalInteraction.fields.getTextInputValue('quantities')

            // Parse location from modal (if it was shown)
            let locationStr: string | null = parsed.location?.naturalId ?? null
            if (locationMissing) {
              try {
                locationStr = modalInteraction.fields.getTextInputValue('location') || null
              } catch {
                // Field not present
              }
            }

            // Reconstruct a corrected input string and re-parse
            const userStr = parsed.user?.username ?? ''
            const correctedInput =
              `${quantitiesStr.replace(/:/g, ' ')} ${locationStr ?? ''} ${userStr}`.trim()
            logger.debug(
              { handler: 'invoice', direction, correctedInput },
              'invoiceHandler: re-running with modal input'
            )

            const reparsed = await parseTokens(correctedInput, botResolvers)
            logger.debug(
              {
                handler: 'invoice',
                direction,
                correctedInput,
                location: reparsed.location?.naturalId ?? null,
                items: reparsed.items.map(i => ({ ticker: i.commodity.ticker, qty: i.quantity })),
                unresolved: reparsed.unresolved,
              },
              'invoiceHandler: re-parsed modal input'
            )

            // Preserve user from original parse (modal doesn't have a user field)
            if (!reparsed.user && parsed.user) {
              reparsed.user = parsed.user
            }

            // Check if we still have missing fields
            const stillMissing: string[] = []
            if (reparsed.items.length === 0) stillMissing.push('commodity')
            if (!reparsed.location) {
              stillMissing.push(
                locationStr ? `location ("${locationStr}" not recognized)` : 'location'
              )
            }
            if (!reparsed.user) stillMissing.push('user')

            if (stillMissing.length > 0) {
              await modalInteraction.reply({
                content: `❌ Still could not resolve: ${stillMissing.join(', ')}.\n\nExample: \`${prefix}${direction} FE 100 MOR alice\``,
                flags: MessageFlags.Ephemeral,
              })
              dialogCollector.stop()
              return
            }

            // We have all fields — proceed directly to invoice creation
            await modalInteraction.deferUpdate()
            dialogCollector.stop()

            const result = await executeInvoiceFlow({
              interaction,
              userId,
              parsed: reparsed,
              direction,
              prefix,
              useEditReply: true,
            })

            // Result is handled inside executeInvoiceFlow
            logger.debug(
              { handler: 'invoice', direction, result: { success: result.success } },
              'invoiceHandler: modal flow complete'
            )
          } catch {
            // Modal timed out or was dismissed
          }
          dialogCollector.stop()
        }
      })

      dialogCollector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          try {
            await interaction.editReply({
              content: '⏱️ Timed out. Please try again.',
              embeds: [],
              components: [],
            })
          } catch {
            // Interaction may have been deleted
          }
        }
      })
    } catch (error) {
      logger.error({ error }, 'Error in invoice dialog collector')
    }

    return { success: false, errors: missingFields }
  }

  // If quantities are missing, prompt for them with a modal
  if (itemsWithoutQuantity.length > 0) {
    logger.debug(
      {
        handler: 'invoice',
        direction,
        outcome: 'quantity-prompt',
        items: itemsWithoutQuantity.map(i => i.commodity.ticker),
      },
      'invoiceHandler: prompting for quantities'
    )
    return await handleQuantityPrompt(
      interaction,
      userId,
      parsed,
      direction,
      locationDisplayMode,
      commodityDisplayMode,
      prefix
    )
  }

  // At this point we have:
  // - parsed.items: commodity/quantity pairs (with quantities)
  // - parsed.location: validated location
  // - parsed.user: validated counterparty user
  // - parsed.actions.has('send'): whether to submit immediately

  const counterparty = parsed.user!
  const locationId = parsed.location!.naturalId
  const willSubmit = parsed.actions.has('send')
  logger.debug(
    {
      handler: 'invoice',
      direction,
      outcome: 'main-flow',
      counterparty: counterparty.username,
      locationId,
      willSubmit,
    },
    'invoiceHandler: entering main flow'
  )

  // Get or create invoice with counterparty
  const { id: invoiceId, isNew: isNewInvoice } = await getOrCreateInvoice(
    userId,
    counterparty.userId
  )

  // Convert parsed items to format expected by matching
  const parsedItems = parsed.items.map(item => ({
    ticker: item.commodity.ticker,
    commodityName: item.commodity.name,
    quantity: item.quantity ?? 0,
  }))

  // Check for existing duplicate line items in the invoice
  const duplicates: Array<{
    ticker: string
    existingQuantity: number
    existingLineItemId: number
    newQuantity: number
  }> = []

  for (const item of parsedItems) {
    const existing = await findExistingLineItems(invoiceId, item.ticker, locationId)
    if (existing.length > 0) {
      duplicates.push({
        ticker: item.ticker,
        existingQuantity: existing[0].quantity,
        existingLineItemId: existing[0].id,
        newQuantity: item.quantity,
      })
    }
  }

  // If there are duplicates, show update/cancel choice
  if (duplicates.length > 0) {
    return await handleDuplicatesInMainFlow(
      interaction,
      userId,
      parsed,
      duplicates,
      invoiceId,
      direction,
      locationDisplayMode,
      commodityDisplayMode,
      prefix
    )
  }

  // Find matching orders from counterparty (don't add yet)
  const matchResult = await findMatchingOrders({
    counterpartyUserId: counterparty.userId,
    locationId,
    parsedItems,
    direction,
  })

  // Get current invoice total
  const invoice = await getInvoiceWithDetails(invoiceId, userId)
  const currentTotal = new Map<string, number>()
  if (invoice) {
    for (const item of invoice.lineItems) {
      const current = currentTotal.get(item.currency) ?? 0
      const unitPrice =
        typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice
      currentTotal.set(item.currency, current + item.quantity * unitPrice)
    }
  }

  // Add new items to total
  for (const item of matchResult.matchedItems) {
    const current = currentTotal.get(item.currency) ?? 0
    currentTotal.set(item.currency, current + item.quantity * item.price)
  }

  // Get location and counterparty names
  const resolvedLocation = await resolveLocation(locationId)
  const locationName = resolvedLocation?.name ?? locationId
  const counterpartyName =
    counterparty.fioUsername ?? counterparty.displayName ?? counterparty.username

  // Build confirmation data
  const confirmationData: InvoiceConfirmationData = {
    direction,
    counterpartyName,
    invoiceId,
    isNewInvoice,
    locationId,
    locationName,
    addedItems: matchResult.matchedItems.map(item => ({
      ticker: item.ticker,
      commodityName: item.commodityName,
      quantity: item.quantity,
      price: item.price.toFixed(2),
      currency: item.currency,
    })),
    notFoundItems: matchResult.notFoundItems,
    currentInvoiceTotal: currentTotal,
    willSubmit,
  }

  // Show confirmation with Edit button
  const confirmEmbed = await buildInvoiceConfirmationEmbed(confirmationData, locationDisplayMode)
  const confirmButtons = buildInvoiceConfirmationButtons('invoice_confirm', {
    allowSubmit: !willSubmit,
    showEdit: true,
  })

  const confirmMessage = await interaction.reply({
    embeds: [confirmEmbed],
    components: [confirmButtons],
    flags: MessageFlags.Ephemeral,
  })

  // Wait for confirmation
  try {
    const collector = confirmMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COMPONENT_TIMEOUT,
      filter: i => i.customId.startsWith('invoice_confirm') && i.user.id === interaction.user.id,
    })

    let finalResult: InvoiceCommandResult = { success: false }

    // Store current state for Edit functionality
    let currentMatchResult = matchResult
    let currentConfirmationData = confirmationData

    collector.on('collect', async buttonInteraction => {
      const action = buttonInteraction.customId.split(':')[1]

      if (action === 'cancel') {
        await buttonInteraction.update({
          content: '❌ Invoice cancelled.',
          embeds: [],
          components: [],
        })
        collector.stop()
        finalResult = { success: false }
        return
      }

      if (action === 'edit') {
        // Show the invoice edit modal with current quantities
        const currentQuantities = currentMatchResult.matchedItems
          .map(i => `${i.ticker}:${i.quantity}`)
          .join(', ')

        const modal = createInvoiceEditModal({
          modalId: `invoice_edit:${Date.now()}`,
          title: `Edit ${direction === 'buy' ? 'Buy' : 'Sell'} Invoice`,
          direction,
          quantities: currentQuantities || undefined,
        })

        await buttonInteraction.showModal(modal)

        // Wait for modal submission
        try {
          const modalInteraction = await buttonInteraction.awaitModalSubmit({
            filter: i =>
              i.customId.startsWith('invoice_edit:') && i.user.id === buttonInteraction.user.id,
            time: MODAL_TIMEOUT,
          })

          // Parse the quantities from modal (format: "COF:100, RAT:200")
          const quantitiesStr = modalInteraction.fields.getTextInputValue('quantities')
          const quantityPairs = quantitiesStr.split(',').map(s => s.trim())

          const updatedItems: Array<{ ticker: string; commodityName: string; quantity: number }> =
            []

          for (const pair of quantityPairs) {
            const match = pair.match(/^([A-Z0-9]+):?\s*(\d+)$/i)
            if (match) {
              const ticker = match[1].toUpperCase()
              const quantity = parseInt(match[2], 10)

              // Find the commodity name from original parsed items
              const original = parsed.items.find(i => i.commodity.ticker === ticker)
              if (original && quantity > 0) {
                updatedItems.push({
                  ticker,
                  commodityName: original.commodity.name,
                  quantity,
                })
              }
            }
          }

          if (updatedItems.length === 0) {
            await modalInteraction.reply({
              content: '❌ Invalid format. Use: `COF:100, RAT:200`',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          // Re-match orders with new quantities
          const newMatchResult = await findMatchingOrders({
            counterpartyUserId: counterparty.userId,
            locationId,
            parsedItems: updatedItems,
            direction,
          })

          // Recalculate total
          const newTotal = new Map<string, number>()
          if (invoice) {
            for (const item of invoice.lineItems) {
              const current = newTotal.get(item.currency) ?? 0
              const unitPrice =
                typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice
              newTotal.set(item.currency, current + item.quantity * unitPrice)
            }
          }
          for (const item of newMatchResult.matchedItems) {
            const current = newTotal.get(item.currency) ?? 0
            newTotal.set(item.currency, current + item.quantity * item.price)
          }

          // Update state
          currentMatchResult = newMatchResult
          currentConfirmationData = {
            ...currentConfirmationData,
            addedItems: newMatchResult.matchedItems.map(item => ({
              ticker: item.ticker,
              commodityName: item.commodityName,
              quantity: item.quantity,
              price: item.price.toFixed(2),
              currency: item.currency,
            })),
            notFoundItems: newMatchResult.notFoundItems,
            currentInvoiceTotal: newTotal,
          }

          // Rebuild and update confirmation embed
          const updatedEmbed = await buildInvoiceConfirmationEmbed(
            currentConfirmationData,
            locationDisplayMode
          )

          // Acknowledge modal and update the message via button interaction
          await modalInteraction.deferUpdate()
          await buttonInteraction.editReply({
            embeds: [updatedEmbed],
            components: [confirmButtons],
          })
        } catch {
          // Modal timed out or was dismissed - do nothing, keep collector active
        }
        return
      }

      const shouldSubmit = action === 'submit' || (action === 'confirm' && willSubmit)

      // Disable buttons
      await buttonInteraction.update({
        embeds: [confirmEmbed],
        components: [],
      })

      // Add line items to invoice
      if (currentMatchResult.lineItems.length > 0) {
        await addLineItems(invoiceId, currentMatchResult.lineItems)
      }

      // Handle submission if requested
      let submitted = false
      let reservationCount = 0

      if (shouldSubmit && currentMatchResult.matchedItems.length > 0) {
        const submitResult = await submitInvoice(invoiceId, userId)
        if (submitResult.success) {
          submitted = true
          reservationCount = submitResult.reservationCount ?? 0
        }
      }

      // Send success message with tips
      const tips = buildInvoiceTips(counterpartyName, invoiceId, prefix, submitted)

      await buttonInteraction.followUp({
        content: tips,
        flags: MessageFlags.Ephemeral,
      })

      logger.info(
        {
          userId,
          counterpartyUserId: counterparty.userId,
          invoiceId,
          direction,
          itemsAdded: currentMatchResult.matchedItems.length,
          submitted,
        },
        `Invoice command processed (${direction})`
      )

      finalResult = {
        success: true,
        invoiceId,
        isNewInvoice,
        addedItems: currentMatchResult.matchedItems,
        notFoundItems: currentMatchResult.notFoundItems,
        submitted,
        reservationCount,
      }

      collector.stop()
    })

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.editReply({
            content: '⏱️ Confirmation timed out. Please try again.',
            embeds: [],
            components: [],
          })
        } catch {
          // Interaction may have been deleted
        }
      }
    })

    // Wait for collector to finish
    await new Promise<void>(resolve => {
      collector.on('end', () => resolve())
    })

    return finalResult
  } catch (error) {
    logger.error({ error }, 'Error in invoice confirmation collector')
    return { success: false, errors: ['Confirmation failed'] }
  }
}

// ==================== DIRECT EXECUTION (from modal dialog) ====================

interface ExecuteInvoiceFlowOptions {
  interaction: ChatInputCommandInteraction
  userId: number
  parsed: ParseResult
  direction: OrderDirection
  prefix: string
  /** If true, use editReply instead of reply (when we already replied with the incomplete embed) */
  useEditReply?: boolean
}

/**
 * Execute the invoice flow directly (skip confirmation).
 * Used when the user has already confirmed via a dialog modal.
 */
async function executeInvoiceFlow(
  options: ExecuteInvoiceFlowOptions
): Promise<InvoiceCommandResult> {
  const { interaction, userId, parsed, direction, prefix, useEditReply } = options

  const counterparty = parsed.user!
  const locationId = parsed.location!.naturalId
  const willSubmit = parsed.actions.has('send')

  // Get or create invoice
  const { id: invoiceId, isNew: isNewInvoice } = await getOrCreateInvoice(
    userId,
    counterparty.userId
  )

  const parsedItems = parsed.items.map(item => ({
    ticker: item.commodity.ticker,
    commodityName: item.commodity.name,
    quantity: item.quantity ?? 0,
  }))

  // Check for duplicates
  for (const item of parsedItems) {
    const existing = await findExistingLineItems(invoiceId, item.ticker, locationId)
    if (existing.length > 0) {
      // Update existing line item quantity directly
      await updateLineItemQuantity(existing[0].id, item.quantity)
      logger.info(
        {
          userId,
          invoiceId,
          ticker: item.ticker,
          oldQty: existing[0].quantity,
          newQty: item.quantity,
        },
        'Updated duplicate line item via dialog'
      )
    }
  }

  // Find matching orders from counterparty
  const matchResult = await findMatchingOrders({
    counterpartyUserId: counterparty.userId,
    locationId,
    parsedItems,
    direction,
  })

  // Add non-duplicate line items to invoice
  if (matchResult.lineItems.length > 0) {
    // Filter out items that were already updated as duplicates
    const existingTickers = new Set<string>()
    for (const item of parsedItems) {
      const existing = await findExistingLineItems(invoiceId, item.ticker, locationId)
      if (existing.length > 0) existingTickers.add(item.ticker)
    }
    const newLineItems = matchResult.lineItems.filter(
      li => !existingTickers.has(li.commodityTicker)
    )
    if (newLineItems.length > 0) {
      await addLineItems(invoiceId, newLineItems)
    }
  }

  // Handle submission if requested
  let submitted = false
  let reservationCount = 0
  if (willSubmit && matchResult.matchedItems.length > 0) {
    const submitResult = await submitInvoice(invoiceId, userId)
    if (submitResult.success) {
      submitted = true
      reservationCount = submitResult.reservationCount ?? 0
    }
  }

  // Build success message
  const counterpartyName =
    counterparty.fioUsername ?? counterparty.displayName ?? counterparty.username
  const tips = buildInvoiceTips(counterpartyName, invoiceId, prefix, submitted)

  let content = tips
  if (matchResult.notFoundItems.length > 0) {
    content += `\n\n⚠️ No matching orders for: ${matchResult.notFoundItems.join(', ')}`
  }

  const sendFn = useEditReply
    ? () => interaction.editReply({ content, embeds: [], components: [] })
    : () => interaction.followUp({ content, flags: MessageFlags.Ephemeral })

  await sendFn()

  logger.info(
    {
      userId,
      counterpartyUserId: counterparty.userId,
      invoiceId,
      direction,
      itemsAdded: matchResult.matchedItems.length,
      submitted,
      source: 'dialog',
    },
    `Invoice created via dialog (${direction})`
  )

  return {
    success: true,
    invoiceId,
    isNewInvoice,
    addedItems: matchResult.matchedItems,
    notFoundItems: matchResult.notFoundItems,
    submitted,
    reservationCount,
  }
}

// ==================== ORDER MATCHING ====================

interface FindMatchingOptions {
  counterpartyUserId: number
  locationId: string
  parsedItems: Array<{ ticker: string; commodityName: string; quantity: number }>
  direction: OrderDirection
}

interface FindMatchingResult {
  matchedItems: Array<{
    ticker: string
    commodityName: string
    quantity: number
    price: number
    currency: string
  }>
  notFoundItems: string[]
  lineItems: InvoiceLineItemInput[]
}

/**
 * Find matching orders from counterparty (doesn't add to invoice yet)
 */
async function findMatchingOrders(options: FindMatchingOptions): Promise<FindMatchingResult> {
  const { counterpartyUserId, locationId, parsedItems, direction } = options

  const matchedItems: FindMatchingResult['matchedItems'] = []
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
        notFoundItems.push(`${item.ticker}`)
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

      matchedItems.push({
        ticker: item.ticker,
        commodityName: item.commodityName,
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
        notFoundItems.push(`${item.ticker}`)
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

      matchedItems.push({
        ticker: item.ticker,
        commodityName: item.commodityName,
        quantity: item.quantity,
        price,
        currency: order.currency,
      })
    }
  }

  return { matchedItems, notFoundItems, lineItems }
}

// ==================== QUANTITY PROMPT ====================

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js'

/**
 * Handle invoice creation when quantities are missing - prompt with modal
 */
async function handleQuantityPrompt(
  interaction: ChatInputCommandInteraction,
  userId: number,
  parsed: ParseResult,
  direction: OrderDirection,
  locationDisplayMode: LocationDisplayMode,
  commodityDisplayMode: CommodityDisplayMode,
  prefix: string
): Promise<InvoiceCommandResult> {
  const itemsWithoutQuantity = parsed.items.filter(
    item => item.quantity === null || item.quantity <= 0
  )
  const formattedCommodities = await Promise.all(
    itemsWithoutQuantity.map(i => formatCommodityWithMode(i.commodity.ticker, commodityDisplayMode))
  )
  const commodityList = formattedCommodities.join(', ')
  const counterpartyName =
    parsed.user!.fioUsername ?? parsed.user!.displayName ?? parsed.user!.username

  // Build prompt embed
  const embed = new EmbedBuilder()
    .setTitle(`📝 Enter Quantity`)
    .setColor(0x5865f2)
    .setDescription(
      `You're ${direction === 'buy' ? 'buying' : 'selling'} **${commodityList}** from **${counterpartyName}**.\n\n` +
        `Please enter the quantity you want to ${direction}.`
    )

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`invoice_qty_dialog:${Date.now()}`)
      .setLabel('Enter Quantity')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`invoice_qty_cancel:${Date.now()}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  )

  const promptMessage = await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  })

  return new Promise(resolve => {
    const collector = promptMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COMPONENT_TIMEOUT,
      filter: i => i.customId.startsWith('invoice_qty_') && i.user.id === interaction.user.id,
    })

    collector.on('collect', async buttonInteraction => {
      if (buttonInteraction.customId.startsWith('invoice_qty_cancel')) {
        await buttonInteraction.update({
          content: '❌ Cancelled.',
          embeds: [],
          components: [],
        })
        collector.stop()
        resolve({ success: false })
        return
      }

      // Show quantity modal
      const modal = createQuantityNotesModal({
        modalId: `invoice_qty_modal:${Date.now()}`,
        title: `Enter Quantity for ${commodityList}`,
        maxQuantity: 999999,
        quantityLabel: 'Quantity',
        notesPlaceholder: 'Optional notes',
      })

      await buttonInteraction.showModal(modal)

      try {
        const modalInteraction = await buttonInteraction.awaitModalSubmit({
          filter: i =>
            i.customId.startsWith('invoice_qty_modal:') && i.user.id === buttonInteraction.user.id,
          time: MODAL_TIMEOUT,
        })

        const quantityStr = modalInteraction.fields.getTextInputValue('quantity')
        const quantity = parseInt(quantityStr, 10)

        if (isNaN(quantity) || quantity <= 0) {
          await modalInteraction.reply({
            content: '❌ Invalid quantity. Please enter a positive number.',
            flags: MessageFlags.Ephemeral,
          })
          collector.stop()
          resolve({ success: false, errors: ['Invalid quantity'] })
          return
        }

        // Update parsed items with the quantity
        for (const item of parsed.items) {
          if (item.quantity === null || item.quantity <= 0) {
            item.quantity = quantity
          }
        }

        // Now continue with the invoice flow
        await modalInteraction.deferUpdate()
        collector.stop()

        // Continue processing with the quantity now filled in
        const result = await processInvoiceWithQuantities(
          interaction,
          buttonInteraction,
          userId,
          parsed,
          direction,
          locationDisplayMode,
          commodityDisplayMode,
          prefix
        )
        resolve(result)
      } catch {
        // Modal timed out
        collector.stop()
        resolve({ success: false })
      }
    })

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.editReply({
            content: '⏱️ Timed out. Please try again.',
            embeds: [],
            components: [],
          })
        } catch {
          // Interaction may have been deleted
        }
        resolve({ success: false })
      }
    })
  })
}

/**
 * Process invoice after quantities have been provided (either from initial input or modal)
 */
async function processInvoiceWithQuantities(
  originalInteraction: ChatInputCommandInteraction,
  buttonInteraction: import('discord.js').ButtonInteraction,
  userId: number,
  parsed: ParseResult,
  direction: OrderDirection,
  locationDisplayMode: LocationDisplayMode,
  commodityDisplayMode: CommodityDisplayMode,
  prefix: string
): Promise<InvoiceCommandResult> {
  const counterparty = parsed.user!
  const locationId = parsed.location!.naturalId
  const willSubmit = parsed.actions.has('send')

  // Get or create invoice with counterparty
  const { id: invoiceId, isNew: isNewInvoice } = await getOrCreateInvoice(
    userId,
    counterparty.userId
  )

  // Convert parsed items to format expected by matching
  const parsedItems = parsed.items.map(item => ({
    ticker: item.commodity.ticker,
    commodityName: item.commodity.name,
    quantity: item.quantity ?? 0,
  }))

  // Check for existing duplicate line items in the invoice
  const duplicates: Array<{
    ticker: string
    existingQuantity: number
    existingLineItemId: number
    newQuantity: number
  }> = []

  for (const item of parsedItems) {
    const existing = await findExistingLineItems(invoiceId, item.ticker, locationId)
    if (existing.length > 0) {
      duplicates.push({
        ticker: item.ticker,
        existingQuantity: existing[0].quantity,
        existingLineItemId: existing[0].id,
        newQuantity: item.quantity,
      })
    }
  }

  // If there are duplicates, show update/cancel choice
  if (duplicates.length > 0) {
    return await handleDuplicateLineItems(
      originalInteraction,
      buttonInteraction,
      userId,
      parsed,
      duplicates,
      invoiceId,
      direction,
      locationDisplayMode,
      commodityDisplayMode,
      prefix
    )
  }

  // No duplicates - proceed with normal flow
  return await continueInvoiceFlow(
    originalInteraction,
    buttonInteraction,
    userId,
    parsed,
    invoiceId,
    isNewInvoice,
    direction,
    locationDisplayMode,
    prefix,
    willSubmit
  )
}

/**
 * Handle duplicate line items - show update or cancel choice
 */
async function handleDuplicateLineItems(
  originalInteraction: ChatInputCommandInteraction,
  buttonInteraction: import('discord.js').ButtonInteraction,
  userId: number,
  parsed: ParseResult,
  duplicates: Array<{
    ticker: string
    existingQuantity: number
    existingLineItemId: number
    newQuantity: number
  }>,
  invoiceId: number,
  _direction: OrderDirection,
  _locationDisplayMode: LocationDisplayMode,
  commodityDisplayMode: CommodityDisplayMode,
  prefix: string
): Promise<InvoiceCommandResult> {
  const counterpartyName =
    parsed.user!.fioUsername ?? parsed.user!.displayName ?? parsed.user!.username

  // Build duplicate warning embed - format commodities according to user preference
  const formattedDuplicates = await Promise.all(
    duplicates.map(async d => {
      const formattedTicker = await formatCommodityWithMode(d.ticker, commodityDisplayMode)
      return `• **${formattedTicker}**: existing qty ${d.existingQuantity} → new qty ${d.newQuantity}`
    })
  )
  const duplicateList = formattedDuplicates.join('\n')

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Duplicate Line Items Found')
    .setColor(0xffa500)
    .setDescription(
      `You already have the following items in your invoice with **${counterpartyName}**:\n\n` +
        duplicateList +
        '\n\n' +
        '**Update** will replace the existing quantities with the new values.\n' +
        '**Cancel** will abort this command and keep the existing items.'
    )

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`invoice_dup_update:${Date.now()}`)
      .setLabel('Update')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`invoice_dup_cancel:${Date.now()}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  )

  await buttonInteraction.editReply({
    embeds: [embed],
    components: [row],
  })

  return new Promise(resolve => {
    const collector = buttonInteraction.message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COMPONENT_TIMEOUT,
      filter: i =>
        i.customId.startsWith('invoice_dup_') && i.user.id === originalInteraction.user.id,
    })

    collector.on('collect', async dupButtonInteraction => {
      if (dupButtonInteraction.customId.startsWith('invoice_dup_cancel')) {
        await dupButtonInteraction.update({
          content: '❌ Cancelled. Existing invoice items unchanged.',
          embeds: [],
          components: [],
        })
        collector.stop()
        resolve({ success: false })
        return
      }

      if (dupButtonInteraction.customId.startsWith('invoice_dup_update')) {
        // Update the existing line items with new quantities
        for (const dup of duplicates) {
          await updateLineItemQuantity(dup.existingLineItemId, dup.newQuantity)
          logger.info(
            {
              userId,
              invoiceId,
              ticker: dup.ticker,
              oldQuantity: dup.existingQuantity,
              newQuantity: dup.newQuantity,
            },
            'Updated duplicate invoice line item quantity'
          )
        }

        await dupButtonInteraction.update({
          content:
            `✅ Updated ${duplicates.length} line item(s) in invoice #${invoiceId}.\n\n` +
            `Use \`${prefix}invoices\` to view your invoices.`,
          embeds: [],
          components: [],
        })

        collector.stop()
        resolve({
          success: true,
          invoiceId,
          addedItems: duplicates.map(d => ({
            ticker: d.ticker,
            quantity: d.newQuantity,
            price: 0, // Price not changed
            currency: 'CIS', // Not relevant for updates
          })),
        })
      }
    })

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await originalInteraction.editReply({
            content: '⏱️ Timed out. Please try again.',
            embeds: [],
            components: [],
          })
        } catch {
          // Interaction may have been deleted
        }
        resolve({ success: false })
      }
    })
  })
}

/**
 * Handle duplicate line items in main flow (quantities provided upfront)
 */
async function handleDuplicatesInMainFlow(
  interaction: ChatInputCommandInteraction,
  userId: number,
  parsed: ParseResult,
  duplicates: Array<{
    ticker: string
    existingQuantity: number
    existingLineItemId: number
    newQuantity: number
  }>,
  invoiceId: number,
  direction: OrderDirection,
  locationDisplayMode: LocationDisplayMode,
  commodityDisplayMode: CommodityDisplayMode,
  prefix: string
): Promise<InvoiceCommandResult> {
  const counterpartyName =
    parsed.user!.fioUsername ?? parsed.user!.displayName ?? parsed.user!.username

  // Build duplicate warning embed - format commodities according to user preference
  const formattedDuplicates = await Promise.all(
    duplicates.map(async d => {
      const formattedTicker = await formatCommodityWithMode(d.ticker, commodityDisplayMode)
      return `• **${formattedTicker}**: existing qty ${d.existingQuantity} → new qty ${d.newQuantity}`
    })
  )
  const duplicateList = formattedDuplicates.join('\n')

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Duplicate Line Items Found')
    .setColor(0xffa500)
    .setDescription(
      `You already have the following items in your invoice with **${counterpartyName}**:\n\n` +
        duplicateList +
        '\n\n' +
        '**Update** will replace the existing quantities with the new values.\n' +
        '**Cancel** will abort this command and keep the existing items.'
    )

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`invoice_dup_main_update:${Date.now()}`)
      .setLabel('Update')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`invoice_dup_main_cancel:${Date.now()}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  )

  const message = await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  })

  return new Promise(resolve => {
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COMPONENT_TIMEOUT,
      filter: i => i.customId.startsWith('invoice_dup_main_') && i.user.id === interaction.user.id,
    })

    collector.on('collect', async buttonInteraction => {
      if (buttonInteraction.customId.startsWith('invoice_dup_main_cancel')) {
        await buttonInteraction.update({
          content: '❌ Cancelled. Existing invoice items unchanged.',
          embeds: [],
          components: [],
        })
        collector.stop()
        resolve({ success: false })
        return
      }

      if (buttonInteraction.customId.startsWith('invoice_dup_main_update')) {
        // Update the existing line items with new quantities
        for (const dup of duplicates) {
          await updateLineItemQuantity(dup.existingLineItemId, dup.newQuantity)
          logger.info(
            {
              userId,
              invoiceId,
              ticker: dup.ticker,
              oldQuantity: dup.existingQuantity,
              newQuantity: dup.newQuantity,
            },
            'Updated duplicate invoice line item quantity'
          )
        }

        await buttonInteraction.update({
          content:
            `✅ Updated ${duplicates.length} line item(s) in invoice #${invoiceId}.\n\n` +
            `Use \`${prefix}invoices\` to view your invoices.`,
          embeds: [],
          components: [],
        })

        collector.stop()
        resolve({
          success: true,
          invoiceId,
          addedItems: duplicates.map(d => ({
            ticker: d.ticker,
            quantity: d.newQuantity,
            price: 0,
            currency: 'CIS',
          })),
        })
      }
    })

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.editReply({
            content: '⏱️ Timed out. Please try again.',
            embeds: [],
            components: [],
          })
        } catch {
          // Interaction may have been deleted
        }
        resolve({ success: false })
      }
    })
  })
}

/**
 * Continue with the standard invoice flow after validations
 */
async function continueInvoiceFlow(
  originalInteraction: ChatInputCommandInteraction,
  buttonInteraction: import('discord.js').ButtonInteraction | null,
  userId: number,
  parsed: ParseResult,
  invoiceId: number,
  isNewInvoice: boolean,
  direction: OrderDirection,
  locationDisplayMode: LocationDisplayMode,
  prefix: string,
  willSubmit: boolean
): Promise<InvoiceCommandResult> {
  const counterparty = parsed.user!
  const locationId = parsed.location!.naturalId

  // Convert parsed items to format expected by matching
  const parsedItems = parsed.items.map(item => ({
    ticker: item.commodity.ticker,
    commodityName: item.commodity.name,
    quantity: item.quantity ?? 0,
  }))

  // Find matching orders from counterparty
  const matchResult = await findMatchingOrders({
    counterpartyUserId: counterparty.userId,
    locationId,
    parsedItems,
    direction,
  })

  if (matchResult.matchedItems.length === 0 && matchResult.notFoundItems.length > 0) {
    const content = `❌ No matching ${direction === 'buy' ? 'sell' : 'buy'} orders found from **${counterparty.fioUsername ?? counterparty.displayName ?? counterparty.username}** for: ${matchResult.notFoundItems.join(', ')}`

    if (buttonInteraction) {
      await buttonInteraction.editReply({
        content,
        embeds: [],
        components: [],
      })
    } else {
      await originalInteraction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      })
    }

    return { success: false, errors: ['No matching orders found'] }
  }

  // Add line items to invoice
  if (matchResult.lineItems.length > 0) {
    await addLineItems(invoiceId, matchResult.lineItems)
  }

  // Handle submission if requested
  let submitted = false
  let reservationCount = 0

  if (willSubmit && matchResult.matchedItems.length > 0) {
    const submitResult = await submitInvoice(invoiceId, userId)
    if (submitResult.success) {
      submitted = true
      reservationCount = submitResult.reservationCount ?? 0
    }
  }

  // Build success message
  const counterpartyName =
    counterparty.fioUsername ?? counterparty.displayName ?? counterparty.username
  const tips = buildInvoiceTips(counterpartyName, invoiceId, prefix, submitted)

  const content =
    tips +
    (matchResult.notFoundItems.length > 0
      ? `\n\n⚠️ Not found: ${matchResult.notFoundItems.join(', ')}`
      : '')

  if (buttonInteraction) {
    await buttonInteraction.editReply({
      content,
      embeds: [],
      components: [],
    })
  } else {
    await originalInteraction.followUp({
      content,
      flags: MessageFlags.Ephemeral,
    })
  }

  logger.info(
    {
      userId,
      counterpartyUserId: counterparty.userId,
      invoiceId,
      direction,
      itemsAdded: matchResult.matchedItems.length,
      submitted,
    },
    `Invoice command processed (${direction}) via quantity prompt flow`
  )

  return {
    success: true,
    invoiceId,
    isNewInvoice,
    addedItems: matchResult.matchedItems,
    notFoundItems: matchResult.notFoundItems,
    submitted,
    reservationCount,
  }
}
