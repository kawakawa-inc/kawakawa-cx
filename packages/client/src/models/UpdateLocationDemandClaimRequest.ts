/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ClaimCategory } from './ClaimCategory';
import type { DemandRate } from './DemandRate';
export type UpdateLocationDemandClaimRequest = {
    quantity?: number;
    rate?: DemandRate;
    category?: ClaimCategory;
    note?: string | null;
};

