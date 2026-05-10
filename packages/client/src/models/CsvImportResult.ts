/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CsvRowError } from './CsvRowError'
export type CsvImportResult = {
  imported: number
  updated: number
  skipped: number
  errors: Array<CsvRowError>
}
