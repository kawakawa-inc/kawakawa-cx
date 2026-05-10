/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DiscordConnectionErrorCode } from './DiscordConnectionErrorCode'
export type DiscordTestConnectionResponse = {
  success: boolean
  guild?: {
    memberCount?: number
    icon: string | null
    name: string
    id: string
  }
  error?: string
  errorCode?: DiscordConnectionErrorCode
}
