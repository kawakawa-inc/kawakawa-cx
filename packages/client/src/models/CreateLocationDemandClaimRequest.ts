/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ClaimCategory } from './ClaimCategory';
import type { DemandRate } from './DemandRate';
export type CreateLocationDemandClaimRequest = {
    locationId: string;
    commodityTicker: string;
    quantity: number;
    rate: DemandRate;
    category: ClaimCategory;
    note?: string;
};

