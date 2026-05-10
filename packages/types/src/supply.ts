// Supply planning types for repair, burn, and production calculations

/** Buy order source mode: manual (fixed qty) or demand (auto-calculated) */
export type BuyOrderSourceMode = 'manual' | 'demand'

/** Demand source: burn (rate * days) or repair (absolute cost) */
export type DemandSource = 'burn' | 'repair'

/** Whether a fixed demand amount is a total or daily rate */
export type DemandRate = 'total' | 'daily'

/** Per-planet override settings */
export interface PlanetOverride {
  repairDays?: number
  burnDays?: number
  includeProduction?: boolean
}

/** Map of planet NaturalId to override settings */
export type PlanetOverrides = Record<string, PlanetOverride>

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
  /** Days for one ship trip from source to destination. 0 = unset/instant. */
  transitDays: number
  /**
   * Days between consecutive shipments on this flow. Drives the shipment
   * unit of work — per-shipment quantity and the next-arrival / load /
   * contract-by timeline. Defaults to 7. User-set per flow.
   */
  cadenceDays: number
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
  transitDays?: number
  cadenceDays?: number
  note?: string
}

export interface UpdateLogisticsFlowRequest {
  fromStorageTypes?: string[]
  toStorageTypes?: string[]
  kind?: FlowKind
  amountOverride?: number | null
  rate?: DemandRate
  priority?: number | null
  transitDays?: number
  cadenceDays?: number
  note?: string | null
}

/** FIO-detection buckets used by the bulk-create endpoint */
export type BulkDetectionCategory = 'consumables' | 'inputs' | 'repair' | 'production_output'

/**
 * Granular demand/supply categories surfaced in the Add Hub review step.
 * Each maps to a specific data source:
 *  - burn: workforce consumables (fio_planet_workforce.needs)
 *  - production_input: recurring production order inputs
 *  - repair: building repair materials
 *  - government: manual demand claims (category=government)
 *  - contract: manual demand claims (category=contract)
 *  - reserve: manual demand claims (category=reserve)
 *  - production_output: recurring production order outputs (surplus)
 */
export type BulkFlowCategory =
  | 'burn'
  | 'production_input'
  | 'repair'
  | 'government'
  | 'contract'
  | 'reserve'
  | 'production_output'

/** A single detected material in a bulk preview, before flow creation. */
export interface BulkPreviewItem {
  ticker: string
  category: BulkFlowCategory
  kind: 'demand' | 'surplus'
}

/** Preview request — same shape as the create request. */
export interface BulkMultiPreviewRequest {
  hubLocationId: string
  planetLocationIds: string[]
  hubStorageTypes: string[]
  planetStorageTypes: string[]
  categories: BulkFlowCategory[]
}

/** Per-planet preview result (no DB writes). */
export interface BulkPlanetPreview {
  planetLocationId: string
  items: BulkPreviewItem[]
  skippedDuplicates: Array<{ category: BulkFlowCategory; ticker: string }>
  skippedCycles: Array<{ category: BulkFlowCategory; ticker: string }>
  /** Set when the planet wasn't found in fio_user_planets. */
  error?: string
}

/** Aggregate preview response across all selected planets. */
export interface BulkMultiPreviewResponse {
  perPlanet: BulkPlanetPreview[]
  totals: { items: number; duplicates: number; cycles: number }
}

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
  categories: BulkFlowCategory[]
  /**
   * Per-planet tickers to exclude from creation, keyed by category.
   * Outer key is planetLocationId, inner key is BulkFlowCategory.
   * Used by the Add Hub review step to honor user deselections.
   */
  exclusions?: Record<string, Record<string, string[]>>
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

/**
 * "Incoming" inventory delta from a user's pending or recently-fulfilled
 * BUY invoices, used by the Plan tab to net out contract amounts. Mirrors
 * the market view's FIO-aware logic: fulfilled reservations stop counting
 * once FIO has synced after them.
 */
export interface ContractCoverageEntry {
  locationId: string
  commodityTicker: string
  incomingQuantity: number
}

/**
 * "I handle this locally" entry — hides a (location, ticker) combo from
 * contract suggestions on the Plan tab. Used when production isn't reflected
 * in FIO (e.g., expert juggling). Treated as if the location produced the
 * ticker for the purposes of the contract walk.
 */
export interface SelfSuppliedEntry {
  id: number
  locationId: string
  commodityTicker: string
  note: string | null
  createdAt: string
}

export interface CreateSelfSuppliedRequest {
  locationId: string
  commodityTicker: string
  note?: string | null
}

/** Lifecycle status of a planned trip. */
export type TripStatus = 'planned' | 'dispatched' | 'delivered' | 'cancelled'

/**
 * One material in a shipment's manifest. `flowId` links the line to a
 * recurring flow; `flowId = null` is an ad-hoc one-off.
 */
export interface ShipmentLine {
  id: number
  flowId: number | null
  commodityTicker: string
  amount: number
}

/**
 * A shipment is a parcel: materials moving from `originLocationId` to
 * `destLocationId`. A shipment in the queue (no `tripId`) hasn't been
 * bundled onto a ship yet — the Plan tab surfaces it for assignment. Once
 * assigned, the system links it to the trip's stops via `originStopId` /
 * `destStopId`.
 */
export interface Shipment {
  id: number
  /** Null when the shipment is queued (not yet assigned to a trip). */
  tripId: number | null
  originLocationId: string
  destLocationId: string
  originStopId: number | null
  destStopId: number | null
  notes: string | null
  lines: ShipmentLine[]
  createdAt: string
  updatedAt: string
}

/** One stop on a trip. */
export interface TripStop {
  id: number
  sequence: number
  locationId: string
  plannedArriveAt: string
  notes: string | null
}

/**
 * A trip = one ship's run. Owns the status state machine. `stops` is ordered
 * by sequence; `shipments` is the set of parcels assigned to this trip.
 */
export interface Trip {
  id: number
  shipDbId: number | null
  status: TripStatus
  /** Stamped by the server when status → 'dispatched'. */
  actualDispatchAt: string | null
  /** Stamped by the server when status → 'delivered'. */
  actualArrivalAt: string | null
  notes: string | null
  stops: TripStop[]
  shipments: Shipment[]
  createdAt: string
  updatedAt: string
}

// ==================== Shipment requests (parcel CRUD) ====================

export interface ShipmentLineInput {
  flowId?: number | null
  commodityTicker: string
  amount: number
}

export interface CreateShipmentRequest {
  originLocationId: string
  destLocationId: string
  notes?: string | null
  lines: ShipmentLineInput[]
}

/**
 * Update an existing shipment. When `lines` is provided, the manifest is
 * fully replaced. Origin/destination can only be edited while the shipment
 * is queued (no trip assigned).
 */
export interface UpdateShipmentRequest {
  originLocationId?: string
  destLocationId?: string
  notes?: string | null
  lines?: ShipmentLineInput[]
}

/**
 * Repeat a shipment back into the queue with refreshed amounts. Currently
 * has no parameters; reserved for future shaping (target trip, override
 * amounts, etc.).
 */
export interface RepeatShipmentRequest {
  /** Optional notes override for the cloned shipment. */
  notes?: string | null
}

// ==================== Trip requests ====================

/** Input stop entry; index into the request's `stops` array becomes its sequence. */
export interface TripStopInput {
  locationId: string
  plannedArriveAt: string
  notes?: string | null
}

/**
 * Per-shipment routing on a trip — origin/dest are indices into the trip's
 * `stops` array, matching `TripStopInput[]`.
 */
export interface TripShipmentAssignment {
  shipmentId: number
  originStopIndex: number
  destStopIndex: number
}

export interface CreateTripRequest {
  shipDbId?: number | null
  notes?: string | null
  /** ≥ 2 entries, in intended visit order. */
  stops: TripStopInput[]
  /** Queued shipments to bind to this trip. May be empty for a shell trip. */
  shipments: TripShipmentAssignment[]
}

/**
 * Replace the trip's stops + shipment assignments atomically. Shipments that
 * were on the trip but aren't in the new `shipments` list are returned to
 * the queue (trip_id = null).
 */
export interface UpdateTripRequest {
  shipDbId?: number | null
  notes?: string | null
  stops?: TripStopInput[]
  shipments?: TripShipmentAssignment[]
}

export interface UpdateTripStatusRequest {
  status: TripStatus
}

/** Repeat (clone) a trip — clones the trip plus its shipments, with stop times shifted. */
export interface RepeatTripRequest {
  /** ISO timestamp for the new trip's first stop. Defaults to now. */
  firstStopAt?: string
}

/**
 * Ask the server to estimate stop arrival times for a planned route. Tier-1
 * heuristic: per-jump time × FIO jump count + a small same-system constant,
 * scaled by cargo-load fraction when a ship is assigned. The first stop's
 * arrival is taken from `startAt`; subsequent stops are accumulated.
 */
export interface SuggestStopTimesRequest {
  /** ISO timestamp for the first stop. */
  startAt: string
  /** Ordered locations the trip will visit. */
  stops: Array<{ locationId: string }>
  /** Optional ship — used to compute the load-factor (full ship is slower). */
  shipDbId?: number | null
  /**
   * Shipments routed against the trip's stops. Used to compute per-segment
   * cargo mass for the load factor.
   */
  shipments: Array<{
    originStopIndex: number
    destStopIndex: number
    lines: Array<{ commodityTicker: string; amount: number }>
  }>
}

export interface SuggestStopTimesResponse {
  /** One entry per stop in the request. `stops[0].plannedArriveAt === startAt`. */
  stops: Array<{ plannedArriveAt: string }>
  /** Caveats — unknown jump counts, missing locations, etc. */
  warnings: string[]
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
  /** Days for one ship trip on this edge (mirrored from the flow row). */
  transitDays: number
  /** Days between shipments on this flow (mirrored from the flow row). */
  cadenceDays: number
  /**
   * Quantity carried in one shipment on this flow:
   * `dailyConsumption(at destination) × cadenceDays`. 0 when the destination
   * has no consumption for the ticker. Surplus edges report 0 in Stage A —
   * surplus shipments are tracked separately in Stage B.
   */
  perShipmentAmount: number
  /**
   * The next planned arrival date for this flow at the destination. In Stage
   * A this is a forward projection from `now`: `now + cadenceDays`. Stage B
   * (shipment entity) anchors it to the latest active shipment instead. ISO
   * string. Null on surplus edges.
   */
  nextArrivalAt: string | null
  /**
   * When the ship must load at the source to arrive on `nextArrivalAt`:
   * `nextArrivalAt − transitDays`. ISO string. Null on surplus edges.
   */
  loadAt: string | null
  /**
   * Latest date the ship must depart the source — same as `loadAt` today.
   * Kept distinct so we can later add ship-prep time without renaming.
   */
  shipBy: string | null
  /**
   * Latest date to place an inbound contract so goods arrive at the source
   * by `loadAt`: `loadAt − contract_lead_days`. Per-flow because each flow
   * has its own cadence and therefore its own load schedule. ISO string.
   * Null on surplus edges.
   */
  contractBy: string | null
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
  /**
   * Per-ticker daily consumption rate (workforce burn + production inputs +
   * daily-rate claims). Production is NOT subtracted here — it's reported
   * separately in `dailyProduction` so callers can compute net daily.
   */
  dailyConsumption: Record<string, number>
  /** Per-ticker daily production rate. */
  dailyProduction: Record<string, number>
  /**
   * Per-ticker days of stock remaining at current net daily consumption.
   * `Infinity` (encoded as `null` over the wire) if net consumption is 0.
   * Stock-mode='ignored' nodes report `null`.
   */
  daysOfStock: Record<string, number | null>
  /**
   * Per-ticker run-out date as an ISO string. Null when daysOfStock is
   * Infinity or stock is being ignored.
   */
  runOutAt: Record<string, string | null>
  /**
   * Per-ticker latest date to place an external KAWA contract so a partner's
   * delivery arrives before run-out. `runOutAt - settings.contractLeadDays`.
   * Null when runOutAt is null. Computed for every ticker the node consumes
   * (contracts don't require a pre-existing demand edge).
   */
  latestContractAt: Record<string, string | null>
  /**
   * Per-ticker daily outflow rate committed to downstream demand/fixed edges
   * (`derivedOutflow / burnDays`). Drives the effective-drain calculation so
   * a hub with stock-out-the-door surfaces a real run-out instead of "never."
   */
  dailyOutflow: Record<string, number>
  /**
   * Per-ticker daily inflow rate from committed inbound edges
   * (`derivedInflow / burnDays`). Symmetric with `dailyOutflow`; used in the
   * Inspector to show "Inflow/day" alongside "Outflow/day" instead of the
   * old burnDays-totals display.
   */
  dailyInflow: Record<string, number>
  /**
   * Per-ticker IMMEDIATE upstream sources for this ticker's inflow — the
   * locationIds whose committed flows feed this node. The UI surfaces these
   * as click-through chips so the user can navigate one hop at a time:
   *
   * - `[]` — this node is its own source: it produces the ticker, has no
   *   committed inflow, or otherwise owns the action here. Contract-by/CX
   *   decisions belong to this row.
   * - `[X]` — single upstream feed (most leaves). The leaf is informational;
   *   click X to see X's own sources / action.
   * - `[X, Y, ...]` — aggregating hub fed by multiple committed surplus or
   *   demand edges (e.g. BEN gets DW from two producer planets). Surfaced as
   *   a chip-with-dropdown.
   *
   * Surplus inbound edges take priority when both kinds are present at a node
   * — surplus is the "supply push" channel, so those are the producers we want
   * to surface. Edges with `amount === 0` (solver didn't allocate) are ignored.
   */
  chainSource: Record<string, string[]>
  warnings: string[]
}

/**
 * A scheduled repair event for one of the user's buildings. Repair is no
 * longer folded into per-day consumption — it's a discrete event with a known
 * date and material list. The Plan tab consumes these to surface "ship by /
 * contract by" deadlines for repair shipments.
 *
 * `nextRepairAt = (lastRepairAt ?? buildingCreated) + repairDays`, where
 * `repairDays` is the user's target repair age. (A future per-building override
 * will refine this; today the global setting applies to all buildings.)
 */
export interface RepairEvent {
  /** FIO building id (stable across syncs). */
  buildingId: string
  /** Building type ticker, e.g. "HB1". */
  buildingTicker: string
  /** Planet the building is on. */
  locationNaturalId: string
  /** Display name for the planet. */
  locationName: string
  /** When the next repair is due. ISO string. */
  nextRepairAt: string
  /** Hull condition (0..1) at the time of the graph build. */
  condition: number
  /** Per-ticker material requirements for this repair. */
  materials: Array<{ ticker: string; amount: number }>
}

/** Full solver output: one graph response per user */
export interface LogisticsGraph {
  settings: {
    burnDays: number
    repairDays: number
    conditionMode: 'actual' | 'max'
    stockMode: 'included' | 'ignored'
    /**
     * Trip lead time in days. Drives both the Plan-tab look-ahead window
     * AND the contract-by deadline (so an order placed today arrives before
     * the trip ships). Stored as the user setting `logistics.tripLeadDays`.
     * Default 7.
     */
    tripLeadDays: number
  }
  nodes: NodeState[]
  edges: EdgeState[]
  /**
   * Upcoming repair events across all the user's buildings. Each event has
   * a known date (lastRepairAt + repairDays target age) and material list.
   * The Plan tab uses these to surface contract-by / ship-by deadlines for
   * repair shipments alongside flow-cadence shipments.
   */
  repairEvents: RepairEvent[]
  warnings: string[]
}

/** Repair material need on a ship (synced from FIO `RepairMaterials`) */
export interface ShipRepairMaterial {
  ticker: string
  amount: number
}

/** Active or recently-finished flight for one of the user's ships */
export interface ShipFlight {
  fioFlightId: string
  fioShipId: string
  originDisplay: string | null
  destinationDisplay: string | null
  originNaturalId: string | null
  destinationNaturalId: string | null
  departureAt: string | null
  arrivalAt: string | null
  currentSegmentIndex: number | null
  stlDistance: number | null
  ftlDistance: number | null
  isAborted: boolean
}

/** One of the user's ships, joined with current fuel state and active flight */
export interface UserShip {
  id: number
  fioShipId: string
  registration: string
  /** FIO returns null for unnamed starter ships — UI should fall back to registration. */
  name: string | null
  blueprintNaturalId: string | null
  commissioningAt: string | null
  /** True when the ship has an active flight assigned */
  inFlight: boolean
  /** Total mass (tons) of the ship as reported by FIO — includes cargo + fuel */
  mass: number
  operatingEmptyMass: number
  acceleration: number | null
  thrust: number | null
  reactorPower: number | null
  emitterPower: number | null
  stlFuelFlowRate: number | null
  /** Hull condition 0..1 */
  condition: number | null
  lastRepairAt: string | null
  /** Resolved location naturalId (most-specific: planet > station > system); null when in flight */
  locationNaturalId: string | null
  /** Display name resolved from `fio_locations` */
  locationName: string | null
  locationSystemNaturalId: string | null
  /**
   * Cargo bay state, sourced from `/storage/{user}` and matched by `StoreId`.
   * `weightCapacity` is the real mass cap in tons (e.g. 5000 t for an HCB).
   * `weightLoad` / `volumeLoad` are the live currently-loaded amounts.
   */
  cargo: {
    weightLoad: number
    weightCapacity: number
    volumeLoad: number
    volumeCapacity: number
  }
  /**
   * STL/FTL fuel state. `amount` is in fuel units; `maxUnits` is the tank's
   * capacity in those same units (derived from VolumeCapacity / unit-volume).
   * `weightLoad`/`weightCapacity` and `volumeLoad`/`volumeCapacity` are the
   * tank's mass and volume figures (t / m³) — useful for displaying fill bars.
   */
  stlFuel: {
    amount: number
    maxUnits: number
    weightLoad: number
    weightCapacity: number
    volumeLoad: number
    volumeCapacity: number
  }
  ftlFuel: {
    amount: number
    maxUnits: number
    weightLoad: number
    weightCapacity: number
    volumeLoad: number
    volumeCapacity: number
  }
  repairMaterials: ShipRepairMaterial[]
  /** Active flight if `inFlight`, else null */
  flight: ShipFlight | null
  /** When our DB last upserted this row from FIO. */
  lastSyncedAt: string
  /**
   * The Timestamp field FIO returned with the ship record — i.e. when FIO
   * itself last got an update from the player. The useful "data freshness"
   * value to show in the UI ("data from 2h ago"). May be null if FIO didn't
   * include a timestamp (rare).
   */
  fioReportedAt: string | null
}
