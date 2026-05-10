/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShipmentLineInput } from './ShipmentLineInput';
/**
 * Update an existing shipment. When `lines` is provided, the manifest is
 * fully replaced. Origin/destination can only be edited while the shipment
 * is queued (no trip assigned).
 */
export type UpdateShipmentRequest = {
    originLocationId?: string;
    destLocationId?: string;
    notes?: string | null;
    lines?: Array<ShipmentLineInput>;
};

