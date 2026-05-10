/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency';
import type { OrderType } from './OrderType';
import type { PricingMode } from './PricingMode';
export type MarketListing = {
    id: number;
    userId: number;
    sellerName: string;
    commodityTicker: string;
    locationId: string;
    price: number;
    currency: Currency;
    priceListCode: string | null;
    effectivePrice: number | null;
    isFallback: boolean;
    priceLocationId: string | null;
    pricingMode: PricingMode;
    orderType: OrderType;
    availableQuantity: number;
    isOwn: boolean;
    jumpCount: number | null;
    activeReservationCount: number;
    reservedQuantity: number;
    remainingQuantity: number;
    fioUploadedAt: string | null;
};

