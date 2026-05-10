/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkFlowCategory } from './BulkFlowCategory'
/**
 * Preview request — same shape as the create request.
 */
export type BulkMultiPreviewRequest = {
  hubLocationId: string
  planetLocationIds: Array<string>
  hubStorageTypes: Array<string>
  planetStorageTypes: Array<string>
  categories: Array<BulkFlowCategory>
}
