/**
 * XIT ACT JSON Parser
 *
 * Parses XIT ACT format used by PRUNplanner and similar tools.
 * Extracts material requirements from groups and aggregates them.
 *
 * This module re-exports from @kawakawa/parser with backwards-compatible types.
 */

import {
  parseXitJson as parserParseXitJson,
  isXitJson as parserIsXitJson,
  toMaterialsMap,
} from '@kawakawa/parser/xit'

// Re-export types from parser (these are compatible)
export type { XitMaterials, XitMaterial, XitGroup, XitJson } from '@kawakawa/parser/xit'

/**
 * Successful parse result with aggregated materials (backwards-compat format)
 */
export interface XitParseResult {
  success: true
  /** Aggregated materials across all groups */
  materials: Record<string, number>
  /** Name from global.name if present */
  name?: string
}

/**
 * Failed parse result with error message
 */
export interface XitParseError {
  success: false
  error: string
}

/**
 * Quick check if a string looks like XIT JSON.
 * Delegates to @kawakawa/parser.
 */
export function isXitJson(input: string): boolean {
  return parserIsXitJson(input)
}

/**
 * Legacy XIT group structure for backwards compatibility.
 */
interface LegacyXitGroup {
  type?: string
  name?: string
  materials: Record<string, number>
}

/**
 * Aggregate materials from multiple groups into a single map.
 * Backwards-compatible: accepts array of groups with materials as Record<string, number>.
 */
export function aggregateMaterials(groups: LegacyXitGroup[]): Record<string, number> {
  const result: Record<string, number> = {}

  for (const group of groups) {
    if (!group.materials || typeof group.materials !== 'object') continue

    for (const [ticker, quantity] of Object.entries(group.materials)) {
      if (typeof quantity !== 'number' || quantity <= 0) continue
      result[ticker] = (result[ticker] ?? 0) + quantity
    }
  }

  return result
}

/**
 * Parse XIT JSON string and return aggregated materials.
 * Provides backwards-compatible result format (success/materials as Record).
 */
export function parseXitJson(input: string): XitParseResult | XitParseError {
  const result = parserParseXitJson(input)

  if (!result.valid) {
    return {
      success: false,
      error: result.error ?? 'Parse error',
    }
  }

  return {
    success: true,
    materials: toMaterialsMap(result.materials),
    name: result.name,
  }
}
