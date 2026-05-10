/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * One material in a shipment's manifest. `flowId` links the line to a
 * recurring flow; `flowId = null` is an ad-hoc one-off.
 */
export type ShipmentLine = {
    id: number;
    flowId: number | null;
    commodityTicker: string;
    amount: number;
};

