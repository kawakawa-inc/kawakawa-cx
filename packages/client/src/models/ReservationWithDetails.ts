/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { ReservationStatus } from './ReservationStatus'
export type ReservationWithDetails = {
  id: number
  sellOrderId: number | null
  buyOrderId: number | null
  counterpartyUserId: number
  quantity: number
  status: ReservationStatus
  notes: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  orderOwnerName: string
  orderOwnerUserId: number
  counterpartyName: string
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  pricingMode: ReservationWithDetails.pricingMode
  effectivePrice: number | null
  priceListCode: string | null
  isOrderOwner: boolean
  isCounterparty: boolean
}
export namespace ReservationWithDetails {
  export enum pricingMode {
    FIXED = 'fixed',
    DYNAMIC = 'dynamic',
  }
}
