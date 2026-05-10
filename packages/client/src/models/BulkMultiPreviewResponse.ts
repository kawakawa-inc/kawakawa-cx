/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkPlanetPreview } from './BulkPlanetPreview'
/**
 * Aggregate preview response across all selected planets.
 */
export type BulkMultiPreviewResponse = {
  perPlanet: Array<BulkPlanetPreview>
  totals: {
    cycles: number
    duplicates: number
    items: number
  }
}
