/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthResponse } from '../models/AuthResponse'
import type { CompleteDiscordLinkRequest } from '../models/CompleteDiscordLinkRequest'
import type { LoginRequest } from '../models/LoginRequest'
import type { RegisterRequest } from '../models/RegisterRequest'
import type { ResetPasswordRequest } from '../models/ResetPasswordRequest'
import type { SuccessMessage } from '../models/SuccessMessage'
import type { UsernameAvailabilityResponse } from '../models/UsernameAvailabilityResponse'
import type { ValidateDiscordLinkTokenResponse } from '../models/ValidateDiscordLinkTokenResponse'
import type { ValidateTokenResponse } from '../models/ValidateTokenResponse'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class AuthenticationService {
  /**
   * @returns AuthResponse Login successful
   * @throws ApiError
   */
  public static login({
    requestBody,
  }: {
    requestBody: LoginRequest
  }): CancelablePromise<AuthResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/auth/login',
      body: requestBody,
      mediaType: 'application/json',
      errors: {
        401: `Invalid credentials`,
        403: `Account is locked`,
      },
    })
  }
  /**
   * @returns AuthResponse Registration successful
   * @throws ApiError
   */
  public static register({
    requestBody,
  }: {
    requestBody: RegisterRequest
  }): CancelablePromise<AuthResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/auth/register',
      body: requestBody,
      mediaType: 'application/json',
      errors: {
        400: `Username already exists`,
      },
    })
  }
  /**
   * @returns SuccessMessage Password reset successful
   * @throws ApiError
   */
  public static resetPassword({
    requestBody,
  }: {
    requestBody: ResetPasswordRequest
  }): CancelablePromise<SuccessMessage> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/auth/reset-password',
      body: requestBody,
      mediaType: 'application/json',
      errors: {
        400: `Invalid or expired token`,
      },
    })
  }
  /**
   * @returns ValidateTokenResponse Token validation result
   * @throws ApiError
   */
  public static validateResetToken({
    token,
  }: {
    token: string
  }): CancelablePromise<ValidateTokenResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/auth/validate-reset-token',
      query: {
        token: token,
      },
    })
  }
  /**
   * Check if a username is available for registration
   * @returns UsernameAvailabilityResponse Username availability checked
   * @throws ApiError
   */
  public static checkUsernameAvailability({
    username,
  }: {
    /**
     * - The username to check
     */
    username: string
  }): CancelablePromise<UsernameAvailabilityResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/auth/check-username',
      query: {
        username: username,
      },
    })
  }
  /**
   * Validate a Discord link token (from /link bot command)
   * Returns Discord user info if token is valid
   * @returns ValidateDiscordLinkTokenResponse Token validation result
   * @throws ApiError
   */
  public static validateDiscordLinkToken({
    token,
  }: {
    token: string
  }): CancelablePromise<ValidateDiscordLinkTokenResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/auth/validate-discord-link-token',
      query: {
        token: token,
      },
    })
  }
  /**
   * Complete Discord account linking
   * Requires authentication - links the Discord from the token to the current user
   * @returns SuccessMessage Discord linked successfully
   * @throws ApiError
   */
  public static completeDiscordLink({
    requestBody,
  }: {
    requestBody: CompleteDiscordLinkRequest
  }): CancelablePromise<SuccessMessage> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/auth/complete-discord-link',
      body: requestBody,
      mediaType: 'application/json',
      errors: {
        400: `Invalid or expired token`,
        401: `Authentication required`,
        409: `Account already has Discord linked`,
      },
    })
  }
}
