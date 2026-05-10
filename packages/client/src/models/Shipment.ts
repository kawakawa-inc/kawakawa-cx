/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShipmentLine } from './ShipmentLine';
/**
 * A shipment is a parcel: materials moving from `originLocationId` to
 * `destLocationId`. A shipment in the queue (no `tripId`) hasn't been
 * bundled onto a ship yet — the Plan tab surfaces it for assignment. Once
 * assigned, the system links it to the trip's stops via `originStopId` /
 * `destStopId`.
 */
export type Shipment = {
    id: number;
    /**
     * Null when the shipment is queued (not yet assigned to a trip).
     */
    tripId: number | null;
    originLocationId: string;
    destLocationId: string;
    originStopId: number | null;
    destStopId: number | null;
    notes: string | null;
    lines: Array<ShipmentLine>;
    createdAt: string;
    updatedAt: string;
};

