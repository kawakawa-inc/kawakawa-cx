// FIO API Types based on Swagger spec

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

// Wrapper response from /workforce/{User}/{Planet}
export interface FioWorkforceResponse {
  Workforces: FioWorkforceType[]
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
  Capacity: number // number of buildings of this type
  Condition: number // average condition of buildings of this type
  Efficiency: number // combined non-condition multiplier (CoGC, experts, etc.)
  Orders: FioProductionOrder[]
}

// ==================== Building Definition API Types ====================

export interface FioBuildingDefinition {
  Ticker: string
  Name: string
  AreaCost: number
  Pioneers: number
  Settlers: number
  Technicians: number
  Engineers: number
  Scientists: number
  BuildingCosts: { CommodityTicker: string; Amount: number }[]
}

export interface FioPlanetData {
  PlanetNaturalId: string
  PlanetName: string
  BuildRequirements: { MaterialTicker: string; MaterialAmount: number }[]
}

// ==================== Rain (User Planets) API Types ====================

// Planet from /rain/userplanets/{User} endpoint
// FIO API returns { NaturalId, Name } per the spec at doc.fnar.net
export interface FioRainPlanet {
  NaturalId: string
  Name: string
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

// ==================== Ship API Types ====================

// One entry in /ship/ships/{user}
export interface FioShipRepairMaterial {
  ShipRepairMaterialId: string
  MaterialName: string
  MaterialId: string
  MaterialTicker: string
  Amount: number
}

export interface FioShipAddressLine {
  LineId: string
  LineType: string // SYSTEM | STATION | PLANET (and possibly others)
  NaturalId: string
  Name: string
}

export interface FioShip {
  RepairMaterials: FioShipRepairMaterial[]
  AddressLines: FioShipAddressLine[]
  ShipId: string
  StoreId: string
  StlFuelStoreId: string
  FtlFuelStoreId: string
  Registration: string
  Name: string | null
  CommissioningTimeEpochMs: number | null
  BlueprintNaturalId: string | null
  FlightId: string | null
  Acceleration: number | null
  Thrust: number | null
  Mass: number | null
  OperatingEmptyMass: number | null
  ReactorPower: number | null
  EmitterPower: number | null
  Volume: number | null
  Condition: number | null
  LastRepairEpochMs: number | null
  Location: string | null
  StlFuelFlowRate: number | null
  UserNameSubmitted: string
  Timestamp: string
}

// One entry in /ship/ships/fuel/{user}
export interface FioShipFuelStorageItem {
  MaterialId: string
  MaterialName: string
  MaterialTicker: string
  MaterialAmount: number
  MaterialWeight?: number
  MaterialVolume?: number
  TotalWeight?: number
  TotalVolume?: number
}

export interface FioShipFuelStore {
  StorageItems: FioShipFuelStorageItem[]
  StorageId: string
  AddressableId: string // ShipId
  Name: string
  WeightLoad: number
  WeightCapacity: number
  VolumeLoad: number
  VolumeCapacity: number
  FixedStore: boolean
  Type: 'STL_FUEL_STORE' | 'FTL_FUEL_STORE'
  UserNameSubmitted: string
  Timestamp: string
}

// One entry in /storage/{user} — covers every storage on the user's account:
// base STORE, station WAREHOUSE_STORE, ship cargo bays (SHIP_STORE), and ship
// fuel tanks (STL_FUEL_STORE / FTL_FUEL_STORE).
//
// Match a ship's cargo bay via `StorageId === ship.StoreId`; fuel tanks via
// the ship's `StlFuelStoreId` / `FtlFuelStoreId`. The same shape covers all
// types — what differs is which `Type` you filter to and what `AddressableId`
// points at (a planet/station for base/warehouse, a ship for ship-related).
export interface FioStorage {
  StorageItems: FioShipFuelStorageItem[]
  StorageId: string
  AddressableId: string
  Name: string | null
  WeightLoad: number
  WeightCapacity: number
  VolumeLoad: number
  VolumeCapacity: number
  FixedStore: boolean
  Type: string // STORE | WAREHOUSE_STORE | SHIP_STORE | STL_FUEL_STORE | FTL_FUEL_STORE | ...
  UserNameSubmitted: string
  Timestamp: string
}

// One entry in /ship/flights/{user}
export interface FioShipFlightSegmentLine {
  OriginLineIndex?: number
  DestinationLineIndex?: number
  Type: string // 'system' | 'planet' | etc.
  LineId: string
  LineNaturalId: string
  LineName: string
}

export interface FioShipFlightSegment {
  OriginLines: FioShipFlightSegmentLine[]
  DestinationLines: FioShipFlightSegmentLine[]
  SegmentIndex: number
  Type: string // TAKE_OFF | DEPARTURE | JUMP | CHARGE | APPROACH | LANDING
  DepartureTimeEpochMs: number
  ArrivalTimeEpochMs: number
  StlDistance: number | null
  StlFuelConsumption: number | null
  FtlDistance: number | null
  FtlFuelConsumption: number | null
  Damage: number
  Origin: string
  Destination: string
}

export interface FioShipFlight {
  Segments: FioShipFlightSegment[]
  FlightId: string
  ShipId: string
  Origin: string
  Destination: string
  DepartureTimeEpochMs: number
  ArrivalTimeEpochMs: number
  CurrentSegmentIndex: number
  StlDistance: number | null
  FtlDistance: number | null
  IsAborted: boolean
  UserNameSubmitted: string
  Timestamp: string
}
