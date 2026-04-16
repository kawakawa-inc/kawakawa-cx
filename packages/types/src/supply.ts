// Supply planning types for repair, burn, and production calculations

/** Buy order source mode: manual (fixed qty) or demand (auto-calculated) */
export type BuyOrderSourceMode = 'manual' | 'demand'

/** Reserve source for sell orders: manual (fixed) or demand (auto-calculated from burn) */
export type ReserveSource = 'manual' | 'demand'

/** Demand source: burn (rate * days) or repair (absolute cost) */
export type DemandSource = 'burn' | 'repair'

/** Supply chain line mode: demand (consumption) or reserve (held stock) */
export type SupplyChainMode = 'demand' | 'reserve'

/** Whether a fixed demand amount is a total or daily rate */
export type DemandRate = 'total' | 'daily'

/** Supply chain line source — determines how demand or supply is calculated */
export type SupplyChainLineSource =
  | 'consumables'
  | 'inputs'
  | 'repair'
  | 'government'
  | 'other'
  | 'production_output'

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

// ==================== Supply Dashboard ====================

/** Dashboard data organized by location */
export interface SupplyDashboard {
  settings: { burnDays: number; repairDays: number; conditionMode: 'actual' | 'max' }
  locations: LocationDashboard[]
  materials: MaterialDashboard[]
}

/** Per-location dashboard data (any location touched by supply chain lines) */
export interface LocationDashboard {
  locationId: string
  stock: Record<string, number>
  connections: ConnectionDashboard[]
  aggregatedExport: Record<string, number>
  aggregatedImport: Record<string, number>
  gap: Record<string, number>
}

/** Flow data between two connected locations */
export interface ConnectionDashboard {
  locationId: string
  locationName: string
  storageTypes: string[]
  exports: { ticker: string; amount: number; lineSource: string }[]
  imports: { ticker: string; amount: number; lineSource: string }[]
  connectionStock: Record<string, number>
  /** Per-ticker production/demand rates at this connection (planets only, null for stations) */
  rates: Record<string, { dailyProduction: number; dailyDemand: number }> | null
}

/** Per-material aggregated dashboard data */
export interface MaterialDashboard {
  ticker: string
  totalExport: number
  totalImport: number
  totalNeed: number
  stock: number
  gap: number
  locations: string[]
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
