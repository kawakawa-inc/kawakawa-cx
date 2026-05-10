/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BuyOrderSourceMode } from './BuyOrderSourceMode'
import type { Currency } from './Currency'
import type { DemandSource } from './DemandSource'
import type { OrderType } from './OrderType'
import type { SellOrderLimitMode } from './SellOrderLimitMode'
export type CreateSellOrderRequest = {
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  priceListCode?: string | null
  orderType?: OrderType
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
  reserveSource?: BuyOrderSourceMode
  reserveDemandSource?: DemandSource
  reserveTargetDays?: number
}
