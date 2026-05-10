/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DemandRate } from './DemandRate';
import type { FlowKind } from './FlowKind';
/**
 * A directed edge in the logistics graph (one physical flow of a material)
 */
export type LogisticsFlow = {
    id: number;
    commodityTicker: string;
    fromLocationId: string;
    fromStorageTypes: Array<string>;
    toLocationId: string;
    toStorageTypes: Array<string>;
    kind: FlowKind;
    amountOverride: number | null;
    rate: DemandRate;
    priority: number | null;
    /**
     * Days for one ship trip from source to destination. 0 = unset/instant.
     */
    transitDays: number;
    /**
     * Days between consecutive shipments on this flow. Drives the shipment
     * unit of work — per-shipment quantity and the next-arrival / load /
     * contract-by timeline. Defaults to 7. User-set per flow.
     */
    cadenceDays: number;
    note: string | null;
    createdAt: string;
    updatedAt: string;
};

