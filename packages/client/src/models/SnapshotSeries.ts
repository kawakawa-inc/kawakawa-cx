/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SnapshotPoint } from './SnapshotPoint'
/**
 * One time-series returned by the endpoint. `label` is either `'corp'` for a
 * corp-aggregate series, an FIO/login username for per-user series, or
 * `'Other (N)'` for the rolled-up overflow group.
 */
export type SnapshotSeries = {
  label: string
  points: Array<SnapshotPoint>
}
