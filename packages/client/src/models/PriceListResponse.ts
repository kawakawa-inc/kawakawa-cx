/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency';
import type { PriceSource } from './PriceSource';
export type PriceListResponse = {
    id: number;
    priceListCode: string;
    commodityTicker: string;
    commodityName: string | null;
    locationId: string;
    locationName: string | null;
    price: string;
    currency: Currency;
    source: PriceSource;
    sourceReference: string | null;
    createdAt: string;
    updatedAt: string;
    exchangeCode: string;
};

