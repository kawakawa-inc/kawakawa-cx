/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FilterPrivacy } from './FilterPrivacy'
import type { MetricKey } from './MetricKey'
import type { ViewCard } from './ViewCard'
export type CreateCorpOverviewViewRequest = {
  name: string
  tickers: Array<string>
  cards: Array<ViewCard>
  /**
   * Optional; defaults to empty (no exclusions) when omitted.
   */
  excludedUserIds?: Array<number>
  /**
   * Optional; defaults to empty (= use the client's default column set).
   */
  materialsTableColumns?: Array<MetricKey>
  /**
   * Optional; defaults to empty (= follow the view's overall ticker scope).
   */
  materialsTableTickers?: Array<string>
  privacy: FilterPrivacy
}
