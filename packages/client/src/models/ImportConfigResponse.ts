/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ImportFormat } from './ImportFormat'
import type { ImportSourceType } from './ImportSourceType'
import type { Record_string_unknown_ } from './Record_string_unknown_'
export type ImportConfigResponse = {
  id: number
  priceListCode: string
  version: number
  name: string
  sourceType: ImportSourceType
  format: ImportFormat
  sheetsUrl: string | null
  sheetGid: number | null
  config: Record_string_unknown_ | null
  createdAt: string
  updatedAt: string
}
