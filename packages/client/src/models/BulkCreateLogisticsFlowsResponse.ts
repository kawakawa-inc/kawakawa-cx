/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkDetectionCategory } from './BulkDetectionCategory'
import type { LogisticsFlow } from './LogisticsFlow'
export type BulkCreateLogisticsFlowsResponse = {
  /**
   * Flows that were inserted, grouped by category
   */
  created: Array<{
    flow: LogisticsFlow
    category: BulkDetectionCategory
  }>
  /**
   * Tickers skipped because a flow with the same (from, to, ticker) already existed
   */
  skippedDuplicates: Array<{
    ticker: string
    category: BulkDetectionCategory
  }>
  /**
   * Tickers skipped because inserting them would create a cycle
   */
  skippedCycles: Array<{
    ticker: string
    category: BulkDetectionCategory
  }>
  /**
   * Categories where no FIO tickers were detected at the appropriate planet
   */
  emptyCategories: Array<BulkDetectionCategory>
}
