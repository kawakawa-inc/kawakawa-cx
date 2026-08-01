/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Currency } from './Currency'
import type { SalesSlipLine } from './SalesSlipLine'
export type SalesSlipDocument = {
  salesOrderId: number
  customerName: string | null
  currency: Currency | null
  lines: Array<SalesSlipLine>
  pickupLocationName: string | null
  pickupFee: number
  total: number
  slipGeneratedAt: string | null
}
