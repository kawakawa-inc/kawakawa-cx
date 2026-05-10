/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DiscordCallbackRequest } from '../models/DiscordCallbackRequest'
import type { DiscordConnectionStatus } from '../models/DiscordConnectionStatus'
import type { UserDiscordProfile } from '../models/UserDiscordProfile'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class DiscordService {
  /**
   * Get Discord authorization URL
   * Returns a URL to redirect the user to for Discord OAuth
   * @returns any Ok
   * @throws ApiError
   */
  public static getAuthUrl(): CancelablePromise<{
    state: string
    url: string
  }> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/discord/auth-url',
    })
  }
  /**
   * Handle Discord OAuth callback
   * Exchanges the authorization code for tokens and links the Discord account
   * @returns any Ok
   * @throws ApiError
   */
  public static handleCallback({
    requestBody,
  }: {
    requestBody: DiscordCallbackRequest
  }): CancelablePromise<{
    profile: UserDiscordProfile
    success: boolean
  }> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/discord/callback',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get current user's Discord connection status
   * @returns DiscordConnectionStatus Ok
   * @throws ApiError
   */
  public static getConnectionStatus(): CancelablePromise<DiscordConnectionStatus> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/discord/status',
    })
  }
  /**
   * Disconnect Discord from current user's account
   * @returns void
   * @throws ApiError
   */
  public static disconnect(): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/discord/connection',
    })
  }
  /**
   * Sync Discord roles for current user
   * Checks Discord guild membership and assigns any matching app roles
   * @returns any Ok
   * @throws ApiError
   */
  public static syncRoles(): CancelablePromise<{
    rolesAdded: Array<string>
    synced: boolean
  }> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/discord/sync-roles',
    })
  }
}
