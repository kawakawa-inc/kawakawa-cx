/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Record_ClaimCategory_number_ } from './Record_ClaimCategory_number_';
/**
 * Per-ticker breakdown of why a node consumes what it consumes
 */
export type NativeConsumptionBreakdown = {
    workforceBurn: number;
    repair: number;
    productionInputs: number;
    claims: Record_ClaimCategory_number_;
    total: number;
};

