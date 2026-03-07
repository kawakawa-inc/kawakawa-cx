import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command, BotClient, HelpCategory } from '../../client.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

interface CategoryMeta {
  title: string
  emoji: string
}

/** Display metadata for each category */
const CATEGORIES: Record<HelpCategory, CategoryMeta> = {
  getting_started: { title: 'Getting Started', emoji: '🚀' },
  inventory: { title: 'Inventory', emoji: '📦' },
  trading: { title: 'Trading', emoji: '🔄' },
  orders: { title: 'Managing Orders', emoji: '💰' },
  invoices: { title: 'Invoices & Reservations', emoji: '📝' },
  lists: { title: 'Shopping Lists', emoji: '📋' },
  settings: { title: 'Settings', emoji: '⚙️' },
}

/** Category display order */
const CATEGORY_ORDER: HelpCategory[] = [
  'getting_started',
  'inventory',
  'trading',
  'orders',
  'invoices',
  'lists',
  'settings',
]

/** Format a command name with the appropriate prefix */
function cmd(name: string, prefix: string): string {
  return `${prefix}${name}`
}

/**
 * Resolve user input to a category key or command name.
 * Returns { type: 'category', key } or { type: 'command', command } or null.
 */
function resolveInput(
  input: string,
  client: BotClient
): { type: 'category'; key: HelpCategory } | { type: 'command'; command: Command } | null {
  const normalized = input.toLowerCase().replace(/[^a-z_]/g, '')

  // Try exact category key match
  if (normalized in CATEGORIES) {
    return { type: 'category', key: normalized as HelpCategory }
  }

  // Try category title match
  for (const [key, meta] of Object.entries(CATEGORIES)) {
    if (meta.title.toLowerCase().replace(/[^a-z]/g, '') === normalized.replace(/_/g, '')) {
      return { type: 'category', key: key as HelpCategory }
    }
  }

  // Try command name match
  const command = client.commands.get(normalized)
  if (command) {
    return { type: 'command', command }
  }

  return null
}

/** Build the overview embed showing all categories */
function buildOverviewEmbed(client: BotClient, prefix: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Kawakawa Exchange Bot')
    .setColor(0x5865f2)
    .setDescription(
      'Welcome to the Kawakawa internal commodity exchange!\n\n' +
        'This bot helps you manage inventory, create buy/sell orders, and trade with other members.\n\n' +
        `Use \`${cmd('help', prefix)} <topic>\` for a category, or \`${cmd('help', prefix)} <command>\` for details.`
    )

  // Group commands by category
  for (const catKey of CATEGORY_ORDER) {
    const meta = CATEGORIES[catKey]
    const commands = getCommandsInCategory(client, catKey)
    if (commands.length === 0) continue

    const commandList = commands.map(c => `\`${cmd(c.data.name, prefix)}\``).join(', ')
    embed.addFields({
      name: `${meta.emoji} ${meta.title}`,
      value: commandList,
      inline: false,
    })
  }

  // Quick start guide
  embed.addFields({
    name: '📋 Quick Start',
    value:
      `1. \`${cmd('register', prefix)}\` - Create your account\n` +
      `2. \`${cmd('sync', prefix)}\` - Connect your FIO inventory\n` +
      `3. \`${cmd('bulksell', prefix)}\` - Post your sell orders\n` +
      `4. \`${cmd('buy', prefix)}\` - Browse what others are selling\n` +
      `5. \`${cmd('settings', prefix)}\` - Customize display preferences`,
    inline: false,
  })

  embed.setFooter({
    text: 'Tip: Most commands are ephemeral (only you see them). Use Share buttons to post publicly.',
  })

  return embed
}

/** Build an embed for a specific category */
function buildCategoryEmbed(client: BotClient, catKey: HelpCategory, prefix: string): EmbedBuilder {
  const meta = CATEGORIES[catKey]
  const commands = getCommandsInCategory(client, catKey)

  const embed = new EmbedBuilder().setTitle(`${meta.emoji} ${meta.title}`).setColor(0x5865f2)

  for (const command of commands) {
    let value = command.data.description
    if (command.helpInfo?.details) {
      value += `\n\n${command.helpInfo.details}`
    }
    embed.addFields({ name: cmd(command.data.name, prefix), value, inline: false })
  }

  return embed
}

/** Build an embed for a specific command */
function buildCommandEmbed(command: Command, prefix: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${cmd(command.data.name, prefix)}`)
    .setColor(0x5865f2)
    .setDescription(command.data.description)

  if (command.helpInfo?.details) {
    embed.addFields({ name: 'Details', value: command.helpInfo.details, inline: false })
  }

  if (command.helpInfo?.examples && command.helpInfo.examples.length > 0) {
    const exampleLines = command.helpInfo.examples.map(ex => `\`${cmd(ex, prefix)}\``).join('\n')
    embed.addFields({ name: 'Examples', value: exampleLines, inline: false })
  }

  if (command.prefixEnabled === false) {
    embed.setFooter({ text: 'This command is slash-only (requires Discord UI).' })
  }

  return embed
}

/** Get all commands in a category, sorted by name */
function getCommandsInCategory(client: BotClient, catKey: HelpCategory): Command[] {
  const commands: Command[] = []
  for (const command of client.commands.values()) {
    if (command.helpInfo?.category === catKey) {
      commands.push(command)
    }
  }
  return commands
}

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how to use the Kawakawa Exchange bot')
    .addStringOption(option =>
      option
        .setName('topic')
        .setDescription('A category or command name')
        .setRequired(false)
        .addChoices(
          ...CATEGORY_ORDER.map(key => ({
            name: CATEGORIES[key].title,
            value: key,
          }))
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const rawTopic = interaction.options.getString('topic')
    const prefix = getCommandPrefix(interaction)
    const client = interaction.client as BotClient

    if (!rawTopic) {
      const embed = buildOverviewEmbed(client, prefix)
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
      return
    }

    const resolved = resolveInput(rawTopic, client)

    if (!resolved) {
      await interaction.reply({
        content: `Unknown topic or command: \`${rawTopic}\`\n\nUse \`${cmd('help', prefix)}\` to see available topics.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (resolved.type === 'category') {
      const embed = buildCategoryEmbed(client, resolved.key, prefix)
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
    } else {
      const embed = buildCommandEmbed(resolved.command, prefix)
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
    }
  },
}
