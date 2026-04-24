// Main barrel — kept minimal on purpose.
//
// Consumers should prefer subpath imports (`@kawakawa/services/fio`,
// `@kawakawa/services/sync-queue`, etc.) so only the code they need is
// loaded. This barrel only re-exports a small, stable API surface used
// broadly across apps.

export * from './settings/index.js'
export * from './discord/index.js'
export * from './permissions/index.js'
export * from './market/index.js'
export { FioClient, FioApiError, syncUserInventory } from './fio/index.js'
export type {
  FioGroupHubResponse,
  FioGroupHubStorage,
  FioGroupHubItem,
  FioGroupHubLocation,
  FioGroupHubPlayerModel,
  FioGroupHubCXWarehouse,
  FioGroupHubPlayerWarehouse,
  UserInventorySyncResult,
} from './fio/index.js'
