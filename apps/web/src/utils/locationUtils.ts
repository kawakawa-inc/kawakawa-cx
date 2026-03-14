/**
 * Shared location display and sorting utilities.
 * Used by KeyValueAutocomplete, FilterMenu, and anywhere locations are listed.
 */

/** Sort priority: Bases(0) > CX Warehouses(1) > Other Warehouses(2) > Stations(3) > Planets/other(4) */
export const getLocationCategoryPriority = (
  locationType?: string | null,
  storageTypes?: string[]
): number => {
  const hasBase = storageTypes?.includes('STORE')
  const hasWarehouse = storageTypes?.includes('WAREHOUSE_STORE')
  if (hasBase) return 0
  if (hasWarehouse && locationType === 'Station') return 1
  if (hasWarehouse) return 2
  if (locationType === 'Station') return 3
  return 4
}

/** Primary emoji: 🛰️ station, 🏠 planet with base, 🌍 planet without base */
export const getLocationPrimaryEmoji = (
  locationType?: string | null,
  storageTypes?: string[]
): string => {
  const hasBase = storageTypes?.includes('STORE')
  if (locationType === 'Station') return '🛰️'
  if (locationType === 'Planet') return hasBase ? '🏠' : '🌍'
  return hasBase ? '🏠' : ''
}

/** Secondary emoji: 🏭 if user has a warehouse at this location, otherwise empty */
export const getLocationWarehouseEmoji = (storageTypes?: string[]): string => {
  return storageTypes?.includes('WAREHOUSE_STORE') ? '🏭' : ''
}
