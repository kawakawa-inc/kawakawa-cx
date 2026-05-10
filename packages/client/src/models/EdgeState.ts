/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlowKind } from './FlowKind'
/**
 * State of a single edge after the solver has run
 */
export type EdgeState = {
  id: number
  fromLocationId: string
  toLocationId: string
  commodityTicker: string
  kind: FlowKind
  /**
   * Solver-committed amount for this edge, already converted against burnDays if the source rate was 'daily'
   */
  amount: number
  /**
   * True when this edge could not be fully satisfied by upstream
   */
  isBottleneck: boolean
  /**
   * True when kind='fixed' (user-pinned)
   */
  isOverride: boolean
  priority: number | null
  /**
   * Days for one ship trip on this edge (mirrored from the flow row).
   */
  transitDays: number
  /**
   * Days between shipments on this flow (mirrored from the flow row).
   */
  cadenceDays: number
  /**
   * Quantity carried in one shipment on this flow:
   * `dailyConsumption(at destination) × cadenceDays`. 0 when the destination
   * has no consumption for the ticker. Surplus edges report 0 in Stage A —
   * surplus shipments are tracked separately in Stage B.
   */
  perShipmentAmount: number
  /**
   * The next planned arrival date for this flow at the destination. In Stage
   * A this is a forward projection from `now`: `now + cadenceDays`. Stage B
   * (shipment entity) anchors it to the latest active shipment instead. ISO
   * string. Null on surplus edges.
   */
  nextArrivalAt: string | null
  /**
   * When the ship must load at the source to arrive on `nextArrivalAt`:
   * `nextArrivalAt − transitDays`. ISO string. Null on surplus edges.
   */
  loadAt: string | null
  /**
   * Latest date the ship must depart the source — same as `loadAt` today.
   * Kept distinct so we can later add ship-prep time without renaming.
   */
  shipBy: string | null
  /**
   * Latest date to place an inbound contract so goods arrive at the source
   * by `loadAt`: `loadAt − contract_lead_days`. Per-flow because each flow
   * has its own cadence and therefore its own load schedule. ISO string.
   * Null on surplus edges.
   */
  contractBy: string | null
  note: string | null
}
