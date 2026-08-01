/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SalesOrderItemRequest } from './SalesOrderItemRequest'
export type CreateSalesOrderRequest = {
  priceListCode: string
  locationId: string
  version?: number | null
  customerName?: string | null
  notes?: string | null
  pickupLocationId?: string | null
  items: Array<SalesOrderItemRequest>
}
