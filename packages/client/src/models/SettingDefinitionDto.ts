/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SettingDefinitionDto = {
  key: string
  type: SettingDefinitionDto.type
  defaultValue: any
  category: string
  label: string
  description: string
  enumOptions?: Array<string>
}
export namespace SettingDefinitionDto {
  export enum type {
    STRING = 'string',
    BOOLEAN = 'boolean',
    NUMBER = 'number',
    ENUM = 'enum',
    STRING_ = 'string[]',
  }
}
