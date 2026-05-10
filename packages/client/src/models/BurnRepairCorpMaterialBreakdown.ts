/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BurnRepairCorpMaterialUserContribution } from './BurnRepairCorpMaterialUserContribution'
/**
 * Response for GET /burn-repair/corp/material/:ticker.
 *
 * "Where do these numbers come from?" diagnostic for a single ticker. Aggregate
 * fields match what the corp endpoint reports for the same ticker; `perUser`
 * exposes the user × planet rows that fold into those aggregates so the modal
 * can lay them out as a hierarchy. Repair and stock are intentionally excluded
 * for now — they don't drill down cleanly through `burn_repair_cache`.
 */
export type BurnRepairCorpMaterialBreakdown = {
  commodityTicker: string
  productionDaily: number
  burnDaily: number
  inputsDaily: number
  /**
   * Convenience: burnDaily + inputsDaily, the "consumption" axis in the modal.
   */
  consumptionDaily: number
  /**
   * Sorted descending by `productionDaily + consumptionDaily`.
   */
  perUser: Array<BurnRepairCorpMaterialUserContribution>
}
