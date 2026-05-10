/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkFlowCategory } from './BulkFlowCategory';
import type { Record_string_Record_string_string_Array__ } from './Record_string_Record_string_string_Array__';
/**
 * Template-based bulk create: connect a single hub to many planets in one
 * operation. Direction auto-orients per category — consumption flows
 * hub→planet, production_output flows planet→hub.
 */
export type BulkMultiCreateLogisticsFlowsRequest = {
    hubLocationId: string;
    planetLocationIds: Array<string>;
    hubStorageTypes: Array<string>;
    planetStorageTypes: Array<string>;
    categories: Array<BulkFlowCategory>;
    /**
     * Per-planet tickers to exclude from creation, keyed by category.
     * Outer key is planetLocationId, inner key is BulkFlowCategory.
     * Used by the Add Hub review step to honor user deselections.
     */
    exclusions?: Record_string_Record_string_string_Array__;
};

