/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BurnRepairCorpMaterial } from './BurnRepairCorpMaterial'
import type { BurnRepairCorpPerUserRow } from './BurnRepairCorpPerUserRow'
import type { ExcludedMember } from './ExcludedMember'
import type { Record_string_number_ } from './Record_string_number_'
/**
 * Response for GET /burn-repair/corp
 */
export type BurnRepairCorpResponse = {
  materials: Array<BurnRepairCorpMaterial>
  includedUserCount: number
  /**
   * Users with matching roles who are generally inactive (no recent activity
   * per `lastActiveAt`) — excluded from aggregation. Does not include members
   * excluded for being on vacation; see `vacationUserCount`.
   */
  staleUserCount: number
  /**
   * Users with matching roles who are currently in vacation mode — excluded from aggregation.
   */
  vacationUserCount: number
  /**
   * Corp-wide on-hand inventory keyed by ticker — sum of FIO-reported quantity
   * across every storage owned by an included user. Powers `stock` /
   * `daysRemaining`: those metrics answer "how long does the corp last on
   * what it already has?", which is an on-hand question, not a "what's listed
   * for sale?" one. The for-sale flavor lives in `listedStock` /
   * `daysListed`.
   */
  availableSurplus: Record_string_number_
  /**
   * Corp-wide *listed* stock keyed by ticker — sum of remaining sell-order
   * quantities (FIO-aware enrichment caps each listing at what the seller can
   * actually fulfill). Companion to `availableSurplus`: answers "what could a
   * buyer purchase from the corp's exchange right now?" Not part of the
   * runway math; surfaced so the UI can render it as a separate column.
   */
  listedStock: Record_string_number_
  /**
   * Per-user-per-ticker rollups for dashboard Top Producers/Consumers
   */
  perUser: Array<BurnRepairCorpPerUserRow>
  /**
   * Members who would otherwise contribute but were excluded — by the
   * activity gate (stale or on vacation) or by the requesting user's manual
   * exclusion list. Surfaced so the UI can render a "N excluded" chip with a
   * per-member breakdown tooltip.
   */
  excludedMembers: Array<ExcludedMember>
}
