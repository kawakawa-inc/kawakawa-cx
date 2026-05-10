/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Role } from './Role'
export type AuthResponse = {
  token: string
  user: {
    permissions: Array<string>
    roles: Array<Role>
    email?: string
    displayName: string
    username: string
    id: number
  }
}
