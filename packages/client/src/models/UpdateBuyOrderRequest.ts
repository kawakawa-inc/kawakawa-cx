/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { OrderType } from './OrderType'
export type UpdateBuyOrderRequest = {
  quantity?: number
  price?: number
  currency?: Currency
  priceListCode?: string | null
  orderType?: OrderType
  targetDays?: number
  isStanding?: boolean
}
