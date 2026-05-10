/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DemandRate } from './DemandRate';
import type { FlowKind } from './FlowKind';
export type UpdateLogisticsFlowRequest = {
    fromStorageTypes?: Array<string>;
    toStorageTypes?: Array<string>;
    kind?: FlowKind;
    amountOverride?: number | null;
    rate?: DemandRate;
    priority?: number | null;
    transitDays?: number;
    cadenceDays?: number;
    note?: string | null;
};

