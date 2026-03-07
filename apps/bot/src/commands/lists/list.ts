/**
 * /list command - Create a shopping list from flexible input
 *
 * Supports:
 * - Quantity + ticker pairs: "100 COF 200 RAT 500 DW"
 * - XIT JSON format: {"groups":[...]}
 * - Comma-separated format: "COF 100, RAT 200, DW 500"
 */
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, shoppingLists } from '@kawakawa/db'
import { parseXitJson } from '@kawakawa/parser/xit'
import { parseTokens } from '@kawakawa/parser'
import { botResolvers } from '../../utils/resolvers.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { formatCommodity } from '../../services/display.js'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

export const list: Command = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('Create a shopping list from commodities with quantities')
    .addStringOption(option =>
      option
        .setName('input')
        .setDescription('Commodities with quantities (e.g., "100 COF 200 RAT" or XIT JSON)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('name').setDescription('List name (optional)').setRequired(false)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prefix = getCommandPrefix(interaction)

    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    const input = interaction.options.getString('input', true)
    const nameOption = interaction.options.getString('name')

    // Parse the input
    const materials: Record<string, number> = {}
    let autoName: string | undefined

    // Check if it's XIT JSON
    if (input.trim().startsWith('{')) {
      const xitResult = parseXitJson(input)
      if (xitResult.valid) {
        for (const mat of xitResult.materials) {
          materials[mat.ticker] = (materials[mat.ticker] ?? 0) + mat.amount
        }
        autoName = xitResult.name
      } else {
        await interaction.reply({
          content: `❌ Invalid XIT JSON format.\n\n${xitResult.error}`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    } else {
      // Use the unified parser
      const parsed = await parseTokens(input, botResolvers)

      // Extract commodities with quantities
      for (const item of parsed.items) {
        if (item.quantity && item.quantity > 0) {
          materials[item.commodity.ticker] = (materials[item.commodity.ticker] ?? 0) + item.quantity
        } else {
          // No quantity specified - error
          await interaction.reply({
            content:
              `❌ Commodity **${item.commodity.ticker}** doesn't have a quantity.\n\n` +
              'Please specify quantities for all items.\n' +
              `Example: \`${prefix}list input:100 COF 200 RAT 500 DW\``,
            flags: MessageFlags.Ephemeral,
          })
          return
        }
      }

      // Check for unresolved tokens
      if (parsed.unresolved.length > 0 && Object.keys(materials).length === 0) {
        await interaction.reply({
          content:
            `❌ Could not resolve: ${parsed.unresolved.map(t => `"${t}"`).join(', ')}\n\n` +
            'Make sure commodity tickers are valid.',
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    }

    // Validate we have materials
    if (Object.keys(materials).length === 0) {
      await interaction.reply({
        content:
          '❌ No valid materials found.\n\n' +
          'Please provide commodities with quantities.\n' +
          `Example: \`${prefix}list input:100 COF 200 RAT 500 DW\``,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Determine list name
    const listName =
      nameOption?.trim() || autoName || `Shopping List ${new Date().toLocaleDateString()}`

    // Save the list
    try {
      const [newList] = await db
        .insert(shoppingLists)
        .values({
          userId,
          name: listName,
          materials,
        })
        .returning()

      const itemCount = Object.keys(materials).length
      const totalQty = Object.values(materials).reduce((sum, qty) => sum + qty, 0)

      // Build materials display
      const materialsDisplay = Object.entries(materials)
        .map(([ticker, qty]) => `• **${formatCommodity(ticker)}**: ${qty.toLocaleString()}`)
        .join('\n')

      await interaction.reply({
        content:
          `✅ List **${listName}** created!\n\n` +
          `${materialsDisplay}\n\n` +
          `📊 ${itemCount} item${itemCount !== 1 ? 's' : ''} • ${totalQty.toLocaleString()} total units\n\n` +
          `Use \`${prefix}lists\` to view and manage your lists.`,
        flags: MessageFlags.Ephemeral,
      })

      logger.info(
        {
          userId,
          listId: newList.id,
          listName,
          itemCount,
          totalQuantity: totalQty,
        },
        'Shopping list created'
      )
    } catch (error) {
      logger.error({ error, userId, listName }, 'Failed to create shopping list')
      await interaction.reply({
        content: '❌ Failed to create list. Please try again.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}
