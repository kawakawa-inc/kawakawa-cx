/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DemandRate } from './DemandRate';
import type { FlowKind } from './FlowKind';
export type CreateLogisticsFlowRequest = {
    commodityTicker: string;
    fromLocationId: string;
    fromStorageTypes: Array<string>;
    toLocationId: string;
    toStorageTypes: Array<string>;
    kind: FlowKind;
    amountOverride?: number;
    rate?: DemandRate;
    priority?: number;
    transitDays?: number;
    cadenceDays?: number;
    note?: string;
};

