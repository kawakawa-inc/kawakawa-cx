// Burn & Repair types: workforce consumption ("burn"), building decay/repair
// costs, and production input/output flows, as surfaced by the corp-wide
// `burn_repair_cache` and the /burn-repair/* endpoints.

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
 * A corp member who has been excluded from the current view: they're
 * generally inactive (stale or never active), they're currently in vacation
 * mode, or the requesting user manually unchecked them in the planning
 * dropdown.
 */
export interface ExcludedMember {
  userId: number
  username: string
  /** ISO timestamp of the user's oldest FIO upload; null if they've never uploaded. */
  fioDataAge: string | null
  reason: 'stale' | 'vacation' | 'manual'
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
  /**
   * Users with matching roles who are generally inactive (no recent activity
   * per `lastActiveAt`) — excluded from aggregation. Does not include members
   * excluded for being on vacation; see `vacationUserCount`.
   */
  staleUserCount: number
  /** Users with matching roles who are currently in vacation mode — excluded from aggregation. */
  vacationUserCount: number
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
   * Members who would otherwise contribute but were excluded — by the
   * activity gate (stale or on vacation) or by the requesting user's manual
   * exclusion list. Surfaced so the UI can render a "N excluded" chip with a
   * per-member breakdown tooltip.
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
