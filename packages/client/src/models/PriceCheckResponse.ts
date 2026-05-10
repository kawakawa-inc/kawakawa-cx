/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { PriceCheckResult } from './PriceCheckResult'
export type PriceCheckResponse = {
  priceListCode: string
  version: number
  currency: Currency
  locationId: string
  locationName: string | null
  results: Array<PriceCheckResult>
}
