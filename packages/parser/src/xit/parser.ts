/**
 * XIT JSON Parser Implementation
 *
 * Parses XIT ACT format used by PRUNplanner and similar tools.
 * Extracts material requirements from groups and aggregates them.
 */

import type { XitJson, XitGroup, XitMaterial, XitParseResult } from '../types.js'

/**
 * Map of commodity ticker to quantity (internal format from XIT JSON)
 */
interface XitMaterialsMap {
  [ticker: string]: number
}

/**
 * Check if a string looks like XIT JSON (starts with {).
 * Does a quick JSON parse to validate the basic structure.
 */
export function isXitJson(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed.startsWith('{')) return false

  try {
    const parsed = JSON.parse(trimmed)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray(parsed.groups) &&
      parsed.groups.length > 0 &&
      parsed.groups.some(
        (g: unknown) =>
          typeof g === 'object' &&
          g !== null &&
          'materials' in g &&
          typeof (g as { materials: unknown }).materials === 'object'
      )
    )
  } catch {
    return false
  }
}

/**
 * Aggregate materials from all groups in XIT data.
 * Returns array of XitMaterial (ticker + amount).
 */
export function aggregateMaterials(data: XitJson): XitMaterial[] {
  const aggregated: XitMaterialsMap = {}

  for (const group of data.groups) {
    if (!group.materials || !Array.isArray(group.materials)) continue

    for (const material of group.materials) {
      if (!material.ticker || typeof material.amount !== 'number' || material.amount <= 0) {
        continue
      }
      aggregated[material.ticker] = (aggregated[material.ticker] ?? 0) + material.amount
    }
  }

  // Convert to array format
  return Object.entries(aggregated).map(([ticker, amount]) => ({ ticker, amount }))
}

/**
 * Parse materials from the object format used in XIT JSON.
 * Converts { "COF": 100, "RAT": 200 } to [ { ticker: "COF", amount: 100 }, ... ]
 */
function parseObjectMaterials(obj: Record<string, unknown>): XitMaterial[] {
  const materials: XitMaterial[] = []

  for (const [ticker, quantity] of Object.entries(obj)) {
    if (typeof quantity === 'number' && quantity > 0) {
      materials.push({ ticker, amount: quantity })
    }
  }

  return materials
}

/**
 * Parse array materials format.
 */
function parseArrayMaterials(arr: unknown[]): XitMaterial[] {
  const materials: XitMaterial[] = []

  for (const item of arr) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'ticker' in item &&
      'amount' in item &&
      typeof (item as XitMaterial).ticker === 'string' &&
      typeof (item as XitMaterial).amount === 'number' &&
      (item as XitMaterial).amount > 0
    ) {
      materials.push({
        ticker: (item as XitMaterial).ticker,
        amount: (item as XitMaterial).amount,
      })
    }
  }

  return materials
}

/**
 * Parse XIT JSON string and return parsed result.
 */
export function parseXitJson(input: string): XitParseResult {
  const trimmed = input.trim()

  if (!trimmed.startsWith('{')) {
    return {
      valid: false,
      data: null,
      materials: [],
      error: 'Input is not JSON',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    return {
      valid: false,
      data: null,
      materials: [],
      error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      valid: false,
      data: null,
      materials: [],
      error: 'JSON is not an object',
    }
  }

  const obj = parsed as Record<string, unknown>

  if (!Array.isArray(obj.groups)) {
    return {
      valid: false,
      data: null,
      materials: [],
      error: 'Missing or invalid "groups" array',
    }
  }

  if (obj.groups.length === 0) {
    return {
      valid: false,
      data: null,
      materials: [],
      error: 'No groups found',
    }
  }

  // Parse groups and extract materials
  const groups: XitGroup[] = []
  let hasValidMaterials = false

  for (const rawGroup of obj.groups) {
    if (typeof rawGroup !== 'object' || rawGroup === null) continue

    const g = rawGroup as Record<string, unknown>
    const groupName = typeof g.name === 'string' ? g.name : 'Unnamed'

    let materials: XitMaterial[] = []

    if (Array.isArray(g.materials)) {
      materials = parseArrayMaterials(g.materials)
    } else if (typeof g.materials === 'object' && g.materials !== null) {
      materials = parseObjectMaterials(g.materials as Record<string, unknown>)
    }

    if (materials.length > 0) {
      hasValidMaterials = true
    }

    groups.push({
      name: groupName,
      materials,
    })
  }

  if (!hasValidMaterials) {
    return {
      valid: false,
      data: null,
      materials: [],
      error: 'No valid materials found in groups',
    }
  }

  const xitData: XitJson = { groups }
  const aggregatedMaterials = aggregateMaterials(xitData)

  // Extract name from global.name if present
  const global = obj.global as { name?: string } | undefined
  const name = typeof global?.name === 'string' ? global.name : undefined

  return {
    valid: true,
    data: xitData,
    materials: aggregatedMaterials,
    name,
  }
}
