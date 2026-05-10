/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateVersionRequest = {
  label?: string
  description?: string
  /**
   * Required: default location for this version (e.g., 'BEN'). Use 'current' to inherit from the current version.
   */
  defaultLocationId: string
  copyFrom?: number | 'current' | 'latest'
}
