/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TripShipmentAssignment } from './TripShipmentAssignment'
import type { TripStopInput } from './TripStopInput'
/**
 * Replace the trip's stops + shipment assignments atomically. Shipments that
 * were on the trip but aren't in the new `shipments` list are returned to
 * the queue (trip_id = null).
 */
export type UpdateTripRequest = {
  shipDbId?: number | null
  notes?: string | null
  stops?: Array<TripStopInput>
  shipments?: Array<TripShipmentAssignment>
}
