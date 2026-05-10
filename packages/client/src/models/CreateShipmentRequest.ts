/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShipmentLineInput } from './ShipmentLineInput'
export type CreateShipmentRequest = {
  originLocationId: string
  destLocationId: string
  notes?: string | null
  lines: Array<ShipmentLineInput>
}
