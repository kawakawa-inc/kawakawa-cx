/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Role } from './Role'
export type UserProfile = {
  username: string
  displayName: string
  email: string | null
  roles: Array<Role>
  permissions: Array<string>
}
