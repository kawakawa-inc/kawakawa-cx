/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Ask the server to estimate stop arrival times for a planned route. Tier-1
 * heuristic: per-jump time × FIO jump count + a small same-system constant,
 * scaled by cargo-load fraction when a ship is assigned. The first stop's
 * arrival is taken from `startAt`; subsequent stops are accumulated.
 */
export type SuggestStopTimesRequest = {
  /**
   * ISO timestamp for the first stop.
   */
  startAt: string
  /**
   * Ordered locations the trip will visit.
   */
  stops: Array<{
    locationId: string
  }>
  /**
   * Optional ship — used to compute the load-factor (full ship is slower).
   */
  shipDbId?: number | null
  /**
   * Shipments routed against the trip's stops. Used to compute per-segment
   * cargo mass for the load factor.
   */
  shipments: Array<{
    lines: Array<{
      amount: number
      commodityTicker: string
    }>
    destStopIndex: number
    originStopIndex: number
  }>
}
