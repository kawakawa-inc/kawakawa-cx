// Supply planning types for repair, burn, and production calculations

/** Buy order source mode: manual (fixed qty) or demand (auto-calculated) */
export type BuyOrderSourceMode = 'manual' | 'demand'

/** Reserve source for sell orders: manual (fixed) or demand (auto-calculated from burn) */
export type ReserveSource = 'manual' | 'demand'

/** Demand source: burn (rate * days) or repair (absolute cost) */
export type DemandSource = 'burn' | 'repair'

/** Whether a fixed demand amount is a total or daily rate */
export type DemandRate = 'total' | 'daily'

/** Linked planet info for demand orders/reserves */
export interface LinkedPlanetInfo {
  userPlanetId: number
  planetNaturalId: string
  planetName: string
}

/** Source of a material need (repair, burn, or production) */
export type MaterialNeedSource = 'repair' | 'burn' | 'production'

/** A single material need with quantity and source */
export interface MaterialNeed {
  ticker: string
  quantity: number
  source: MaterialNeedSource
  planetId: string
}

/** Per-planet override settings */
export interface PlanetOverride {
  repairDays?: number
  burnDays?: number
  includeProduction?: boolean
}

/** Map of planet NaturalId to override settings */
export type PlanetOverrides = Record<string, PlanetOverride>

/** Options for supply calculation */
export interface SupplyCalculationOptions {
  repairDays: number
  burnDays: number
  includeProduction: boolean
  planetOverrides: PlanetOverrides
  now?: Date // for testing
}

/** Building data as stored in the database */
export interface BuildingData {
  buildingTicker: string
  buildingCreated: Date
  buildingLastRepair: Date | null
  condition: number
  repairMaterials: { ticker: string; amount: number }[]
  reclaimableMaterials: { ticker: string; amount: number }[]
}

/** Workforce data as stored in the database */
export interface WorkforceData {
  workforceType: string
  population: number
  needs: { ticker: string; unitsPerInterval: number; essential: boolean }[]
}

/** Production line data as stored in the database */
export interface ProductionData {
  lineType: string
  /** Number of buildings of this type (max concurrent orders) */
  capacity: number
  condition: number
  efficiency: number
  orders: {
    recurring: boolean
    durationMs: number
    inputs: { ticker: string; amount: number }[]
    outputs: { ticker: string; amount: number }[]
  }[]
}

/** Input for calculating supply needs for a single planet */
export interface PlanetSupplyInput {
  planetId: string
  planetName: string
  buildings: BuildingData[]
  workforce: WorkforceData[]
  production: ProductionData[]
}

/** Supply calculation result for a single planet */
export interface PlanetSupplyResult {
  planetId: string
  planetName: string
  repairNeeds: MaterialNeed[]
  burnNeeds: MaterialNeed[]
  productionNeeds: MaterialNeed[]
  buildingCount: number
  repairableBuildingCount: number
  options: {
    repairDays: number
    burnDays: number
    includeProduction: boolean
  }
}

/** Aggregated supply calculation result across all planets */
export interface SupplyCalculationResult {
  planets: PlanetSupplyResult[]
  /** Aggregated material quantities by ticker (all sources) */
  aggregatedMaterials: Record<string, number>
  /** Aggregated repair materials by ticker */
  repairMaterials: Record<string, number>
  /** Aggregated burn materials by ticker */
  burnMaterials: Record<string, number>
  /** Aggregated production materials by ticker */
  productionMaterials: Record<string, number>
}

// ==================== Burn & Repair (corp-wide cache) ====================

/** A single cached burn/repair row for one user-planet-ticker combination */
export interface BurnRepairCacheRow {
  planetNaturalId: string
  planetName: string
  commodityTicker: string
  burnDaily: number
  inputsDaily: number
  repairTotal: number
  productionDaily: number
}

/** One building instance with age and repair eligibility */
export interface BurnRepairBuildingInstance {
  ticker: string
  /** Days since last repair (or construction if never repaired) */
  ageDays: number
  /** False for "indestructible" buildings (CM, HB1, STO, etc.) that don't decay */
  needsRepair: boolean
}

/** Per-planet summary returned by GET /burn-repair/my-bases */
export interface BurnRepairPlanetSummary {
  planetNaturalId: string
  planetName: string
  userPlanetId: number
  materials: BurnRepairCacheRow[]
  buildingCount: number
  /** One entry per building on the planet (client aggregates for chip display) */
  buildings: BurnRepairBuildingInstance[]
  workforceSummary: { type: string; population: number; required: number }[]
  computedAt: string
}

/** Response for GET /burn-repair/my-bases */
export interface BurnRepairMyBasesResponse {
  planets: BurnRepairPlanetSummary[]
}

/** Aggregated ticker totals for corp-wide views */
export interface BurnRepairCorpMaterial {
  commodityTicker: string
  burnDaily: number
  inputsDaily: number
  repairTotal: number
  productionDaily: number
}

/**
 * A corp member who has been excluded from the current view, either because
 * their FIO data is past the staleness cutoff or because the requesting user
 * manually unchecked them in the planning dropdown.
 */
export interface ExcludedMember {
  userId: number
  username: string
  /** ISO timestamp of the user's oldest FIO upload; null if they've never uploaded. */
  fioDataAge: string | null
  reason: 'fio-stale' | 'manual'
}

/** Per-user-per-ticker row used for Top Producers/Consumers dashboards */
export interface BurnRepairCorpPerUserRow {
  userId: number
  /** FIO username (from fio.username setting), falling back to users.username */
  username: string
  commodityTicker: string
  burnDaily: number
  inputsDaily: number
  repairTotal: number
  productionDaily: number
  /**
   * Oldest FIO-reported upload timestamp across this user's storages (ISO string,
   * or null if FIO has never uploaded for them). This is the "last time the user
   * logged into PrUn with a FIO-enabled browser" signal — a user-level property,
   * so it's the same for every ticker belonging to a given user. Using the
   * oldest (MIN) across storages gives a worst-case staleness read.
   */
  fioDataAge: string | null
}

/** Response for GET /burn-repair/corp */
export interface BurnRepairCorpResponse {
  materials: BurnRepairCorpMaterial[]
  includedUserCount: number
  /** Users with matching roles whose data is older than 30 days (excluded from aggregation) */
  staleUserCount: number
  /**
   * Corp-wide on-hand inventory keyed by ticker — sum of FIO-reported quantity
   * across every storage owned by an included user. Powers `stock` /
   * `daysRemaining`: those metrics answer "how long does the corp last on
   * what it already has?", which is an on-hand question, not a "what's listed
   * for sale?" one. The for-sale flavor lives in `listedStock` /
   * `daysListed`.
   */
  availableSurplus: Record<string, number>
  /**
   * Corp-wide *listed* stock keyed by ticker — sum of remaining sell-order
   * quantities (FIO-aware enrichment caps each listing at what the seller can
   * actually fulfill). Companion to `availableSurplus`: answers "what could a
   * buyer purchase from the corp's exchange right now?" Not part of the
   * runway math; surfaced so the UI can render it as a separate column.
   */
  listedStock: Record<string, number>
  /** Per-user-per-ticker rollups for dashboard Top Producers/Consumers */
  perUser: BurnRepairCorpPerUserRow[]
  /**
   * Members who would otherwise contribute but were excluded — either by the
   * FIO-staleness gate or by the requesting user's manual exclusion list.
   * Surfaced so the UI can render a "N excluded" chip with a per-member
   * breakdown tooltip.
   */
  excludedMembers: ExcludedMember[]
}

/** Response for GET /burn-repair/corp/buildings */
export interface BurnRepairCorpBuildingsResponse {
  buildings: Record<string, number>
  totalBuildings: number
}

/** Workforce summary entry */
export interface BurnRepairWorkforceEntry {
  type: string
  totalPopulation: number
  totalRequired: number
}

/**
 * Per-planet contribution for a single user toward one ticker's totals.
 * Mirrors the per-(user, planet, ticker) row in `burn_repair_cache` so the
 * breakdown modal can drill from user → planet without an extra round-trip.
 */
export interface BurnRepairCorpMaterialPlanetContribution {
  planetNaturalId: string
  planetName: string
  productionDaily: number
  burnDaily: number
  inputsDaily: number
}

/** One user's contribution to a ticker's corp totals, with per-planet drill-down. */
export interface BurnRepairCorpMaterialUserContribution {
  userId: number
  username: string
  productionDaily: number
  burnDaily: number
  inputsDaily: number
  /** Sorted by `planetName` for stable rendering. */
  perPlanet: BurnRepairCorpMaterialPlanetContribution[]
}

/**
 * Response for GET /burn-repair/corp/material/:ticker.
 *
 * "Where do these numbers come from?" diagnostic for a single ticker. Aggregate
 * fields match what the corp endpoint reports for the same ticker; `perUser`
 * exposes the user × planet rows that fold into those aggregates so the modal
 * can lay them out as a hierarchy. Repair and stock are intentionally excluded
 * for now — they don't drill down cleanly through `burn_repair_cache`.
 */
export interface BurnRepairCorpMaterialBreakdown {
  commodityTicker: string
  productionDaily: number
  burnDaily: number
  inputsDaily: number
  /** Convenience: burnDaily + inputsDaily, the "consumption" axis in the modal. */
  consumptionDaily: number
  /** Sorted descending by `productionDaily + consumptionDaily`. */
  perUser: BurnRepairCorpMaterialUserContribution[]
}

/** Response for GET /burn-repair/corp/workforce */
export interface BurnRepairCorpWorkforceResponse {
  workforce: BurnRepairWorkforceEntry[]
}

/** Request body for POST /burn-repair/shopping-list */
export interface BurnRepairShoppingListRequest {
  originLocationId: string
  basePlanetId: string
  days: number
}

/** A single shopping list item */
export interface BurnRepairShoppingListItem {
  commodityTicker: string
  demand: number
  production: number
  originStock: number
  baseStock: number
  gap: number
}

/** Response for POST /burn-repair/shopping-list */
export interface BurnRepairShoppingListResponse {
  items: BurnRepairShoppingListItem[]
  days: number
  originLocationId: string
  basePlanetId: string
}

// ==================== Logistics Flow Graph ====================
// New model. See docs/guides/logistics-plan.md.

/** Edge sizing rule: demand-pull, surplus-push, or fixed override */
export type FlowKind = 'demand' | 'surplus' | 'fixed'

/** Category of a manual node-level demand claim */
export type ClaimCategory = 'government' | 'contract' | 'reserve' | 'other'

/** Whether a claim was entered manually or generated by an auto-calculator */
export type ClaimSource = 'manual' | 'auto'

/** A directed edge in the logistics graph (one physical flow of a material) */
export interface LogisticsFlow {
  id: number
  commodityTicker: string
  fromLocationId: string
  fromStorageTypes: string[]
  toLocationId: string
  toStorageTypes: string[]
  kind: FlowKind
  amountOverride: number | null
  rate: DemandRate
  priority: number | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateLogisticsFlowRequest {
  commodityTicker: string
  fromLocationId: string
  fromStorageTypes: string[]
  toLocationId: string
  toStorageTypes: string[]
  kind: FlowKind
  amountOverride?: number
  rate?: DemandRate
  priority?: number
  note?: string
}

export interface UpdateLogisticsFlowRequest {
  fromStorageTypes?: string[]
  toStorageTypes?: string[]
  kind?: FlowKind
  amountOverride?: number | null
  rate?: DemandRate
  priority?: number | null
  note?: string | null
}

/** FIO-detection buckets used by the bulk-create endpoint */
export type BulkDetectionCategory = 'consumables' | 'inputs' | 'repair' | 'production_output'

export interface BulkCreateLogisticsFlowsRequest {
  fromLocationId: string
  toLocationId: string
  fromStorageTypes: string[]
  toStorageTypes: string[]
  categories: BulkDetectionCategory[]
}

export interface BulkCreateLogisticsFlowsResponse {
  /** Flows that were inserted, grouped by category */
  created: Array<{ category: BulkDetectionCategory; flow: LogisticsFlow }>
  /** Tickers skipped because a flow with the same (from, to, ticker) already existed */
  skippedDuplicates: Array<{ category: BulkDetectionCategory; ticker: string }>
  /** Tickers skipped because inserting them would create a cycle */
  skippedCycles: Array<{ category: BulkDetectionCategory; ticker: string }>
  /** Categories where no FIO tickers were detected at the appropriate planet */
  emptyCategories: BulkDetectionCategory[]
}

/**
 * Template-based bulk create: connect a single hub to many planets in one
 * operation. Direction auto-orients per category — consumption flows
 * hub→planet, production_output flows planet→hub.
 */
export interface BulkMultiCreateLogisticsFlowsRequest {
  hubLocationId: string
  planetLocationIds: string[]
  hubStorageTypes: string[]
  planetStorageTypes: string[]
  categories: BulkDetectionCategory[]
}

export interface BulkMultiPlanetResult {
  planetLocationId: string
  created: Array<{ category: BulkDetectionCategory; flow: LogisticsFlow }>
  skippedDuplicates: Array<{ category: BulkDetectionCategory; ticker: string }>
  skippedCycles: Array<{ category: BulkDetectionCategory; ticker: string }>
  emptyCategories: BulkDetectionCategory[]
  /** Set when the planet wasn't found in fio_user_planets (not synced, or not owned by user) */
  error?: string
}

export interface BulkMultiCreateLogisticsFlowsResponse {
  perPlanet: BulkMultiPlanetResult[]
  totals: {
    created: number
    duplicates: number
    cycles: number
    empty: number
  }
}

/** A manual node-level demand claim (government, contract, reserve, other) */
export interface LocationDemandClaim {
  id: number
  locationId: string
  commodityTicker: string
  quantity: number
  rate: DemandRate
  category: ClaimCategory
  note: string | null
  source: ClaimSource
  createdAt: string
  updatedAt: string
}

export interface CreateLocationDemandClaimRequest {
  locationId: string
  commodityTicker: string
  quantity: number
  rate: DemandRate
  category: ClaimCategory
  note?: string
}

export interface UpdateLocationDemandClaimRequest {
  quantity?: number
  rate?: DemandRate
  category?: ClaimCategory
  note?: string | null
}

/** Per-ticker breakdown of why a node consumes what it consumes */
export interface NativeConsumptionBreakdown {
  workforceBurn: number
  repair: number
  productionInputs: number
  claims: Record<ClaimCategory, number>
  total: number
}

/** State of a single edge after the solver has run */
export interface EdgeState {
  id: number
  fromLocationId: string
  toLocationId: string
  commodityTicker: string
  kind: FlowKind
  /** Solver-committed amount for this edge, already converted against burnDays if the source rate was 'daily' */
  amount: number
  /** True when this edge could not be fully satisfied by upstream */
  isBottleneck: boolean
  /** True when kind='fixed' (user-pinned) */
  isOverride: boolean
  priority: number | null
  note: string | null
}

/** State of a single node after the solver has run */
export interface NodeState {
  locationId: string
  locationName: string
  /** System this location belongs to (e.g. "CH-771") */
  systemNaturalId: string
  /** System display name (e.g. "Wild Garden") */
  systemName: string
  /** System 3D X coordinate from FIO systemstars (top-down map uses X/Z) */
  systemPositionX?: number
  /** System 3D Z coordinate from FIO systemstars */
  systemPositionZ?: number
  /** Per-ticker current stock (respects stockMode) */
  stock: Record<string, number>
  nativeConsumption: Record<string, number>
  nativeProduction: Record<string, number>
  /** Per-ticker breakdown of nativeConsumption */
  consumptionBreakdown: Record<string, NativeConsumptionBreakdown>
  /** Sum of committed inbound edge amounts */
  derivedInflow: Record<string, number>
  /** Sum of committed outbound edge amounts */
  derivedOutflow: Record<string, number>
  /** balance < 0 means shortfall (shopping list); balance >= 0 means surplus held */
  balance: Record<string, number>
  /** Shopping list = max(0, -balance). Shorthand for the UI. */
  shoppingList: Record<string, number>
  warnings: string[]
}

/** Full solver output: one graph response per user */
export interface LogisticsGraph {
  settings: {
    burnDays: number
    repairDays: number
    conditionMode: 'actual' | 'max'
    stockMode: 'included' | 'ignored'
  }
  nodes: NodeState[]
  edges: EdgeState[]
  warnings: string[]
}
