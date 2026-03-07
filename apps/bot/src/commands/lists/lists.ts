/**
 * /lists command - View and manage shopping lists
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, shoppingLists, sellOrders } from '@kawakawa/db'
import { eq, desc, inArray } from 'drizzle-orm'
import { requireLinkedUser } from '../../utils/auth.js'
import { resolveCommodity, formatCommodity } from '../../services/display.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import { createSingleInputModal } from '../../utils/modals.js'
import { enrichSellOrdersWithQuantities } from '@kawakawa/services/market'
import { formatGroupedOrdersMulti, buildFilterDescription } from '../../services/orderFormatter.js'
import { startInvoiceCreationFlow, type OrderForInvoice } from '../../services/invoiceBuilder.js'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

const LISTS_PER_PAGE = 5
const COMPONENT_TIMEOUT = 5 * 60 * 1000 // 5 minutes

interface ShoppingListData {
  id: number
  name: string
  materials: Record<string, number>
  createdAt: Date
  updatedAt: Date
}

/**
 * Format a list summary for display.
 */
function formatListSummary(list: ShoppingListData): { name: string; value: string } {
  const materials = list.materials
  const itemCount = Object.keys(materials).length
  const totalQty = Object.values(materials).reduce((sum, qty) => sum + qty, 0)

  // Show first few items
  const preview = Object.entries(materials)
    .slice(0, 3)
    .map(([ticker, qty]) => `${formatCommodity(ticker)} ×${qty.toLocaleString()}`)
    .join(', ')

  const moreItems = itemCount > 3 ? ` +${itemCount - 3} more` : ''

  return {
    name: `📋 ${list.name}`,
    value: `${preview}${moreItems}\n📊 ${itemCount} items • ${totalQty.toLocaleString()} units\n*Updated ${list.updatedAt.toLocaleDateString()}*`,
  }
}

/**
 * Build the list detail embed.
 */
function buildListDetailEmbed(list: ShoppingListData): EmbedBuilder {
  const materials = list.materials
  const itemCount = Object.keys(materials).length
  const totalQty = Object.values(materials).reduce((sum, qty) => sum + qty, 0)

  const embed = new EmbedBuilder()
    .setTitle(`📋 ${list.name}`)
    .setColor(0x5865f2)
    .setTimestamp(list.updatedAt)

  // Build materials list
  const materialsText = Object.entries(materials)
    .map(([ticker, qty]) => `• **${formatCommodity(ticker)}**: ${qty.toLocaleString()}`)
    .join('\n')

  embed.setDescription(materialsText)
  embed.setFooter({ text: `${itemCount} items • ${totalQty.toLocaleString()} total units` })

  return embed
}

export const lists: Command = {
  data: new SlashCommandBuilder()
    .setName('lists')
    .setDescription('View and manage your shopping lists') as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prefix = getCommandPrefix(interaction)

    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Get all lists for user
    const userLists = await db
      .select()
      .from(shoppingLists)
      .where(eq(shoppingLists.userId, userId))
      .orderBy(desc(shoppingLists.updatedAt))

    if (userLists.length === 0) {
      await interaction.reply({
        content:
          '📭 No shopping lists found.\n\n' +
          'Create a list using:\n' +
          `• \`${prefix}list\` - Create from commodities with quantities\n` +
          `• \`${prefix}query\` - Search orders and use "Save as List" button`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Build initial embed
    const embed = new EmbedBuilder()
      .setTitle('📋 Your Shopping Lists')
      .setColor(0x5865f2)
      .setDescription(`You have ${userLists.length} list${userLists.length !== 1 ? 's' : ''}`)
      .setTimestamp()

    // Add list summaries
    for (const list of userLists.slice(0, LISTS_PER_PAGE)) {
      const { name, value } = formatListSummary(list as ShoppingListData)
      embed.addFields({ name, value, inline: false })
    }

    if (userLists.length > LISTS_PER_PAGE) {
      embed.setFooter({
        text: `Showing ${LISTS_PER_PAGE} of ${userLists.length} lists`,
      })
    }

    // Build select menu for list selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('lists:select')
      .setPlaceholder('Select a list to view or manage')
      .addOptions(
        userLists.slice(0, 25).map(list => {
          const materials = list.materials as Record<string, number>
          const itemCount = Object.keys(materials).length
          return {
            label: list.name,
            value: String(list.id),
            description: `${itemCount} items`,
          }
        })
      )

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)

    // Send response
    const response = await interaction.reply({
      embeds: [embed],
      components: [selectRow],
      flags: MessageFlags.Ephemeral,
    })

    // Create collector for interactions
    const collector = response.createMessageComponentCollector({
      time: COMPONENT_TIMEOUT,
      filter: i => i.user.id === interaction.user.id,
    })

    let selectedListId: number | null = null

    collector.on('collect', async i => {
      try {
        if (i.isStringSelectMenu() && i.customId === 'lists:select') {
          selectedListId = parseInt(i.values[0], 10)

          // Fetch the selected list
          const [selectedList] = await db
            .select()
            .from(shoppingLists)
            .where(eq(shoppingLists.id, selectedListId))

          if (!selectedList) {
            await i.reply({
              content: '❌ List not found. It may have been deleted.',
              flags: MessageFlags.Ephemeral,
            })
            return
          }

          // Show list detail with action buttons
          const detailEmbed = buildListDetailEmbed(selectedList as ShoppingListData)

          const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('lists:query')
              .setLabel('Query Market')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🔍'),
            new ButtonBuilder()
              .setCustomId('lists:share')
              .setLabel('Share')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('📢'),
            new ButtonBuilder()
              .setCustomId('lists:rename')
              .setLabel('Rename')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('✏️'),
            new ButtonBuilder()
              .setCustomId('lists:delete')
              .setLabel('Delete')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🗑️'),
            new ButtonBuilder()
              .setCustomId('lists:back')
              .setLabel('Back to Lists')
              .setStyle(ButtonStyle.Secondary)
          )

          await i.update({
            embeds: [detailEmbed],
            components: [buttonRow],
          })
        } else if (i.isButton()) {
          switch (i.customId) {
            case 'lists:query': {
              if (!selectedListId) return

              // Fetch list for query
              const [listForQuery] = await db
                .select()
                .from(shoppingLists)
                .where(eq(shoppingLists.id, selectedListId))

              if (!listForQuery) {
                await i.reply({
                  content: '❌ List not found.',
                  flags: MessageFlags.Ephemeral,
                })
                return
              }

              const listMaterials = listForQuery.materials as Record<string, number>
              const tickers = Object.keys(listMaterials)

              // Resolve commodities
              const resolvedCommodities: { ticker: string; name: string }[] = []
              for (const ticker of tickers) {
                const commodity = await resolveCommodity(ticker)
                if (commodity) {
                  resolvedCommodities.push(commodity)
                }
              }

              if (resolvedCommodities.length === 0) {
                await i.reply({
                  content: '❌ No valid commodities found in this list.',
                  flags: MessageFlags.Ephemeral,
                })
                return
              }

              // Get user's display settings
              const displaySettings = await getDisplaySettings(i.user.id)

              // Query sell orders for these commodities (internal visibility)
              const sellOrdersData = await db.query.sellOrders.findMany({
                where: inArray(
                  sellOrders.commodityTicker,
                  resolvedCommodities.map(c => c.ticker)
                ),
                with: {
                  user: true,
                  commodity: true,
                  location: true,
                },
                orderBy: [desc(sellOrders.updatedAt)],
              })

              if (sellOrdersData.length === 0) {
                await i.reply({
                  content: `📭 No sell orders found for **${listForQuery.name}**.\n\n*Searched for: ${resolvedCommodities.map(c => formatCommodity(c.ticker)).join(', ')}*`,
                  flags: MessageFlags.Ephemeral,
                })
                return
              }

              // Enrich sell orders with inventory quantities
              const sellQuantities = await enrichSellOrdersWithQuantities(
                sellOrdersData.map(o => ({
                  id: o.id,
                  userId: o.userId,
                  commodityTicker: o.commodityTicker,
                  locationId: o.locationId,
                  limitMode: o.limitMode,
                  limitQuantity: o.limitQuantity,
                }))
              )

              // Build filter description
              const filterDesc = buildFilterDescription(
                resolvedCommodities.map(c => formatCommodity(c.ticker)),
                [],
                [],
                'sell',
                'internal',
                { visibilityEnforced: false }
              )

              // Format orders
              const { items: allItems, missingXitMaterials } = await formatGroupedOrdersMulti(
                sellOrdersData,
                [],
                sellQuantities,
                { commodities: resolvedCommodities, locations: [], userIds: [], displayNames: [] },
                displaySettings.locationDisplayMode,
                'sell',
                'internal',
                listMaterials
              )

              // Build description with XIT info
              let fullDescription = `🧊 **${listForQuery.name}**\n${filterDesc}`
              if (missingXitMaterials && missingXitMaterials.length > 0) {
                const missingFormatted = missingXitMaterials.map(t => formatCommodity(t))
                fullDescription += `\n\n⚠️ **Not found:** ${missingFormatted.join(', ')}`
              }

              // Build embed
              const queryEmbed = new EmbedBuilder()
                .setTitle('📦 Market Orders')
                .setColor(0x5865f2)
                .setDescription(fullDescription)
                .setTimestamp()

              // Reply with results
              // Note: We need to defer since the query takes time
              await i.deferReply({ flags: MessageFlags.Ephemeral })

              // Show results in a simple format (pagination requires ChatInputCommandInteraction)
              if (allItems.length === 0) {
                await i.editReply({
                  content: `📭 No matching orders found for **${listForQuery.name}**.`,
                })
                return
              }

              // Build a simple embed with results
              for (const item of allItems.slice(0, 10)) {
                queryEmbed.addFields({ name: item.name, value: item.value, inline: item.inline })
              }

              if (allItems.length > 10) {
                queryEmbed.setFooter({
                  text: `Showing 10 of ${allItems.length} results. Use /query for full pagination.`,
                })
              }

              // Prepare orders for invoice builder with list quantities
              const ordersForInvoice: OrderForInvoice[] = sellOrdersData.map(order => ({
                id: order.id,
                userId: order.userId,
                commodityTicker: order.commodityTicker,
                locationId: order.locationId, // naturalId like "BEN"
                price: parseFloat(order.price),
                currency: order.currency,
                priceListCode: order.priceListCode,
                user: {
                  id: order.userId,
                  displayName: order.user.displayName,
                  username: order.user.username,
                },
                location: {
                  naturalId: order.location.naturalId,
                  name: order.location.name,
                },
                commodity: {
                  ticker: order.commodity.ticker,
                  name: order.commodity.name,
                },
                // Use requested quantity from list, fallback to available
                availableQuantity:
                  listMaterials[order.commodityTicker] ??
                  sellQuantities.get(order.id)?.availableQuantity,
              }))

              // Add "Create Invoice" button
              const invoiceButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`lists:create-invoice:${listForQuery.id}`)
                  .setLabel('Create Invoice')
                  .setStyle(ButtonStyle.Success)
                  .setEmoji('🧾')
              )

              const queryResponse = await i.editReply({
                embeds: [queryEmbed],
                components: [invoiceButtonRow],
              })

              // Set up collector for the invoice button
              const invoiceCollector = queryResponse.createMessageComponentCollector({
                time: COMPONENT_TIMEOUT,
                filter: bi =>
                  bi.customId.startsWith('lists:create-invoice:') && bi.user.id === i.user.id,
              })

              invoiceCollector.on('collect', async buttonInteraction => {
                if (!buttonInteraction.isButton()) return
                // Start the invoice creation flow
                await startInvoiceCreationFlow(
                  buttonInteraction,
                  ordersForInvoice,
                  userId,
                  displaySettings.locationDisplayMode
                )
              })

              invoiceCollector.on('end', async () => {
                try {
                  // Disable the button after timeout
                  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId('lists:invoice-expired')
                      .setLabel('Session expired')
                      .setStyle(ButtonStyle.Secondary)
                      .setDisabled(true)
                  )
                  await i.editReply({ components: [disabledRow] })
                } catch {
                  // Ignore if already deleted
                }
              })

              break
            }

            case 'lists:share': {
              if (!selectedListId) return

              // Fetch list for sharing
              const [listToShare] = await db
                .select()
                .from(shoppingLists)
                .where(eq(shoppingLists.id, selectedListId))

              if (!listToShare) {
                await i.reply({
                  content: '❌ List not found.',
                  flags: MessageFlags.Ephemeral,
                })
                return
              }

              // Build shareable embed with "Shared by" footer
              const shareEmbed = buildListDetailEmbed(listToShare as ShoppingListData)

              // Get the member's server display name
              const member = interaction.member
              const sharedByName =
                member && 'displayName' in member
                  ? member.displayName
                  : interaction.user.displayName

              shareEmbed.setFooter({
                text: `Shared by ${sharedByName} • ${Object.keys(listToShare.materials as Record<string, number>).length} items`,
              })

              // Post publicly (non-ephemeral)
              await i.reply({
                embeds: [shareEmbed],
              })

              logger.info({ userId, listId: selectedListId }, 'Shopping list shared')
              break
            }

            case 'lists:rename': {
              if (!selectedListId) return

              // Show rename modal
              const modal = createSingleInputModal({
                modalId: `lists:rename-modal:${selectedListId}`,
                title: 'Rename List',
                inputId: 'new-name',
                label: 'New Name',
                placeholder: 'Enter new list name',
                required: true,
                maxLength: 100,
              })

              await i.showModal(modal)

              try {
                const modalInteraction = await i.awaitModalSubmit({
                  filter: mi =>
                    mi.customId.startsWith('lists:rename-modal:') && mi.user.id === i.user.id,
                  time: 60_000,
                })

                const newName = modalInteraction.fields.getTextInputValue('new-name').trim()

                if (!newName) {
                  await modalInteraction.reply({
                    content: '❌ Name cannot be empty.',
                    flags: MessageFlags.Ephemeral,
                  })
                  return
                }

                // Update the list name
                await db
                  .update(shoppingLists)
                  .set({ name: newName, updatedAt: new Date() })
                  .where(eq(shoppingLists.id, selectedListId!))

                await modalInteraction.reply({
                  content: `✅ List renamed to **${newName}**`,
                  flags: MessageFlags.Ephemeral,
                })

                logger.info({ userId, listId: selectedListId, newName }, 'Shopping list renamed')
              } catch {
                // Modal timed out
              }
              break
            }

            case 'lists:delete': {
              if (!selectedListId) return

              // Show confirmation
              const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('lists:confirm-delete')
                  .setLabel('Yes, Delete')
                  .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                  .setCustomId('lists:cancel-delete')
                  .setLabel('Cancel')
                  .setStyle(ButtonStyle.Secondary)
              )

              await i.update({
                content: '⚠️ Are you sure you want to delete this list?',
                embeds: [],
                components: [confirmRow],
              })
              break
            }

            case 'lists:confirm-delete': {
              if (!selectedListId) return

              // Delete the list
              await db.delete(shoppingLists).where(eq(shoppingLists.id, selectedListId))

              logger.info({ userId, listId: selectedListId }, 'Shopping list deleted')

              await i.update({
                content: '✅ List deleted.',
                embeds: [],
                components: [],
              })
              break
            }

            case 'lists:cancel-delete':
            case 'lists:back': {
              // Refresh and show list overview
              const refreshedLists = await db
                .select()
                .from(shoppingLists)
                .where(eq(shoppingLists.userId, userId))
                .orderBy(desc(shoppingLists.updatedAt))

              if (refreshedLists.length === 0) {
                await i.update({
                  content:
                    '📭 No shopping lists found.\n\n' +
                    `Create a list using \`${prefix}list\` or the "Save as List" button in \`${prefix}query\`.`,
                  embeds: [],
                  components: [],
                })
                return
              }

              // Rebuild embed and select menu
              const refreshedEmbed = new EmbedBuilder()
                .setTitle('📋 Your Shopping Lists')
                .setColor(0x5865f2)
                .setDescription(
                  `You have ${refreshedLists.length} list${refreshedLists.length !== 1 ? 's' : ''}`
                )
                .setTimestamp()

              for (const list of refreshedLists.slice(0, LISTS_PER_PAGE)) {
                const { name, value } = formatListSummary(list as ShoppingListData)
                refreshedEmbed.addFields({ name, value, inline: false })
              }

              const refreshedSelectMenu = new StringSelectMenuBuilder()
                .setCustomId('lists:select')
                .setPlaceholder('Select a list to view or manage')
                .addOptions(
                  refreshedLists.slice(0, 25).map(list => {
                    const materials = list.materials as Record<string, number>
                    const itemCount = Object.keys(materials).length
                    return {
                      label: list.name,
                      value: String(list.id),
                      description: `${itemCount} items`,
                    }
                  })
                )

              const refreshedSelectRow =
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(refreshedSelectMenu)

              await i.update({
                content: null,
                embeds: [refreshedEmbed],
                components: [refreshedSelectRow],
              })

              selectedListId = null
              break
            }
          }
        }
      } catch (error) {
        logger.error({ error, userId }, 'Error handling lists interaction')
      }
    })

    collector.on('end', async () => {
      try {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('lists:expired')
            .setLabel('Session expired - run /lists again')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        )
        await interaction.editReply({ components: [disabledRow] })
      } catch {
        // Interaction may have been deleted
      }
    })
  },
}
