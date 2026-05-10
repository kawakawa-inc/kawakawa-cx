/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type KawaSheetSyncRequest = {
    tickerColumn: (string | number);
    priceColumn: (string | number);
    locationColumn?: (string | number);
    locationDefault?: string;
    currencyColumn?: (string | number);
    currencyDefault?: KawaSheetSyncRequest.currencyDefault;
};
export namespace KawaSheetSyncRequest {
    export enum currencyDefault {
        ICA = 'ICA',
        CIS = 'CIS',
        AIC = 'AIC',
        NCC = 'NCC',
    }
}

