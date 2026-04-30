/**
 * Reply utilities for Discord bot commands
 */
import { MessageFlags } from 'discord.js'
import type {
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  MessageComponentInteraction,
} from 'discord.js'

type RepliableInteraction =
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | MessageComponentInteraction

/**
 * Send an ephemeral error reply to the user.
 *
 * @param interaction - The Discord interaction
 * @param message - The error message (without emoji prefix)
 *
 * @example
 * ```typescript
 * await replyError(interaction, 'Invalid quantity. Please enter a positive number.')
 * return
 * ```
 */
export async function replyError(
  interaction: RepliableInteraction,
  message: string
): Promise<void> {
  await interaction.reply({
    content: `❌ ${message}`,
    flags: MessageFlags.Ephemeral,
  })
}
