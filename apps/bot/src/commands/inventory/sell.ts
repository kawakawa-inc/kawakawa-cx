/**
 * /sell command - Browse buy orders (demand) or create invoices
 *
 * Query mode (no counterparty):
 * - /sell RAT - Show all buy orders for RAT (people looking to buy)
 * - /sell RAT BEN - Show buy orders for RAT at BEN
 * - /sell 20 RAT BEN - Show with availability emojis
 *
 * Invoice mode (with counterparty):
 * - /sell RAT BEN @alice - Prompt for quantity, then create invoice
 * - /sell 20 RAT BEN @alice - Create invoice (check for duplicates)
 *
 * To create sell orders (your supply), use /order sell instead.
 */
import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js'
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, userDiscordProfiles } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { searchLocations } from '../../autocomplete/index.js'
import { formatCommodity, formatLocation } from '../../services/display.js'
import { getDisplaySettings } from '../../services/userSettings.js'
import {
  getChannelConfig,
  resolveEffectiveValue,
  resolveMessageVisibility,
} from '../../services/channelConfig.js'
import { requireLinkedUser } from '../../utils/auth.js'
import { parseTokens } from '@kawakawa/parser'
import { botResolvers } from '../../utils/resolvers.js'
import { handleInvoiceCommand } from '../../services/invoiceCommandHandler.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'
import { executeQuery, sendQueryResponse } from '../../services/queryHelper.js'
import type { ExtraButton } from '../../components/pagination.js'
import logger from '../../utils/logger.js'

export const sell: Command = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Browse buy orders (demand) or create invoices')
    .addStringOption(option =>
      option
        .setName('input')
        .setDescription('Commodity, location, quantity, and/or username (e.g., "RAT BEN" or "20 RAT BEN @alice")')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('visibility')
        .setDescription('Filter by visibility (default: internal)')
        .setRequired(false)
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Internal (members)', value: 'internal' },
          { name: 'Partner (trade partners)', value: 'partner' }
        )
    )
    .addStringOption(option =>
      option
        .setName('reply')
        .setDescription('Reply visibility (default: your preference)')
        .setRequired(false)
        .addChoices(
          { name: 'Private (only you)', value: 'ephemeral' },
          { name: 'Public (everyone)', value: 'public' }
        )
    ) as SlashCommandBuilder,

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

    // Get user's display preferences
    const displaySettings = await getDisplaySettings(interaction.user.id)

    // Get channel defaults (if configured)
    const channelId = interaction.channelId
    const channelSettings = await getChannelConfig(channelId)

    // Get options
    const input = interaction.options.getString('input')
    const visibilityOption = interaction.options.getString('visibility') as
      | 'all'
      | 'internal'
      | 'partner'
      | null
    const replyOption = interaction.options.getString('reply') as 'ephemeral' | 'public' | null

    // Resolve message visibility
    const { isEphemeral } = resolveMessageVisibility(
      replyOption,
      channelSettings,
      displaySettings.messageVisibility
    )

    // Check for empty input - show informational message
    if (!input || input.trim() === '') {
      logger.debug({ cmd: 'sell', mode: 'help', input }, 'sell: empty input → help')
      await showSellHelp(interaction, prefix, isEphemeral)
      return
    }

    // Parse input with unified parser
    const parsed = await parseTokens(input, botResolvers)
    logger.debug({
      cmd: 'sell',
      input,
      user: parsed.user?.username ?? null,
      userId: parsed.user?.userId ?? null,
      items: parsed.items.map(i => ({ ticker: i.commodity.ticker, qty: i.quantity })),
      location: parsed.location?.naturalId ?? null,
      unresolved: parsed.unresolved,
    }, 'sell: parsed input')

    // Check for invoice mode (counterparty user in input)
    if (parsed.user) {
      logger.debug({ cmd: 'sell', mode: 'invoice', counterparty: parsed.user.username }, 'sell: invoice mode')
      // INVOICE MODE: Sell to counterparty's buy orders
      // Require linked account for invoice creation
      const result = await requireLinkedUser(interaction)
      if (!result) return
      const { userId } = result
      logger.debug({ cmd: 'sell', currentUserId: userId, counterpartyUserId: parsed.user.userId }, 'sell: user IDs')

      const invoiceResult = await handleInvoiceCommand({
        interaction,
        userId,
        input,
        direction: 'sell',
        locationDisplayMode: displaySettings.locationDisplayMode,
        commodityDisplayMode: displaySettings.commodityDisplayMode,
      })
      logger.debug({ cmd: 'sell', invoiceResult: { success: invoiceResult.success, hasErrors: !!invoiceResult.errors } }, 'sell: invoice result')
      // handleInvoiceCommand handles all user-facing replies internally
      return
    }

    // QUERY MODE: Show available buy orders (people's demand)
    // Check if we have at least one commodity
    if (parsed.items.length === 0 && !parsed.location) {
      logger.debug({ cmd: 'sell', mode: 'help', reason: 'no items or location' }, 'sell: nothing to query → help')
      // Nothing to query - show help
      await showSellHelp(interaction, prefix, isEphemeral)
      return
    }
    logger.debug({ cmd: 'sell', mode: 'query', commodities: parsed.items.map(i => i.commodity.ticker), location: parsed.location?.naturalId }, 'sell: query mode')

    // Get current user's ID (if linked) for filtering own orders
    const currentUserProfile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, interaction.user.id),
    })
    const currentUserId = currentUserProfile?.userId ?? null

    // Determine visibility using channel defaults
    const visibility: 'all' | 'internal' | 'partner' = resolveEffectiveValue(
      visibilityOption,
      channelSettings?.visibility,
      channelSettings?.visibilityEnforced ?? false,
      'internal' as const,
      'internal' as const
    )

    // Build resolved commodities
    const resolvedCommodities = parsed.items.map(item => item.commodity)

    // Build resolved locations
    const resolvedLocations = parsed.location
      ? [
          {
            naturalId: parsed.location.naturalId,
            name: parsed.location.name,
            type: parsed.location.type,
          },
        ]
      : []

    // Build requested quantities (for availability emojis)
    const requestedQuantities: Record<string, number> = {}
    let hasQuantities = false
    for (const item of parsed.items) {
      if (item.quantity !== null && item.quantity > 0) {
        requestedQuantities[item.commodity.ticker] = item.quantity
        hasQuantities = true
      }
    }

    // Execute query for BUY orders only (since user is looking to sell)
    const queryResult = await executeQuery({
      commodities: resolvedCommodities,
      locations: resolvedLocations,
      userIds: [],
      displayNames: [],
      orderType: 'buy', // Always buy orders for /sell
      visibility,
      channelSettings,
      locationDisplayMode: displaySettings.locationDisplayMode,
      commodityDisplayMode: displaySettings.commodityDisplayMode,
      isEphemeral,
      requestedQuantities: hasQuantities ? requestedQuantities : undefined,
      currentUserId,
    })

    if (!queryResult.hasOrders) {
      // Build helpful message for no results
      const commodityList = resolvedCommodities.map(c => formatCommodity(c.ticker)).join(', ')
      const locationList = await Promise.all(
        resolvedLocations.map(l => formatLocation(l.naturalId, displaySettings.locationDisplayMode))
      )

      let noResultsMsg = `📭 No buy orders found`
      if (commodityList) noResultsMsg += ` for **${commodityList}**`
      if (locationList.length > 0) noResultsMsg += ` at **${locationList.join(', ')}**`
      noResultsMsg += '.'

      noResultsMsg += `\n\n💡 **Tips:**`
      noResultsMsg += `\n• Use \`${prefix}query\` to search all orders`
      noResultsMsg += `\n• Use \`${prefix}order sell\` to post your supply`

      await interaction.reply({
        content: noResultsMsg,
        flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
      })
      return
    }

    // Build extra buttons (empty for now - invoice creation moved to explicit @user syntax)
    const extraButtons: ExtraButton[] = []

    // Send paginated response
    await sendQueryResponse(interaction, queryResult, {
      isEphemeral,
      extraButtons,
    })
  },
}

/**
 * Show help message for /sell command
 */
async function showSellHelp(
  interaction: ChatInputCommandInteraction,
  prefix: string,
  isEphemeral: boolean
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('💰 Sell Command')
    .setColor(0xfee75c)
    .setDescription(
      `Use \`${prefix}sell\` to browse buy orders (demand) or create invoices.\n\n` +
        `**Browse Demand (Query Mode)**\n` +
        `• \`${prefix}sell RAT\` - Show all RAT buy orders\n` +
        `• \`${prefix}sell RAT BEN\` - Show RAT demand at Benten\n` +
        `• \`${prefix}sell 20 RAT BEN\` - Show with availability ✅⚠️❌\n\n` +
        `**Create Invoice**\n` +
        `• \`${prefix}sell RAT BEN @alice\` - Sell RAT to Alice at Benten\n` +
        `• \`${prefix}sell 20 RAT BEN @alice\` - Sell 20 RAT to Alice\n\n` +
        `**Post Your Supply**\n` +
        `• \`${prefix}order sell COF Katoa 500\` - Create a sell order`
    )
    .setFooter({ text: 'Use /query for advanced searches across all order types' })

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('sell_help:dismiss')
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary)
  )

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
  })
}
