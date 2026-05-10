/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PriceDiffEntry } from './PriceDiffEntry'
export type VersionDiff = {
  added: Array<PriceDiffEntry>
  removed: Array<PriceDiffEntry>
  changed: Array<PriceDiffEntry>
  unchanged: number
}
