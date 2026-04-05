// Supply planning types for repair, burn, and production calculations

/** Buy order source mode: manual (fixed qty) or demand (auto-calculated) */
export type BuyOrderSourceMode = 'manual' | 'demand'

/** Reserve source for sell orders: manual (fixed) or demand (auto-calculated from burn) */
export type ReserveSource = 'manual' | 'demand'

/** Demand source: burn (rate * days) or repair (absolute cost) */
export type DemandSource = 'burn' | 'repair'

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
