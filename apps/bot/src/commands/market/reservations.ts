/**
 * /reservations command - DEPRECATED
 *
 * Redirects users to !invoices / !invoice.
 * Standalone reservations have been migrated to invoices at startup.
 */
import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

export const reservations: Command = {
  data: new SlashCommandBuilder()
    .setName('reservations')
    .setDescription(
      'View and manage your reservations (deprecated - use /invoices)'
    ) as SlashCommandBuilder,

  // No helpInfo — hidden from !help

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const prefix = getCommandPrefix(interaction)

    await interaction.reply({
      content:
        `**This command has been replaced.**\n` +
        `Use \`${prefix}invoices\` to view your invoice dashboard, ` +
        `or \`${prefix}invoice <id>\` to manage a specific invoice.\n\n` +
        `Your existing reservations have been migrated to invoices.`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
