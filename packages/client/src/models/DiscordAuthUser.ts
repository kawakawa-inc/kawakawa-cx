/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Role } from './Role'
export type DiscordAuthUser = {
  id: number
  username: string
  displayName: string
  email?: string
  roles: Array<Role>
  permissions: Array<string>
}
