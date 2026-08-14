import { settingsService } from '@kawakawa/services/settings'

export interface BotConfig {
  token: string
  clientId: string
  guildId: string | null
}

let cachedConfig: BotConfig | null = null
let cachedWebUrl: string | null = null

// Default web URL for development
const DEFAULT_WEB_URL = 'http://localhost:5173'

/**
 * Get bot configuration from database settings.
 * Caches the result until invalidateConfig() is called.
 */
export async function getConfig(): Promise<BotConfig> {
  if (cachedConfig) {
    return cachedConfig
  }

  const settings = await settingsService.getAll('discord.')

  const token = settings['discord.botToken']
  const clientId = settings['discord.clientId']
  const guildId = settings['discord.guildId'] || null

  if (!token) {
    throw new Error('Discord bot token not configured. Set discord.botToken in Admin Panel.')
  }

  if (!clientId) {
    throw new Error('Discord client ID not configured. Set discord.clientId in Admin Panel.')
  }

  cachedConfig = { token, clientId, guildId }
  return cachedConfig
}

/**
 * Get the web application URL for generating links.
 * Reads from app.webUrl setting, falls back to default for development.
 *
 * Returned **without** a trailing slash, so callers can safely append a path.
 * `app.webUrl` is admin-editable free text and was in fact stored as
 * `http://localhost:5173/`, which produced `//link-discord?token=...`. That does
 * not match the `/link-discord` route, so it fell through to the catch-all and
 * redirected to /market — carrying the query string along, which made it look
 * like a routing bug rather than a malformed link. Normalising here rather than
 * at each call site because the next person to build a URL will not know.
 */
export async function getWebUrl(): Promise<string> {
  if (cachedWebUrl) {
    return cachedWebUrl
  }

  const settings = await settingsService.getAll('app.')
  const configured = settings['app.webUrl']?.trim() || DEFAULT_WEB_URL
  cachedWebUrl = configured.replace(/\/+$/, '')

  return cachedWebUrl
}
