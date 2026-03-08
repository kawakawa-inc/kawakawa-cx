/**
 * Main Parser
 *
 * Orchestrates tokenization and identification to produce ParseResult.
 * Handles quantity-commodity pairing and conflict detection.
 */

import type {
  ParseResult,
  TokenResolvers,
  IdentifiedToken,
  ResolvedCommodity,
  ResolvedLocation,
  ResolvedUser,
  ActionKeyword,
  RawToken,
} from './types.js'
import { tokenize, isCommaSeparatedList } from './tokenizer.js'
import { identifyTokens, resolveCommaSeparatedCommodities } from './identifier.js'
import { parseXitJson } from './xit/parser.js'

/**
 * Pattern for pairing numbers with commodities.
 */
type PairPattern = 'qty-first' | 'ticker-first' | 'unknown'

/**
 * Detect the pairing pattern from identified tokens.
 * Looks for the first adjacent number/commodity pair.
 */
function detectPairPattern(tokens: IdentifiedToken[]): PairPattern {
  for (let i = 0; i < tokens.length - 1; i++) {
    const current = tokens[i]
    const next = tokens[i + 1]

    if (current.type === 'number' && next.type === 'commodity') {
      return 'qty-first'
    }
    if (current.type === 'commodity' && next.type === 'number') {
      return 'ticker-first'
    }
  }

  return 'unknown'
}

/**
 * Parse an input string into a structured result.
 *
 * @param input - The input string to parse
 * @param resolvers - Resolver functions for lookups
 * @returns Parse result with items, location, user, etc.
 */
export async function parseTokens(input: string, resolvers: TokenResolvers): Promise<ParseResult> {
  const result: ParseResult = {
    items: [],
    location: null,
    user: null,
    xit: null,
    actions: new Set(),
    limit: null,
    unresolved: [],
    errors: [],
  }

  if (!input.trim()) {
    return result
  }

  // Step 1: Tokenize
  const { tokens: rawTokens, jsonString } = tokenize(input)

  // Step 2: Handle XIT JSON if present
  if (jsonString) {
    result.xit = parseXitJson(jsonString)
  }

  // Step 3: Check for comma-separated commodity list at start
  // This is a special format: "COF,CAF,H2O BEN 500"
  if (rawTokens.length > 0 && isCommaSeparatedList(rawTokens[0].value)) {
    return parseCommaSeparatedFormat(rawTokens, resolvers, result)
  }

  // Step 4: Identify all tokens
  const identifiedTokens = await identifyTokens(rawTokens, resolvers)

  // Step 5: Detect pairing pattern
  const pattern = detectPairPattern(identifiedTokens)

  // Step 6: Process tokens and build result
  return processIdentifiedTokens(identifiedTokens, pattern, result)
}

/**
 * Parse comma-separated format: "COF,CAF,H2O BEN 500"
 */
async function parseCommaSeparatedFormat(
  rawTokens: RawToken[],
  resolvers: TokenResolvers,
  result: ParseResult
): Promise<ParseResult> {
  // First token is the comma-separated list
  const listToken = rawTokens[0]
  const { commodities, unresolved } = await resolveCommaSeparatedCommodities(
    listToken.value,
    resolvers
  )

  // Add unresolved tickers to the result
  result.unresolved.push(...unresolved)

  // Identify remaining tokens
  const remainingRaw = rawTokens.slice(1)
  const identifiedTokens = await identifyTokens(remainingRaw, resolvers)

  // Look for shared quantity and other tokens
  let sharedQuantity: number | null = null

  for (const token of identifiedTokens) {
    switch (token.type) {
      case 'number':
        // In comma-separated mode, standalone number is the shared quantity
        sharedQuantity = parseInt(token.value, 10)
        break

      case 'location':
        if (result.location) {
          result.errors.push(
            `Multiple locations: "${result.location.name}" and "${(token.resolved as ResolvedLocation).name}"`
          )
        } else {
          result.location = token.resolved as ResolvedLocation
        }
        break

      case 'user':
        if (result.user) {
          result.errors.push(
            `Multiple users: "${result.user.username}" and "${(token.resolved as ResolvedUser).username}"`
          )
        } else {
          result.user = token.resolved as ResolvedUser
        }
        break

      case 'action':
        result.actions.add(token.value as ActionKeyword)
        break

      case 'limit':
        result.limit = token.limitData ?? null
        break

      case 'unresolved':
        result.unresolved.push(token.value)
        break
    }
  }

  // Build items from commodities with shared quantity
  for (const { resolved } of commodities) {
    result.items.push({
      commodity: resolved,
      quantity: sharedQuantity,
    })
  }

  return result
}

/**
 * Process identified tokens with pattern-based quantity pairing.
 */
function processIdentifiedTokens(
  tokens: IdentifiedToken[],
  pattern: PairPattern,
  result: ParseResult
): ParseResult {
  const paired = new Set<number>()

  // First pass: pair numbers with commodities
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token.type === 'number') {
      const prevToken = tokens[i - 1]
      const nextToken = tokens[i + 1]

      const prevIsCommodity = prevToken?.type === 'commodity' && !paired.has(i - 1)
      const nextIsCommodity = nextToken?.type === 'commodity' && !paired.has(i + 1)

      let pairedIndex: number | null = null

      // Use detected pattern for pairing
      if (pattern === 'ticker-first' && prevIsCommodity) {
        pairedIndex = i - 1
      } else if (pattern === 'qty-first' && nextIsCommodity) {
        pairedIndex = i + 1
      } else if (prevIsCommodity) {
        // Fallback: prefer previous if available
        pairedIndex = i - 1
      } else if (nextIsCommodity) {
        // Fallback: try next
        pairedIndex = i + 1
      }

      if (pairedIndex !== null) {
        const commodityToken = tokens[pairedIndex]
        result.items.push({
          commodity: commodityToken.resolved as ResolvedCommodity,
          quantity: parseInt(token.value, 10),
        })
        paired.add(i)
        paired.add(pairedIndex)
      }
    }
  }

  // Second pass: collect remaining tokens
  for (let i = 0; i < tokens.length; i++) {
    if (paired.has(i)) continue

    const token = tokens[i]

    switch (token.type) {
      case 'commodity':
        // Unpaired commodity - add with null quantity
        result.items.push({
          commodity: token.resolved as ResolvedCommodity,
          quantity: null,
        })
        break

      case 'number':
        // Unpaired number - add to unresolved
        result.unresolved.push(token.value)
        break

      case 'location':
        if (result.location) {
          result.errors.push(
            `Multiple locations: "${result.location.name}" and "${(token.resolved as ResolvedLocation).name}"`
          )
        } else {
          result.location = token.resolved as ResolvedLocation
        }
        break

      case 'user':
        if (result.user) {
          result.errors.push(
            `Multiple users: "${result.user.username}" and "${(token.resolved as ResolvedUser).username}"`
          )
        } else {
          result.user = token.resolved as ResolvedUser
        }
        break

      case 'action':
        result.actions.add(token.value as ActionKeyword)
        break

      case 'limit':
        result.limit = token.limitData ?? null
        break

      case 'json':
        // Already handled by tokenizer
        break

      case 'unresolved':
        result.unresolved.push(token.value)
        break
    }
  }

  return result
}
