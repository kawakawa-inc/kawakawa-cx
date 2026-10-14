/**
 * XIT Paste
 *
 * Reads and writes the clipboard format of refined-prun's XIT ACT Paste
 * material group.
 */

export {
  parsePaste,
  parseMaterials,
  maxPriceSignificantFigures,
  type MaterialBill,
  type ParsedRow,
  type ParseError,
  type ParseResult,
  type ResolveTicker,
  type Delimiter,
} from './paste-parse.js'

export {
  serializePaste,
  roundPrice,
  minContractPrice,
  maxContractPrice,
  type PasteRounding,
  type PasteMaterial,
  type PasteSerializeError,
  type PasteAdjustment,
  type PasteSerializeResult,
} from './paste-serialize.js'
