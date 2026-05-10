/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PriceSource } from './PriceSource';
export type CreatePriceRequest = {
    exchangeCode: string;
    commodityTicker: string;
    locationId: string;
    price: number;
    version?: number;
    source?: PriceSource;
    sourceReference?: string | null;
};

