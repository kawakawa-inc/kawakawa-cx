/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
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
export type RepairEvent = {
    /**
     * FIO building id (stable across syncs).
     */
    buildingId: string;
    /**
     * Building type ticker, e.g. "HB1".
     */
    buildingTicker: string;
    /**
     * Planet the building is on.
     */
    locationNaturalId: string;
    /**
     * Display name for the planet.
     */
    locationName: string;
    /**
     * When the next repair is due. ISO string.
     */
    nextRepairAt: string;
    /**
     * Hull condition (0..1) at the time of the graph build.
     */
    condition: number;
    /**
     * Per-ticker material requirements for this repair.
     */
    materials: Array<{
        amount: number;
        ticker: string;
    }>;
};

