/**
 * Token Identifier
 *
 * Identifies token types using resolver functions.
 * Handles resolution order, explicit prefixes, and multi-word locations.
 */

import type { RawToken, IdentifiedToken, TokenResolvers, ResolvedCommodity } from './types.js'
import {
  parseLimitModifier,
  extractExplicitValue,
  isCommaSeparatedList,
  splitCommaSeparatedList,
} from './tokenizer.js'

/**
 * Action keyword to ActionKeyword type mapping.
 */
const ACTION_MAPPING: Record<string, 'send' | 'close'> = {
  send: 'send',
  close: 'close',
  submit: 'send',
  done: 'send',
  finish: 'send',
}

/**
 * Identify a single token's type and resolve it if needed.
 */
async function identifySingleToken(
  token: RawToken,
  resolvers: TokenResolvers
): Promise<IdentifiedToken> {
  const { type, value, position } = token

  // Already classified types
  switch (type) {
    case 'number':
      return { type: 'number', value, position }

    case 'action':
      return { type: 'action', value: ACTION_MAPPING[value.toLowerCase()] || value, position }

    case 'limit': {
      const limitData = parseLimitModifier(value)
      return {
        type: 'limit',
        value,
        position,
        limitData: limitData ?? undefined,
      }
    }

    case 'explicit_user': {
      const username = extractExplicitValue(value, 'user')
      if (username) {
        const resolved = await resolvers.resolveUser(username)
        if (resolved) {
          return { type: 'user', value, position, resolved }
        }
      }
      return { type: 'unresolved', value, position }
    }

    case 'explicit_commodity': {
      const ticker = extractExplicitValue(value, 'commodity')
      if (ticker) {
        const resolved = await resolvers.resolveCommodity(ticker)
        if (resolved) {
          return { type: 'commodity', value, position, resolved }
        }
      }
      return { type: 'unresolved', value, position }
    }

    case 'explicit_location': {
      const locationId = extractExplicitValue(value, 'location')
      if (locationId) {
        const resolved = await resolvers.resolveLocation(locationId)
        if (resolved) {
          return { type: 'location', value, position, resolved }
        }
      }
      return { type: 'unresolved', value, position }
    }

    case 'json':
      return { type: 'json', value, position }

    case 'unknown':
    default:
      // Need to resolve - try commodity, location, user in order
      break
  }

  // Handle comma-separated list (multiple commodities)
  // This is handled in the parser, not here - just mark as unknown for now
  if (isCommaSeparatedList(value)) {
    // Return as-is, parser will handle expanding
    return { type: 'unresolved', value, position }
  }

  // Try to resolve as commodity first (most common)
  const commodity = await resolvers.resolveCommodity(value)
  if (commodity) {
    return { type: 'commodity', value, position, resolved: commodity }
  }

  // Try to resolve as location
  const location = await resolvers.resolveLocation(value)
  if (location) {
    return { type: 'location', value, position, resolved: location }
  }

  // Try to resolve as user
  const user = await resolvers.resolveUser(value)
  if (user) {
    return { type: 'user', value, position, resolved: user }
  }

  // Could not resolve
  return { type: 'unresolved', value, position }
}

/**
 * Try to resolve a multi-word location from consecutive tokens.
 * Returns the number of tokens consumed and the resolved location, or null.
 */
async function tryMultiWordLocation(
  tokens: RawToken[],
  startIndex: number,
  resolvers: TokenResolvers
): Promise<{ consumed: number; token: IdentifiedToken } | null> {
  const maxWords = Math.min(3, tokens.length - startIndex)

  for (let len = maxWords; len > 1; len--) {
    // Only try if all tokens in range are 'unknown' type
    const slice = tokens.slice(startIndex, startIndex + len)
    if (!slice.every(t => t.type === 'unknown')) {
      continue
    }

    const combined = slice.map(t => t.value).join(' ')
    const location = await resolvers.resolveLocation(combined)

    if (location) {
      return {
        consumed: len,
        token: {
          type: 'location',
          value: combined,
          position: tokens[startIndex].position,
          resolved: location,
        },
      }
    }
  }

  return null
}

/**
 * Identify token types using the provided resolvers.
 *
 * Resolution order for unknown tokens:
 * 1. Multi-word location (try 3-word, 2-word combinations)
 * 2. Commodity (via resolver)
 * 3. Location (via resolver)
 * 4. User (via resolver)
 * 5. Unresolved
 *
 * @param tokens - Raw tokens to identify
 * @param resolvers - Resolver functions for lookups
 * @returns Identified tokens with resolved data
 */
export async function identifyTokens(
  tokens: RawToken[],
  resolvers: TokenResolvers
): Promise<IdentifiedToken[]> {
  const identified: IdentifiedToken[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]

    // For unknown tokens, try multi-word location first
    if (token.type === 'unknown') {
      const multiWord = await tryMultiWordLocation(tokens, i, resolvers)
      if (multiWord) {
        identified.push(multiWord.token)
        i += multiWord.consumed
        continue
      }
    }

    // Single token identification
    const identifiedToken = await identifySingleToken(token, resolvers)
    identified.push(identifiedToken)
    i++
  }

  return identified
}

/**
 * Resolve a comma-separated list of commodities.
 * Returns resolved commodities and any unresolved tickers.
 */
export async function resolveCommaSeparatedCommodities(
  value: string,
  resolvers: TokenResolvers
): Promise<{
  commodities: Array<{ ticker: string; resolved: ResolvedCommodity }>
  unresolved: string[]
}> {
  const parts = splitCommaSeparatedList(value)
  const commodities: Array<{ ticker: string; resolved: ResolvedCommodity }> = []
  const unresolved: string[] = []

  for (const part of parts) {
    const resolved = await resolvers.resolveCommodity(part)
    if (resolved) {
      commodities.push({ ticker: part, resolved })
    } else {
      unresolved.push(part)
    }
  }

  return { commodities, unresolved }
}
