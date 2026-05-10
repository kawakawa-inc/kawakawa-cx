/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkFlowCategory } from './BulkFlowCategory'
import type { BulkPreviewItem } from './BulkPreviewItem'
/**
 * Per-planet preview result (no DB writes).
 */
export type BulkPlanetPreview = {
  planetLocationId: string
  items: Array<BulkPreviewItem>
  skippedDuplicates: Array<{
    ticker: string
    category: BulkFlowCategory
  }>
  skippedCycles: Array<{
    ticker: string
    category: BulkFlowCategory
  }>
  /**
   * Set when the planet wasn't found in fio_user_planets.
   */
  error?: string
}
