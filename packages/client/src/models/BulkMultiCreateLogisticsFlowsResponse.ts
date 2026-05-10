/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkMultiPlanetResult } from './BulkMultiPlanetResult'
export type BulkMultiCreateLogisticsFlowsResponse = {
  perPlanet: Array<BulkMultiPlanetResult>
  totals: {
    empty: number
    cycles: number
    duplicates: number
    created: number
  }
}
