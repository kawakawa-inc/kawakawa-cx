/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency';
/**
 * Response type for a single exchange sync result
 */
export type ExchangeSyncResultResponse = {
    exchangeCode: string;
    locationId: string | null;
    currency: Currency;
    pricesUpdated: number;
    pricesSkipped: number;
    syncedAt: string;
};

