/**
 * Parser Resolvers for Discord Bot
 *
 * Wraps existing bot services to implement the TokenResolvers interface
 * from @kawakawa/parser. This enables dependency injection so the parser
 * can work with different resolution strategies (bot, web, tests).
 */

import type {
  TokenResolvers,
  ResolvedCommodity,
  ResolvedLocation,
  ResolvedUser,
} from '@kawakawa/parser'
import { resolveCommodity as commodityResolve } from '../services/commodityService.js'
import { resolveLocation as locationResolve } from '../services/locationService.js'
import { findUserByName, findUserByDiscordId } from '../services/invoiceService.js'

/**
 * Resolve a token to a commodity using the bot's commodity service.
 */
async function resolveCommodity(token: string): Promise<ResolvedCommodity | null> {
  const result = await commodityResolve(token)
  if (!result) return null

  return {
    ticker: result.ticker,
    name: result.name,
  }
}

/**
 * Resolve a token to a location using the bot's location service.
 */
async function resolveLocation(token: string): Promise<ResolvedLocation | null> {
  const result = await locationResolve(token)
  if (!result) return null

  // Convert the location type to the expected union type
  const type = normalizeLocationType(result.type)

  return {
    naturalId: result.naturalId,
    name: result.name,
    type,
  }
}

/**
 * Normalize location type string to the expected union type.
 */
function normalizeLocationType(type: string): 'planet' | 'station' | 'warehouse' {
  const lower = type.toLowerCase()
  if (lower === 'station') return 'station'
  if (lower === 'warehouse') return 'warehouse'
  return 'planet' // Default to planet for planets and unknown types
}

/**
 * Resolve a token to a user using the bot's invoice service.
 */
async function resolveUser(token: string): Promise<ResolvedUser | null> {
  const result = await findUserByName(token)
  if (!result) return null

  return {
    userId: result.userId,
    username: result.username,
    displayName: result.displayName,
    fioUsername: result.fioUsername,
  }
}

/**
 * Resolve a Discord mention (<@123456>) to a user using their Discord ID.
 */
async function resolveDiscordMention(discordId: string): Promise<ResolvedUser | null> {
  const result = await findUserByDiscordId(discordId)
  if (!result) return null

  return {
    userId: result.userId,
    username: result.username,
    displayName: result.displayName,
    fioUsername: result.fioUsername,
  }
}

/**
 * Bot resolver implementations for the token parser.
 *
 * Usage:
 * ```typescript
 * import { parseTokens } from '@kawakawa/parser'
 * import { botResolvers } from '../utils/resolvers.js'
 *
 * const result = await parseTokens(input, botResolvers)
 * ```
 */
export const botResolvers: TokenResolvers = {
  resolveCommodity,
  resolveLocation,
  resolveUser,
  resolveDiscordMention,
}
