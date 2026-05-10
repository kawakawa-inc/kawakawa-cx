/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Commodity } from '../models/Commodity';
import type { Location } from '../models/Location';
import type { LocationType } from '../models/LocationType';
import type { RoleResponse } from '../models/RoleResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ReferenceDataService {
    /**
     * Get all roles
     * Returns the list of roles that can be used for order targeting
     * @returns RoleResponse Ok
     * @throws ApiError
     */
    public static getRoles(): CancelablePromise<Array<RoleResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/roles',
        });
    }
    /**
     * Get all locations
     * @returns Location Ok
     * @throws ApiError
     */
    public static getLocations({
        search,
        type,
        system,
    }: {
        /**
         * Optional search term to filter by name, id, or system
         */
        search?: string,
        /**
         * Optional filter by location type ('Station' or 'Planet')
         */
        type?: LocationType,
        /**
         * Optional filter by system code
         */
        system?: string,
    }): CancelablePromise<Array<Location>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/locations',
            query: {
                'search': search,
                'type': type,
                'system': system,
            },
        });
    }
    /**
     * Get stations only
     * @returns Location Ok
     * @throws ApiError
     */
    public static getStations(): CancelablePromise<Array<Location>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/locations/stations',
        });
    }
    /**
     * Get planets only
     * @returns Location Ok
     * @throws ApiError
     */
    public static getPlanets({
        system,
    }: {
        system?: string,
    }): CancelablePromise<Array<Location>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/locations/planets',
            query: {
                'system': system,
            },
        });
    }
    /**
     * Get a specific location by ID
     * @returns any Ok
     * @throws ApiError
     */
    public static getLocation({
        id,
    }: {
        /**
         * The location ID (e.g., 'BEN', 'UV-351a')
         */
        id: string,
    }): CancelablePromise<Location | null> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/locations/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get all unique systems
     * @returns any Ok
     * @throws ApiError
     */
    public static getSystems(): CancelablePromise<Array<{
        name: string;
        code: string;
    }>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/locations/systems/list',
        });
    }
    /**
     * Get the jump count (distance) between two locations
     * @returns any Ok
     * @throws ApiError
     */
    public static getDistance({
        from,
        to,
    }: {
        /**
         * Starting location ID (system, planet ID, or planet name)
         */
        from: string,
        /**
         * Destination location ID (system, planet ID, or planet name)
         */
        to: string,
    }): CancelablePromise<{
        jumpCount: number | null;
        to: string;
        from: string;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/locations/distance',
            query: {
                'from': from,
                'to': to,
            },
        });
    }
    /**
     * Get all commodities
     * @returns Commodity Ok
     * @throws ApiError
     */
    public static getCommodities({
        search,
        category,
    }: {
        /**
         * Optional search term to filter by ticker or name
         */
        search?: string,
        /**
         * Optional category filter
         */
        category?: string,
    }): CancelablePromise<Array<Commodity>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/commodities',
            query: {
                'search': search,
                'category': category,
            },
        });
    }
    /**
     * Get a specific commodity by ticker
     * @returns any Ok
     * @throws ApiError
     */
    public static getCommodity({
        ticker,
    }: {
        /**
         * The commodity ticker (e.g., 'H2O', 'FE', 'RAT')
         */
        ticker: string,
    }): CancelablePromise<Commodity | null> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/commodities/{ticker}',
            path: {
                'ticker': ticker,
            },
        });
    }
    /**
     * Get all unique categories
     * @returns string Ok
     * @throws ApiError
     */
    public static getCategories(): CancelablePromise<Array<string>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/commodities/categories/list',
        });
    }
}
