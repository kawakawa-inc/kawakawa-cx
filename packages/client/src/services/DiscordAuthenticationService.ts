/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DiscordAuthResult } from '../models/DiscordAuthResult';
import type { DiscordAuthUrlResponse } from '../models/DiscordAuthUrlResponse';
import type { DiscordRegisterRequest } from '../models/DiscordRegisterRequest';
import type { DiscordRegisterResponse } from '../models/DiscordRegisterResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DiscordAuthenticationService {
    /**
     * Get Discord OAuth authorization URL for login/registration
     * This endpoint does NOT require authentication
     * @returns DiscordAuthUrlResponse Ok
     * @throws ApiError
     */
    public static getAuthUrl({
        prompt,
    }: {
        /**
         * - Optional prompt parameter: 'none' to skip consent for returning users (login), 'consent' to always show
         */
        prompt?: 'none' | 'consent',
    }): CancelablePromise<DiscordAuthUrlResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/auth/discord/auth-url',
            query: {
                'prompt': prompt,
            },
        });
    }
    /**
     * Handle Discord OAuth callback for login/registration
     * Returns different result types based on the situation:
     * - login: User has linked Discord, returns JWT token
     * - register_required: New Discord user, needs to complete registration
     * - account_exists_no_discord: User exists but hasn't linked Discord
     * - consent_required: prompt=none was used but user hasn't authorized before
     * - error: Something went wrong
     * @returns DiscordAuthResult Ok
     * @throws ApiError
     */
    public static handleCallback({
        code,
        state,
        error,
        errorDescription,
    }: {
        code?: string,
        state?: string,
        error?: string,
        errorDescription?: string,
    }): CancelablePromise<DiscordAuthResult> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/auth/discord/callback',
            query: {
                'code': code,
                'state': state,
                'error': error,
                'error_description': errorDescription,
            },
        });
    }
    /**
     * Complete Discord registration
     * Creates a new user account linked to Discord
     * @returns DiscordRegisterResponse Ok
     * @throws ApiError
     */
    public static completeRegistration({
        requestBody,
    }: {
        requestBody: DiscordRegisterRequest,
    }): CancelablePromise<DiscordRegisterResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/discord/register',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
