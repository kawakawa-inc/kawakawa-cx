/**
 * /invoices command - Invoice dashboard
 *
 * Shows three sections with pagination:
 * - Inbox: invoices sent TO the user (pending/confirmed) needing attention
 * - Drafts: invoices the user is building
 * - Sent: invoices the user has submitted
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import type { ChatInputCommandInteraction, ButtonInteraction } from 'discord.js'
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

const INVOICES_PER_PAGE = 10
const COMPONENT_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export const invoicesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('invoices')
    .setDescription('View your invoice dashboard (inbox, drafts, sent)'),

  helpInfo: {
    category: 'invoices',
    details: 'List your draft invoices.',
    examples: ['invoices'],
  },

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

    // Build all invoice items as embed fields with section headers
    const allItems = buildInvoiceFields(inbox, drafts, sent, prefix)

    // Summary description
    const parts: string[] = []
    if (inbox.length > 0) parts.push(`**${inbox.length}** awaiting your response`)
    if (drafts.length > 0) parts.push(`**${drafts.length}** in progress`)
    if (sent.length > 0) parts.push(`**${sent.length}** sent`)
    const description = parts.join(' · ')

    const baseEmbed = new EmbedBuilder()
      .setTitle('Invoice Dashboard')
      .setColor(0x5865f2)
      .setDescription(description)

    await sendPaginatedInvoices(interaction, baseEmbed, allItems, prefix)

    logger.info(
      { userId, inbox: inbox.length, drafts: drafts.length, sent: sent.length },
      'User viewed invoice dashboard'
    )
  },
}

interface InvoiceField {
  name: string
  value: string
  inline: boolean
}

/**
 * Build embed fields for all invoice sections.
 * Each section header is a field, followed by invoice line fields.
 */
function buildInvoiceFields(
  inbox: InvoiceSummary[],
  drafts: InvoiceSummary[],
  sent: InvoiceSummary[],
  _prefix: string
): InvoiceField[] {
  const fields: InvoiceField[] = []

  if (inbox.length > 0) {
    fields.push({
      name: `📥 Inbox (${inbox.length})`,
      value: formatInvoiceList(inbox),
      inline: false,
    })
  }

  if (drafts.length > 0) {
    fields.push({
      name: `📝 Drafts (${drafts.length})`,
      value: formatInvoiceList(drafts),
      inline: false,
    })
  }

  if (sent.length > 0) {
    fields.push({
      name: `📤 Sent (${sent.length})`,
      value: formatInvoiceList(sent),
      inline: false,
    })
  }

  return fields
}

function formatInvoiceLine(inv: InvoiceSummary): string {
  const emoji = getInvoiceStatusEmoji(inv.status)
  const totals =
    inv.totalsByCurrency.length > 0
      ? inv.totalsByCurrency.map(t => `${t.total.toFixed(2)} ${t.currency}`).join(', ')
      : 'No items'
  const itemLabel = inv.itemCount === 1 ? 'item' : 'items'
  return `${emoji} **#${inv.id}** ${inv.counterpartyName} · ${inv.itemCount} ${itemLabel} · ${totals}`
}

function formatInvoiceList(invoiceList: InvoiceSummary[]): string {
  return invoiceList.map(formatInvoiceLine).join('\n')
}

/**
 * Send invoices with pagination.
 */
async function sendPaginatedInvoices(
  interaction: ChatInputCommandInteraction,
  baseEmbed: EmbedBuilder,
  allFields: InvoiceField[],
  prefix: string
): Promise<void> {
  // Split long field values into pages
  // Each field (section) may have many lines. We paginate by splitting lines across pages.
  const pages = paginateFields(allFields, INVOICES_PER_PAGE)
  const totalPages = pages.length
  let currentPage = 0

  const idPrefix = `invoices:${Date.now()}`

  const buildEmbed = (page: number): EmbedBuilder => {
    const embed = EmbedBuilder.from(baseEmbed)
    const pageFields = pages[page] || []
    embed.setFields(...pageFields)
    embed.setFooter({
      text:
        `${prefix}invoice <id> to view details and take action` +
        (totalPages > 1 ? `\nPage ${page + 1}/${totalPages}` : ''),
    })
    return embed
  }

  // Single page — no buttons needed
  if (totalPages <= 1) {
    await interaction.reply({
      embeds: [buildEmbed(0)],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const buildButtons = (page: number): ActionRowBuilder<ButtonBuilder> => {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:prev`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:info`)
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:next`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    )
  }

  const response = await interaction.reply({
    embeds: [buildEmbed(0)],
    components: [buildButtons(0)],
    flags: MessageFlags.Ephemeral,
  })

  const collector = response.createMessageComponentCollector({
    time: COMPONENT_TIMEOUT,
    filter: i => i.customId.startsWith(idPrefix) && i.user.id === interaction.user.id,
  })

  collector.on('collect', async (btnInteraction: ButtonInteraction) => {
    const action = btnInteraction.customId.split(':')[2]

    if (action === 'prev' && currentPage > 0) {
      currentPage--
    } else if (action === 'next' && currentPage < totalPages - 1) {
      currentPage++
    }

    await btnInteraction.update({
      embeds: [buildEmbed(currentPage)],
      components: [buildButtons(currentPage)],
    })
  })

  collector.on('end', async () => {
    try {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:expired`)
          .setLabel('Session expired - run /invoices again')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
      await interaction.editReply({ components: [disabledRow] })
    } catch (error) {
      // Interaction may have been deleted
      logger.error({ error }, 'Failed to update expired invoices interaction')
    }
  })
}

/**
 * Split section fields into pages.
 * Each section's invoice lines are split across pages at the pageSize boundary.
 */
function paginateFields(fields: InvoiceField[], pageSize: number): InvoiceField[][] {
  const pages: InvoiceField[][] = []
  let currentPageFields: InvoiceField[] = []
  let currentCount = 0

  for (const field of fields) {
    const lines = field.value.split('\n')

    // If all lines fit on the current page, add the whole field
    if (currentCount + lines.length <= pageSize) {
      currentPageFields.push(field)
      currentCount += lines.length
      continue
    }

    // Split lines across pages
    let lineIdx = 0
    while (lineIdx < lines.length) {
      const remaining = pageSize - currentCount
      const chunk = lines.slice(lineIdx, lineIdx + remaining)

      if (chunk.length > 0) {
        const suffix = lineIdx > 0 ? ' (cont.)' : ''
        currentPageFields.push({
          name: `${field.name}${suffix}`,
          value: chunk.join('\n'),
          inline: false,
        })
        currentCount += chunk.length
        lineIdx += chunk.length
      }

      if (currentCount >= pageSize && lineIdx < lines.length) {
        pages.push(currentPageFields)
        currentPageFields = []
        currentCount = 0
      }
    }
  }

  if (currentPageFields.length > 0) {
    pages.push(currentPageFields)
  }

  if (pages.length === 0) {
    pages.push([])
  }

  return pages
}
