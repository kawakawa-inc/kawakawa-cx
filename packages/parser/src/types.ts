/**
 * Token Parser Types
 *
 * This module defines the core types for the position-independent token parser.
 * The parser accepts tokens in any order and uses dependency injection for resolution.
 */

// =============================================================================
// Resolved Types (returned by resolvers)
// =============================================================================

/**
 * A resolved commodity from the resolver.
 */
export interface ResolvedCommodity {
  ticker: string
  name: string
}

/**
 * A resolved location from the resolver.
 */
export interface ResolvedLocation {
  naturalId: string
  name: string
  type: 'planet' | 'station' | 'warehouse'
}

/**
 * A resolved user from the resolver.
 */
export interface ResolvedUser {
  userId: number
  username: string
  displayName: string | null
  fioUsername: string | null
}

// =============================================================================
// Resolver Interface (dependency injection)
// =============================================================================

/**
 * Resolver functions for token identification.
 * Different consumers provide different implementations:
 * - Bot: async database queries
 * - Web: sync in-memory cache (wrapped in Promise)
 * - Tests: mock resolvers
 */
export interface TokenResolvers {
  /**
   * Resolve a token to a commodity.
   * Should match by ticker (exact) or name (fuzzy).
   */
  resolveCommodity: (token: string) => Promise<ResolvedCommodity | null>

  /**
   * Resolve a token to a location.
   * Should match by naturalId (exact) or name (fuzzy).
   */
  resolveLocation: (token: string) => Promise<ResolvedLocation | null>

  /**
   * Resolve a token to a user.
   * Should match by username, displayName, or fioUsername.
   */
  resolveUser: (token: string) => Promise<ResolvedUser | null>

  /**
   * Resolve a Discord mention (<@123456>) to a user.
   * Should look up the user by their Discord ID.
   */
  resolveDiscordMention?: (discordId: string) => Promise<ResolvedUser | null>
}

// =============================================================================
// Token Types (internal)
// =============================================================================

/**
 * Raw token types before resolution.
 */
export type RawTokenType =
  | 'number'
  | 'json'
  | 'action'
  | 'limit'
  | 'explicit_commodity'
  | 'explicit_location'
  | 'explicit_user'
  | 'discord_mention'
  | 'unknown'

/**
 * A raw token from the tokenizer.
 */
export interface RawToken {
  type: RawTokenType
  value: string
  /** Original position in input (for error messages) */
  position: number
}

/**
 * Identified token types after resolution.
 */
export type IdentifiedTokenType =
  | 'commodity'
  | 'location'
  | 'user'
  | 'number'
  | 'json'
  | 'action'
  | 'limit'
  | 'unresolved'

/**
 * An identified token after resolution.
 */
export interface IdentifiedToken {
  type: IdentifiedTokenType
  value: string
  position: number
  /** Resolved data (if applicable) */
  resolved?: ResolvedCommodity | ResolvedLocation | ResolvedUser
  /** Parsed limit data */
  limitData?: LimitModifier
}

// =============================================================================
// Parsed Result Types
// =============================================================================

/**
 * A commodity with optional quantity.
 */
export interface ParsedItem {
  commodity: ResolvedCommodity
  /** Quantity, or null if not specified */
  quantity: number | null
}

/**
 * Limit modifier for sell orders.
 */
export interface LimitModifier {
  mode: 'reserve' | 'max_sell'
  quantity: number
}

/**
 * Action keywords recognized by the parser.
 */
export type ActionKeyword = 'send' | 'close' | 'buy' | 'sell'

/**
 * The result of parsing an input string.
 */
export interface ParseResult {
  /** Commodity items with quantities */
  items: ParsedItem[]

  /** Single location (error if multiple found) */
  location: ResolvedLocation | null

  /** Single user/counterparty (error if multiple found) */
  user: ResolvedUser | null

  /** XIT data if JSON detected and valid */
  xit: XitParseResult | null

  /** Action keywords found (send, close, etc.) */
  actions: Set<ActionKeyword>

  /** Limit modifier for sell orders */
  limit: LimitModifier | null

  /** Tokens that couldn't be resolved to any known type */
  unresolved: string[]

  /** Parse errors (multiple locations, invalid JSON, etc.) */
  errors: string[]
}

// =============================================================================
// XIT Types (moved from @kawakawa/types)
// =============================================================================

/**
 * A material entry in XIT JSON.
 */
export interface XitMaterial {
  ticker: string
  amount: number
}

/**
 * Map of commodity ticker to quantity.
 * Backwards compatibility type for web app usage.
 */
export type XitMaterials = Record<string, number>

/**
 * A group of materials in XIT JSON.
 */
export interface XitGroup {
  name: string
  materials: XitMaterial[]
}

/**
 * The structure of XIT JSON data.
 */
export interface XitJson {
  groups: XitGroup[]
}

/**
 * Result of parsing XIT JSON.
 */
export interface XitParseResult {
  /** Whether the JSON was valid XIT format */
  valid: boolean
  /** Parsed XIT data (if valid) */
  data: XitJson | null
  /** Aggregated materials from all groups */
  materials: XitMaterial[]
  /** Name from global.name if present */
  name?: string
  /** Parse error message (if invalid) */
  error?: string
}

/**
 * Convert XitMaterial[] to XitMaterials (Record<string, number>).
 * Helper for backwards compatibility with web app.
 */
export function toMaterialsMap(materials: XitMaterial[]): XitMaterials {
  const result: XitMaterials = {}
  for (const m of materials) {
    result[m.ticker] = (result[m.ticker] ?? 0) + m.amount
  }
  return result
}

// =============================================================================
// List Types (commodity lists from various formats)
// =============================================================================

/**
 * Detected format of a list.
 */
export type ListFormat = 'fio' | 'xit' | 'simple' | 'unknown'

/**
 * A parsed item from a list.
 */
export interface ListItem {
  ticker: string
  quantity: number
}

/**
 * Result of parsing a list.
 */
export interface ListParseResult {
  /** Detected format */
  format: ListFormat
  /** Parsed items */
  items: ListItem[]
  /** Whether parsing was successful */
  success: boolean
  /** Parse error message (if failed) */
  error?: string
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation result for order commands (buy/sell).
 */
export interface OrderValidation {
  valid: boolean
  errors: string[]
}

/**
 * Validation result for invoice commands.
 */
export interface InvoiceValidation {
  valid: boolean
  errors: string[]
}

/**
 * Validation result for query commands.
 */
export interface QueryValidation {
  valid: boolean
  errors: string[]
}
