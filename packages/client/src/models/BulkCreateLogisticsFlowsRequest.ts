/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkDetectionCategory } from './BulkDetectionCategory'
export type BulkCreateLogisticsFlowsRequest = {
  fromLocationId: string
  toLocationId: string
  fromStorageTypes: Array<string>
  toStorageTypes: Array<string>
  categories: Array<BulkDetectionCategory>
}
