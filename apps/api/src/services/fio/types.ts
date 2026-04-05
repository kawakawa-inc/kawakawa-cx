// FIO API Types based on Swagger spec

export interface FioMaterial {
  MaterialId: string // Ticker like "H2O", "FE", etc.
  CategoryName: string // "agricultural products", "metals", etc.
  CategoryId: string
  Name: string
  Ticker: string
  Weight: number
  Volume: number
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioPlanet {
  PlanetId: string
  PlanetNaturalId: string // Natural ID like "UV-351a"
  PlanetName: string
  Namer: string | null
  NamingDataEpochMs: number
  Nameable: boolean
  SystemId: string
  Gravity: number
  MagneticField: number
  Mass: number
  MassEarth: number
  OrbitSemiMajorAxis: number
  OrbitEccentricity: number
  OrbitInclination: number
  OrbitRightAscension: number
  OrbitPeriapsis: number
  OrbitIndex: number
  Radius: number
  Sunlight: number
  Surface: boolean
  Temperature: number
  Fertility: number
  HasLocalMarket: boolean
  HasChamberOfCommerce: boolean
  HasWarehouse: boolean
  HasAdministrationCenter: boolean
  HasShipyard: boolean
  FactionCode: string | null
  FactionName: string | null
  GovernorId: string | null
  GovernorUserName: string | null
  GovernorCorporationId: string | null
  GovernorCorporationName: string | null
  GovernorCorporationCode: string | null
  CurrencyName: string | null
  CurrencyCode: string | null
  CollectorId: string | null
  CollectorName: string | null
  CollectorCode: string | null
  BaseAttackProtection: number
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioSystem {
  SystemId: string
  NaturalId: string // Natural ID like "UV-351"
  Name: string
  Type: string
  PositionX: number
  PositionY: number
  PositionZ: number
  SectorId: string
  SubSectorId: string
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioOrder {
  OrderId: string
  CompanyId: string
  CompanyName: string
  CompanyCode: string
  ItemCount: number
  ItemCost: number
  MaterialId: string
  MaterialName: string
  MaterialTicker: string
  MaterialCategory: string
  MaterialWeight: number
  MaterialVolume: number
  ExchangeCode: string // "IC1", "NC1", etc.
  ExchangeName: string
  MMBuy: number
  MMSell: number
  PriceAverage: number
  PriceAsk: number
  PriceBid: number
  SupplyAverage: number
  SupplyDemand: number
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioBuilding {
  BuildingId: string
  Name: string
  Ticker: string
  Expertise: string | null
  Pioneers: number
  Settlers: number
  Technicians: number
  Engineers: number
  Scientists: number
  AreaCost: number
  UserNameSubmitted: string
  Timestamp: string
  BuildingCosts?: FioBuildingCost[]
  Recipes?: FioRecipe[]
}

export interface FioBuildingCost {
  MaterialId: string
  MaterialName: string
  MaterialTicker: string
  MaterialCategory: string
  Amount: number
}

export interface FioRecipe {
  RecipeId: string
  BuildingTicker: string
  RecipeName: string
  StandardRecipeName: string
  Inputs: FioRecipeIO[]
  Outputs: FioRecipeIO[]
  TimeMs: number
  UserNameSubmitted: string
  Timestamp: string
}

export interface FioRecipeIO {
  MaterialId: string
  MaterialName: string
  MaterialTicker: string
  MaterialCategory: string
  Amount: number
}

export interface FioPrice {
  MaterialId: string
  MaterialTicker: string
  MaterialName: string
  ExchangeCode: string
  MMBuy: number | null
  MMSell: number | null
  PriceAverage: number | null
  PriceAsk: number | null
  PriceBid: number | null
  SupplyAverage: number | null
  DemandAverage: number | null
  Traded: number | null
  VolumeAmount: number | null
  PriceTimeEpochMs: number
  UserNameSubmitted: string
  Timestamp: string
}

// User inventory item from /csv/inventory endpoint (legacy, prefer FioStorage)
export interface FioInventoryItem {
  Username: string
  NaturalId: string // Location natural ID (e.g., "UV-351a", "BEN")
  Name: string // Location name (e.g., "Benten Station")
  StorageType: string // e.g., "WAREHOUSE_STORE", "STORE"
  Ticker: string // e.g., "H2O", "RAT"
  Amount: number
}

// User site from /csv/sites endpoint
export interface FioSite {
  SiteId: string
  PlanetId: string
  PlanetNaturalId: string
  PlanetName: string
}

// ==================== JSON API Types ====================

// Storage item from /storage/{UserName} endpoint
export interface FioStorageItem {
  MaterialId: string
  MaterialName: string
  MaterialTicker: string
  MaterialCategory: string
  MaterialWeight: number
  MaterialVolume: number
  MaterialAmount: number
  MaterialValue: number
  MaterialValueCurrency: string
  Type: string // "INVENTORY"
  TotalWeight: number
  TotalVolume: number
}

// Storage location from /storage/{UserName} endpoint
export interface FioStorage {
  StorageId: string
  AddressableId: string // UUID for the location (planet/station/ship)
  Name: string | null // Ship name if applicable
  WeightLoad: number
  WeightCapacity: number
  VolumeLoad: number
  VolumeCapacity: number
  FixedStore: boolean
  Type: string // "STORE", "WAREHOUSE_STORE", "SHIP_STORE", "STL_FUEL_STORE", "FTL_FUEL_STORE"
  UserNameSubmitted: string
  Timestamp: string // ISO timestamp of last sync from game
  StorageItems: FioStorageItem[]
}

// User planet from /user/{UserName} endpoint
export interface FioUserPlanet {
  PlanetId: string // UUID
  PlanetNaturalId: string // Natural ID like "UV-351a"
  PlanetName: string
}

// User data from /user/{UserName} endpoint
export interface FioUserData {
  UserDataId: string
  UserId: string
  UserName: string
  CompanyId: string
  CompanyName: string
  CompanyCode: string
  CorporationId: string | null
  CorporationName: string | null
  CorporationCode: string | null
  Planets: FioUserPlanet[]
  Timestamp: string // ISO timestamp of last sync from game
}

// ==================== GroupHub API Types (undocumented) ====================

// Item in storage from GroupHub endpoint
export interface FioGroupHubItem {
  MaterialTicker: string | null
  MaterialName: string | null
  MaterialCategoryName: string | null
  Units: number
}

// Storage from GroupHub endpoint (BaseStorage or WarehouseStorage)
export interface FioGroupHubStorage {
  PlayerName: string
  StorageType: string // "STORE", "WAREHOUSE_STORE"
  Items: FioGroupHubItem[]
  LastUpdated: string // ISO timestamp
}

// Location (planet base) from GroupHub endpoint
export interface FioGroupHubLocation {
  LocationIdentifier: string // NaturalId (e.g., "CH-771b", "KW-688c")
  LocationName: string
  Buildings: unknown[]
  ProductionLines: unknown[]
  BaseStorage: FioGroupHubStorage | null
  WarehouseStorage: FioGroupHubStorage | null
  StationaryPlayerShips: unknown[]
}

// Player model from GroupHub endpoint
export interface FioGroupHubPlayerModel {
  UserName: string
  Currencies: unknown[]
  Locations: FioGroupHubLocation[]
}

// Player warehouse at a CX station
export interface FioGroupHubPlayerWarehouse {
  PlayerName: string
  StorageType: string // "WAREHOUSE_STORE"
  Items: FioGroupHubItem[]
}

// CX warehouse location from GroupHub endpoint
export interface FioGroupHubCXWarehouse {
  WarehouseLocationName: string // e.g., "Benten Station"
  WarehouseLocationNaturalId: string // e.g., "BEN"
  PlayerCXWarehouses: FioGroupHubPlayerWarehouse[]
}

// ==================== Sites/Repair API Types ====================

// Material entry from /sites endpoint (repair or reclaimable)
export interface FioSiteMaterial {
  MaterialTicker: string
  MaterialAmount: number
}

// Building from /sites/{User}/{Planet} endpoint
export interface FioSiteBuilding {
  BuildingId: string
  BuildingTicker: string
  BuildingCreated: number // epoch ms
  BuildingLastRepair: number | null // epoch ms, null if never repaired
  Condition: number
  RepairMaterials: FioSiteMaterial[]
  ReclaimableMaterials: FioSiteMaterial[]
}

// Full response from /sites/{User}/{Planet}
export interface FioSiteResponse {
  PlanetId: string
  Buildings: FioSiteBuilding[]
}

// ==================== Workforce API Types ====================

// Workforce consumable need from /workforce endpoint
export interface FioWorkforceNeed {
  MaterialTicker: string
  UnitsPerInterval: number // daily consumption rate
  Essential: boolean
}

// Workforce type from /workforce/{User}/{Planet} endpoint
export interface FioWorkforceType {
  WorkforceTypeName: string // PIONEER, SETTLER, TECHNICIAN, ENGINEER, SCIENTIST
  Population: number
  Required: number
  WorkforceNeeds: FioWorkforceNeed[]
}

// ==================== Production API Types ====================

// Material entry in production order inputs/outputs
export interface FioProductionMaterial {
  MaterialTicker: string
  MaterialAmount: number
}

// Production order from /production endpoint
export interface FioProductionOrder {
  Recurring: boolean
  DurationMs: number // wall-clock time including all modifiers
  Inputs: FioProductionMaterial[]
  Outputs: FioProductionMaterial[]
}

// Production line from /production/{User}/{Planet} endpoint
export interface FioProductionLine {
  Type: string // e.g. "chemPlant", "smelter"
  Condition: number // average condition of buildings of this type
  Efficiency: number // combined non-condition multiplier (CoGC, experts, etc.)
  Orders: FioProductionOrder[]
}

// ==================== Rain (User Planets) API Types ====================

// Planet from /rain/userplanets/{User} endpoint
export interface FioRainPlanet {
  PlanetId: string
  PlanetNaturalId: string
  PlanetName: string
}

// Full GroupHub response
export interface FioGroupHubResponse {
  GroupName: string | null
  CXWarehouses: FioGroupHubCXWarehouse[]
  PlayerModels: FioGroupHubPlayerModel[]
  PlayerShipsInFlight: unknown[]
  PlayerStationaryShips: unknown[]
  Failures: unknown[]
}
