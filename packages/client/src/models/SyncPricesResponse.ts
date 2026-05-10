/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ExchangeSyncResultResponse } from './ExchangeSyncResultResponse';
/**
 * Response type for the sync operation
 */
export type SyncPricesResponse = {
    success: boolean;
    exchanges: Array<ExchangeSyncResultResponse>;
    totalUpdated: number;
    totalSkipped: number;
    errors: Array<string>;
};

