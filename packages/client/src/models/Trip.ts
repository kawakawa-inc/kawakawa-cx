/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Shipment } from './Shipment';
import type { TripStatus } from './TripStatus';
import type { TripStop } from './TripStop';
/**
 * A trip = one ship's run. Owns the status state machine. `stops` is ordered
 * by sequence; `shipments` is the set of parcels assigned to this trip.
 */
export type Trip = {
    id: number;
    shipDbId: number | null;
    status: TripStatus;
    /**
     * Stamped by the server when status → 'dispatched'.
     */
    actualDispatchAt: string | null;
    /**
     * Stamped by the server when status → 'delivered'.
     */
    actualArrivalAt: string | null;
    notes: string | null;
    stops: Array<TripStop>;
    shipments: Array<Shipment>;
    createdAt: string;
    updatedAt: string;
};

