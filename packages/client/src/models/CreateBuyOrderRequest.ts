/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BuyOrderSourceMode } from './BuyOrderSourceMode';
import type { Currency } from './Currency';
import type { DemandSource } from './DemandSource';
import type { OrderType } from './OrderType';
export type CreateBuyOrderRequest = {
    commodityTicker: string;
    locationId: string;
    quantity: number;
    price: number;
    currency: Currency;
    priceListCode?: string | null;
    orderType?: OrderType;
    sourceMode?: BuyOrderSourceMode;
    demandSource?: DemandSource;
    targetDays?: number;
};

