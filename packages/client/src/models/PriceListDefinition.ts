/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { PriceListType } from './PriceListType'
export type PriceListDefinition = {
  code: string
  name: string
  description: string | null
  type: PriceListType
  currency: Currency
  defaultLocationId: string | null
  defaultLocationName: string | null
  isActive: boolean
  currentVersion: number
  createdAt: string
  updatedAt: string
  priceCount?: number
  importConfigCount?: number
}
