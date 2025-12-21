/**
 * /invoices command - List all draft invoices for the current user
 *
 * Shows a summary of all open invoices with their partners and totals.
 */
import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { getDraftInvoices } from '../../services/invoiceService.js'
import logger from '../../utils/logger.js'

export const invoicesCommand: Command = {
  data: new SlashCommandBuilder().setName('invoices').setDescription('List your draft invoices'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Get draft invoices
    const drafts = await getDraftInvoices(userId)

    if (drafts.length === 0) {
      await interaction.reply({
        content:
          '📋 You have no draft invoices.\n\n' +
          'To create an invoice, use `/buy` or `/sell` with a username:\n' +
          '• `/buy COF 100 @bob BEN` - Buy from bob\n' +
          '• `/sell DW 500 user:alice BEN` - Sell to alice',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle('📋 Your Draft Invoices')
      .setColor(0x5865f2)
      .setDescription(
        `You have **${drafts.length}** draft invoice${drafts.length === 1 ? '' : 's'}`
      )

    // Add field for each invoice
    for (const invoice of drafts) {
      const totalsStr =
        invoice.totalsByCurrency.length > 0
          ? invoice.totalsByCurrency.map(t => `${t.total.toFixed(2)} ${t.currency}`).join(', ')
          : 'No items'

      embed.addFields({
        name: `#${invoice.id}: ${invoice.counterpartyName}`,
        value: `${invoice.itemCount} item${invoice.itemCount === 1 ? '' : 's'} • Total: ${totalsStr}`,
        inline: false,
      })
    }

    embed.setFooter({
      text: 'Use /close <user> or /close <id> to submit an invoice',
    })

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    })

    logger.info({ userId, invoiceCount: drafts.length }, 'User listed draft invoices')
  },
}
