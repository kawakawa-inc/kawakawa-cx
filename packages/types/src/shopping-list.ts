/**
 * Shopping List Parser
 *
 * Parses shopping lists from multiple input formats:
 * - XIT JSON (PRUNplanner ACT format with groups/materials)
 * - CSV format (TICKER,QTY or TICKER QTY pairs with comma/space/tab separators)
 * - Simple format (single TICKER QTY pair)
 *
 * All formats produce a unified output: Record<string, number> (ticker -> quantity)
 *
 * This module re-exports from @kawakawa/parser with backwards-compatible types.
 */

import {
  parseList as parserParseList,
  isList as parserIsList,
  detectFormat as parserDetectFormat,
} from '@kawakawa/parser/list'
import { parseXitJson } from './xit.js'

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
 * Extract ticker/quantity pairs from input for format detection.
 */
function extractTickerQuantityPairs(input: string): number {
  const pairRegex = /[\s,]*([A-Za-z0-9]{1,4})[\s,]+(\d+)/g
  let count = 0
  while (pairRegex.exec(input) !== null) {
    count++
  }
  return count
}

/**
 * Detect the format of a shopping list input string.
 * Returns null if the format cannot be determined or is empty.
 */
export function detectShoppingListFormat(input: string): ShoppingListFormat | null {
  const format = parserDetectFormat(input)
  // Map parser formats to legacy formats
  if (format === 'unknown') return null
  if (format === 'xit') return 'xit'
  if (format === 'fio') return 'simple'

  // For 'simple' format, count pairs to determine csv vs simple
  const pairCount = extractTickerQuantityPairs(input)
  if (pairCount === 1) return 'simple'
  if (pairCount > 1) return 'csv'

  return null
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

  // Use the parser package
  const parserResult = parserParseList(trimmed)

  if (!parserResult.success) {
    return {
      success: false,
      error: parserResult.error ?? 'Parse error',
    }
  }

  // Convert parser's items array to materials map
  const materials: ShoppingListMaterials = {}
  for (const item of parserResult.items) {
    materials[item.ticker] = (materials[item.ticker] ?? 0) + item.quantity
  }

  // Map parser format to legacy format
  let format: ShoppingListFormat
  let name: string | undefined

  if (parserResult.format === 'xit') {
    format = 'xit'
    // Extract name from XIT JSON using the xit parser
    const xitResult = parseXitJson(trimmed)
    if (xitResult.success) {
      name = xitResult.name
    }
  } else if (parserResult.format === 'fio') {
    format = 'simple' // FIO is treated as simple for backwards compat
  } else if (parserResult.format === 'simple') {
    // Determine if it's simple or csv based on item count
    format = parserResult.items.length === 1 ? 'simple' : 'csv'
  } else {
    format = 'simple'
  }

  let result: ShoppingListParseSuccess = {
    success: true,
    materials,
    format,
    name,
  }

  // Validate tickers if validTickers set is provided
  if (options.validTickers && options.validTickers.size > 0) {
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
      result = { ...result, unknownTickers: unknown }
    }
  }

  return result
}

/**
 * Check if a string could be parsed as a shopping list.
 * Quick check without full parsing.
 */
export function isShoppingList(input: string): boolean {
  return parserIsList(input)
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
