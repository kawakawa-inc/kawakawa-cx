/**
 * Interaction utilities for Discord bot commands
 */
import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type Message,
  type ModalBuilder,
} from 'discord.js'
import { isMessageInteractionAdapter } from '../adapters/messageInteraction.js'

/** Default modal timeout: 5 minutes */
export const MODAL_TIMEOUT = 5 * 60 * 1000

/** Default component timeout: 1 minute */
export const COMPONENT_TIMEOUT = 60 * 1000

/**
 * Await a modal submission with automatic timeout handling.
 *
 * @param interaction - The interaction that showed the modal
 * @param modalId - The custom ID of the modal to await
 * @param timeout - Timeout in milliseconds (default: 5 minutes)
 * @returns The modal submission interaction, or null if timed out/cancelled
 *
 * @example
 * ```typescript
 * await interaction.showModal(modal)
 * const submit = await awaitModal(interaction, modalId)
 * if (!submit) return // Modal was cancelled or timed out
 * ```
 */
export async function awaitModal(
  interaction: MessageComponentInteraction | ChatInputCommandInteraction,
  modalId: string,
  timeout: number = MODAL_TIMEOUT
): Promise<ModalSubmitInteraction | null> {
  return interaction
    .awaitModalSubmit({
      time: timeout,
      filter: (i: ModalSubmitInteraction) =>
        i.customId === modalId && i.user.id === interaction.user.id,
    })
    .catch(() => null)
}

/**
 * Await a message component interaction (button or select menu).
 *
 * @param message - The message containing the components
 * @param customId - The custom ID of the component to await
 * @param userId - The user ID to filter for
 * @param timeout - Timeout in milliseconds (default: 1 minute)
 * @returns The component interaction, or null if timed out
 */
export async function awaitComponent(
  message: Message,
  customId: string,
  userId: string,
  timeout: number = COMPONENT_TIMEOUT
): Promise<MessageComponentInteraction | null> {
  return message
    .awaitMessageComponent({
      filter: i => i.customId === customId && i.user.id === userId,
      time: timeout,
    })
    .catch(() => null)
}

/**
 * Await a select menu interaction.
 *
 * @param message - The message containing the select menu
 * @param customId - The custom ID of the select menu
 * @param userId - The user ID to filter for
 * @param timeout - Timeout in milliseconds (default: 1 minute)
 * @returns The select menu interaction, or null if timed out
 */
export async function awaitSelectMenu(
  message: Message,
  customId: string,
  userId: string,
  timeout: number = COMPONENT_TIMEOUT
): Promise<StringSelectMenuInteraction | null> {
  const interaction = await awaitComponent(message, customId, userId, timeout)
  if (interaction?.isStringSelectMenu()) {
    return interaction
  }
  return null
}

/**
 * Await a button interaction.
 *
 * @param message - The message containing the button
 * @param customId - The custom ID of the button
 * @param userId - The user ID to filter for
 * @param timeout - Timeout in milliseconds (default: 1 minute)
 * @returns The button interaction, or null if timed out
 */
export async function awaitButton(
  message: Message,
  customId: string,
  userId: string,
  timeout: number = COMPONENT_TIMEOUT
): Promise<ButtonInteraction | null> {
  const interaction = await awaitComponent(message, customId, userId, timeout)
  if (interaction?.isButton()) {
    return interaction
  }
  return null
}

/**
 * Show a modal, handling prefix commands by DMing a button first.
 *
 * Slash commands can show modals directly, but prefix commands cannot.
 * For prefix commands, this sends a DM with a button that opens the modal.
 *
 * @returns The modal submit interaction, or null if timed out/cancelled
 */
export async function showModalWithPrefixSupport(
  interaction: ChatInputCommandInteraction,
  modal: ModalBuilder,
  modalId: string
): Promise<ModalSubmitInteraction | null> {
  // Slash commands: show modal directly
  if (!isMessageInteractionAdapter(interaction)) {
    await interaction.showModal(modal)
    return awaitModal(interaction, modalId)
  }

  // Prefix commands: send a button that opens the modal
  const buttonId = `open-modal:${Date.now()}`
  const button = new ButtonBuilder()
    .setCustomId(buttonId)
    .setLabel('Open Form')
    .setStyle(ButtonStyle.Primary)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button)

  const reply = (await interaction.reply({
    content: 'Click the button below to open the form:',
    components: [row],
  })) as unknown as Message

  const buttonClick = await awaitButton(reply, buttonId, interaction.user.id, MODAL_TIMEOUT)
  if (!buttonClick) {
    // Button timed out — remove it
    await reply.edit({ content: 'Form expired.', components: [] }).catch(() => {})
    return null
  }

  // Button clicked — show modal (this is the interaction response)
  await buttonClick.showModal(modal)

  // Remove the button so it can't be clicked again
  await reply
    .edit({ content: 'Form opened. Fill it out and submit.', components: [] })
    .catch(() => {})

  const modalSubmit = await awaitModal(buttonClick, modalId)
  if (!modalSubmit) {
    // Modal dismissed or timed out
    await reply.edit({ content: 'Form cancelled or timed out.', components: [] }).catch(() => {})
  }
  return modalSubmit
}
