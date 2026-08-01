/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BurnRepairCorpBuildingsResponse } from '../models/BurnRepairCorpBuildingsResponse'
import type { BurnRepairCorpMaterialBreakdown } from '../models/BurnRepairCorpMaterialBreakdown'
import type { BurnRepairCorpResponse } from '../models/BurnRepairCorpResponse'
import type { BurnRepairCorpWorkforceResponse } from '../models/BurnRepairCorpWorkforceResponse'
import type { BurnRepairMyBasesResponse } from '../models/BurnRepairMyBasesResponse'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class BurnRepairService {
  /**
   * Get burn/repair data for the current user's bases.
   * Returns pre-computed daily burn rates, input rates, and repair totals
   * grouped by planet. Also includes building count and workforce summary.
   * @returns BurnRepairMyBasesResponse Ok
   * @throws ApiError
   */
  public static getMyBases(): CancelablePromise<BurnRepairMyBasesResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/burn-repair/my-bases',
    })
  }
  /**
   * Get corp-wide aggregated burn/repair data.
   * Sums across all users whose roles match the burnRepair.includedRoles setting.
   *
   * `excludedUserIds` is a CSV of user IDs to additionally exclude on top of
   * the role + activity filter (stale or on vacation). Used by the "Users
   * included" planning dropdown so the corp view can be modeled as if
   * specific members weren't around (e.g. planning around someone's actual
   * vacation).
   * @returns BurnRepairCorpResponse Ok
   * @throws ApiError
   */
  public static getCorpOverview({
    excludedUserIds,
  }: {
    excludedUserIds?: string
  }): CancelablePromise<BurnRepairCorpResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/burn-repair/corp',
      query: {
        excludedUserIds: excludedUserIds,
      },
    })
  }
  /**
   * Get corp-wide building counts by ticker.
   * @returns BurnRepairCorpBuildingsResponse Ok
   * @throws ApiError
   */
  public static getCorpBuildings({
    excludedUserIds,
  }: {
    excludedUserIds?: string
  }): CancelablePromise<BurnRepairCorpBuildingsResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/burn-repair/corp/buildings',
      query: {
        excludedUserIds: excludedUserIds,
      },
    })
  }
  /**
   * Get corp-wide workforce summary.
   * @returns BurnRepairCorpWorkforceResponse Ok
   * @throws ApiError
   */
  public static getCorpWorkforce({
    excludedUserIds,
  }: {
    excludedUserIds?: string
  }): CancelablePromise<BurnRepairCorpWorkforceResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/burn-repair/corp/workforce',
      query: {
        excludedUserIds: excludedUserIds,
      },
    })
  }
  /**
   * Per-ticker breakdown for the "where do these numbers come from?" modal.
   *
   * Aggregates production, workforce burn, and production inputs for a single
   * commodity, then exposes the user × planet rows that fold into them. Stock
   * and repair are intentionally omitted — neither drills cleanly through
   * `burn_repair_cache` and both are tracked separately for now.
   * @returns BurnRepairCorpMaterialBreakdown Ok
   * @throws ApiError
   */
  public static getCorpMaterialBreakdown({
    ticker,
    excludedUserIds,
  }: {
    ticker: string
    excludedUserIds?: string
  }): CancelablePromise<BurnRepairCorpMaterialBreakdown> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/burn-repair/corp/material/{ticker}',
      path: {
        ticker: ticker,
      },
      query: {
        excludedUserIds: excludedUserIds,
      },
    })
  }
}
