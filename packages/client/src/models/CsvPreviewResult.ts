/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CsvRowError } from './CsvRowError'
import type { ParsedPriceRow } from './ParsedPriceRow'
export type CsvPreviewResult = {
  headers: Array<string>
  sampleRows: Array<ParsedPriceRow>
  parseErrors: Array<CsvRowError>
  validationErrors: Array<CsvRowError>
  delimiter: string
  totalRows: number
  validRows: number
}
