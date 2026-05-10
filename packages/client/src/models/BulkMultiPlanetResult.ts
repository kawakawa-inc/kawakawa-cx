/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkDetectionCategory } from './BulkDetectionCategory';
import type { LogisticsFlow } from './LogisticsFlow';
export type BulkMultiPlanetResult = {
    planetLocationId: string;
    created: Array<{
        flow: LogisticsFlow;
        category: BulkDetectionCategory;
    }>;
    skippedDuplicates: Array<{
        ticker: string;
        category: BulkDetectionCategory;
    }>;
    skippedCycles: Array<{
        ticker: string;
        category: BulkDetectionCategory;
    }>;
    emptyCategories: Array<BulkDetectionCategory>;
    /**
     * Set when the planet wasn't found in fio_user_planets (not synced, or not owned by user)
     */
    error?: string;
};

