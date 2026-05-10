/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency';
import type { PriceListType } from './PriceListType';
export type CreatePriceListRequest = {
    code: string;
    name: string;
    description?: string | null;
    type: PriceListType;
    currency: Currency;
    /**
     * Default location for the initial version (required)
     */
    defaultLocationId: string;
    isActive?: boolean;
};

