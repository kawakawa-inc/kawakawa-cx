/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReservationStatus } from './ReservationStatus'
export type ReservationResponse = {
  id: number
  sellOrderId: number | null
  buyOrderId: number | null
  counterpartyUserId: number
  quantity: number
  status: ReservationStatus
  notes: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}
