/**
 * /buy command - Browse available sell orders or create invoices
 *
 * Query mode (no counterparty):
 * - /buy RAT - Show all sell orders for RAT
 * - /buy RAT BEN - Show sell orders for RAT at BEN
 * - /buy 20 RAT BEN - Show with availability emojis
 *
 * Invoice mode (with counterparty):
 * - /buy RAT BEN @alice - Prompt for quantity, then create invoice
 * - /buy 20 RAT BEN @alice - Create invoice (check for duplicates)
 *
 * To create buy orders (your demand), use /order buy instead.
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

export const buy: Command = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Browse available sell orders or create invoices')
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
      logger.debug({ cmd: 'buy', mode: 'help', input }, 'buy: empty input → help')
      await showBuyHelp(interaction, prefix, isEphemeral)
      return
    }

    // Parse input with unified parser
    const parsed = await parseTokens(input, botResolvers)
    logger.debug({
      cmd: 'buy',
      input,
      user: parsed.user?.username ?? null,
      userId: parsed.user?.userId ?? null,
      items: parsed.items.map(i => ({ ticker: i.commodity.ticker, qty: i.quantity })),
      location: parsed.location?.naturalId ?? null,
      unresolved: parsed.unresolved,
    }, 'buy: parsed input')

    // Check for invoice mode (counterparty user in input)
    if (parsed.user) {
      logger.debug({ cmd: 'buy', mode: 'invoice', counterparty: parsed.user.username }, 'buy: invoice mode')
      // INVOICE MODE: Buy from counterparty's sell orders
      // Require linked account for invoice creation
      const result = await requireLinkedUser(interaction)
      if (!result) return
      const { userId } = result
      logger.debug({ cmd: 'buy', currentUserId: userId, counterpartyUserId: parsed.user.userId }, 'buy: user IDs')

      const invoiceResult = await handleInvoiceCommand({
        interaction,
        userId,
        input,
        direction: 'buy',
        locationDisplayMode: displaySettings.locationDisplayMode,
        commodityDisplayMode: displaySettings.commodityDisplayMode,
      })
      logger.debug({ cmd: 'buy', invoiceResult: { success: invoiceResult.success, hasErrors: !!invoiceResult.errors } }, 'buy: invoice result')
      // handleInvoiceCommand handles all user-facing replies internally
      return
    }

    // QUERY MODE: Show available sell orders
    // Check if we have at least one commodity
    if (parsed.items.length === 0 && !parsed.location) {
      logger.debug({ cmd: 'buy', mode: 'help', reason: 'no items or location' }, 'buy: nothing to query → help')
      // Nothing to query - show help
      await showBuyHelp(interaction, prefix, isEphemeral)
      return
    }
    logger.debug({ cmd: 'buy', mode: 'query', commodities: parsed.items.map(i => i.commodity.ticker), location: parsed.location?.naturalId }, 'buy: query mode')

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

    // Execute query for SELL orders only (since user is looking to buy)
    const queryResult = await executeQuery({
      commodities: resolvedCommodities,
      locations: resolvedLocations,
      userIds: [],
      displayNames: [],
      orderType: 'sell', // Always sell orders for /buy
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

      let noResultsMsg = `📭 No sell orders found`
      if (commodityList) noResultsMsg += ` for **${commodityList}**`
      if (locationList.length > 0) noResultsMsg += ` at **${locationList.join(', ')}**`
      noResultsMsg += '.'

      noResultsMsg += `\n\n💡 **Tips:**`
      noResultsMsg += `\n• Use \`${prefix}query\` to search all orders`
      noResultsMsg += `\n• Use \`${prefix}order buy\` to post your demand`

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
 * Show help message for /buy command
 */
async function showBuyHelp(
  interaction: ChatInputCommandInteraction,
  prefix: string,
  isEphemeral: boolean
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle('🛒 Buy Command')
    .setColor(0x5865f2)
    .setDescription(
      `Use \`${prefix}buy\` to browse available sell orders or create invoices.\n\n` +
        `**Browse Orders (Query Mode)**\n` +
        `• \`${prefix}buy RAT\` - Show all RAT sell orders\n` +
        `• \`${prefix}buy RAT BEN\` - Show RAT orders at Benten\n` +
        `• \`${prefix}buy 20 RAT BEN\` - Show with availability ✅⚠️❌\n\n` +
        `**Create Invoice**\n` +
        `• \`${prefix}buy RAT BEN @alice\` - Buy RAT from Alice at Benten\n` +
        `• \`${prefix}buy 20 RAT BEN @alice\` - Buy 20 RAT from Alice\n\n` +
        `**Post Your Demand**\n` +
        `• \`${prefix}order buy COF Katoa 500\` - Create a buy order`
    )
    .setFooter({ text: 'Use /query for advanced searches across all order types' })

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('buy_help:dismiss')
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary)
  )

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
  })
}
