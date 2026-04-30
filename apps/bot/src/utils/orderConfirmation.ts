/**
 * Order Confirmation Utilities
 *
 * Provides confirmation dialogs and educational tips for buy/sell commands.
 */

import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js'
import { formatCommodity, formatLocation } from '../services/display.js'

/**
 * Order confirmation data
 */
export interface OrderConfirmationData {
  direction: 'buy' | 'sell'
  locationId: string
  locationName: string
  items: Array<{
    ticker: string
    commodityName: string
    quantity: number
    price: string
    currency: string
    priceSource: string // e.g., "auto-priced from KAWA-BUY" or "fixed price"
  }>
  orderType: 'market' | 'limit'
  existingOrders?: Array<{
    ticker: string
    quantity: number
    price: string
    currency: string
  }>
  limitMode?: 'reserve' | 'max_sell' | 'none'
}

/**
 * Invoice confirmation data
 */
export interface InvoiceConfirmationData {
  direction: 'buy' | 'sell'
  counterpartyName: string
  invoiceId: number
  isNewInvoice: boolean
  locationId: string
  locationName: string
  addedItems: Array<{
    ticker: string
    commodityName: string
    quantity: number
    price: string
    currency: string
  }>
  notFoundItems?: string[]
  currentInvoiceTotal: Map<string, number> // currency -> total
  willSubmit: boolean
}

/**
 * Build order confirmation embed
 */
export async function buildOrderConfirmationEmbed(
  data: OrderConfirmationData,
  locationDisplayMode: 'names-only' | 'natural-ids-only' | 'both'
): Promise<EmbedBuilder> {
  const { direction, locationId, items, orderType, existingOrders } = data

  const locationDisplay = await formatLocation(locationId, locationDisplayMode)
  const title = direction === 'buy' ? '📦 Confirm Buy Order' : '📤 Confirm Sell Order'
  const color = direction === 'buy' ? 0x5865f2 : 0xfee75c

  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp()

  // Location
  embed.addFields({ name: 'Location', value: locationDisplay, inline: false })

  // Items
  if (items.length === 1) {
    const item = items[0]
    embed.addFields(
      {
        name: 'Commodity',
        value: `${item.commodityName} (${formatCommodity(item.ticker)})`,
        inline: true,
      },
      { name: 'Quantity', value: item.quantity.toLocaleString(), inline: true },
      {
        name: 'Price',
        value: `${item.price} ${item.currency}${item.priceSource ? ` (${item.priceSource})` : ''}`,
        inline: true,
      }
    )
  } else {
    // Multiple items
    const itemList = items
      .map(
        item =>
          `• ${item.quantity.toLocaleString()} ${formatCommodity(item.ticker)} @ ${item.price} ${item.currency}${item.priceSource ? ` (${item.priceSource})` : ''}`
      )
      .join('\n')
    embed.addFields({ name: 'Items', value: itemList, inline: false })
  }

  // Order Type
  embed.addFields({
    name: 'Order Type',
    value: orderType === 'market' ? 'Market' : 'Limit',
    inline: true,
  })

  // Existing orders warning
  if (existingOrders && existingOrders.length > 0) {
    const existingList = existingOrders
      .map(
        order =>
          `  ${formatCommodity(order.ticker)}: ${order.quantity.toLocaleString()} @ ${order.price} ${order.currency}`
      )
      .join('\n')

    embed.addFields({
      name: '⚠️ Updates Existing Orders',
      value: `Current:\n${existingList}\n\nNew orders will replace these.`,
      inline: false,
    })
  }

  return embed
}

/**
 * Build invoice confirmation embed
 */
export async function buildInvoiceConfirmationEmbed(
  data: InvoiceConfirmationData,
  locationDisplayMode: 'names-only' | 'natural-ids-only' | 'both'
): Promise<EmbedBuilder> {
  const {
    direction,
    counterpartyName,
    invoiceId,
    isNewInvoice,
    locationId,
    addedItems,
    notFoundItems,
    currentInvoiceTotal,
    willSubmit,
  } = data

  const locationDisplay = await formatLocation(locationId, locationDisplayMode)
  const title = isNewInvoice ? '📋 New Invoice' : '📋 Add to Invoice'
  const color = 0x57f287

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp()
    .addFields({ name: 'Invoice', value: `#${invoiceId} with ${counterpartyName}`, inline: false })
    .addFields({ name: 'Location', value: locationDisplay, inline: false })

  // Added items
  if (addedItems.length > 0) {
    const itemsByCurrency = new Map<string, { items: typeof addedItems; total: number }>()

    for (const item of addedItems) {
      if (!itemsByCurrency.has(item.currency)) {
        itemsByCurrency.set(item.currency, { items: [], total: 0 })
      }
      const entry = itemsByCurrency.get(item.currency)!
      entry.items.push(item)
      entry.total += parseFloat(item.price) * item.quantity
    }

    for (const [currency, { items, total }] of itemsByCurrency) {
      const itemList = items
        .map(
          item =>
            `• ${item.quantity.toLocaleString()} ${item.commodityName} (${formatCommodity(item.ticker)}) @ ${item.price} ${currency} = ${(parseFloat(item.price) * item.quantity).toFixed(2)} ${currency}`
        )
        .join('\n')

      embed.addFields({
        name: `Adding (${currency})`,
        value: `${itemList}\n**Subtotal: ${total.toFixed(2)} ${currency}**`,
        inline: false,
      })
    }
  }

  // Not found items
  if (notFoundItems && notFoundItems.length > 0) {
    embed.addFields({
      name: '⚠️ Items Not Found',
      value: `${counterpartyName} has no ${direction === 'buy' ? 'sell' : 'buy'} orders for:\n${notFoundItems.map(t => `• ${formatCommodity(t)}`).join('\n')}`,
      inline: false,
    })
  }

  // Current invoice total
  if (currentInvoiceTotal.size > 0) {
    const totals = Array.from(currentInvoiceTotal.entries())
      .map(([currency, total]) => `${total.toFixed(2)} ${currency}`)
      .join(', ')

    const itemCount = addedItems.length
    embed.addFields({
      name: 'Current Invoice Total',
      value: `${totals} (${itemCount} item${itemCount === 1 ? '' : 's'})`,
      inline: false,
    })
  }

  // Submit warning
  if (willSubmit) {
    embed.addFields({
      name: '📤 Will Submit',
      value: 'This invoice will be submitted immediately (creates reservations).',
      inline: false,
    })
  }

  return embed
}

/**
 * Options for order confirmation buttons
 */
export interface OrderConfirmationButtonOptions {
  /** Show the Edit button (default: false for backward compatibility) */
  showEdit?: boolean
}

/**
 * Build confirmation buttons
 */
export function buildOrderConfirmationButtons(
  customIdPrefix: string,
  options?: OrderConfirmationButtonOptions
): ActionRowBuilder<ButtonBuilder> {
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:confirm`)
      .setLabel('✅ Confirm')
      .setStyle(ButtonStyle.Success),
  ]

  if (options?.showEdit) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:edit`)
        .setLabel('✏️ Edit')
        .setStyle(ButtonStyle.Primary)
    )
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:cancel`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary)
  )

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)
}

/**
 * Options for invoice confirmation buttons
 */
export interface InvoiceConfirmationButtonOptions {
  /** Allow the submit button */
  allowSubmit: boolean
  /** Show the Edit button (default: false for backward compatibility) */
  showEdit?: boolean
}

/**
 * Build invoice confirmation buttons
 */
export function buildInvoiceConfirmationButtons(
  customIdPrefix: string,
  options: InvoiceConfirmationButtonOptions | boolean
): ActionRowBuilder<ButtonBuilder> {
  // Support legacy signature: buildInvoiceConfirmationButtons(prefix, allowSubmit)
  const opts: InvoiceConfirmationButtonOptions =
    typeof options === 'boolean' ? { allowSubmit: options } : options

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:confirm`)
      .setLabel('✅ Add Items')
      .setStyle(ButtonStyle.Success),
  ]

  if (opts.showEdit) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:edit`)
        .setLabel('✏️ Edit')
        .setStyle(ButtonStyle.Primary)
    )
  }

  if (opts.allowSubmit) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${customIdPrefix}:submit`)
        .setLabel('📤 Add & Send')
        .setStyle(ButtonStyle.Primary)
    )
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:cancel`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary)
  )

  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)
}

/**
 * Build educational tips for order creation
 */
export function buildOrderCreatedTips(
  direction: 'buy' | 'sell',
  commodities: string[],
  locationId: string,
  prefix: string,
  wasUpdate: boolean
): string {
  const action = wasUpdate ? 'updated' : 'created'
  const actionEmoji = wasUpdate ? '🔄' : '✅'

  const tips = [
    `${actionEmoji} ${direction === 'buy' ? 'Buy' : 'Sell'} order ${action}!`,
    '',
    '📚 Managing Orders:',
    `  • \`${prefix}orders\` - View all your orders`,
  ]

  if (commodities.length === 1) {
    tips.push(`  • \`${prefix}delete ${commodities[0]} ${locationId}\` - Remove this order`)
  } else {
    tips.push(
      `  • \`${prefix}delete ${commodities.join(',')} ${locationId}\` - Remove these orders`
    )
  }

  if (direction === 'buy') {
    tips.push(`  • \`${prefix}buy ${commodities[0]} 2000 ${locationId}\` - Update quantity`)
    tips.push(`  • \`${prefix}buy ${commodities[0]} ${locationId} 130.00\` - Update price`)
  } else {
    tips.push(`  • \`${prefix}sell ${commodities[0]} ${locationId} reserve:500\` - Update limit`)
    tips.push(`  • \`${prefix}sell ${commodities[0]} ${locationId} 95.00\` - Update price`)
  }

  return tips.join('\n')
}

/**
 * Build educational tips for invoice operations
 */
export function buildInvoiceTips(
  counterpartyName: string,
  invoiceId: number,
  prefix: string,
  wasSubmitted: boolean
): string {
  if (wasSubmitted) {
    return [
      '✅ Invoice submitted and reservations created!',
      '',
      '📚 Next Steps:',
      `  • \`${prefix}reservations\` - View all your reservations`,
      `  • \`${prefix}invoices\` - View invoice history`,
      `  • Complete the trade in-game using FIO contracts`,
    ].join('\n')
  }

  return [
    '✅ Items added to draft invoice!',
    '',
    '📚 Managing Invoices:',
    `  • \`${prefix}invoices\` - View all draft invoices`,
    `  • \`${prefix}close ${counterpartyName}\` - Submit invoice #${invoiceId}`,
    `  • \`${prefix}buy COF 500 Katoa ${counterpartyName}\` - Add more items`,
    `  • Items are matched against ${counterpartyName}'s orders`,
    '',
    '💡 Tip: Submit invoice when ready to create reservations',
  ].join('\n')
}

/**
 * Data for incomplete input embed
 */
export interface IncompleteInputData {
  /** Direction of the order/invoice */
  direction: 'buy' | 'sell'
  /** Missing required fields */
  missingFields: string[]
  /** Values that were successfully parsed */
  parsedValues: {
    commodities?: string[]
    location?: string
    quantity?: number
    user?: string
  }
  /** Tokens that couldn't be resolved */
  unresolved?: string[]
  /** Example commands to show */
  examples: string[]
  /** Whether this is for invoice mode */
  isInvoiceMode?: boolean
}

/**
 * Build an embed showing what was parsed and what's missing
 */
export function buildIncompleteInputEmbed(data: IncompleteInputData): EmbedBuilder {
  const { direction, missingFields, parsedValues, unresolved, examples, isInvoiceMode } = data

  const title = isInvoiceMode
    ? `📋 Incomplete Invoice Input`
    : `${direction === 'buy' ? '📦' : '📤'} Incomplete ${direction === 'buy' ? 'Buy' : 'Sell'} Order`

  const color = 0xffa500 // Orange for warning

  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp()

  // Show what was parsed
  const parsedList: string[] = []
  if (parsedValues.commodities && parsedValues.commodities.length > 0) {
    parsedList.push(
      `✅ Commodities: ${parsedValues.commodities.map(c => formatCommodity(c)).join(', ')}`
    )
  }
  if (parsedValues.location) {
    parsedList.push(`✅ Location: ${parsedValues.location}`)
  }
  if (parsedValues.quantity !== undefined) {
    parsedList.push(`✅ Quantity: ${parsedValues.quantity.toLocaleString()}`)
  }
  if (parsedValues.user) {
    parsedList.push(`✅ User: ${parsedValues.user}`)
  }

  if (parsedList.length > 0) {
    embed.addFields({
      name: 'Parsed',
      value: parsedList.join('\n'),
      inline: false,
    })
  }

  // Show unresolved tokens (tokens we couldn't match to anything)
  if (unresolved && unresolved.length > 0) {
    embed.addFields({
      name: '❓ Unrecognized',
      value: unresolved.map(t => `• \`${t}\``).join('\n'),
      inline: false,
    })
  }

  // Show what's missing
  embed.addFields({
    name: '❌ Missing',
    value: missingFields.map(f => `• ${f}`).join('\n'),
    inline: false,
  })

  // Show examples
  embed.addFields({
    name: '💡 Examples',
    value: examples.map(e => `\`${e}\``).join('\n'),
    inline: false,
  })

  embed.setFooter({
    text: 'Use the dialog button below to enter values, or try a corrected command',
  })

  return embed
}

/**
 * Build buttons for incomplete input (Use Dialog + Cancel)
 */
export function buildUseDialogButtons(customIdPrefix: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:dialog`)
      .setLabel('📝 Use Dialog')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}:cancel`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary)
  )
}
