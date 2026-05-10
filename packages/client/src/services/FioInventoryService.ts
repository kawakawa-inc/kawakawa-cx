/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FioInventoryResponse } from '../models/FioInventoryResponse';
import type { FioStatsResponse } from '../models/FioStatsResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class FioInventoryService {
    /**
     * Get the current user's synced FIO inventory
     * @returns FioInventoryResponse Ok
     * @throws ApiError
     */
    public static getInventory(): CancelablePromise<Array<FioInventoryResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/fio/inventory',
        });
    }
    /**
     * Clear all FIO inventory data for the current user
     * @returns any Inventory cleared
     * @throws ApiError
     */
    public static clearInventory(): CancelablePromise<{
        deletedStorages: number;
        deletedItems: number;
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/fio/inventory',
        });
    }
    /**
     * Get the last sync time for the current user
     * @returns any Ok
     * @throws ApiError
     */
    public static getLastSyncTime(): CancelablePromise<{
        fioUploadedAt: string | null;
        lastSyncedAt: string | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/fio/inventory/last-sync',
        });
    }
    /**
     * Get the unique location IDs where the user has FIO inventory,
     * along with their storage types (STORE = base, WAREHOUSE_STORE = warehouse, etc.)
     * @returns any Ok
     * @throws ApiError
     */
    public static getStorageLocations(): CancelablePromise<{
        locations: Array<{
            storageTypes: Array<string>;
            locationId: string;
        }>;
        locationIds: Array<string>;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/fio/inventory/locations',
        });
    }
    /**
     * Get FIO inventory statistics for the current user
     * @returns FioStatsResponse Ok
     * @throws ApiError
     */
    public static getStats(): CancelablePromise<FioStatsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/fio/inventory/stats',
        });
    }
}
