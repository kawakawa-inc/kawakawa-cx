/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FilterOperator } from './FilterOperator'
import type { MetricKey } from './MetricKey'
/**
 * One row-level filter on a card. Filters are AND-combined; a row passes only
 * when every filter matches. Null-valued metrics (e.g. daysRemaining when
 * there is no deficit) always fail numeric comparisons.
 */
export type ViewCardFilter = {
  metric: MetricKey
  op: FilterOperator
  value: number
}
