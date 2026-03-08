/**
 * Invoice Builder Service
 *
 * Handles multi-step invoice creation from query results:
 * 1. Location select (with chunking for >25 orders)
 * 2. Order multi-select
 * 3. Create invoice(s) grouped by seller
 */
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import type { ButtonInteraction } from 'discord.js'
import { formatCommodity, formatLocation } from './display.js'
import { getOrCreateInvoice, addLineItems, type InvoiceLineItemInput } from './invoiceService.js'
import type { Currency, LocationDisplayMode } from '@kawakawa/types'
import logger from '../utils/logger.js'

const CHUNK_SIZE = 25
const COMPONENT_TIMEOUT = 5 * 60 * 1000 // 5 minutes

/**
 * Order data structure for invoice builder
 */
export interface OrderForInvoice {
  id: number
  userId: number
  commodityTicker: string
  locationId: string // naturalId like "BEN"
  price: number
  currency: Currency
  priceListCode: string | null
  user: { id?: number; displayName: string | null; username: string }
  location: { naturalId: string; name: string }
  commodity: { ticker: string; name: string }
  availableQuantity?: number
}

/**
 * Location chunk for the first select menu
 */
interface LocationChunk {
  locationNaturalId: string
  locationName: string
  startIndex: number
  endIndex: number
  totalOrders: number
  orders: OrderForInvoice[]
}

/**
 * Group orders by location and chunk if necessary.
 */
function chunkOrdersByLocation(orders: OrderForInvoice[]): LocationChunk[] {
  // Group by location naturalId
  const byLocation = new Map<string, OrderForInvoice[]>()
  for (const order of orders) {
    const key = order.location.naturalId
    const existing = byLocation.get(key) || []
    existing.push(order)
    byLocation.set(key, existing)
  }

  const chunks: LocationChunk[] = []

  for (const [_locationNaturalId, locationOrders] of byLocation) {
    const first = locationOrders[0]
    const totalOrders = locationOrders.length

    if (locationOrders.length <= CHUNK_SIZE) {
      // Single chunk for this location
      chunks.push({
        locationNaturalId: first.location.naturalId,
        locationName: first.location.name,
        startIndex: 1,
        endIndex: locationOrders.length,
        totalOrders,
        orders: locationOrders,
      })
    } else {
      // Split into multiple chunks
      for (let i = 0; i < locationOrders.length; i += CHUNK_SIZE) {
        const slice = locationOrders.slice(i, i + CHUNK_SIZE)
        chunks.push({
          locationNaturalId: first.location.naturalId,
          locationName: first.location.name,
          startIndex: i + 1,
          endIndex: i + slice.length,
          totalOrders,
          orders: slice,
        })
      }
    }
  }

  return chunks
}

/**
 * Build location select menu options
 */
async function buildLocationOptions(
  chunks: LocationChunk[],
  locationDisplayMode: LocationDisplayMode
): Promise<{ label: string; value: string; description: string }[]> {
  const options: { label: string; value: string; description: string }[] = []

  for (let i = 0; i < Math.min(chunks.length, 25); i++) {
    const chunk = chunks[i]
    const locationDisplay = await formatLocation(chunk.locationNaturalId, locationDisplayMode)

    // Format label: "Benten (BEN) - 12 orders" or "Benten (BEN) [1-25]"
    let label: string
    if (chunk.totalOrders <= CHUNK_SIZE) {
      label = `${locationDisplay} - ${chunk.totalOrders} order${chunk.totalOrders !== 1 ? 's' : ''}`
    } else {
      label = `${locationDisplay} [${chunk.startIndex}-${chunk.endIndex}]`
    }

    // Truncate label if too long (Discord limit: 100 chars)
    if (label.length > 100) {
      label = label.substring(0, 97) + '...'
    }

    // Unique sellers at this chunk
    const uniqueSellers = new Set(chunk.orders.map(o => o.userId))
    const sellerCount = uniqueSellers.size

    options.push({
      label,
      value: String(i), // Index into chunks array
      description: `${chunk.orders.length} orders from ${sellerCount} seller${sellerCount !== 1 ? 's' : ''}`,
    })
  }

  return options
}

/**
 * Build order select menu options for a chunk
 */
function buildOrderOptions(
  orders: OrderForInvoice[]
): { label: string; value: string; description: string }[] {
  return orders.slice(0, 25).map(order => {
    const qty = order.availableQuantity ?? '?'
    const seller = order.user.displayName || order.user.username
    // Format: "100x COF @ 50 CIS - Alice"
    let label = `${qty}x ${order.commodityTicker} @ ${order.price} ${order.currency}`
    if (label.length > 80) {
      label = label.substring(0, 77) + '...'
    }

    // Truncate seller name if needed
    let description = `From ${seller}`
    if (description.length > 100) {
      description = description.substring(0, 97) + '...'
    }

    return {
      label,
      value: String(order.id),
      description,
    }
  })
}

/**
 * Start the invoice creation flow from query results.
 *
 * Uses a step-by-step approach with awaitMessageComponent for reliable
 * interaction handling on ephemeral messages.
 *
 * @param buttonInteraction - The button interaction that triggered this flow
 * @param orders - All sell orders from the query results
 * @param buyerUserId - The user ID of the person creating the invoice (buyer)
 * @param locationDisplayMode - How to display locations
 */
export async function startInvoiceCreationFlow(
  buttonInteraction: ButtonInteraction,
  orders: OrderForInvoice[],
  buyerUserId: number,
  locationDisplayMode: LocationDisplayMode
): Promise<void> {
  if (orders.length === 0) {
    await buttonInteraction.reply({
      content: '❌ No orders available to create an invoice from.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Chunk orders by location
  const chunks = chunkOrdersByLocation(orders)

  if (chunks.length === 0) {
    await buttonInteraction.reply({
      content: '❌ No orders available to create an invoice from.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Run the multi-step flow
  await runInvoiceFlow(buttonInteraction, chunks, buyerUserId, locationDisplayMode)
}

/**
 * Run the invoice creation flow with step-by-step interactions.
 */
async function runInvoiceFlow(
  buttonInteraction: ButtonInteraction,
  chunks: LocationChunk[],
  buyerUserId: number,
  locationDisplayMode: LocationDisplayMode
): Promise<void> {
  // Build location select embed
  const locationEmbed = new EmbedBuilder()
    .setTitle('🧾 Create Invoice - Step 1')
    .setDescription('Select a location to view orders from:')
    .setColor(0x5865f2)

  // Build location options
  const locationOptions = await buildLocationOptions(chunks, locationDisplayMode)

  const locationSelect = new StringSelectMenuBuilder()
    .setCustomId('invoice-builder:location')
    .setPlaceholder('Select a location...')
    .addOptions(locationOptions)

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(locationSelect)

  const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('invoice-builder:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  )

  // Send location select
  await buttonInteraction.reply({
    embeds: [locationEmbed],
    components: [selectRow, cancelRow],
    flags: MessageFlags.Ephemeral,
  })
  const response = await buttonInteraction.fetchReply()

  // Flow state
  let selectedChunk: LocationChunk | null = null
  let selectedOrders: OrderForInvoice[] = []

  // Main interaction loop
  while (true) {
    try {
      // Wait for next interaction
      const i = await response.awaitMessageComponent({
        time: COMPONENT_TIMEOUT,
        filter: interaction => interaction.user.id === buttonInteraction.user.id,
      })

      // Handle cancel button
      if (i.isButton() && i.customId === 'invoice-builder:cancel') {
        await i.update({
          content: '❌ Invoice creation cancelled.',
          embeds: [],
          components: [],
        })
        return
      }

      // Handle back button (from step 2)
      if (i.isButton() && i.customId === 'invoice-builder:back') {
        selectedChunk = null
        selectedOrders = []

        // Go back to location select
        const freshLocationOptions = await buildLocationOptions(chunks, locationDisplayMode)
        const freshLocationSelect = new StringSelectMenuBuilder()
          .setCustomId('invoice-builder:location')
          .setPlaceholder('Select a location...')
          .addOptions(freshLocationOptions)

        const freshSelectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          freshLocationSelect
        )

        await i.update({
          embeds: [locationEmbed],
          components: [freshSelectRow, cancelRow],
        })
        continue
      }

      // Handle location selection
      if (i.isStringSelectMenu() && i.customId === 'invoice-builder:location') {
        const chunkIndex = parseInt(i.values[0], 10)
        selectedChunk = chunks[chunkIndex]

        if (!selectedChunk) {
          await i.update({
            content: '❌ Invalid selection. Please try again.',
            embeds: [],
            components: [],
          })
          return
        }

        // Build order select embed
        const locationDisplay = await formatLocation(
          selectedChunk.locationNaturalId,
          locationDisplayMode
        )
        const orderEmbed = new EmbedBuilder()
          .setTitle('🧾 Create Invoice - Step 2')
          .setDescription(
            `Select orders from **${locationDisplay}**:\n` +
              `*You can select up to ${Math.min(selectedChunk.orders.length, 25)} orders*`
          )
          .setColor(0x5865f2)

        // Build order options
        const orderOptions = buildOrderOptions(selectedChunk.orders)

        const orderSelect = new StringSelectMenuBuilder()
          .setCustomId('invoice-builder:orders')
          .setPlaceholder('Select orders to include...')
          .setMinValues(1)
          .setMaxValues(Math.min(orderOptions.length, 25))
          .addOptions(orderOptions)

        const orderSelectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          orderSelect
        )

        const backCancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('invoice-builder:back')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('invoice-builder:cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        )

        await i.update({
          embeds: [orderEmbed],
          components: [orderSelectRow, backCancelRow],
        })
        continue
      }

      // Handle order selection
      if (i.isStringSelectMenu() && i.customId === 'invoice-builder:orders') {
        if (!selectedChunk) {
          await i.update({
            content: '❌ No location selected. Please start over.',
            embeds: [],
            components: [],
          })
          return
        }

        const selectedOrderIds = new Set(i.values.map(v => parseInt(v, 10)))
        selectedOrders = selectedChunk.orders.filter(o => selectedOrderIds.has(o.id))

        if (selectedOrders.length === 0) {
          await i.update({
            content: '❌ No orders selected.',
            embeds: [],
            components: [],
          })
          return
        }

        // Show confirmation with selected orders
        const locationDisplay = await formatLocation(
          selectedChunk.locationNaturalId,
          locationDisplayMode
        )

        // Group by seller for display
        const bySeller = new Map<number, OrderForInvoice[]>()
        for (const order of selectedOrders) {
          const existing = bySeller.get(order.userId) || []
          existing.push(order)
          bySeller.set(order.userId, existing)
        }

        const confirmEmbed = new EmbedBuilder()
          .setTitle('🧾 Create Invoice - Confirm')
          .setColor(0x5865f2)

        let description = `**Location:** ${locationDisplay}\n\n`

        if (bySeller.size > 1) {
          description += `⚠️ *Orders from ${bySeller.size} sellers will create ${bySeller.size} separate invoices*\n\n`
        }

        confirmEmbed.setDescription(description)

        // Add field per seller
        for (const [_sellerId, sellerOrders] of bySeller) {
          const seller = sellerOrders[0].user
          const sellerName = seller.displayName || seller.username

          const orderLines = sellerOrders
            .map(o => {
              const qty = o.availableQuantity ?? '?'
              return `• ${qty}x ${formatCommodity(o.commodityTicker)} @ ${o.price} ${o.currency}`
            })
            .join('\n')

          confirmEmbed.addFields({
            name: `📤 From ${sellerName}`,
            value: orderLines,
            inline: false,
          })
        }

        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('invoice-builder:confirm')
            .setLabel(`Create ${bySeller.size > 1 ? `${bySeller.size} Invoices` : 'Invoice'}`)
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId('invoice-builder:back-to-orders')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('invoice-builder:cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        )

        await i.update({
          embeds: [confirmEmbed],
          components: [confirmRow],
        })
        continue
      }

      // Handle back to order selection
      if (i.isButton() && i.customId === 'invoice-builder:back-to-orders') {
        if (!selectedChunk) {
          // Go back to location select
          const freshLocationOptions = await buildLocationOptions(chunks, locationDisplayMode)
          const freshLocationSelect = new StringSelectMenuBuilder()
            .setCustomId('invoice-builder:location')
            .setPlaceholder('Select a location...')
            .addOptions(freshLocationOptions)

          const freshSelectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            freshLocationSelect
          )

          await i.update({
            embeds: [locationEmbed],
            components: [freshSelectRow, cancelRow],
          })
          continue
        }

        // Go back to order select
        const locationDisplay = await formatLocation(
          selectedChunk.locationNaturalId,
          locationDisplayMode
        )
        const orderEmbed = new EmbedBuilder()
          .setTitle('🧾 Create Invoice - Step 2')
          .setDescription(
            `Select orders from **${locationDisplay}**:\n` +
              `*You can select up to ${Math.min(selectedChunk.orders.length, 25)} orders*`
          )
          .setColor(0x5865f2)

        const orderOptions = buildOrderOptions(selectedChunk.orders)

        const orderSelect = new StringSelectMenuBuilder()
          .setCustomId('invoice-builder:orders')
          .setPlaceholder('Select orders to include...')
          .setMinValues(1)
          .setMaxValues(Math.min(orderOptions.length, 25))
          .addOptions(orderOptions)

        const orderSelectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          orderSelect
        )

        const backCancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('invoice-builder:back')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('invoice-builder:cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        )

        await i.update({
          embeds: [orderEmbed],
          components: [orderSelectRow, backCancelRow],
        })
        continue
      }

      // Handle confirm
      if (i.isButton() && i.customId === 'invoice-builder:confirm') {
        if (selectedOrders.length === 0) {
          await i.update({
            content: '❌ No orders selected. Please start over.',
            embeds: [],
            components: [],
          })
          return
        }

        await i.deferUpdate()

        // Group orders by seller
        const bySeller = new Map<number, OrderForInvoice[]>()
        for (const order of selectedOrders) {
          const existing = bySeller.get(order.userId) || []
          existing.push(order)
          bySeller.set(order.userId, existing)
        }

        // Create invoices for each seller
        const createdInvoices: { invoiceId: number; sellerName: string; itemCount: number }[] = []
        const errors: string[] = []

        for (const [sellerId, sellerOrders] of bySeller) {
          try {
            // Get or create invoice with this seller
            const { id: invoiceId } = await getOrCreateInvoice(buyerUserId, sellerId)

            // Add line items
            const lineItems: InvoiceLineItemInput[] = sellerOrders.map(order => ({
              sellOrderId: order.id,
              commodityTicker: order.commodityTicker,
              locationId: order.location.naturalId,
              quantity: order.availableQuantity ?? 0, // Default to 0 if unknown
              unitPrice: order.price,
              currency: order.currency,
              priceListCode: order.priceListCode,
            }))

            await addLineItems(invoiceId, lineItems)

            const sellerName = sellerOrders[0].user.displayName || sellerOrders[0].user.username
            createdInvoices.push({
              invoiceId,
              sellerName,
              itemCount: lineItems.length,
            })

            logger.info(
              {
                userId: buyerUserId,
                sellerId,
                invoiceId,
                itemCount: lineItems.length,
              },
              'Added items to invoice from query'
            )
          } catch (error) {
            const sellerName = sellerOrders[0].user.displayName || sellerOrders[0].user.username
            errors.push(`Failed to add items for ${sellerName}`)
            logger.error({ error, sellerId }, 'Failed to create invoice from query')
          }
        }

        // Build result message
        let resultContent: string

        if (createdInvoices.length > 0) {
          if (createdInvoices.length === 1) {
            const inv = createdInvoices[0]
            resultContent =
              `✅ Added ${inv.itemCount} item${inv.itemCount !== 1 ? 's' : ''} to invoice with **${inv.sellerName}** (Invoice #${inv.invoiceId})\n\n` +
              `Use \`/close ${inv.sellerName}\` to review and submit the invoice.`
          } else {
            resultContent = `✅ Created/updated ${createdInvoices.length} invoices:\n\n`
            for (const inv of createdInvoices) {
              resultContent += `• **${inv.sellerName}**: ${inv.itemCount} item${inv.itemCount !== 1 ? 's' : ''} (Invoice #${inv.invoiceId})\n`
            }
            resultContent += `\nUse \`/invoices\` to view your draft invoices.`
          }
        } else {
          resultContent = '❌ Failed to create invoices. Please try again.'
        }

        if (errors.length > 0) {
          resultContent += `\n\n⚠️ Errors:\n${errors.join('\n')}`
        }

        await i.editReply({
          content: resultContent,
          embeds: [],
          components: [],
        })

        return
      }
    } catch (error) {
      // Check if it's a timeout
      if (error instanceof Error && error.message.includes('time')) {
        try {
          await buttonInteraction.editReply({
            content: '⏱️ Invoice creation timed out. Please try again.',
            embeds: [],
            components: [],
          })
        } catch {
          // Interaction may have been deleted
        }
        return
      }

      logger.error({ error }, 'Error in invoice builder flow')
      try {
        await buttonInteraction.editReply({
          content: '❌ An error occurred. Please try again.',
          embeds: [],
          components: [],
        })
      } catch {
        // Ignore reply errors
      }
      return
    }
  }
}
