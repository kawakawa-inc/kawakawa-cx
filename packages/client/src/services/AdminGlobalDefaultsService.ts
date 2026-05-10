/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GlobalDefaultsResponse } from '../models/GlobalDefaultsResponse';
import type { SettingHistoryEntry } from '../models/SettingHistoryEntry';
import type { UpdateGlobalDefaultsRequest } from '../models/UpdateGlobalDefaultsRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AdminGlobalDefaultsService {
    /**
     * Get all configurable settings with their code defaults, admin defaults, and effective values
     * @returns GlobalDefaultsResponse Ok
     * @throws ApiError
     */
    public static getGlobalDefaults(): CancelablePromise<GlobalDefaultsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/global-defaults',
        });
    }
    /**
     * Update admin defaults for one or more settings
     * @returns GlobalDefaultsResponse Ok
     * @throws ApiError
     */
    public static updateGlobalDefaults({
        requestBody,
    }: {
        requestBody: UpdateGlobalDefaultsRequest,
    }): CancelablePromise<GlobalDefaultsResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/admin/global-defaults',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Reset a setting to its code-defined default (remove admin override)
     * @returns GlobalDefaultsResponse Ok
     * @throws ApiError
     */
    public static resetGlobalDefault({
        key,
    }: {
        key: string,
    }): CancelablePromise<GlobalDefaultsResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/admin/global-defaults/{key}',
            path: {
                'key': key,
            },
        });
    }
    /**
     * Get change history for a specific setting's admin default
     * @returns SettingHistoryEntry Ok
     * @throws ApiError
     */
    public static getSettingHistory({
        key,
    }: {
        key: string,
    }): CancelablePromise<Array<SettingHistoryEntry>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/admin/global-defaults/history/{key}',
            path: {
                'key': key,
            },
        });
    }
}
