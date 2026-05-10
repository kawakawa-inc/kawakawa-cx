/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UpdateSettingsRequest } from '../models/UpdateSettingsRequest'
import type { UserSettingsResponse } from '../models/UserSettingsResponse'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class UserSettingsService {
  /**
   * Get all user settings with their current values and definitions
   * Returns both the user's current values (with defaults applied) and
   * the setting definitions for use in building settings UI
   * @returns UserSettingsResponse Ok
   * @throws ApiError
   */
  public static getSettings(): CancelablePromise<UserSettingsResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/user-settings',
    })
  }
  /**
   * Update one or more user settings
   * Only the settings specified in the request body will be updated;
   * other settings will remain unchanged
   * @returns UserSettingsResponse Ok
   * @throws ApiError
   */
  public static updateSettings({
    requestBody,
  }: {
    requestBody: UpdateSettingsRequest
  }): CancelablePromise<UserSettingsResponse> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/user-settings',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Reset all settings to their default values
   * @returns UserSettingsResponse Ok
   * @throws ApiError
   */
  public static resetAllSettings(): CancelablePromise<UserSettingsResponse> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/user-settings',
    })
  }
  /**
   * Reset a single setting to its default value
   * The setting key should be URL-encoded (e.g., display.preferredCurrency)
   * @returns UserSettingsResponse Ok
   * @throws ApiError
   */
  public static resetSetting({ key }: { key: string }): CancelablePromise<UserSettingsResponse> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/user-settings/{key}',
      path: {
        key: key,
      },
    })
  }
}
