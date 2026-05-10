/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TripShipmentAssignment } from './TripShipmentAssignment';
import type { TripStopInput } from './TripStopInput';
export type CreateTripRequest = {
    shipDbId?: number | null;
    notes?: string | null;
    /**
     * ≥ 2 entries, in intended visit order.
     */
    stops: Array<TripStopInput>;
    /**
     * Queued shipments to bind to this trip. May be empty for a shell trip.
     */
    shipments: Array<TripShipmentAssignment>;
};

