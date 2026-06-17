/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DiscordInfo } from './DiscordInfo'
import type { FioSyncInfo } from './FioSyncInfo'
import type { Role } from './Role'
export type AdminUser = {
  id: number
  username: string
  email: string | null
  displayName: string
  isLocked: boolean
  roles: Array<Role>
  fioSync: FioSyncInfo
  discord: DiscordInfo
  createdAt: string
}
