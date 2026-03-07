/**
 * /invoices command - Invoice dashboard
 *
 * Shows three sections:
 * - Inbox: invoices sent TO the user (pending/confirmed) needing attention
 * - Drafts: invoices the user is building
 * - Sent: invoices the user has submitted
 */
import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { requireLinkedUser } from '../../utils/auth.js'
import {
  getDraftInvoices,
  getInboxInvoices,
  getSentInvoices,
  getInvoiceStatusEmoji,
} from '../../services/invoiceService.js'
import type { InvoiceSummary } from '@kawakawa/types'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

export const invoicesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('invoices')
    .setDescription('View your invoice dashboard (inbox, drafts, sent)'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prefix = getCommandPrefix(interaction)

    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    // Fetch all three sections in parallel
    const [inbox, drafts, sent] = await Promise.all([
      getInboxInvoices(userId),
      getDraftInvoices(userId),
      getSentInvoices(userId),
    ])

    const totalCount = inbox.length + drafts.length + sent.length

    if (totalCount === 0) {
      await interaction.reply({
        content:
          'You have no invoices.\n\n' +
          `To create one, use \`${prefix}buy\` or \`${prefix}sell\` with a username:\n` +
          `  \`${prefix}buy COF 100 @bob BEN\` - Buy from bob\n` +
          `  \`${prefix}sell DW 500 alice BEN\` - Sell to alice`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const embed = new EmbedBuilder().setTitle('Invoice Dashboard').setColor(0x5865f2)

    // Inbox section
    if (inbox.length > 0) {
      embed.addFields({
        name: `📥 Inbox (${inbox.length})`,
        value: formatInvoiceList(inbox, prefix),
        inline: false,
      })
    }

    // Drafts section
    if (drafts.length > 0) {
      embed.addFields({
        name: `📝 Drafts (${drafts.length})`,
        value: formatInvoiceList(drafts, prefix),
        inline: false,
      })
    }

    // Sent section
    if (sent.length > 0) {
      embed.addFields({
        name: `📤 Sent (${sent.length})`,
        value: formatInvoiceList(sent, prefix),
        inline: false,
      })
    }

    // Summary description
    const parts: string[] = []
    if (inbox.length > 0) parts.push(`**${inbox.length}** awaiting your response`)
    if (drafts.length > 0) parts.push(`**${drafts.length}** in progress`)
    if (sent.length > 0) parts.push(`**${sent.length}** sent`)
    embed.setDescription(parts.join(' · '))

    embed.setFooter({
      text: `${prefix}invoice <id> to view details and take action`,
    })

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    })

    logger.info(
      { userId, inbox: inbox.length, drafts: drafts.length, sent: sent.length },
      'User viewed invoice dashboard'
    )
  },
}

function formatInvoiceList(invoiceList: InvoiceSummary[], prefix: string): string {
  const lines = invoiceList.slice(0, 10).map(inv => {
    const emoji = getInvoiceStatusEmoji(inv.status)
    const totals =
      inv.totalsByCurrency.length > 0
        ? inv.totalsByCurrency.map(t => `${t.total.toFixed(2)} ${t.currency}`).join(', ')
        : 'No items'
    const itemLabel = inv.itemCount === 1 ? 'item' : 'items'
    return `${emoji} **#${inv.id}** ${inv.counterpartyName} · ${inv.itemCount} ${itemLabel} · ${totals}`
  })

  if (invoiceList.length > 10) {
    lines.push(`*...and ${invoiceList.length - 10} more. Use \`${prefix}invoice <id>\` to view.*`)
  }

  return lines.join('\n')
}
