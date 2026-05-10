/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdjustmentType } from './AdjustmentType'
export type CreatePriceAdjustmentRequest = {
  priceListCode?: string | null
  commodityTicker?: string | null
  locationId?: string | null
  adjustmentType: AdjustmentType
  adjustmentValue: number
  priority?: number
  description?: string | null
  isActive?: boolean
  effectiveFrom?: string | null
  effectiveUntil?: string | null
}
