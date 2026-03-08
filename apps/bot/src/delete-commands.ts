/**
 * Delete Discord slash commands.
 *
 * Usage:
 *   pnpm delete-commands          # Delete global commands only
 *   pnpm delete-commands --guild  # Delete guild commands only
 *   pnpm delete-commands --all    # Delete both global and guild commands
 */
import { REST, Routes } from 'discord.js'
import { getConfig } from './config.js'
import logger from './utils/logger.js'

interface DiscordCommand {
  id: string
  name: string
}

async function deleteGlobalCommands(rest: REST, clientId: string): Promise<void> {
  logger.info('Fetching global commands...')

  const commands = (await rest.get(Routes.applicationCommands(clientId))) as DiscordCommand[]

  if (commands.length === 0) {
    logger.info('No global commands to delete')
    return
  }

  logger.info({ count: commands.length }, 'Deleting global commands...')

  for (const command of commands) {
    await rest.delete(Routes.applicationCommand(clientId, command.id))
    logger.info({ name: command.name, id: command.id }, 'Deleted global command')
  }

  logger.info({ count: commands.length }, 'Global commands deleted')
}

async function deleteGuildCommands(rest: REST, clientId: string, guildId: string): Promise<void> {
  logger.info({ guildId }, 'Fetching guild commands...')

  const commands = (await rest.get(
    Routes.applicationGuildCommands(clientId, guildId)
  )) as DiscordCommand[]

  if (commands.length === 0) {
    logger.info({ guildId }, 'No guild commands to delete')
    return
  }

  logger.info({ guildId, count: commands.length }, 'Deleting guild commands...')

  for (const command of commands) {
    await rest.delete(Routes.applicationGuildCommand(clientId, guildId, command.id))
    logger.info({ guildId, name: command.name, id: command.id }, 'Deleted guild command')
  }

  logger.info({ guildId, count: commands.length }, 'Guild commands deleted')
}

async function main(): Promise<void> {
  const config = await getConfig()
  const rest = new REST().setToken(config.token)

  const args = process.argv.slice(2)
  const deleteGuild = args.includes('--guild') || args.includes('--all')
  const deleteGlobal = args.includes('--all') || !args.includes('--guild')

  if (deleteGlobal) {
    try {
      await deleteGlobalCommands(rest, config.clientId)
    } catch (error) {
      logger.error({ error }, 'Failed to delete global commands')
    }
  }

  if (deleteGuild) {
    if (!config.guildId) {
      logger.warn('DISCORD_GUILD_ID not set, skipping guild commands')
    } else {
      try {
        await deleteGuildCommands(rest, config.clientId, config.guildId)
      } catch (error) {
        logger.error({ error, guildId: config.guildId }, 'Failed to delete guild commands')
      }
    }
  }

  logger.info('Done!')
  process.exit(0)
}

main().catch(error => {
  logger.error({ error }, 'Failed to delete commands')
  process.exit(1)
})
