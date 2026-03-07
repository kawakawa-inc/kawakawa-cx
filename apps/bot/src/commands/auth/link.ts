/**
 * /link command - Generate a link to connect Discord to existing Kawakawa account
 *
 * Instead of accepting passwords in Discord (insecure), this generates a secure
 * token-based link. The user clicks the link, logs in on the website, and the
 * account is linked automatically.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, userDiscordProfiles, discordLinkTokens } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'
import { getWebUrl } from '../../config.js'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

export const link: Command = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord to an existing Kawakawa account'),

  helpInfo: {
    category: 'getting_started',
    details:
      'Generates a secure link to connect your Discord account to an existing Kawakawa account. Click the button, log in on the website, and your accounts are linked.',
    examples: ['link'],
  },

  // Prefix commands send response via DM (ephemeral flag triggers DM routing)

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id
    const discordUsername = interaction.user.username
    const discordAvatar = interaction.user.avatar
    const prefix = getCommandPrefix(interaction)

    // Check if Discord is already linked
    const existingProfile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, discordId),
    })

    if (existingProfile) {
      await interaction.reply({
        content:
          'Your Discord is already linked to a Kawakawa account.\n\n' +
          `Use \`${prefix}whoami\` to see your account, or \`${prefix}unlink\` first to disconnect.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Generate link token
    const token = crypto.randomBytes(32).toString('hex')
    const expirationMinutes = 15 // Short expiration for security
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000)

    // Store token with Discord info
    await db.insert(discordLinkTokens).values({
      token,
      discordId,
      discordUsername,
      discordAvatar,
      expiresAt,
      used: false,
    })

    logger.info({ discordId, discordUsername }, 'Discord link token generated')

    // Get web URL
    const webUrl = await getWebUrl()
    const linkUrl = `${webUrl}/link-discord?token=${token}`

    const embed = new EmbedBuilder()
      .setTitle('🔗 Link Your Discord Account')
      .setColor(0x5865f2)
      .setDescription(
        'Click the button below to link your Discord to your Kawakawa account.\n\n' +
          "You'll be asked to log in on the website, and your accounts will be connected automatically."
      )
      .addFields({
        name: 'Expires',
        value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
        inline: true,
      })
      .setFooter({ text: `Discord: ${discordUsername}` })
      .setTimestamp()

    // Create button with link
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('🔗 Link Account').setStyle(ButtonStyle.Link).setURL(linkUrl)
    )

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    })
  },
}
