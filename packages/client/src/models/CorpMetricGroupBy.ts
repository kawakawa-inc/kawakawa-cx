/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Metric catalog for Corp Overview Views.
 *
 * Each card's `columns`, `filters[].metric`, and `sortBy[].metric` pick keys
 * from this registry. The registry here is the single source of truth — the
 * controller uses it to validate incoming card configs, and the frontend uses
 * it to render the metric picker and format cell values.
 */
export enum CorpMetricGroupBy {
    TICKER = 'ticker',
    USER_TICKER = 'user-ticker',
}
