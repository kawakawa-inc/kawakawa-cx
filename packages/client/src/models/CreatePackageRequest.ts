/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { PackageInputRequest } from './PackageInputRequest'
import type { PackagePricingMode } from './PackagePricingMode'
import type { PackageType } from './PackageType'
export type CreatePackageRequest = {
  name: string
  type?: PackageType
  salePrice?: number | null
  currency?: Currency | null
  /**
   * Defaults to 'fixed'. 'margin' requires marginMultiplier.
   */
  pricingMode?: PackagePricingMode
  /**
   * Required (and must be > 0) when pricingMode is 'margin'.
   */
  marginMultiplier?: number | null
  /**
   * Optional BoM commodity ticker to use as the package's icon.
   */
  iconCommodityTicker?: string | null
  description?: string | null
  isActive?: boolean
  inputs: Array<PackageInputRequest>
}
