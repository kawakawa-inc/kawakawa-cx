/**
 * Shopping List Parser
 *
 * Parses shopping lists from multiple input formats:
 * - XIT JSON (PRUNplanner ACT format with groups/materials)
 * - CSV format (TICKER,QTY or TICKER QTY pairs with comma/space/tab separators)
 * - Simple format (single TICKER QTY pair)
 *
 * All formats produce a unified output: Record<string, number> (ticker -> quantity)
 */

import { parseXitJson, isXitJson } from './xit.js'

/** Supported shopping list input formats */
export type ShoppingListFormat = 'xit' | 'csv' | 'simple'

/** Map of commodity ticker to quantity (alias for consistency) */
export type ShoppingListMaterials = Record<string, number>

/** Successful parse result */
export interface ShoppingListParseSuccess {
  success: true
  /** Aggregated materials (ticker -> quantity) */
  materials: ShoppingListMaterials
  /** Optional list name (from XIT global.name or inferred) */
  name?: string
  /** Format that was detected and used */
  format: ShoppingListFormat
  /** Unknown tickers that weren't validated (if validation was enabled) */
  unknownTickers?: string[]
}

/** Failed parse result */
export interface ShoppingListParseError {
  success: false
  error: string
}

/** Parse result union type */
export type ShoppingListParseResult = ShoppingListParseSuccess | ShoppingListParseError

/** Options for parsing */
export interface ShoppingListParseOptions {
  /** Optional set of valid tickers for validation */
  validTickers?: Set<string>
  /** If true, remove unknown tickers from result. If false, include them but report. Default: false */
  removeUnknown?: boolean
}

/**
 * Detect the format of a shopping list input string.
 * Returns null if the format cannot be determined or is empty.
 */
export function detectShoppingListFormat(input: string): ShoppingListFormat | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // XIT JSON: starts with { and contains groups
  if (trimmed.startsWith('{')) {
    if (isXitJson(trimmed)) {
      return 'xit'
    }
    // It's JSON but not valid XIT - we'll try to parse and fail gracefully
    return 'xit'
  }

  // Check for ticker/quantity pattern using regex to extract pairs
  // Tickers are 1-4 alphanumeric chars (e.g., H2O, COF, DW, 2GO)
  // Examples: "COF 100", "COF,100", "COF 100 DW 500", "COF,100,DW,500"
  const pairs = extractTickerQuantityPairs(trimmed)
  if (pairs.length === 1) {
    return 'simple'
  } else if (pairs.length > 1) {
    return 'csv'
  }

  return null
}

/**
 * Extract ticker/quantity pairs from a CSV-style string.
 * Uses regex to match TICKER QUANTITY pairs with flexible separators.
 * Tickers are 1-4 alphanumeric characters (e.g., H2O, COF, DW).
 */
function extractTickerQuantityPairs(input: string): Array<{ ticker: string; quantity: number }> {
  const pairs: Array<{ ticker: string; quantity: number }> = []

  // Regex to match ticker/quantity pairs
  // Ticker: 1-4 alphanumeric chars
  // Separator: optional comma/space/tab before and after
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
 * Parse CSV format input (TICKER QTY pairs).
 */
function parseCsvFormat(input: string): ShoppingListParseResult {
  const pairs = extractTickerQuantityPairs(input)

  if (pairs.length === 0) {
    return {
      success: false,
      error: 'No valid ticker/quantity pairs found',
    }
  }

  // Aggregate duplicates
  const materials: ShoppingListMaterials = {}
  for (const { ticker, quantity } of pairs) {
    materials[ticker] = (materials[ticker] ?? 0) + quantity
  }

  return {
    success: true,
    materials,
    format: pairs.length === 1 ? 'simple' : 'csv',
  }
}

/**
 * Parse a shopping list from any supported format.
 * Auto-detects format and returns unified materials map.
 */
export function parseShoppingList(
  input: string,
  options: ShoppingListParseOptions = {}
): ShoppingListParseResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { success: false, error: 'Empty input' }
  }

  const format = detectShoppingListFormat(trimmed)

  let result: ShoppingListParseResult

  if (format === 'xit') {
    // Use existing XIT parser
    const xitResult = parseXitJson(trimmed)
    if (!xitResult.success) {
      return xitResult
    }
    result = {
      success: true,
      materials: xitResult.materials,
      name: xitResult.name,
      format: 'xit',
    }
  } else if (format === 'csv' || format === 'simple') {
    result = parseCsvFormat(trimmed)
  } else {
    return {
      success: false,
      error:
        'Unrecognized format. Expected XIT JSON, CSV pairs (COF 100 DW 500), or simple (COF 100)',
    }
  }

  // Validate tickers if validTickers set is provided
  if (result.success && options.validTickers && options.validTickers.size > 0) {
    const tickers = Object.keys(result.materials)
    const unknown = tickers.filter(t => !options.validTickers!.has(t))

    if (unknown.length > 0) {
      if (options.removeUnknown) {
        // Remove unknown tickers
        for (const t of unknown) {
          delete result.materials[t]
        }
        // Check if any materials left
        if (Object.keys(result.materials).length === 0) {
          return {
            success: false,
            error: `All tickers were unknown: ${unknown.join(', ')}`,
          }
        }
      }
      result.unknownTickers = unknown
    }
  }

  return result
}

/**
 * Check if a string could be parsed as a shopping list.
 * Quick check without full parsing.
 */
export function isShoppingList(input: string): boolean {
  return detectShoppingListFormat(input.trim()) !== null
}

// ==================== SAVED SHOPPING LISTS ====================

/**
 * Saved shopping list (from database)
 */
export interface SavedShoppingList {
  id: number
  userId: number
  name: string
  materials: ShoppingListMaterials
  notes: string | null
  createdAt: string // ISO date string
  updatedAt: string // ISO date string
}

/**
 * Shopping list summary (for listing)
 */
export interface ShoppingListSummary {
  id: number
  name: string
  itemCount: number
  totalQuantity: number
  createdAt: string
  updatedAt: string
}

/**
 * Request to create a shopping list
 */
export interface CreateShoppingListRequest {
  name: string
  materials: ShoppingListMaterials
  notes?: string
}

/**
 * Request to update a shopping list
 */
export interface UpdateShoppingListRequest {
  name?: string
  materials?: ShoppingListMaterials
  notes?: string | null
}

/**
 * Working shopping list state (in localStorage)
 */
export interface WorkingShoppingList {
  /** Materials in the list */
  materials: ShoppingListMaterials
  /** Optional name */
  name?: string
  /** If loaded from server, the saved list ID */
  savedListId?: number
  /** Whether list has unsaved changes */
  isDirty: boolean
}
