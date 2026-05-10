/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChangePasswordRequest } from '../models/ChangePasswordRequest';
import type { UpdateProfileRequest } from '../models/UpdateProfileRequest';
import type { UserProfile } from '../models/UserProfile';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AccountService {
    /**
     * @returns UserProfile Ok
     * @throws ApiError
     */
    public static getProfile(): CancelablePromise<UserProfile> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/account',
        });
    }
    /**
     * @returns UserProfile Ok
     * @throws ApiError
     */
    public static updateProfile({
        requestBody,
    }: {
        requestBody: UpdateProfileRequest,
    }): CancelablePromise<UserProfile> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/account',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete the current user's account and all associated data
     * This is a permanent action that cannot be undone
     * @returns any Ok
     * @throws ApiError
     */
    public static deleteAccount(): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/account',
        });
    }
    /**
     * @returns any Ok
     * @throws ApiError
     */
    public static changePassword({
        requestBody,
    }: {
        requestBody: ChangePasswordRequest,
    }): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/account/password',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
