/**
 * Tokenizer
 *
 * Splits input string into raw tokens, handling:
 * - Multiple separators (spaces, commas, tabs, newlines)
 * - XIT JSON detection (braces matching)
 *
 * Note: Multi-word location handling is done in the identifier,
 * not in the tokenizer. The tokenizer produces individual tokens.
 */

import type { RawToken, RawTokenType } from './types.js'

/**
 * Result of tokenization.
 */
export interface TokenizeResult {
  /** Raw tokens extracted from input */
  tokens: RawToken[]
  /** XIT JSON string if detected */
  jsonString: string | null
}

/**
 * Separator pattern: whitespace only (spaces, tabs, newlines)
 * Commas within tokens are preserved (e.g., "COF,CAF,H2O")
 */
const SEPARATOR_PATTERN = /\s+/

/**
 * Action keywords recognized by the parser.
 */
const ACTION_KEYWORDS = new Set(['send', 'close', 'submit', 'done', 'finish'])

/**
 * Limit modifier patterns.
 * reserve:N, r:N, max:N, m:N
 */
const LIMIT_PATTERN = /^(?:reserve|r|max|m):(\d+)$/i

/**
 * Explicit prefix patterns.
 */
const EXPLICIT_PREFIXES = {
  user: /^user:(.+)$/i,
  commodity: /^commodity:(.+)$/i,
  location: /^location:(.+)$/i,
}

/**
 * Check if a string is purely numeric.
 */
function isNumeric(value: string): boolean {
  return /^\d+$/.test(value)
}

/**
 * Find the matching closing brace for an opening brace.
 * Returns -1 if no matching brace is found.
 */
function findMatchingBrace(input: string, startIndex: number): number {
  let depth = 0

  for (let i = startIndex; i < input.length; i++) {
    const char = input[i]

    if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }

  return -1 // No matching brace found
}

/**
 * Extract XIT JSON from input if present.
 * Returns the JSON string and the remaining input.
 */
function extractJson(input: string): { jsonString: string | null; remaining: string } {
  const jsonStart = input.indexOf('{')

  if (jsonStart === -1) {
    return { jsonString: null, remaining: input }
  }

  const jsonEnd = findMatchingBrace(input, jsonStart)

  if (jsonEnd === -1) {
    // Unmatched brace - treat as regular token
    return { jsonString: null, remaining: input }
  }

  const jsonString = input.slice(jsonStart, jsonEnd + 1)
  const before = input.slice(0, jsonStart)
  const after = input.slice(jsonEnd + 1)

  return {
    jsonString,
    remaining: before + ' ' + after,
  }
}

/**
 * Determine the raw type of a token based on its content.
 * This does NOT resolve commodities/locations/users - that's the identifier's job.
 */
function classifyToken(value: string): RawTokenType {
  // Numbers
  if (isNumeric(value)) {
    return 'number'
  }

  // Action keywords
  if (ACTION_KEYWORDS.has(value.toLowerCase())) {
    return 'action'
  }

  // Limit modifiers
  if (LIMIT_PATTERN.test(value)) {
    return 'limit'
  }

  // Explicit prefixes
  if (EXPLICIT_PREFIXES.user.test(value)) {
    return 'explicit_user'
  }
  if (EXPLICIT_PREFIXES.commodity.test(value)) {
    return 'explicit_commodity'
  }
  if (EXPLICIT_PREFIXES.location.test(value)) {
    return 'explicit_location'
  }

  // Everything else needs resolution
  return 'unknown'
}

/**
 * Tokenize an input string into raw tokens.
 *
 * @param input - The input string to tokenize
 * @returns Tokenization result with tokens and optional JSON
 */
export function tokenize(input: string): TokenizeResult {
  const trimmed = input.trim()

  if (!trimmed) {
    return { tokens: [], jsonString: null }
  }

  // Extract JSON first (if present)
  const { jsonString, remaining } = extractJson(trimmed)

  // Split remaining input by separators
  const tokens: RawToken[] = []
  let position = 0

  // Use split with tracking of original positions
  const parts = remaining.split(SEPARATOR_PATTERN)

  for (const part of parts) {
    if (!part) {
      continue
    }

    // Strip trailing comma (from inputs like "COF, BEN, 100")
    // Comma-separated lists like "COF,CAF,H2O" are preserved (only trailing comma removed)
    const value = part.replace(/,$/, '')

    if (!value) {
      continue
    }

    const token: RawToken = {
      type: classifyToken(value),
      value,
      position,
    }

    tokens.push(token)
    position += part.length + 1 // Approximate position tracking
  }

  return { tokens, jsonString }
}

/**
 * Parse a limit modifier value.
 * Returns the mode and quantity.
 */
export function parseLimitModifier(
  value: string
): { mode: 'reserve' | 'max_sell'; quantity: number } | null {
  const match = value.match(LIMIT_PATTERN)

  if (!match) {
    return null
  }

  const prefix = value.split(':')[0].toLowerCase()
  const quantity = parseInt(match[1], 10)

  if (prefix === 'reserve' || prefix === 'r') {
    return { mode: 'reserve', quantity }
  }

  if (prefix === 'max' || prefix === 'm') {
    return { mode: 'max_sell', quantity }
  }

  return null
}

/**
 * Extract value from an explicit prefix token.
 */
export function extractExplicitValue(
  value: string,
  prefix: 'user' | 'commodity' | 'location'
): string | null {
  const pattern = EXPLICIT_PREFIXES[prefix]
  const match = value.match(pattern)

  return match ? match[1] : null
}

/**
 * Check if a token is a comma-separated list of items.
 */
export function isCommaSeparatedList(value: string): boolean {
  // Must contain at least one comma and no spaces
  // Also, each part should be non-empty
  if (!value.includes(',') || value.includes(' ')) {
    return false
  }

  const parts = value.split(',')
  return parts.length > 1 && parts.every(part => part.trim().length > 0)
}

/**
 * Split a comma-separated list into its parts.
 */
export function splitCommaSeparatedList(value: string): string[] {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0)
}
