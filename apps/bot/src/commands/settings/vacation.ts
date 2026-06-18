import { SlashCommandBuilder, MessageFlags } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { Command } from '../../client.js'
import { db, users } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { requireLinkedUser } from '../../utils/auth.js'

const DURATION_RE = /^(\d+)\s*(day|days|week|weeks|month|months|year|years)$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDuration(input: string): Date | null {
  // Try ISO date first (e.g. "2026-07-20")
  if (ISO_DATE_RE.test(input)) {
    const date = new Date(input + 'T23:59:59')
    if (!isNaN(date.getTime()) && date > new Date()) return date
    return null
  }

  // Try natural language duration (e.g. "1 month", "2 weeks", "5 days")
  const match = input.match(DURATION_RE)
  if (!match) return null

  const amount = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  const date = new Date()

  if (unit.startsWith('day')) date.setDate(date.getDate() + amount)
  else if (unit.startsWith('week')) date.setDate(date.getDate() + amount * 7)
  else if (unit.startsWith('month')) date.setMonth(date.getMonth() + amount)
  else if (unit.startsWith('year')) date.setFullYear(date.getFullYear() + amount)

  return date
}

export const vacation: Command = {
  data: new SlashCommandBuilder()
    .setName('vacation')
    .setDescription('Pause your market activity while you are away')
    .addStringOption(option =>
      option
        .setName('until')
        .setDescription('Duration (e.g. "1 week", "2 months") or date (YYYY-MM-DD)')
    )
    .addBooleanOption(option =>
      option.setName('clear').setDescription('End vacation mode early')
    ),

  helpInfo: {
    category: 'settings',
    details:
      'Set, check, or clear vacation mode. While on vacation, your market orders are hidden.\n\n' +
      'With no arguments, shows your current vacation status.\n\n' +
      'Accepted formats:\n' +
      '• Duration: `5 days`, `1 week`, `2 weeks`, `1 month`, `2 months`, `1 year`\n' +
      '• ISO date: `2026-07-20`\n\n' +
      'Use `clear` to end vacation early.',
    examples: [
      'vacation',
      'vacation until:1 week',
      'vacation until:2 months',
      'vacation until:5 days',
      'vacation until:2026-07-20',
      'vacation clear:true',
    ],
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const result = await requireLinkedUser(interaction)
    if (!result) return
    const { userId } = result

    const clear = interaction.options.getBoolean('clear')
    // Support both slash command (until:) and prefix command (input fallback)
    const untilInput = interaction.options.getString('until') ?? interaction.options.getString('input')

    if (clear || untilInput?.toLowerCase() === 'clear') {
      await db.update(users).set({ inactiveUntil: null }).where(eq(users.id, userId))
      await interaction.reply({
        content: 'Vacation mode cleared. Your orders are visible again.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // No arguments — show current status
    if (!untilInput) {
      const [user] = await db
        .select({ inactiveUntil: users.inactiveUntil })
        .from(users)
        .where(eq(users.id, userId))

      if (user?.inactiveUntil && new Date(user.inactiveUntil) > new Date()) {
        const now = new Date()
        const end = new Date(user.inactiveUntil)
        const daysRemaining = Math.ceil((end.getTime() - now.getTime()) / 86400000)
        const formattedDate = end.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        await interaction.reply({
          content: `On vacation — **${daysRemaining} day${daysRemaining === 1 ? '' : 's'}** remaining (until ${formattedDate}).`,
          flags: MessageFlags.Ephemeral,
        })
      } else {
        await interaction.reply({
          content: 'Not on vacation. Use `/vacation until:<duration>` to set one.',
          flags: MessageFlags.Ephemeral,
        })
      }
      return
    }

    const until = parseDuration(untilInput)
    if (!until) {
      await interaction.reply({
        content:
          'Could not understand that duration. Try:\n' +
          '• `5 days`, `1 week`, `2 weeks`, `1 month`, `2 months`\n' +
          '• An ISO date like `2026-07-20`',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await db
      .update(users)
      .set({ inactiveUntil: until })
      .where(eq(users.id, userId))

    const formattedDate = until.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    await interaction.reply({
      content: `Vacation mode set until **${formattedDate}**. Your market orders are now hidden.`,
      flags: MessageFlags.Ephemeral,
    })
  },
}
