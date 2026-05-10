/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReservationStatus } from './ReservationStatus'
export type OrderReservationSummary = {
  id: number
  status: ReservationStatus
  quantity: number
  counterpartyUserId: number
  counterpartyName: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  invoiceId: number | null
  canViewInvoice: boolean
  notes: string | null
}
