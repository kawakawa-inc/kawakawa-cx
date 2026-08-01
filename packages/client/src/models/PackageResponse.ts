/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { PackageInputDto } from './PackageInputDto'
import type { PackagePricingMode } from './PackagePricingMode'
import type { PackageType } from './PackageType'
export type PackageResponse = {
  id: number
  name: string
  type: PackageType
  salePrice: number | null
  currency: Currency | null
  pricingMode: PackagePricingMode
  marginMultiplier: number | null
  /**
   * One of the BoM commodity tickers, used as the package's visual icon.
   */
  iconCommodityTicker: string | null
  description: string | null
  isActive: boolean
  createdByUserId: number | null
  createdByUsername: string | null
  createdAt: string
  updatedAt: string
  inputs: Array<PackageInputDto>
}
