/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkFlowCategory } from './BulkFlowCategory'
import type { LogisticsFlow } from './LogisticsFlow'
export type BulkMultiPlanetResult = {
  planetLocationId: string
  created: Array<{
    flow: LogisticsFlow
    category: BulkFlowCategory
  }>
  skippedDuplicates: Array<{
    ticker: string
    category: BulkFlowCategory
  }>
  skippedCycles: Array<{
    ticker: string
    category: BulkFlowCategory
  }>
  emptyCategories: Array<BulkFlowCategory>
  /**
   * Set when the planet wasn't found in fio_user_planets (not synced, or not owned by user)
   */
  error?: string
}
