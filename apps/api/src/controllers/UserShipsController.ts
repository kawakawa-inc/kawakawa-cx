// Reads the user's ship roster joined with active flight (if any), repair
// materials, fuel state, and resolved location display name. Backed by the
// FIO ship sync (see packages/services/src/fio/sync-user-ships.ts).
import { Controller, Get, Route, Security, Tags, Request } from 'tsoa'
import type { UserShip, ShipFlight, ShipRepairMaterial } from '@kawakawa/types'
import {
  db,
  fioUserShips,
  fioUserShipFlights,
  fioUserShipRepairMaterials,
  fioLocations,
} from '../db/index.js'
import { eq, and, inArray } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

@Route('ships')
@Tags('Logistics')
@Security('jwt')
export class UserShipsController extends Controller {
  /**
   * List the user's ships, with embedded current flight (if any), repair
   * materials, current fuel state, and a resolved display name for the
   * ship's location (when parked).
   */
  @Get()
  public async listShips(@Request() request: { user: JwtPayload }): Promise<UserShip[]> {
    const userId = request.user.userId

    const shipRows = await db
      .select()
      .from(fioUserShips)
      .where(eq(fioUserShips.userId, userId))
      .orderBy(fioUserShips.name)

    if (shipRows.length === 0) return []

    const shipIds = shipRows.map(s => s.id)
    const flightIds = shipRows.map(s => s.flightId).filter((id): id is string => !!id)
    const locationIds = Array.from(
      new Set(shipRows.map(s => s.locationNaturalId).filter((id): id is string => !!id))
    )

    const [repairRows, flightRows, locationRows] = await Promise.all([
      db
        .select()
        .from(fioUserShipRepairMaterials)
        .where(inArray(fioUserShipRepairMaterials.shipId, shipIds)),
      flightIds.length > 0
        ? db
            .select()
            .from(fioUserShipFlights)
            .where(
              and(
                eq(fioUserShipFlights.userId, userId),
                inArray(fioUserShipFlights.fioFlightId, flightIds)
              )
            )
        : Promise.resolve([] as (typeof fioUserShipFlights.$inferSelect)[]),
      locationIds.length > 0
        ? db
            .select({
              naturalId: fioLocations.naturalId,
              name: fioLocations.name,
            })
            .from(fioLocations)
            .where(inArray(fioLocations.naturalId, locationIds))
        : Promise.resolve([] as { naturalId: string; name: string | null }[]),
    ])

    const repairByShip = new Map<number, ShipRepairMaterial[]>()
    for (const r of repairRows) {
      const list = repairByShip.get(r.shipId) ?? []
      list.push({ ticker: r.materialTicker, amount: r.amount })
      repairByShip.set(r.shipId, list)
    }

    const flightByFlightId = new Map<string, typeof fioUserShipFlights.$inferSelect>()
    for (const f of flightRows) flightByFlightId.set(f.fioFlightId, f)

    const locationNameById = new Map<string, string>()
    for (const l of locationRows) {
      locationNameById.set(l.naturalId, l.name ?? l.naturalId)
    }

    return shipRows.map((row): UserShip => {
      const flightRow = row.flightId ? flightByFlightId.get(row.flightId) : undefined
      const flight: ShipFlight | null = flightRow
        ? {
            fioFlightId: flightRow.fioFlightId,
            fioShipId: flightRow.fioShipId,
            originDisplay: flightRow.originDisplay,
            destinationDisplay: flightRow.destinationDisplay,
            originNaturalId: flightRow.originNaturalId,
            destinationNaturalId: flightRow.destinationNaturalId,
            departureAt: flightRow.departureAt ? flightRow.departureAt.toISOString() : null,
            arrivalAt: flightRow.arrivalAt ? flightRow.arrivalAt.toISOString() : null,
            currentSegmentIndex: flightRow.currentSegmentIndex,
            stlDistance: toNumberOrNull(flightRow.stlDistance),
            ftlDistance: toNumberOrNull(flightRow.ftlDistance),
            isAborted: flightRow.isAborted,
          }
        : null

      return {
        id: row.id,
        fioShipId: row.fioShipId,
        registration: row.registration,
        name: row.name,
        blueprintNaturalId: row.blueprintNaturalId,
        commissioningAt: row.commissioningAt ? row.commissioningAt.toISOString() : null,
        inFlight: !!row.flightId,
        mass: toNumber(row.mass),
        operatingEmptyMass: toNumber(row.operatingEmptyMass),
        acceleration: toNumberOrNull(row.acceleration),
        thrust: toNumberOrNull(row.thrust),
        reactorPower: toNumberOrNull(row.reactorPower),
        emitterPower: toNumberOrNull(row.emitterPower),
        stlFuelFlowRate: toNumberOrNull(row.stlFuelFlowRate),
        condition: toNumberOrNull(row.condition),
        lastRepairAt: row.lastRepairAt ? row.lastRepairAt.toISOString() : null,
        locationNaturalId: row.locationNaturalId,
        locationName: row.locationNaturalId
          ? (locationNameById.get(row.locationNaturalId) ?? row.locationNaturalId)
          : null,
        locationSystemNaturalId: row.locationSystemNaturalId,
        cargo: {
          weightLoad: toNumber(row.cargoWeightLoad),
          weightCapacity: toNumber(row.cargoWeightCapacity),
          volumeLoad: toNumber(row.cargoVolumeLoad),
          volumeCapacity: toNumber(row.cargoVolumeCapacity),
        },
        stlFuel: {
          amount: toNumber(row.stlFuelAmount),
          maxUnits: toNumber(row.stlFuelMaxUnits),
          weightLoad: toNumber(row.stlFuelWeightLoad),
          weightCapacity: toNumber(row.stlFuelWeightCapacity),
          volumeLoad: toNumber(row.stlFuelVolumeLoad),
          volumeCapacity: toNumber(row.stlFuelVolumeCapacity),
        },
        ftlFuel: {
          amount: toNumber(row.ftlFuelAmount),
          maxUnits: toNumber(row.ftlFuelMaxUnits),
          weightLoad: toNumber(row.ftlFuelWeightLoad),
          weightCapacity: toNumber(row.ftlFuelWeightCapacity),
          volumeLoad: toNumber(row.ftlFuelVolumeLoad),
          volumeCapacity: toNumber(row.ftlFuelVolumeCapacity),
        },
        repairMaterials: repairByShip.get(row.id) ?? [],
        flight,
        lastSyncedAt: row.lastSyncedAt.toISOString(),
        fioReportedAt: row.fioReportedAt ? row.fioReportedAt.toISOString() : null,
      }
    })
  }
}
