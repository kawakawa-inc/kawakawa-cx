/**
 * /close command - Submit a draft invoice
 *
 * Supports:
 * - By invoice ID: /close 1
 * - By username: /close bob
 */
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { requireLinkedUser } from '../../utils/auth.js'
import {
  getDraftInvoices,
  getInvoiceWithDetails,
  submitInvoice,
  findUserByName,
  formatLineItemsForEmbed,
} from '../../services/invoiceService.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

export const close: Command = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Submit a draft invoice (creates reservations)')
    .addStringOption(option =>
      option
        .setName('target')
        .setDescription('Invoice ID (e.g., "1") or partner username (e.g., "bob")')
        .setRequired(false)
    ),

  helpInfo: {
    category: 'invoices',
    details: 'Submit a draft invoice to a target user, creating reservations.',
    examples: ['close alice', 'close 5'],
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Get command prefix (/ or ! or custom)
    const prefix = getCommandPrefix(interaction)

    // Require linked account
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    const target = interaction.options.getString('target')?.trim()
    logger.debug({ cmd: 'close', target, userId }, 'close: invoked')

    // Get user's draft invoices
    const drafts = await getDraftInvoices(userId)

    logger.debug(
      {
        cmd: 'close',
        draftCount: drafts.length,
        drafts: drafts.map(d => ({
          id: d.id,
          counterparty: d.counterpartyName,
          items: d.itemCount,
        })),
      },
      'close: found drafts'
    )

    if (drafts.length === 0) {
      await interaction.reply({
        content:
          '❌ You have no draft invoices to submit.\n\n' +
          `Use \`${prefix}buy\` or \`${prefix}sell\` with a username to create an invoice first.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // If no target specified, show list of draft invoices
    if (!target) {
      const invoiceList = drafts
        .map(
          inv =>
            `• **#${inv.id}**: ${inv.counterpartyName} - ${inv.itemCount} item${inv.itemCount === 1 ? '' : 's'}, ${inv.totalsByCurrency.map(t => `${t.total.toFixed(2)} ${t.currency}`).join(', ')}`
        )
        .join('\n')

      await interaction.reply({
        content:
          `📋 **What do you wish to close?**\n\nYou have ${drafts.length} draft invoice${drafts.length === 1 ? '' : 's'}:\n\n${invoiceList}\n\n` +
          `Use \`${prefix}close <id>\` or \`${prefix}close <username>\` to submit an invoice.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    let invoiceId: number | null = null

    // Check if target is a number (invoice ID)
    const numericId = parseInt(target, 10)
    if (!isNaN(numericId)) {
      // Find invoice by ID
      const matchingInvoice = drafts.find(d => d.id === numericId)
      if (matchingInvoice) {
        invoiceId = matchingInvoice.id
      } else {
        await interaction.reply({
          content: `❌ Invoice #${numericId} not found in your drafts.\n\nUse \`${prefix}invoices\` to see your draft invoices.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    } else {
      // Target is a username - find matching invoice(s)
      const user = await findUserByName(target)

      if (user) {
        // Find invoices with this counterparty
        const matchingInvoices = drafts.filter(d => d.counterpartyUserId === user.userId)

        if (matchingInvoices.length === 0) {
          await interaction.reply({
            content: `❌ No draft invoice found with **${user.fioUsername ?? user.displayName ?? user.username}**.\n\nUse \`${prefix}invoices\` to see your draft invoices.`,
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        if (matchingInvoices.length === 1) {
          invoiceId = matchingInvoices[0].id
        } else {
          // Multiple invoices with same user - ask to specify
          const invoiceList = matchingInvoices
            .map(
              inv =>
                `• #${inv.id}: ${inv.itemCount} item${inv.itemCount === 1 ? '' : 's'}, ${inv.totalsByCurrency.map(t => `${t.total.toFixed(2)} ${t.currency}`).join(', ')}`
            )
            .join('\n')

          await interaction.reply({
            content:
              `⚠️ You have multiple invoices with **${user.fioUsername ?? user.displayName ?? user.username}**:\n\n${invoiceList}\n\n` +
              `Please use \`${prefix}close <id>\` to specify which one.`,
            flags: MessageFlags.Ephemeral,
          })
          return
        }
      } else {
        // Try to match against counterparty names in existing invoices
        const matchByName = drafts.filter(
          d => d.counterpartyName.toLowerCase() === target.toLowerCase()
        )

        if (matchByName.length === 1) {
          invoiceId = matchByName[0].id
        } else if (matchByName.length > 1) {
          const invoiceList = matchByName
            .map(inv => `• #${inv.id}: ${inv.itemCount} item${inv.itemCount === 1 ? '' : 's'}`)
            .join('\n')

          await interaction.reply({
            content:
              `⚠️ You have multiple invoices with **${target}**:\n\n${invoiceList}\n\n` +
              `Please use \`${prefix}close <id>\` to specify which one.`,
            flags: MessageFlags.Ephemeral,
          })
          return
        } else {
          await interaction.reply({
            content: `❌ Could not find user or invoice matching "${target}".\n\nUse \`${prefix}invoices\` to see your draft invoices.`,
            flags: MessageFlags.Ephemeral,
          })
          return
        }
      }
    }

    // Get full invoice details
    const invoice = await getInvoiceWithDetails(invoiceId, userId)

    if (!invoice) {
      await interaction.reply({
        content: `❌ Could not load invoice #${invoiceId}.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (invoice.lineItems.length === 0) {
      await interaction.reply({
        content: `❌ Invoice #${invoiceId} has no items. Add items first using \`${prefix}buy\` or \`${prefix}sell\`.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Submit the invoice
    const submitResult = await submitInvoice(invoiceId, userId)

    if (!submitResult.success) {
      await interaction.reply({
        content: `❌ Failed to submit invoice: ${submitResult.error}`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Get display settings for location formatting
    const displaySettings = await getDisplaySettings(interaction.user.id)

    // Build success response with line item details
    const totalsStr =
      invoice.totalsByCurrency.length > 0
        ? invoice.totalsByCurrency.map(t => `${t.total.toFixed(2)} ${t.currency}`).join(', ')
        : 'N/A'

    // Format line items (includes notes)
    const lineItemLines = await formatLineItemsForEmbed(
      invoice.lineItems,
      displaySettings.locationDisplayMode
    )

    let response = `🎉 **Invoice #${invoiceId} submitted!**\n\n`
    response += `Created **${submitResult.reservationCount}** reservation${submitResult.reservationCount === 1 ? '' : 's'} for **${invoice.counterpartyName}** to confirm.\n\n`
    response += `📋 **Items:**\n`
    response += lineItemLines.join('\n') + '\n\n'
    response += `**Total: ${totalsStr}**`

    await interaction.reply({
      content: response,
      flags: MessageFlags.Ephemeral,
    })

    logger.info(
      {
        userId,
        invoiceId,
        counterpartyName: invoice.counterpartyName,
        reservationCount: submitResult.reservationCount,
      },
      'Invoice submitted successfully'
    )
  },
}
