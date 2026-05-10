/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { ReservationStatus } from './ReservationStatus'
export type InvoiceLineItem = {
  id: number
  invoiceId: number
  sellOrderId: number | null
  buyOrderId: number | null
  reservationId: number | null
  reservationStatus: ReservationStatus | null
  commodityTicker: string
  locationId: string
  quantity: number
  unitPrice: number
  currency: Currency
  priceListCode: string | null
  notes: string | null
  orderType: InvoiceLineItem.orderType
  totalValue: number
}
export namespace InvoiceLineItem {
  export enum orderType {
    SELL = 'sell',
    BUY = 'buy',
  }
}
