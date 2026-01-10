/**
 * XIT Parser
 *
 * Parses XIT JSON format used for importing material lists.
 */

export type { XitMaterial, XitMaterials, XitGroup, XitJson, XitParseResult } from '../types.js'
export { toMaterialsMap } from '../types.js'

export { isXitJson, parseXitJson, aggregateMaterials } from './parser.js'
