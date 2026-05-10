/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DiscordAuthUser } from './DiscordAuthUser'
import type { DiscordProfileForRegistration } from './DiscordProfileForRegistration'
export type DiscordAuthResult =
  | {
      user: DiscordAuthUser
      token: string
      type: DiscordAuthResult.type
    }
  | {
      state: string
      discordProfile: DiscordProfileForRegistration
      type: DiscordAuthResult.type
    }
  | {
      username: string
      type: DiscordAuthResult.type
    }
  | {
      message: string
      type: DiscordAuthResult.type
    }
export namespace DiscordAuthResult {
  export enum type {
    LOGIN = 'login',
  }
}
