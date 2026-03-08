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
import { db, userDiscordProfiles } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import logger from '../../utils/logger.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

export const unlink: Command = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Disconnect your Discord from your Kawakawa account'),

  helpInfo: {
    category: 'getting_started',
    details: 'Discord-only accounts will be warned before unlinking.',
    examples: ['unlink'],
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prefix = getCommandPrefix(interaction)
    const discordId = interaction.user.id

    // Find the Discord profile
    const profile = await db.query.userDiscordProfiles.findFirst({
      where: eq(userDiscordProfiles.discordId, discordId),
      with: {
        user: true,
      },
    })

    if (!profile) {
      await interaction.reply({
        content: "You don't have a linked Kawakawa account.",
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Check if this is a Discord-only account (no password set)
    const isDiscordOnlyAccount = profile.user.passwordHash.startsWith('discord:')

    if (isDiscordOnlyAccount) {
      // Show warning with confirm/cancel buttons
      const idPrefix = `unlink-confirm:${Date.now()}`
      const embed = new EmbedBuilder()
        .setTitle('Warning: Discord-Only Account')
        .setColor(0xed4245)
        .setDescription(
          'Your account was created via Discord and has no password.\n\n' +
            "**If you unlink, you won't be able to log in!**\n\n" +
            'Before unlinking, you should:\n' +
            '1. Log in to the website\n' +
            '2. Set a password in your account settings'
        )

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:yes`)
          .setLabel('Unlink Anyway')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:no`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      )

      await interaction.reply({
        embeds: [embed],
        components: [buttonRow],
        flags: MessageFlags.Ephemeral,
      })

      const response = await interaction.fetchReply()

      try {
        const btnInteraction = await response.awaitMessageComponent({
          filter: i => i.customId.startsWith(idPrefix) && i.user.id === interaction.user.id,
          time: 30000,
        })

        if (btnInteraction.customId.endsWith(':yes')) {
          try {
            await performUnlink(discordId, profile)
            await btnInteraction.update({
              content:
                `Successfully unlinked your Discord from **${profile.user.username}**.\n\n` +
                '**Warning:** You no longer have a way to log in. ' +
                `Use \`${prefix}register\` to create a new account, or \`${prefix}link\` to connect to an existing one.`,
              embeds: [],
              components: [],
            })
          } catch (error) {
            logger.error({ error, discordId }, 'Failed to unlink Discord')
            await btnInteraction.update({
              content: 'An error occurred while unlinking your account. Please try again.',
              embeds: [],
              components: [],
            })
          }
        } else {
          await btnInteraction.update({
            content: 'Unlink cancelled.',
            embeds: [],
            components: [],
          })
        }
      } catch {
        await interaction.editReply({
          content: 'Confirmation timed out. Use the command again if you want to unlink.',
          embeds: [],
          components: [],
        })
      }
      return
    }

    // Normal unlink (has password)
    try {
      await performUnlink(discordId, profile)
      await interaction.reply({
        content:
          `Successfully unlinked your Discord from **${profile.user.username}**.\n\n` +
          'You can still log in with your username and password on the website.\n' +
          `Use \`${prefix}link\` to reconnect your Discord later.`,
        flags: MessageFlags.Ephemeral,
      })
    } catch (error) {
      logger.error({ error, discordId }, 'Failed to unlink Discord')
      await interaction.reply({
        content: 'An error occurred while unlinking your account. Please try again.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}

async function performUnlink(
  discordId: string,
  profile: { user: { id: number; username: string } }
): Promise<void> {
  await db.delete(userDiscordProfiles).where(eq(userDiscordProfiles.discordId, discordId))
  logger.info(
    { userId: profile.user.id, username: profile.user.username, discordId },
    'Discord account unlinked'
  )
}
