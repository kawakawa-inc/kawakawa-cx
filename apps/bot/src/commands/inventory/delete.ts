/**
 * /delete command - Delete sell and/or buy orders
 *
 * Supports:
 * - Comma-separated tickers: /delete COF,CAF Katoa
 * - Filter by type: all, sell, buy
 * - Confirmation for multiple matches
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, sellOrders, buyOrders } from '@kawakawa/db'
import { eq, and, inArray } from 'drizzle-orm'
import { searchLocations } from '../../autocomplete/index.js'
import { formatCommodity, formatLocation, resolveLocation } from '../../services/display.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { parseTokens } from '@kawakawa/parser'
import { botResolvers } from '../../utils/resolvers.js'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

interface OrderToDelete {
  id: number
  type: 'sell' | 'buy'
  commodityTicker: string
  locationId: string
  price: string
  currency: string
  orderType: 'internal' | 'partner'
  quantity?: number
}

export const deleteCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete your sell and/or buy orders')
    .addStringOption(option =>
      option
        .setName('input')
        .setDescription('Ticker(s) and location (e.g., "COF,CAF Katoa")')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('location')
        .setDescription('Override location')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Order type to delete (default: all)')
        .setRequired(false)
        .addChoices(
          { name: 'All (sell & buy)', value: 'all' },
          { name: 'Sell orders only', value: 'sell' },
          { name: 'Buy orders only', value: 'buy' }
        )
    ) as SlashCommandBuilder,

  helpInfo: {
    category: 'orders',
    details:
      'Delete sell and/or buy orders by commodity and location. Supports comma-separated tickers and type filtering (all/sell/buy).',
    examples: ['delete COF BEN', 'delete COF,RAT BEN'],
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true)

    if (focusedOption.name === 'location') {
      const query = focusedOption.value
      const discordId = interaction.user.id
      const locations = await searchLocations(query, 25, discordId)
      const choices = locations.map(l => ({
        name: `${l.naturalId} - ${l.name}`,
        value: l.naturalId,
      }))
      await interaction.respond(choices)
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Get command prefix (/ or ! or custom)
    const prefix = getCommandPrefix(interaction)

    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Get user settings
    const displaySettings = await getDisplaySettings(interaction.user.id)

    // Get options
    const input = interaction.options.getString('input', true)
    const locationOverride = interaction.options.getString('location')
    const typeFilter =
      (interaction.options.getString('type') as 'all' | 'sell' | 'buy' | null) || 'all'

    // Parse flexible input
    const parsed = await parseTokens(input, botResolvers)

    // Extract tickers from parsed items
    const tickers = parsed.items.map(item => item.commodity.ticker)

    // Validate we have at least one ticker
    if (tickers.length === 0) {
      const errorMsg =
        parsed.unresolved.length > 0
          ? `Could not find commodities: ${parsed.unresolved.map(t => `"${t}"`).join(', ')}`
          : 'Please specify at least one commodity ticker.'

      await interaction.reply({
        content: `❌ ${errorMsg}\n\nExample: \`${prefix}delete COF,CAF Katoa\``,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Determine location (override takes precedence)
    let locationId = locationOverride || parsed.location?.naturalId

    // If location override provided, validate it
    if (locationOverride) {
      const resolved = await resolveLocation(locationOverride)
      if (!resolved) {
        await interaction.reply({
          content: `❌ Location "${locationOverride}" not found.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
      locationId = resolved.naturalId
    }

    if (!locationId) {
      await interaction.reply({
        content:
          '❌ Please specify a location for safety.\n\n' +
          `Example: \`${prefix}delete COF Katoa\` or use the \`location\` option.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Query matching orders
    const ordersToDelete: OrderToDelete[] = []

    // Query sell orders if applicable
    if (typeFilter === 'all' || typeFilter === 'sell') {
      const matchingSellOrders = await db.query.sellOrders.findMany({
        where: and(
          eq(sellOrders.userId, userId),
          eq(sellOrders.locationId, locationId),
          inArray(sellOrders.commodityTicker, tickers)
        ),
      })

      for (const order of matchingSellOrders) {
        ordersToDelete.push({
          id: order.id,
          type: 'sell',
          commodityTicker: order.commodityTicker,
          locationId: order.locationId,
          price: order.price,
          currency: order.currency,
          orderType: order.orderType,
        })
      }
    }

    // Query buy orders if applicable
    if (typeFilter === 'all' || typeFilter === 'buy') {
      const matchingBuyOrders = await db.query.buyOrders.findMany({
        where: and(
          eq(buyOrders.userId, userId),
          eq(buyOrders.locationId, locationId),
          inArray(buyOrders.commodityTicker, tickers)
        ),
      })

      for (const order of matchingBuyOrders) {
        ordersToDelete.push({
          id: order.id,
          type: 'buy',
          commodityTicker: order.commodityTicker,
          locationId: order.locationId,
          price: order.price,
          currency: order.currency,
          orderType: order.orderType,
          quantity: order.quantity,
        })
      }
    }

    // No matches found
    if (ordersToDelete.length === 0) {
      const locationDisplay = await formatLocation(locationId, displaySettings.locationDisplayMode)
      const tickerDisplay = tickers.map(t => formatCommodity(t)).join(', ')

      await interaction.reply({
        content:
          `📭 No matching orders found.\n\n` +
          `Searched for: ${tickerDisplay} @ ${locationDisplay}\n` +
          `Type filter: ${typeFilter}`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Show confirmation before deleting
    if (ordersToDelete.length <= 5) {
      await showDeleteConfirmation(interaction, ordersToDelete, displaySettings.locationDisplayMode)
      return
    }

    // Many matches - show selection menu
    await showDeleteSelectionMenu(
      interaction,
      ordersToDelete,
      displaySettings.locationDisplayMode,
      userId
    )
  },
}

/**
 * Show a confirmation prompt before deleting orders.
 */
async function showDeleteConfirmation(
  interaction: ChatInputCommandInteraction,
  orders: OrderToDelete[],
  locationDisplayMode: string
): Promise<void> {
  const locationDisplay = await formatLocation(
    orders[0].locationId,
    locationDisplayMode as 'natural-ids-only' | 'names-only' | 'both'
  )

  const orderList = orders
    .map(order => {
      const commodityDisplay = formatCommodity(order.commodityTicker)
      const priceDisplay =
        parseFloat(order.price) > 0 ? `${order.price} ${order.currency}` : `-- ${order.currency}`
      return order.type === 'sell'
        ? `• SELL ${commodityDisplay} - ${priceDisplay} (${order.orderType})`
        : `• BUY ${commodityDisplay} - ${order.quantity}x @ ${priceDisplay} (${order.orderType})`
    })
    .join('\n')

  const idPrefix = `delete-confirm:${Date.now()}`
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${idPrefix}:yes`)
      .setLabel(`Delete ${orders.length} order(s)`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${idPrefix}:no`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  )

  const response = await interaction.reply({
    content: `**Delete ${orders.length} order(s) at ${locationDisplay}?**\n\n${orderList}`,
    components: [buttonRow],
    flags: MessageFlags.Ephemeral,
  })

  try {
    const btnInteraction = await response.awaitMessageComponent({
      filter: i => i.customId.startsWith(idPrefix) && i.user.id === interaction.user.id,
      time: 30000,
    })

    const action = btnInteraction.customId.split(':')[2]

    if (action === 'yes') {
      await executeDeletes(orders)
      await btnInteraction.update({
        content: `✅ Deleted ${orders.length} order(s):\n\n${orderList}`,
        components: [],
      })
    } else {
      await btnInteraction.update({
        content: '❌ Delete cancelled.',
        components: [],
      })
    }
  } catch {
    // Timed out
    try {
      await interaction.editReply({
        content: '⏰ Delete confirmation timed out.',
        components: [],
      })
    } catch {
      // Message may have been deleted
    }
  }
}

/**
 * Execute the actual order deletions.
 */
async function executeDeletes(orders: OrderToDelete[]): Promise<void> {
  for (const order of orders) {
    if (order.type === 'sell') {
      await db.delete(sellOrders).where(eq(sellOrders.id, order.id))
    } else {
      await db.delete(buyOrders).where(eq(buyOrders.id, order.id))
    }
    logger.info(
      {
        orderId: order.id,
        type: order.type,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
      },
      'Order deleted'
    )
  }
}

/**
 * Show selection menu for multiple matching orders
 */
async function showDeleteSelectionMenu(
  interaction: ChatInputCommandInteraction,
  orders: OrderToDelete[],
  locationDisplayMode: string,
  _userId: number
): Promise<void> {
  const locationDisplay = await formatLocation(
    orders[0].locationId,
    locationDisplayMode as 'natural-ids-only' | 'names-only' | 'both'
  )

  // Build select menu options (max 25)
  const options = orders.slice(0, 25).map(order => {
    const priceDisplay =
      parseFloat(order.price) > 0 ? `${order.price} ${order.currency}` : `-- ${order.currency}`
    const label =
      order.type === 'sell'
        ? `SELL ${order.commodityTicker} - ${priceDisplay}`
        : `BUY ${order.commodityTicker} - ${order.quantity}x @ ${priceDisplay}`

    return {
      label: label.slice(0, 100),
      description: `${order.orderType} order`,
      value: `${order.type}:${order.id}`,
    }
  })

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`delete-select:${Date.now()}`)
    .setPlaceholder('Select orders to delete')
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options)

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`delete-all:${Date.now()}`)
      .setLabel(`Delete All (${orders.length})`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`delete-cancel:${Date.now()}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  )

  const response = await interaction.reply({
    content:
      `**Select orders to delete at ${locationDisplay}:**\n\n` +
      (orders.length > 25 ? `*Showing first 25 of ${orders.length} orders*\n\n` : '') +
      'Use the dropdown to select specific orders, or click "Delete All" to remove all matches.',
    components: [selectRow, buttonRow],
    flags: MessageFlags.Ephemeral,
  })

  // Wait for user interaction
  try {
    const collector = response.createMessageComponentCollector({
      time: 60000, // 1 minute timeout
    })

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: 'This menu is not for you.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }

      if (i.customId.startsWith('delete-cancel')) {
        await i.update({
          content: '❌ Delete cancelled.',
          components: [],
        })
        collector.stop()
        return
      }

      if (i.customId.startsWith('delete-all')) {
        // Delete all orders
        const deleted: string[] = []
        const errors: string[] = []

        for (const order of orders) {
          try {
            if (order.type === 'sell') {
              await db.delete(sellOrders).where(eq(sellOrders.id, order.id))
            } else {
              await db.delete(buyOrders).where(eq(buyOrders.id, order.id))
            }

            deleted.push(`${order.type.toUpperCase()} ${formatCommodity(order.commodityTicker)}`)

            logger.info(
              {
                orderId: order.id,
                type: order.type,
                commodityTicker: order.commodityTicker,
                locationId: order.locationId,
              },
              'Order deleted via menu'
            )
          } catch (error) {
            logger.error({ error, orderId: order.id }, 'Failed to delete order via menu')
            errors.push(`${order.type.toUpperCase()} ${order.commodityTicker}`)
          }
        }

        let responseText = `✅ Deleted ${deleted.length} order(s).`
        if (errors.length > 0) {
          responseText += `\n\n⚠️ Failed: ${errors.join(', ')}`
        }

        await i.update({
          content: responseText,
          components: [],
        })
        collector.stop()
        return
      }

      if (i.isStringSelectMenu() && i.customId.startsWith('delete-select')) {
        // Delete selected orders
        const selectedValues = i.values
        const selectedOrders = orders.filter(o => selectedValues.includes(`${o.type}:${o.id}`))

        const deleted: string[] = []
        const errors: string[] = []

        for (const order of selectedOrders) {
          try {
            if (order.type === 'sell') {
              await db.delete(sellOrders).where(eq(sellOrders.id, order.id))
            } else {
              await db.delete(buyOrders).where(eq(buyOrders.id, order.id))
            }

            deleted.push(`${order.type.toUpperCase()} ${formatCommodity(order.commodityTicker)}`)

            logger.info(
              {
                orderId: order.id,
                type: order.type,
                commodityTicker: order.commodityTicker,
                locationId: order.locationId,
              },
              'Order deleted via selection'
            )
          } catch (error) {
            logger.error({ error, orderId: order.id }, 'Failed to delete order via selection')
            errors.push(`${order.type.toUpperCase()} ${order.commodityTicker}`)
          }
        }

        let responseText = `✅ Deleted ${deleted.length} order(s):\n• ${deleted.join('\n• ')}`
        if (errors.length > 0) {
          responseText += `\n\n⚠️ Failed: ${errors.join(', ')}`
        }

        await i.update({
          content: responseText,
          components: [],
        })
        collector.stop()
      }
    })

    collector.on('end', async (_, reason) => {
      if (reason === 'time') {
        try {
          await interaction.editReply({
            content: '⏰ Delete selection timed out.',
            components: [],
          })
        } catch {
          // Message may have been deleted
        }
      }
    })
  } catch (error) {
    logger.error({ error }, 'Error in delete selection collector')
  }
}
