/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { SalesOrderItemDto } from './SalesOrderItemDto'
import type { SalesOrderStatus } from './SalesOrderStatus'
export type SalesOrderResponse = {
  id: number
  status: SalesOrderStatus
  requestedByUserId: number
  requestedByName: string | null
  claimedByUserId: number | null
  claimedByName: string | null
  customerName: string | null
  notes: string | null
  priceListCode: string | null
  version: number | null
  currency: Currency | null
  pickupLocationId: string | null
  pickupLocationName: string | null
  pickupFee: number
  packagesSubtotal: number
  grandTotal: number
  claimedAt: string | null
  slipGeneratedAt: string | null
  fulfilledAt: string | null
  createdAt: string
  updatedAt: string
  items: Array<SalesOrderItemDto>
  isRequestor: boolean
  isClaimer: boolean
  canClaim: boolean
  canFulfill: boolean
  canCancel: boolean
  canGenerateSlip: boolean
}
