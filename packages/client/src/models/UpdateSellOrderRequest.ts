/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency';
import type { OrderType } from './OrderType';
import type { SellOrderLimitMode } from './SellOrderLimitMode';
export type UpdateSellOrderRequest = {
    price?: number;
    currency?: Currency;
    priceListCode?: string | null;
    orderType?: OrderType;
    limitMode?: SellOrderLimitMode;
    limitQuantity?: number | null;
    reserveTargetDays?: number;
};

