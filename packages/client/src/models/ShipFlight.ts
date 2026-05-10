/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Active or recently-finished flight for one of the user's ships
 */
export type ShipFlight = {
  fioFlightId: string
  fioShipId: string
  originDisplay: string | null
  destinationDisplay: string | null
  originNaturalId: string | null
  destinationNaturalId: string | null
  departureAt: string | null
  arrivalAt: string | null
  currentSegmentIndex: number | null
  stlDistance: number | null
  ftlDistance: number | null
  isAborted: boolean
}
