/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * "I handle this locally" entry — hides a (location, ticker) combo from
 * contract suggestions on the Plan tab. Used when production isn't reflected
 * in FIO (e.g., expert juggling). Treated as if the location produced the
 * ticker for the purposes of the contract walk.
 */
export type SelfSuppliedEntry = {
    id: number;
    locationId: string;
    commodityTicker: string;
    note: string | null;
    createdAt: string;
};

