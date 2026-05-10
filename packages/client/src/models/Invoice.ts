/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency';
import type { InvoiceDirection } from './InvoiceDirection';
import type { InvoiceLineItem } from './InvoiceLineItem';
import type { InvoiceStatus } from './InvoiceStatus';
export type Invoice = {
    id: number;
    counterpartyUserId: number;
    counterpartyName: string;
    status: InvoiceStatus;
    direction: InvoiceDirection;
    name: string | null;
    itemCount: number;
    buyItemCount: number;
    sellItemCount: number;
    totalsByCurrency: Array<{
        total: number;
        currency: Currency;
    }>;
    buyTotalsByCurrency: Array<{
        total: number;
        currency: Currency;
    }>;
    sellTotalsByCurrency: Array<{
        total: number;
        currency: Currency;
    }>;
    commodityTickers: Array<string>;
    createdAt: string;
    updatedAt: string;
    notes: string | null;
    submittedAt: string | null;
    lineItems: Array<InvoiceLineItem>;
};

