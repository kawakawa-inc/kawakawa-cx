/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReadinessLine } from './ReadinessLine'
export type SalesOrderReadinessResponse = {
  salesOrderId: number
  locationId: string | null
  locationName: string | null
  inventoryUploadedAt: string | null
  ready: boolean
  lines: Array<ReadinessLine>
  shortfalls: Array<ReadinessLine>
}
