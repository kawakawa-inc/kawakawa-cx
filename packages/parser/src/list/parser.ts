/**
 * List Parser Implementation
 *
 * Parses commodity lists from multiple input formats:
 * - XIT JSON (PRUNplanner ACT format with groups/materials)
 * - CSV format (TICKER,QTY or TICKER QTY pairs with comma/space/tab separators)
 * - Simple format (single TICKER QTY pair)
 * - FIO format (game clipboard format)
 */

import type { ListFormat, ListItem, ListParseResult } from '../types.js'
import { parseXitJson, isXitJson } from '../xit/parser.js'

/**
 * Detect the format of a list input string.
 */
export function detectFormat(input: string): ListFormat {
  const trimmed = input.trim()
  if (!trimmed) return 'unknown'

  // XIT JSON: starts with { and contains groups
  if (trimmed.startsWith('{')) {
    if (isXitJson(trimmed)) {
      return 'xit'
    }
    // It's JSON but not valid XIT
    return 'unknown'
  }

  // Check for FIO format (game clipboard)
  // FIO format has lines like: "Material  100" with game-style formatting
  if (isFioFormat(trimmed)) {
    return 'fio'
  }

  // Check for ticker/quantity pairs
  const pairs = extractTickerQuantityPairs(trimmed)
  if (pairs.length >= 1) {
    return 'simple'
  }

  return 'unknown'
}

/**
 * Check if input looks like FIO clipboard format.
 */
function isFioFormat(input: string): boolean {
  // FIO format typically has lines with material name and quantity
  // separated by multiple spaces or tabs
  const lines = input.split('\n').filter(l => l.trim())
  if (lines.length === 0) return false

  // Check if lines follow FIO pattern: NAME<spaces>QUANTITY
  const fioLinePattern = /^[A-Za-z][A-Za-z\s]+\s{2,}\d+$/
  const matchingLines = lines.filter(l => fioLinePattern.test(l.trim()))

  return matchingLines.length > 0 && matchingLines.length >= lines.length * 0.5
}

/**
 * Extract ticker/quantity pairs from a string.
 * Handles formats like: "COF 100", "COF,100", "COF 100 DW 500"
 */
function extractTickerQuantityPairs(input: string): ListItem[] {
  const pairs: ListItem[] = []

  // Regex to match ticker/quantity pairs
  // Ticker: 1-4 alphanumeric chars
  // Separator: optional comma/space/tab
  // Quantity: one or more digits
  const pairRegex = /[\s,]*([A-Za-z0-9]{1,4})[\s,]+(\d+)/g

  let match
  while ((match = pairRegex.exec(input)) !== null) {
    const ticker = match[1].toUpperCase()
    const quantity = parseInt(match[2], 10)

    if (quantity > 0) {
      pairs.push({ ticker, quantity })
    }
  }

  return pairs
}

/**
 * Parse FIO clipboard format.
 */
function parseFioFormat(input: string): ListParseResult {
  const lines = input.split('\n').filter(l => l.trim())
  const items: ListItem[] = []

  // Map of common material names to tickers (simplified)
  const nameToTicker: Record<string, string> = {
    coffee: 'COF',
    rations: 'RAT',
    water: 'H2O',
    'drinking water': 'DW',
    // Add more mappings as needed
  }

  for (const line of lines) {
    // Try to parse as: NAME<spaces>QUANTITY
    const match = line.trim().match(/^(.+?)\s{2,}(\d+)$/)
    if (match) {
      const name = match[1].trim().toLowerCase()
      const quantity = parseInt(match[2], 10)

      // Try to find ticker from name
      const ticker = nameToTicker[name] || name.toUpperCase().slice(0, 4)

      if (quantity > 0) {
        items.push({ ticker, quantity })
      }
    }
  }

  if (items.length === 0) {
    return {
      format: 'fio',
      items: [],
      success: false,
      error: 'No valid items found in FIO format',
    }
  }

  return {
    format: 'fio',
    items,
    success: true,
  }
}

/**
 * Parse simple/CSV format input.
 */
function parseSimpleFormat(input: string): ListParseResult {
  const pairs = extractTickerQuantityPairs(input)

  if (pairs.length === 0) {
    return {
      format: 'simple',
      items: [],
      success: false,
      error: 'No valid ticker/quantity pairs found',
    }
  }

  // Aggregate duplicates
  const aggregated: Record<string, number> = {}
  for (const { ticker, quantity } of pairs) {
    aggregated[ticker] = (aggregated[ticker] ?? 0) + quantity
  }

  const items = Object.entries(aggregated).map(([ticker, quantity]) => ({
    ticker,
    quantity,
  }))

  return {
    format: 'simple',
    items,
    success: true,
  }
}

/**
 * Parse XIT format input.
 */
function parseXitFormat(input: string): ListParseResult {
  const xitResult = parseXitJson(input)

  if (!xitResult.valid) {
    return {
      format: 'xit',
      items: [],
      success: false,
      error: xitResult.error || 'Invalid XIT JSON',
    }
  }

  const items = xitResult.materials.map(m => ({
    ticker: m.ticker,
    quantity: m.amount,
  }))

  return {
    format: 'xit',
    items,
    success: true,
  }
}

/**
 * Parse a list string.
 * Auto-detects format and returns unified items list.
 */
export function parseList(input: string): ListParseResult {
  const trimmed = input.trim()

  if (!trimmed) {
    return {
      format: 'unknown',
      items: [],
      success: false,
      error: 'Empty input',
    }
  }

  const format = detectFormat(trimmed)

  switch (format) {
    case 'xit':
      return parseXitFormat(trimmed)
    case 'fio':
      return parseFioFormat(trimmed)
    case 'simple':
      return parseSimpleFormat(trimmed)
    default:
      return {
        format: 'unknown',
        items: [],
        success: false,
        error: 'Unrecognized format. Expected XIT JSON, FIO clipboard, or TICKER QTY pairs',
      }
  }
}

/**
 * Check if a string could be parsed as a list.
 * Quick check without full parsing.
 */
export function isList(input: string): boolean {
  return detectFormat(input.trim()) !== 'unknown'
}
