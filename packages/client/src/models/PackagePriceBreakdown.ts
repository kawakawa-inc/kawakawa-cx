/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { PackageLinePrice } from './PackageLinePrice'
import type { PackagePricingMode } from './PackagePricingMode'
import type { PackageType } from './PackageType'
export type PackagePriceBreakdown = {
  packageId: number
  packageName: string
  type: PackageType
  priceListCode: string
  version: number
  locationId: string
  currency: Currency
  lines: Array<PackageLinePrice>
  materialCost: number
  missingPriceTickers: Array<string>
  salePrice: number | null
  saleCurrency: Currency | null
  currencyMismatch: boolean
  margin: number | null
  marginPercent: number | null
  pricingMode: PackagePricingMode
  marginMultiplier: number | null
  iconCommodityTicker: string | null
}
