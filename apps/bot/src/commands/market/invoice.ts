/**
 * /invoice <id> command - View invoice details with context-sensitive actions
 *
 * Shows full invoice details and provides action buttons based on the
 * caller's role (creator vs counterparty) and the invoice's current status.
 *
 * Actions:
 * - Creator + draft: Submit, Cancel
 * - Creator + pending: Cancel
 * - Creator + confirmed: Cancel
 * - Counterparty + pending: Confirm, Reject
 * - Any + terminal status: read-only
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { requireLinkedUser } from '../../utils/auth.js'
import {
  getInvoiceWithDetails,
  submitInvoice,
  confirmInvoice,
  rejectInvoice,
  cancelInvoice,
  formatLineItemsForEmbed,
  getInvoiceStatusEmoji,
  getInvoiceStatusLabel,
} from '../../services/invoiceService.js'
import type { InvoiceWithDetails } from '../../services/invoiceService.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'
import type { InvoiceStatus } from '@kawakawa/types'

type InvoiceRole = 'creator' | 'counterparty'

export const invoice: Command = {
  data: new SlashCommandBuilder()
    .setName('invoice')
    .setDescription('View invoice details and take actions')
    .addIntegerOption(option =>
      option.setName('id').setDescription('Invoice ID (e.g., 5)').setRequired(true).setMinValue(1)
    ) as SlashCommandBuilder,

  helpInfo: {
    category: 'invoices',
    details: 'View invoice details and take actions (submit, confirm, reject, cancel).',
    examples: ['invoice 5'],
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prefix = getCommandPrefix(interaction)

    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    const invoiceId = interaction.options.getInteger('id', true)
    const displaySettings = await getDisplaySettings(interaction.user.id)

    const inv = await getInvoiceWithDetails(invoiceId, userId)
    if (!inv) {
      await interaction.reply({
        content: `Could not find invoice #${invoiceId}, or you are not a party to it.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const role: InvoiceRole = inv.userId === userId ? 'creator' : 'counterparty'

    // Build the detail embed and action buttons
    const embed = await buildDetailEmbed(inv, role, displaySettings.locationDisplayMode, prefix)
    const buttons = buildActionButtons(inv.status, role)

    const replyOptions: Parameters<typeof interaction.reply>[0] = {
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    }
    if (buttons) {
      replyOptions.components = [buttons]
    }

    const reply = await interaction.reply(replyOptions)

    if (!buttons) return // No actions available, done

    // Collect button interactions
    try {
      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000, // 5 minutes
      })

      collector.on('collect', async buttonInteraction => {
        const action = buttonInteraction.customId

        if (action === 'invoice_cancel_draft') {
          // Delete draft — no confirmation needed
          const cancelResult = await cancelInvoice(invoiceId, userId)
          if (cancelResult.success) {
            await buttonInteraction.update({
              content: `Invoice #${invoiceId} has been cancelled.`,
              embeds: [],
              components: [],
            })
            logger.info({ userId, invoiceId, action: 'cancel_draft' }, 'Invoice draft cancelled')
          } else {
            await buttonInteraction.reply({
              content: `Failed: ${cancelResult.error}`,
              flags: MessageFlags.Ephemeral,
            })
          }
          collector.stop()
          return
        }

        if (action === 'invoice_submit') {
          const submitResult = await submitInvoice(invoiceId, userId)
          if (submitResult.success) {
            // Re-fetch and show updated embed
            const updated = await getInvoiceWithDetails(invoiceId, userId)
            if (updated) {
              const updatedEmbed = await buildDetailEmbed(
                updated,
                role,
                displaySettings.locationDisplayMode,
                prefix
              )
              const newButtons = buildActionButtons(updated.status, role)
              await buttonInteraction.update({
                embeds: [updatedEmbed],
                components: newButtons ? [newButtons] : [],
              })
            } else {
              await buttonInteraction.update({
                content: `Invoice #${invoiceId} submitted! Created ${submitResult.reservationCount} reservation(s).`,
                embeds: [],
                components: [],
              })
            }
            logger.info(
              { userId, invoiceId, reservations: submitResult.reservationCount },
              'Invoice submitted via /invoice'
            )
          } else {
            await buttonInteraction.reply({
              content: `Failed: ${submitResult.error}`,
              flags: MessageFlags.Ephemeral,
            })
          }
          return
        }

        if (action === 'invoice_confirm') {
          const confirmResult = await confirmInvoice(invoiceId, userId)
          if (confirmResult.success) {
            const updated = await getInvoiceWithDetails(invoiceId, userId)
            if (updated) {
              const updatedEmbed = await buildDetailEmbed(
                updated,
                role,
                displaySettings.locationDisplayMode,
                prefix
              )
              await buttonInteraction.update({
                embeds: [updatedEmbed],
                components: [],
              })
            } else {
              await buttonInteraction.update({
                content: `Invoice #${invoiceId} confirmed.`,
                embeds: [],
                components: [],
              })
            }
            logger.info(
              { userId, invoiceId, action: 'confirm' },
              'Invoice confirmed by counterparty'
            )
          } else {
            await buttonInteraction.reply({
              content: `Failed: ${confirmResult.error}`,
              flags: MessageFlags.Ephemeral,
            })
          }
          return
        }

        if (action === 'invoice_reject') {
          const rejectResult = await rejectInvoice(invoiceId, userId)
          if (rejectResult.success) {
            const updated = await getInvoiceWithDetails(invoiceId, userId)
            if (updated) {
              const updatedEmbed = await buildDetailEmbed(
                updated,
                role,
                displaySettings.locationDisplayMode,
                prefix
              )
              await buttonInteraction.update({
                embeds: [updatedEmbed],
                components: [],
              })
            } else {
              await buttonInteraction.update({
                content: `Invoice #${invoiceId} rejected.`,
                embeds: [],
                components: [],
              })
            }
            logger.info({ userId, invoiceId, action: 'reject' }, 'Invoice rejected by counterparty')
          } else {
            await buttonInteraction.reply({
              content: `Failed: ${rejectResult.error}`,
              flags: MessageFlags.Ephemeral,
            })
          }
          return
        }

        if (action === 'invoice_cancel') {
          const cancelResult = await cancelInvoice(invoiceId, userId)
          if (cancelResult.success) {
            const updated = await getInvoiceWithDetails(invoiceId, userId)
            if (updated) {
              const updatedEmbed = await buildDetailEmbed(
                updated,
                role,
                displaySettings.locationDisplayMode,
                prefix
              )
              await buttonInteraction.update({
                embeds: [updatedEmbed],
                components: [],
              })
            } else {
              await buttonInteraction.update({
                content: `Invoice #${invoiceId} cancelled.`,
                embeds: [],
                components: [],
              })
            }
            logger.info({ userId, invoiceId, action: 'cancel' }, 'Invoice cancelled by creator')
          } else {
            await buttonInteraction.reply({
              content: `Failed: ${cancelResult.error}`,
              flags: MessageFlags.Ephemeral,
            })
          }
          return
        }
      })

      collector.on('end', async (_collected, reason) => {
        if (reason === 'time') {
          try {
            await interaction.editReply({ components: [] })
          } catch {
            // Interaction may have been deleted
          }
        }
      })
    } catch {
      // Collector setup failed
    }
  },
}

/**
 * Build the detail embed for an invoice
 */
async function buildDetailEmbed(
  inv: InvoiceWithDetails,
  role: InvoiceRole,
  locationDisplayMode: string,
  prefix: string
): Promise<EmbedBuilder> {
  const statusEmoji = getInvoiceStatusEmoji(inv.status)
  const statusLabel = getInvoiceStatusLabel(inv.status)
  const roleLabel = role === 'creator' ? 'To' : 'From'

  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji} Invoice #${inv.id}`)
    .setColor(getStatusColor(inv.status))

  // Header info
  const headerLines: string[] = [
    `**${roleLabel}:** ${inv.counterpartyName}`,
    `**Status:** ${statusEmoji} ${statusLabel}`,
  ]

  if (inv.submittedAt) {
    headerLines.push(`**Submitted:** ${formatDate(inv.submittedAt)}`)
  }
  headerLines.push(`**Created:** ${formatDate(inv.createdAt)}`)

  embed.setDescription(headerLines.join('\n'))

  // Line items
  if (inv.lineItems.length > 0) {
    const lineItemLines = await formatLineItemsForEmbed(
      inv.lineItems,
      locationDisplayMode as 'names-only' | 'natural-ids-only' | 'both'
    )

    // Split into multiple fields if too long (Discord field limit: 1024 chars)
    const chunks = chunkLines(lineItemLines, 1000)
    for (let i = 0; i < chunks.length; i++) {
      embed.addFields({
        name: i === 0 ? `Items (${inv.itemCount})` : '\u200b',
        value: chunks[i].join('\n'),
        inline: false,
      })
    }
  } else {
    embed.addFields({
      name: 'Items',
      value: 'No items yet.',
      inline: false,
    })
  }

  // Totals
  if (inv.totalsByCurrency.length > 0) {
    const totals = inv.totalsByCurrency
      .map(t => `**${t.total.toFixed(2)} ${t.currency}**`)
      .join(' + ')
    embed.addFields({ name: 'Total', value: totals, inline: false })
  }

  // Footer with contextual tips
  const tips = getContextualTips(inv.status, role, prefix)
  if (tips) {
    embed.setFooter({ text: tips })
  }

  return embed
}

/**
 * Build action buttons based on invoice status and the caller's role
 */
function buildActionButtons(
  status: InvoiceStatus,
  role: InvoiceRole
): ActionRowBuilder<ButtonBuilder> | null {
  const buttons: ButtonBuilder[] = []

  if (role === 'creator') {
    if (status === 'draft') {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('invoice_submit')
          .setLabel('Submit')
          .setEmoji('📤')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('invoice_cancel_draft')
          .setLabel('Cancel')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger)
      )
    } else if (status === 'pending' || status === 'confirmed') {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('invoice_cancel')
          .setLabel('Cancel Invoice')
          .setStyle(ButtonStyle.Danger)
      )
    }
  } else if (role === 'counterparty') {
    if (status === 'pending') {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('invoice_confirm')
          .setLabel('Confirm')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('invoice_reject')
          .setLabel('Reject')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger)
      )
    }
  }

  if (buttons.length === 0) return null
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)
}

function getStatusColor(status: InvoiceStatus): number {
  switch (status) {
    case 'draft':
      return 0x95a5a6 // gray
    case 'pending':
      return 0xf39c12 // amber
    case 'confirmed':
      return 0x2ecc71 // green
    case 'fulfilled':
      return 0x3498db // blue
    case 'partially_fulfilled':
      return 0xe67e22 // orange
    case 'cancelled':
      return 0xe74c3c // red
    default:
      return 0x5865f2 // blurple
  }
}

function getContextualTips(
  status: InvoiceStatus,
  role: InvoiceRole,
  prefix: string
): string | null {
  if (role === 'creator' && status === 'draft') {
    return `Add items: ${prefix}buy <commodity> <location> <user> | Submit: click Submit above`
  }
  if (role === 'counterparty' && status === 'pending') {
    return 'Review the items above, then Confirm or Reject this invoice.'
  }
  if (status === 'confirmed') {
    return `Use ${prefix}reservations to track fulfillment.`
  }
  return null
}

function formatDate(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`
}

function chunkLines(lines: string[], maxChars: number): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let currentLen = 0

  for (const line of lines) {
    if (currentLen + line.length + 1 > maxChars && current.length > 0) {
      chunks.push(current)
      current = []
      currentLen = 0
    }
    current.push(line)
    currentLen += line.length + 1
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}
