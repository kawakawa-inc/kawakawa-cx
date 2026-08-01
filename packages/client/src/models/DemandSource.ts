/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Demand source: burn (rate * days) or repair (absolute cost). Used by
 * buy/sell order auto-reserve as well as the logistics flow/claim models
 * below — kept here since it's shaped around the flow/claim `rate` field.
 */
export enum DemandSource {
  BURN = 'burn',
  REPAIR = 'repair',
}
