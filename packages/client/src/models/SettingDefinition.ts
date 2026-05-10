/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SettingValueType } from './SettingValueType'
export type SettingDefinition = {
  key: string
  type: SettingValueType
  defaultValue: any
  category: string
  label: string
  description: string
  enumOptions?: Array<string>
  sensitive?: boolean
}
