// Sync user ships, fuel state, and active flights from FIO API.
//
// Pulls three endpoints:
//   GET /ship/ships/{user}        — ship roster
//   GET /ship/ships/fuel/{user}   — per-store fuel inventory (STL + FTL per ship)
//   GET /ship/flights/{user}      — active and historical flights
//
// Ships and flights are upserted by their FIO IDs. Flights without an active
// ship reference are still kept (they may be the "most recent" historical
// flight that the UI wants to show).
//
// Repair materials are replaced wholesale per ship per sync.
//
// The fuel response is folded into the ship row before the upsert so the
// caller (UI) can read everything from one query.
import { eq, inArray, sql } from 'drizzle-orm'
import { db, fioUserShips, fioUserShipFlights, fioUserShipRepairMaterials } from '@kawakawa/db'
import { FioClient } from './client.js'
import type {
  FioShip,
  FioShipFuelStore,
  FioShipFlight,
  FioShipAddressLine,
  FioStorage,
} from './types.js'
import type { SyncResult } from './sync-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ service: 'fio-sync', entity: 'user-ships' })

export interface UserShipsSyncResult extends SyncResult {
  shipsSynced: number
  flightsSynced: number
  fioLastSync: string | null // Most recent FIO data timestamp from ships
}

/**
 * Pick the most-specific NaturalId for a location: planet > station > system.
 * Returns { naturalId, systemNaturalId } where naturalId may be null if the
 * ship has no AddressLines (i.e. in flight).
 */
function resolveLocation(addressLines: FioShipAddressLine[]): {
  naturalId: string | null
  systemNaturalId: string | null
} {
  if (!addressLines || addressLines.length === 0) {
    return { naturalId: null, systemNaturalId: null }
  }
  let planet: string | null = null
  let station: string | null = null
  let system: string | null = null
  for (const line of addressLines) {
    const t = line.LineType?.toUpperCase()
    if (t === 'PLANET') planet = line.NaturalId
    else if (t === 'STATION') station = line.NaturalId
    else if (t === 'SYSTEM') system = line.NaturalId
  }
  return {
    naturalId: planet ?? station ?? system,
    systemNaturalId: system,
  }
}

/**
 * From a flight's first/last segment, pick the most-specific (planet > station > system)
 * NaturalId on the appropriate side. Returns null if no usable line.
 */
function pickLineNaturalId(
  lines: { Type: string; LineNaturalId: string }[] | undefined
): string | null {
  if (!lines || lines.length === 0) return null
  let planet: string | null = null
  let station: string | null = null
  let system: string | null = null
  for (const line of lines) {
    const t = line.Type?.toLowerCase()
    if (t === 'planet') planet = line.LineNaturalId
    else if (t === 'station') station = line.LineNaturalId
    else if (t === 'system') system = line.LineNaturalId
  }
  return planet ?? station ?? system
}

function epochToDate(ms: number | null | undefined): Date | null {
  if (ms == null || ms <= 0) return null
  return new Date(ms)
}

function decimalString(n: number | null | undefined, fallback = '0'): string {
  if (n == null || !Number.isFinite(n)) return fallback
  return String(n)
}

function decimalNullable(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  return String(n)
}

// Per-unit volume in m³ for the two fuel materials. FIO returns MaterialVolume
// in the fuel storage payload when there's any fuel present, but an empty tank
// has no StorageItems entry, so we fall back to these well-known game constants.
const FUEL_UNIT_VOLUME: Record<string, number> = {
  SF: 0.06, // STL fuel
  FF: 0.01, // FTL fuel
}

/**
 * Compute the tank's capacity in fuel units.
 * Prefer the MaterialVolume reported in StorageItems (always accurate when fuel
 * is present); fall back to a constant per-ticker volume for empty tanks.
 *
 * Accepts either a fuel-endpoint entry or a generic /storage entry — both
 * expose the same VolumeCapacity + StorageItems shape.
 */
function computeMaxUnits(
  store: { VolumeCapacity: number; StorageItems?: { MaterialVolume?: number }[] } | undefined,
  fallbackTicker: 'SF' | 'FF'
): number {
  if (!store || store.VolumeCapacity <= 0) return 0
  const item = store.StorageItems?.[0]
  const unitVol =
    item && (item.MaterialVolume ?? 0) > 0
      ? (item.MaterialVolume as number)
      : FUEL_UNIT_VOLUME[fallbackTicker]
  if (!unitVol || unitVol <= 0) return 0
  return store.VolumeCapacity / unitVol
}

/**
 * Sync ships + fuel + flights for one user. Returns counts and any errors.
 */
export async function syncUserShips(
  userId: number,
  fioApiKey: string,
  fioUsername: string,
  client: FioClient = new FioClient()
): Promise<UserShipsSyncResult> {
  const result: UserShipsSyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
    shipsSynced: 0,
    flightsSynced: 0,
    fioLastSync: null,
  }

  try {
    log.info({ userId, fioUsername }, 'Fetching ships, fuel, storage, and flights from FIO')
    const [ships, fuelStores, allStorage, flights] = await Promise.all([
      client.getUserShips<FioShip[]>(fioApiKey, fioUsername),
      client.getUserShipFuel<FioShipFuelStore[]>(fioApiKey, fioUsername),
      // /storage/{user} returns every storage on the account. We use it for
      // the ship cargo bays (SHIP_STORE) — those carry the WeightCapacity in
      // tons (i.e. "5000 t" for an HCB) which the ship roster endpoint does
      // not expose. We also prefer this endpoint's load values for fuel tanks.
      client.getUserStorage<FioStorage[]>(fioApiKey, fioUsername),
      client.getUserShipFlights<FioShipFlight[]>(fioApiKey, fioUsername),
    ])

    const fuelByShipAndType = new Map<string, FioShipFuelStore>()
    for (const store of fuelStores) {
      fuelByShipAndType.set(`${store.AddressableId}|${store.Type}`, store)
    }

    // Build a lookup of every storage by StorageId so we can hit it by the
    // ship's StoreId / StlFuelStoreId / FtlFuelStoreId without iterating.
    const storageById = new Map<string, FioStorage>()
    for (const s of allStorage) {
      storageById.set(s.StorageId, s)
    }

    const now = new Date()
    const fioShipIds = ships.map(s => s.ShipId)
    const timestamps: Date[] = []

    // Collect FIO data timestamps from ships
    for (const ship of ships) {
      if (ship.Timestamp) {
        timestamps.push(new Date(ship.Timestamp))
      }
    }

    // Upsert ships. We do a delete+insert pattern because the unique key is
    // (userId, fioShipId) and we want to handle removals (ship sold/scrapped).
    if (fioShipIds.length === 0) {
      // No ships at all — clean up any stale rows for this user.
      await db.delete(fioUserShips).where(eq(fioUserShips.userId, userId))
    } else {
      await db.delete(fioUserShips).where(
        sql`${fioUserShips.userId} = ${userId} AND ${fioUserShips.fioShipId} NOT IN (${sql.join(
          fioShipIds.map(id => sql`${id}`),
          sql`, `
        )})`
      )
    }

    for (const ship of ships) {
      // Cargo bay (SHIP_STORE): match by the ship's StoreId. The /storage
      // entry carries WeightCapacity in tons (the real "5000 t" mass cap)
      // and live WeightLoad / VolumeLoad as the ship moves cargo around.
      const cargoStore = storageById.get(ship.StoreId)
      // Fuel: prefer the dedicated /ship/ships/fuel response, fall back to
      // /storage if the fuel endpoint missed an entry. Both have the same
      // capacity values; we accept either.
      const stlStore =
        fuelByShipAndType.get(`${ship.ShipId}|STL_FUEL_STORE`) ??
        storageById.get(ship.StlFuelStoreId)
      const ftlStore =
        fuelByShipAndType.get(`${ship.ShipId}|FTL_FUEL_STORE`) ??
        storageById.get(ship.FtlFuelStoreId)
      const stlAmount = stlStore?.StorageItems?.[0]?.MaterialAmount ?? 0
      const ftlAmount = ftlStore?.StorageItems?.[0]?.MaterialAmount ?? 0
      const stlMaxUnits = computeMaxUnits(stlStore, 'SF')
      const ftlMaxUnits = computeMaxUnits(ftlStore, 'FF')
      const { naturalId: locNat, systemNaturalId: sysNat } = resolveLocation(ship.AddressLines)
      const fioReportedAt = ship.Timestamp ? new Date(ship.Timestamp) : null

      const values = {
        userId,
        fioShipId: ship.ShipId,
        registration: ship.Registration,
        name: ship.Name,
        blueprintNaturalId: ship.BlueprintNaturalId,
        commissioningAt: epochToDate(ship.CommissioningTimeEpochMs),
        flightId: ship.FlightId,
        volumeM3: decimalString(ship.Volume),
        mass: decimalString(ship.Mass),
        operatingEmptyMass: decimalString(ship.OperatingEmptyMass),
        acceleration: decimalNullable(ship.Acceleration),
        thrust: decimalNullable(ship.Thrust),
        reactorPower: decimalNullable(ship.ReactorPower),
        emitterPower: decimalNullable(ship.EmitterPower),
        stlFuelFlowRate: decimalNullable(ship.StlFuelFlowRate),
        condition: decimalNullable(ship.Condition),
        lastRepairAt: epochToDate(ship.LastRepairEpochMs),
        locationNaturalId: locNat,
        locationSystemNaturalId: sysNat,
        fioReportedAt,
        storeId: ship.StoreId,
        stlFuelStoreId: ship.StlFuelStoreId,
        ftlFuelStoreId: ship.FtlFuelStoreId,
        cargoWeightLoad: decimalString(cargoStore?.WeightLoad ?? 0),
        cargoWeightCapacity: decimalString(cargoStore?.WeightCapacity ?? 0),
        cargoVolumeLoad: decimalString(cargoStore?.VolumeLoad ?? 0),
        cargoVolumeCapacity: decimalString(cargoStore?.VolumeCapacity ?? 0),
        stlFuelAmount: decimalString(stlAmount),
        stlFuelMaxUnits: decimalString(stlMaxUnits),
        stlFuelWeightLoad: decimalString(stlStore?.WeightLoad ?? 0),
        stlFuelWeightCapacity: decimalString(stlStore?.WeightCapacity ?? 0),
        stlFuelVolumeLoad: decimalString(stlStore?.VolumeLoad ?? 0),
        stlFuelVolumeCapacity: decimalString(stlStore?.VolumeCapacity ?? 0),
        ftlFuelAmount: decimalString(ftlAmount),
        ftlFuelMaxUnits: decimalString(ftlMaxUnits),
        ftlFuelWeightLoad: decimalString(ftlStore?.WeightLoad ?? 0),
        ftlFuelWeightCapacity: decimalString(ftlStore?.WeightCapacity ?? 0),
        ftlFuelVolumeLoad: decimalString(ftlStore?.VolumeLoad ?? 0),
        ftlFuelVolumeCapacity: decimalString(ftlStore?.VolumeCapacity ?? 0),
        lastSyncedAt: now,
      }

      // Upsert by (userId, fioShipId).
      const [row] = await db
        .insert(fioUserShips)
        .values(values)
        .onConflictDoUpdate({
          target: [fioUserShips.userId, fioUserShips.fioShipId],
          set: {
            registration: values.registration,
            name: values.name,
            blueprintNaturalId: values.blueprintNaturalId,
            commissioningAt: values.commissioningAt,
            flightId: values.flightId,
            volumeM3: values.volumeM3,
            mass: values.mass,
            operatingEmptyMass: values.operatingEmptyMass,
            acceleration: values.acceleration,
            thrust: values.thrust,
            reactorPower: values.reactorPower,
            emitterPower: values.emitterPower,
            stlFuelFlowRate: values.stlFuelFlowRate,
            condition: values.condition,
            lastRepairAt: values.lastRepairAt,
            locationNaturalId: values.locationNaturalId,
            locationSystemNaturalId: values.locationSystemNaturalId,
            fioReportedAt: values.fioReportedAt,
            storeId: values.storeId,
            stlFuelStoreId: values.stlFuelStoreId,
            ftlFuelStoreId: values.ftlFuelStoreId,
            cargoWeightLoad: values.cargoWeightLoad,
            cargoWeightCapacity: values.cargoWeightCapacity,
            cargoVolumeLoad: values.cargoVolumeLoad,
            cargoVolumeCapacity: values.cargoVolumeCapacity,
            stlFuelAmount: values.stlFuelAmount,
            stlFuelMaxUnits: values.stlFuelMaxUnits,
            stlFuelWeightLoad: values.stlFuelWeightLoad,
            stlFuelWeightCapacity: values.stlFuelWeightCapacity,
            stlFuelVolumeLoad: values.stlFuelVolumeLoad,
            stlFuelVolumeCapacity: values.stlFuelVolumeCapacity,
            ftlFuelAmount: values.ftlFuelAmount,
            ftlFuelMaxUnits: values.ftlFuelMaxUnits,
            ftlFuelWeightLoad: values.ftlFuelWeightLoad,
            ftlFuelWeightCapacity: values.ftlFuelWeightCapacity,
            ftlFuelVolumeLoad: values.ftlFuelVolumeLoad,
            ftlFuelVolumeCapacity: values.ftlFuelVolumeCapacity,
            lastSyncedAt: values.lastSyncedAt,
          },
        })
        .returning({ id: fioUserShips.id })

      // Replace repair materials wholesale.
      await db
        .delete(fioUserShipRepairMaterials)
        .where(eq(fioUserShipRepairMaterials.shipId, row.id))
      if (ship.RepairMaterials && ship.RepairMaterials.length > 0) {
        await db.insert(fioUserShipRepairMaterials).values(
          ship.RepairMaterials.map(m => ({
            shipId: row.id,
            materialTicker: m.MaterialTicker,
            amount: m.Amount,
          }))
        )
      }

      result.shipsSynced++
    }

    // Flights: upsert by (userId, fioFlightId). Don't bother deleting old
    // flights — historical record is useful and the table is bounded by the
    // user's lifetime flight count. The UI filters to active by `arrivalAt`.
    const flightIds = flights.map(f => f.FlightId).filter((id): id is string => !!id)
    if (flightIds.length === 0) {
      // Optional: nothing to upsert.
    } else {
      // Pre-load existing flights to compute insert/update split (purely for stats).
      const existing = await db
        .select({ fioFlightId: fioUserShipFlights.fioFlightId })
        .from(fioUserShipFlights)
        .where(inArray(fioUserShipFlights.fioFlightId, flightIds))
      const existingSet = new Set(existing.map(r => r.fioFlightId))

      for (const flight of flights) {
        if (!flight.FlightId) continue
        const firstSeg = flight.Segments?.[0]
        const lastSeg = flight.Segments?.[flight.Segments.length - 1]
        const originNat = pickLineNaturalId(firstSeg?.OriginLines)
        const destNat = pickLineNaturalId(lastSeg?.DestinationLines)

        const values = {
          userId,
          fioFlightId: flight.FlightId,
          fioShipId: flight.ShipId,
          originDisplay: flight.Origin,
          destinationDisplay: flight.Destination,
          originNaturalId: originNat,
          destinationNaturalId: destNat,
          departureAt: epochToDate(flight.DepartureTimeEpochMs),
          arrivalAt: epochToDate(flight.ArrivalTimeEpochMs),
          currentSegmentIndex: flight.CurrentSegmentIndex,
          stlDistance: decimalNullable(flight.StlDistance),
          ftlDistance: decimalNullable(flight.FtlDistance),
          isAborted: flight.IsAborted,
          segments: flight.Segments,
          lastSyncedAt: now,
        }

        await db
          .insert(fioUserShipFlights)
          .values(values)
          .onConflictDoUpdate({
            target: [fioUserShipFlights.userId, fioUserShipFlights.fioFlightId],
            set: {
              fioShipId: values.fioShipId,
              originDisplay: values.originDisplay,
              destinationDisplay: values.destinationDisplay,
              originNaturalId: values.originNaturalId,
              destinationNaturalId: values.destinationNaturalId,
              departureAt: values.departureAt,
              arrivalAt: values.arrivalAt,
              currentSegmentIndex: values.currentSegmentIndex,
              stlDistance: values.stlDistance,
              ftlDistance: values.ftlDistance,
              isAborted: values.isAborted,
              segments: values.segments,
              lastSyncedAt: values.lastSyncedAt,
            },
          })

        if (existingSet.has(flight.FlightId)) result.updated++
        else result.inserted++
        result.flightsSynced++
      }
    }

    if (timestamps.length > 0) {
      const mostRecent = new Date(Math.max(...timestamps.map(t => t.getTime())))
      result.fioLastSync = mostRecent.toISOString()
    }

    result.success = result.errors.length === 0
    log.info(
      { userId, ships: result.shipsSynced, flights: result.flightsSynced },
      'Synced user ships'
    )
    return result
  } catch (error) {
    const errorMsg = `Failed to sync ships for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    log.error({ userId, err: error }, 'Failed to sync user ships')
    return result
  }
}
