/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { PackageInputRequest } from './PackageInputRequest'
import type { PackagePricingMode } from './PackagePricingMode'
import type { PackageType } from './PackageType'
export type UpdatePackageRequest = {
  name?: string
  type?: PackageType
  salePrice?: number | null
  currency?: Currency | null
  pricingMode?: PackagePricingMode
  marginMultiplier?: number | null
  iconCommodityTicker?: string | null
  description?: string | null
  isActive?: boolean
  /**
   * If provided, fully replaces the package's existing material lines.
   */
  inputs?: Array<PackageInputRequest>
}
