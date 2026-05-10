/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UserPlanetSummary } from '../models/UserPlanetSummary';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SupplyPlanningService {
    /**
     * List synced planets with last sync timestamps
     * @returns UserPlanetSummary Ok
     * @throws ApiError
     */
    public static getPlanets(): CancelablePromise<Array<UserPlanetSummary>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/supply-planning/planets',
        });
    }
}
