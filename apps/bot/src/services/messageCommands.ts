/**
 * Message Command Handler
 *
 * Parses and handles text-based commands (prefix commands like !help, !buy, etc.).
 * Works alongside slash commands to provide an alternative input method.
 *
 * Prefix resolution order:
 * 1. Channel-specific commandPrefix
 * 2. Default commandPrefix (channelId = '0')
 * 3. DM: matches any configured prefix (cached for performance)
 * 4. No prefix configured for guild channels: ignore messages
 */

import type { Message } from 'discord.js'
import type { BotClient, Command } from '../client.js'
import { getChannelConfig } from './channelConfig.js'
import { db, channelConfig } from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import { MessageInteractionAdapter } from '../adapters/messageInteraction.js'
import logger from '../utils/logger.js'
import { touchActivity } from '../utils/auth.js'

/** Default prefix for DMs when no prefixes are configured anywhere */
const DM_DEFAULT_PREFIX = '!'

/** Cache TTL in milliseconds (5 minutes) */
const PREFIX_CACHE_TTL = 5 * 60 * 1000

/** Cached list of all configured command prefixes */
let cachedPrefixes: string[] | null = null
let cacheTimestamp = 0

/**
 * Get all unique command prefixes from the database.
 * Results are cached for performance.
 */
export async function getAllPrefixes(): Promise<string[]> {
  const now = Date.now()

  // Return cached value if still valid
  if (cachedPrefixes !== null && now - cacheTimestamp < PREFIX_CACHE_TTL) {
    return cachedPrefixes
  }

  // Fetch all commandPrefix values from database
  const rows = await db
    .select({ value: channelConfig.value })
    .from(channelConfig)
    .where(eq(channelConfig.key, 'commandPrefix'))

  // Each commandPrefix value is a string of allowed prefix characters (e.g., "!?" means both ! and ?)
  const rawPrefixes = rows.map(r => r.value).filter(Boolean)
  const prefixes = expandPrefixes(rawPrefixes)

  // Update cache
  cachedPrefixes = prefixes
  cacheTimestamp = now

  logger.debug({ prefixCount: prefixes.length }, 'Refreshed command prefix cache')

  return prefixes
}

/**
 * Clear the prefix cache. Useful for testing or when config changes.
 */
export function clearPrefixCache(): void {
  cachedPrefixes = null
  cacheTimestamp = 0
}

/**
 * Expand prefix strings into individual prefix characters.
 * Each character in a prefix string is treated as a separate valid prefix.
 * e.g., "!?" becomes ["!", "?"], "!" stays ["!"]
 */
export function expandPrefixes(prefixStrings: string[]): string[] {
  const chars = new Set<string>()
  for (const str of prefixStrings) {
    for (const ch of str) {
      chars.add(ch)
    }
  }
  return [...chars]
}

/**
 * Find a matching prefix character from message content.
 * Returns the matching prefix or null if none match.
 */
export function findMatchingPrefix(content: string, prefixes: string[]): string | null {
  if (content.length === 0) return null

  const firstChar = content[0]
  for (const prefix of prefixes) {
    if (prefix === firstChar) {
      return prefix
    }
  }

  return null
}

/**
 * Get the effective command prefix for a channel.
 *
 * @param channelId - The Discord channel ID
 * @param isDM - Whether this is a DM channel
 * @returns The command prefix, or null if prefix commands are disabled
 */
export async function getEffectivePrefix(channelId: string, isDM: boolean): Promise<string | null> {
  // Get channel config (includes fallback to defaults)
  const config = await getChannelConfig(channelId)

  if (config?.commandPrefix) {
    return config.commandPrefix
  }

  // For DMs, default to '!' if no prefix configured
  if (isDM) {
    return DM_DEFAULT_PREFIX
  }

  // No prefix configured for this guild channel
  return null
}

/**
 * Parse command arguments from message content.
 *
 * For now, we use a simple approach:
 * - First token after prefix is the command name
 * - Remaining content is passed as the 'input' option (for commands that support it)
 *
 * This allows commands like:
 * - !help → command: 'help', input: null
 * - !buy DW 1000 BEN → command: 'buy', input: 'DW 1000 BEN'
 * - !query COF BEN → command: 'query', input: 'COF BEN'
 *
 * @param content - Message content after the prefix
 * @returns Parsed command name and options
 */
function parseCommandArgs(content: string): {
  commandName: string | null
  options: Map<string, string | number | boolean | null>
} {
  const trimmed = content.trim()
  const parts = trimmed.split(/\s+/)

  if (parts.length === 0 || !parts[0]) {
    return { commandName: null, options: new Map() }
  }

  const commandName = parts[0].toLowerCase()
  const options = new Map<string, string | number | boolean | null>()

  // Everything after the command name is the primary text argument.
  // Set it under multiple option names so commands with different
  // primary option names all receive the value via prefix commands.
  if (parts.length > 1) {
    const inputValue = parts.slice(1).join(' ')
    options.set('input', inputValue)
    options.set('query', inputValue) // /query
    options.set('target', inputValue) // /close
    options.set('topic', inputValue) // /help

    // For commands that take a numeric ID as primary argument (e.g., /invoice <id>)
    const numericValue = parseInt(inputValue, 10)
    if (!isNaN(numericValue) && numericValue.toString() === inputValue.trim()) {
      options.set('id', numericValue)
    }
  }

  return { commandName, options }
}

/**
 * Handle an incoming message, checking for prefix commands.
 *
 * @param message - The Discord message
 * @param client - The bot client with registered commands
 */
export async function handleMessageCommand(message: Message, client: BotClient): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) {
    return
  }

  // Ignore messages without content
  if (!message.content) {
    return
  }

  // Determine if this is a DM
  const isDM = message.channel.isDMBased()

  let prefix: string | null

  if (isDM) {
    // For DMs, match against any configured prefix
    // This allows users to continue using the same prefix they use in channels
    const allPrefixes = await getAllPrefixes()

    if (allPrefixes.length > 0) {
      prefix = findMatchingPrefix(message.content, allPrefixes)
    } else {
      // No prefixes configured anywhere, use default
      prefix = message.content.startsWith(DM_DEFAULT_PREFIX) ? DM_DEFAULT_PREFIX : null
    }
  } else {
    // For guild channels, use channel-specific prefix
    const channelPrefixStr = await getEffectivePrefix(message.channelId, isDM)
    if (channelPrefixStr) {
      // Each character in the prefix string is a valid prefix
      const validPrefixes = expandPrefixes([channelPrefixStr])
      prefix = findMatchingPrefix(message.content, validPrefixes)
    } else {
      prefix = null
    }
  }

  // No prefix matched - ignore message
  if (!prefix) {
    return
  }

  // Extract command content (everything after prefix)
  const commandContent = message.content.slice(prefix.length)

  // Parse command and arguments
  const { commandName, options } = parseCommandArgs(commandContent)

  if (!commandName) {
    return
  }

  // Look up command - try exact match first
  let command = client.commands.get(commandName)

  if (!command) {
    // Try partial match - find all commands that start with the input
    const partialMatches: Command[] = []
    for (const [name, cmd] of client.commands) {
      if (name.startsWith(commandName) && cmd.prefixEnabled !== false) {
        partialMatches.push(cmd)
      }
    }

    if (partialMatches.length === 1) {
      // Exactly one match - use it
      command = partialMatches[0]
    } else if (partialMatches.length > 1) {
      // Multiple matches - show disambiguation message
      const matchList = partialMatches
        .map(cmd => `• **${prefix}${cmd.data.name}** - ${cmd.data.description}`)
        .join('\n')
      await message.reply({
        content: `Did you mean one of these commands?\n${matchList}`,
        allowedMentions: { repliedUser: false },
      })
      return
    } else {
      // No partial matches - try fuzzy matching for typos
      const fuzzyMatches = findFuzzyMatches(commandName, client.commands)
      if (fuzzyMatches.length > 0) {
        const suggestions = fuzzyMatches.map(cmd => `\`${prefix}${cmd.data.name}\``).join(' or ')
        await message.reply({
          content: `Did you mean ${suggestions}?`,
          allowedMentions: { repliedUser: false },
        })
      }
      return
    }
  }

  // Check if command allows prefix invocation
  if (command.prefixEnabled === false) {
    // Command explicitly disabled for prefix - ignore silently
    // User must use slash command for this
    return
  }

  // Use the actual command name (may differ from input if partial match was used)
  const actualCommandName = command.data.name

  // Extract subcommand from input if the command has subcommands
  // e.g., "!order buy COF Katoa 500" → subcommand="buy", input="COF Katoa 500"
  let subcommandName: string | null = null
  const commandJson = command.data.toJSON() as { options?: { type: number; name: string }[] }
  const subcommandNames = (commandJson.options ?? [])
    .filter(opt => opt.type === 1) // ApplicationCommandOptionType.Subcommand = 1
    .map(opt => opt.name)

  if (subcommandNames.length > 0) {
    const inputValue = options.get('input')
    if (typeof inputValue === 'string') {
      const firstWord = inputValue.split(/\s+/)[0]?.toLowerCase()
      if (firstWord && subcommandNames.includes(firstWord)) {
        subcommandName = firstWord
        // Remove subcommand from input, leaving just the arguments
        const remaining = inputValue.slice(firstWord.length).trim()
        if (remaining) {
          options.set('input', remaining)
          options.set('query', remaining)
          options.set('target', remaining)
          options.set('topic', remaining)
        } else {
          options.set('input', null)
          options.set('query', null)
          options.set('target', null)
          options.set('topic', null)
        }
      }
    }

    // If no valid subcommand found, show usage help
    if (!subcommandName) {
      const subcommandList = subcommandNames
        .map(name => `\`${prefix}${actualCommandName} ${name}\``)
        .join(', ')
      await message.reply({
        content: `Please specify a subcommand: ${subcommandList}`,
        allowedMentions: { repliedUser: false },
      })
      return
    }
  }

  // Create adapter to make message look like an interaction
  const adapter = new MessageInteractionAdapter(
    message,
    actualCommandName,
    options,
    prefix,
    subcommandName
  )

  // Log command invocation
  const startTime = Date.now()
  const logContext = {
    command: actualCommandName,
    input: commandName !== actualCommandName ? commandName : undefined, // Log partial input if different
    userId: message.author.id,
    username: message.author.username,
    guildId: message.guildId,
    source: 'prefix',
    prefix,
  }

  logger.info(logContext, 'Prefix command invoked')
  touchActivity(message.author.id)

  try {
    // Execute command with adapter
    // Cast is needed because commands expect ChatInputCommandInteraction
    // but our adapter provides a compatible interface
    await command.execute(adapter as unknown as Parameters<Command['execute']>[0])

    logger.info({ ...logContext, durationMs: Date.now() - startTime }, 'Prefix command completed')
  } catch (error) {
    logger.error(
      { ...logContext, error, durationMs: Date.now() - startTime },
      'Prefix command failed'
    )

    // Send error message
    try {
      if (adapter.replied || adapter.deferred) {
        await adapter.followUp('There was an error executing this command.')
      } else {
        await adapter.reply('There was an error executing this command.')
      }
    } catch {
      // Ignore follow-up errors
    }
  }
}

const MAX_FUZZY_DISTANCE = 2

/**
 * Damerau-Levenshtein distance between two strings.
 * Handles insertions, deletions, substitutions, and transpositions.
 */
function damerauLevenshtein(a: string, b: string): number {
  const lenA = a.length
  const lenB = b.length

  // Quick exits
  if (lenA === 0) return lenB
  if (lenB === 0) return lenA
  if (Math.abs(lenA - lenB) > MAX_FUZZY_DISTANCE) return MAX_FUZZY_DISTANCE + 1

  const d: number[][] = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0))

  for (let i = 0; i <= lenA; i++) d[i][0] = i
  for (let j = 0; j <= lenB; j++) d[0][j] = j

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      )
      // transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost)
      }
    }
  }

  return d[lenA][lenB]
}

/**
 * Find commands that are within edit distance 2 of the input.
 * Only considers prefix-enabled commands.
 */
function findFuzzyMatches(input: string, commands: Map<string, Command>): Command[] {
  const matches: { cmd: Command; distance: number }[] = []

  for (const [name, cmd] of commands) {
    if (cmd.prefixEnabled === false) continue
    const dist = damerauLevenshtein(input, name)
    if (dist <= MAX_FUZZY_DISTANCE) {
      matches.push({ cmd, distance: dist })
    }
  }

  // Sort by distance (closest first), then alphabetically
  matches.sort((a, b) => a.distance - b.distance || a.cmd.data.name.localeCompare(b.cmd.data.name))
  return matches.map(m => m.cmd)
}
