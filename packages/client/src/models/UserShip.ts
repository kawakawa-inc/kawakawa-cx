/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShipFlight } from './ShipFlight';
import type { ShipRepairMaterial } from './ShipRepairMaterial';
/**
 * One of the user's ships, joined with current fuel state and active flight
 */
export type UserShip = {
    id: number;
    fioShipId: string;
    registration: string;
    /**
     * FIO returns null for unnamed starter ships — UI should fall back to registration.
     */
    name: string | null;
    blueprintNaturalId: string | null;
    commissioningAt: string | null;
    /**
     * True when the ship has an active flight assigned
     */
    inFlight: boolean;
    /**
     * Total mass (tons) of the ship as reported by FIO — includes cargo + fuel
     */
    mass: number;
    operatingEmptyMass: number;
    acceleration: number | null;
    thrust: number | null;
    reactorPower: number | null;
    emitterPower: number | null;
    stlFuelFlowRate: number | null;
    /**
     * Hull condition 0..1
     */
    condition: number | null;
    lastRepairAt: string | null;
    /**
     * Resolved location naturalId (most-specific: planet > station > system); null when in flight
     */
    locationNaturalId: string | null;
    /**
     * Display name resolved from `fio_locations`
     */
    locationName: string | null;
    locationSystemNaturalId: string | null;
    /**
     * Cargo bay state, sourced from `/storage/{user}` and matched by `StoreId`.
     * `weightCapacity` is the real mass cap in tons (e.g. 5000 t for an HCB).
     * `weightLoad` / `volumeLoad` are the live currently-loaded amounts.
     */
    cargo: {
        volumeCapacity: number;
        volumeLoad: number;
        weightCapacity: number;
        weightLoad: number;
    };
    /**
     * STL/FTL fuel state. `amount` is in fuel units; `maxUnits` is the tank's
     * capacity in those same units (derived from VolumeCapacity / unit-volume).
     * `weightLoad`/`weightCapacity` and `volumeLoad`/`volumeCapacity` are the
     * tank's mass and volume figures (t / m³) — useful for displaying fill bars.
     */
    stlFuel: {
        volumeCapacity: number;
        volumeLoad: number;
        weightCapacity: number;
        weightLoad: number;
        maxUnits: number;
        amount: number;
    };
    ftlFuel: {
        volumeCapacity: number;
        volumeLoad: number;
        weightCapacity: number;
        weightLoad: number;
        maxUnits: number;
        amount: number;
    };
    repairMaterials: Array<ShipRepairMaterial>;
    /**
     * Active flight if `inFlight`, else null
     */
    flight: ShipFlight | null;
    /**
     * When our DB last upserted this row from FIO.
     */
    lastSyncedAt: string;
    /**
     * The Timestamp field FIO returned with the ship record — i.e. when FIO
     * itself last got an update from the player. The useful "data freshness"
     * value to show in the UI ("data from 2h ago"). May be null if FIO didn't
     * include a timestamp (rare).
     */
    fioReportedAt: string | null;
};

