/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * "Incoming" inventory delta from a user's pending or recently-fulfilled
 * BUY invoices, used by the Plan tab to net out contract amounts. Mirrors
 * the market view's FIO-aware logic: fulfilled reservations stop counting
 * once FIO has synced after them.
 */
export type ContractCoverageEntry = {
  locationId: string
  commodityTicker: string
  incomingQuantity: number
}
