/**
 * @kawakawa/parser
 *
 * Position-independent token parser for commodity exchange commands.
 * Supports flexible input where tokens can appear in any order.
 *
 * @example
 * ```typescript
 * import { parseTokens, validateForOrder } from '@kawakawa/parser'
 *
 * const result = await parseTokens('100 COF BEN', resolvers)
 * const validation = validateForOrder(result)
 * ```
 */

// Core types
export type {
  // Resolved types
  ResolvedCommodity,
  ResolvedLocation,
  ResolvedUser,
  // Resolver interface
  TokenResolvers,
  // Token types
  RawTokenType,
  RawToken,
  IdentifiedTokenType,
  IdentifiedToken,
  // Parse result types
  ParsedItem,
  LimitModifier,
  ActionKeyword,
  ParseResult,
  // Validation types
  OrderValidation,
  InvoiceValidation,
  QueryValidation,
} from './types.js'

// XIT types (re-exported for convenience)
export type { XitMaterial, XitMaterials, XitGroup, XitJson, XitParseResult } from './types.js'
export { toMaterialsMap } from './types.js'

// List types (re-exported for convenience)
export type { ListFormat, ListItem, ListParseResult } from './types.js'

// XIT parser functions
export { parseXitJson, isXitJson, aggregateMaterials } from './xit/parser.js'

// List parser functions
export { parseList, isList, detectFormat } from './list/parser.js'

// Tokenizer
export { tokenize, type TokenizeResult } from './tokenizer.js'

// Identifier
export { identifyTokens } from './identifier.js'

// Main parser
export { parseTokens } from './parser.js'

// Validators
export {
  validateForOrder,
  validateForInvoice,
  validateForQuery,
  hasContent,
  summarizeParsed,
} from './validators.js'

// Tokenizer utilities
export {
  isCommaSeparatedList,
  splitCommaSeparatedList,
  parseLimitModifier,
  extractExplicitValue,
} from './tokenizer.js'

// Identifier utilities
export { resolveCommaSeparatedCommodities } from './identifier.js'
