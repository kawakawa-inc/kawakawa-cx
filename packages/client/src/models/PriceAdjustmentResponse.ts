/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdjustmentType } from './AdjustmentType';
export type PriceAdjustmentResponse = {
    id: number;
    priceListCode: string | null;
    commodityTicker: string | null;
    commodityName: string | null;
    locationId: string | null;
    locationName: string | null;
    adjustmentType: AdjustmentType;
    adjustmentValue: string;
    priority: number;
    description: string | null;
    isActive: boolean;
    effectiveFrom: string | null;
    effectiveUntil: string | null;
    createdByUserId: number | null;
    createdByUsername: string | null;
    createdAt: string;
    updatedAt: string;
    exchangeCode: string | null;
};

