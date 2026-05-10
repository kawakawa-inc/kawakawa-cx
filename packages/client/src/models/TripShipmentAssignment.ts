/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Per-shipment routing on a trip — origin/dest are indices into the trip's
 * `stops` array, matching `TripStopInput[]`.
 */
export type TripShipmentAssignment = {
    shipmentId: number;
    originStopIndex: number;
    destStopIndex: number;
};

