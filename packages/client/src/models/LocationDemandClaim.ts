/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ClaimCategory } from './ClaimCategory'
import type { ClaimSource } from './ClaimSource'
import type { DemandRate } from './DemandRate'
/**
 * A manual node-level demand claim (government, contract, reserve, other)
 */
export type LocationDemandClaim = {
  id: number
  locationId: string
  commodityTicker: string
  quantity: number
  rate: DemandRate
  category: ClaimCategory
  note: string | null
  source: ClaimSource
  createdAt: string
  updatedAt: string
}
