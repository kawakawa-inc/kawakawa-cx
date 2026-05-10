/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CsvFieldMapping } from './CsvFieldMapping'
import type { Currency } from './Currency'
export type CsvImportRequest = {
  /**
   * The exchange code to import prices for (KAWA, CI1, etc.)
   */
  exchangeCode: string
  /**
   * Field mapping configuration
   */
  mapping: CsvFieldMapping
  /**
   * Default location if not in CSV
   */
  locationDefault?: string
  /**
   * Default currency if not in CSV
   */
  currencyDefault?: Currency
  /**
   * CSV delimiter (auto-detected if not provided)
   */
  delimiter?: string
  /**
   * Whether the CSV has a header row (default: true)
   */
  hasHeader?: boolean
}
