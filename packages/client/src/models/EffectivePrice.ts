/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AppliedAdjustment } from './AppliedAdjustment'
import type { Currency } from './Currency'
import type { PriceSource } from './PriceSource'
export type EffectivePrice = {
  priceListCode: string
  version: number
  commodityTicker: string
  commodityName: string | null
  locationId: string
  locationName: string | null
  currency: Currency
  basePrice: number
  source: PriceSource
  sourceReference: string | null
  adjustments: Array<AppliedAdjustment>
  finalPrice: number
  exchangeCode: string
  isFallback?: boolean
  requestedLocationId?: string
}
