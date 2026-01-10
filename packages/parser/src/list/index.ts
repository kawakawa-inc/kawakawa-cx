/**
 * List Parser
 *
 * Parses various list formats (FIO, XIT, simple).
 */

export type { ListFormat, ListItem, ListParseResult } from '../types.js'
// Backwards compatibility
export type { ShoppingListFormat, ShoppingListItem, ShoppingListParseResult } from '../types.js'

export { detectFormat, parseList, isList, parseShoppingList, isShoppingList } from './parser.js'
