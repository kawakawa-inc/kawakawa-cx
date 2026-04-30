/**
 * List Parser
 *
 * Parses various list formats (FIO, XIT, simple).
 */

export type { ListFormat, ListItem, ListParseResult } from '../types.js'

export { detectFormat, parseList, isList } from './parser.js'
