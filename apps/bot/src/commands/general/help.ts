import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command, BotClient } from '../../client.js'
import { getCommandPrefix } from '../../adapters/messageInteraction.js'

interface HelpCommandEntry {
  /** Command name without prefix (e.g., 'register') */
  name: string
  /** Extended help details (optional, shown below the command description) */
  details?: string
}

interface HelpSection {
  title: string
  emoji: string
  commands: HelpCommandEntry[]
}

/**
 * Command sections - descriptions are pulled from registered commands at runtime.
 * Only store command names and optional extended details here.
 */
const SECTIONS: Record<string, HelpSection> = {
  getting_started: {
    title: 'Getting Started',
    emoji: '🚀',
    commands: [{ name: 'register' }, { name: 'link' }, { name: 'whoami' }, { name: 'unlink' }],
  },
  inventory: {
    title: 'Inventory',
    emoji: '📦',
    commands: [
      {
        name: 'inventory',
        details: 'Filter by commodity or location. Use the Share button to post publicly.',
      },
      { name: 'sync' },
    ],
  },
  orders: {
    title: 'Creating Orders',
    emoji: '💰',
    commands: [
      { name: 'sell' },
      { name: 'buy' },
      {
        name: 'bulksell',
        details:
          'Format: `TICKER LOCATION [limit] PRICE [CURRENCY]`\n' +
          'Examples:\n' +
          '`COF UV-351a 150`\n' +
          '`RAT BEN max:500 125.50 ICA`\n' +
          '`DW MOR reserve:100 75`',
      },
      {
        name: 'bulkbuy',
        details:
          'Format: `TICKER LOCATION QUANTITY PRICE [CURRENCY]`\n' +
          'Examples:\n' +
          '`COF UV-351a 1000 150`\n' +
          '`RAT BEN 500 125.50 ICA`',
      },
    ],
  },
  market: {
    title: 'Market',
    emoji: '📊',
    commands: [
      {
        name: 'orders',
        details:
          'Shows your orders by default. Add filters to search the market.\n' +
          'Use the Manage button to edit or delete your orders.',
      },
      {
        name: 'query',
        details: 'Find what others are selling or buying.',
      },
    ],
  },
  reservations: {
    title: 'Reservations',
    emoji: '📝',
    commands: [
      {
        name: 'reserve',
        details:
          'Browse available sell orders for a commodity, then reserve a quantity.\n' +
          'The seller will be notified and can confirm or reject.',
      },
      {
        name: 'fill',
        details:
          'Browse open buy orders for a commodity, then offer to supply.\n' +
          'The buyer will be notified and can confirm or reject.',
      },
      {
        name: 'reservations',
        details:
          'See reservations where you are the order owner or counterparty.\n' +
          'Confirm, reject, fulfill, or cancel reservations.',
      },
    ],
  },
  settings: {
    title: 'Settings',
    emoji: '⚙️',
    commands: [
      {
        name: 'settings',
        details:
          '- Location/commodity display modes\n' +
          '- Preferred currency\n' +
          '- Default price list for auto-pricing\n' +
          '- Favorite locations and commodities',
      },
    ],
  },
}

/** Format a command name with the appropriate prefix */
function cmd(name: string, prefix: string): string {
  return `${prefix}${name}`
}

/** Get command description from registered commands */
function getCommandDescription(client: BotClient, commandName: string): string {
  const command = client.commands.get(commandName)
  return command?.data.description ?? 'No description available'
}

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn how to use the Kawakawa Exchange bot')
    .addStringOption(option =>
      option
        .setName('topic')
        .setDescription('Get help on a specific topic')
        .setRequired(false)
        .addChoices(
          { name: 'Getting Started', value: 'getting_started' },
          { name: 'Inventory', value: 'inventory' },
          { name: 'Creating Orders', value: 'orders' },
          { name: 'Market', value: 'market' },
          { name: 'Reservations', value: 'reservations' },
          { name: 'Settings', value: 'settings' }
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const topic = interaction.options.getString('topic')
    const prefix = getCommandPrefix(interaction)
    const client = interaction.client as BotClient

    if (topic && topic in SECTIONS) {
      // Show specific topic
      const section = SECTIONS[topic]
      const embed = new EmbedBuilder()
        .setTitle(`${section.emoji} ${section.title}`)
        .setColor(0x5865f2)

      for (const command of section.commands) {
        // Get description from the registered command
        let value = getCommandDescription(client, command.name)
        if (command.details) {
          value += `\n\n${command.details}`
        }
        embed.addFields({ name: cmd(command.name, prefix), value, inline: false })
      }

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Show overview
    const embed = new EmbedBuilder()
      .setTitle('Kawakawa Exchange Bot')
      .setColor(0x5865f2)
      .setDescription(
        'Welcome to the Kawakawa internal commodity exchange!\n\n' +
          'This bot helps you manage inventory, create buy/sell orders, and trade with other members.\n\n' +
          `Use \`${cmd('help', prefix)} topic:\` to learn more about a specific area.`
      )

    // Add sections overview
    for (const section of Object.values(SECTIONS)) {
      const commandList = section.commands.map(c => `\`${cmd(c.name, prefix)}\``).join(', ')
      embed.addFields({
        name: `${section.emoji} ${section.title}`,
        value: commandList,
        inline: false,
      })
    }

    // Quick start guide
    embed.addFields({
      name: '📋 Quick Start',
      value:
        `1. \`${cmd('register', prefix)}\` - ${getCommandDescription(client, 'register')}\n` +
        `2. \`${cmd('settings', prefix)}\` - ${getCommandDescription(client, 'settings')}\n` +
        `3. \`${cmd('sync', prefix)}\` - ${getCommandDescription(client, 'sync')}\n` +
        `4. \`${cmd('bulksell', prefix)}\` - ${getCommandDescription(client, 'bulksell')}\n` +
        `5. \`${cmd('query', prefix)}\` - ${getCommandDescription(client, 'query')}`,
      inline: false,
    })

    embed.setFooter({
      text: 'Tip: Most commands are ephemeral (only you see them). Use Share buttons to post publicly.',
    })

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    })
  },
}
