/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkCreateLogisticsFlowsRequest } from '../models/BulkCreateLogisticsFlowsRequest';
import type { BulkCreateLogisticsFlowsResponse } from '../models/BulkCreateLogisticsFlowsResponse';
import type { BulkMultiCreateLogisticsFlowsRequest } from '../models/BulkMultiCreateLogisticsFlowsRequest';
import type { BulkMultiCreateLogisticsFlowsResponse } from '../models/BulkMultiCreateLogisticsFlowsResponse';
import type { BulkMultiPreviewRequest } from '../models/BulkMultiPreviewRequest';
import type { BulkMultiPreviewResponse } from '../models/BulkMultiPreviewResponse';
import type { ContractCoverageEntry } from '../models/ContractCoverageEntry';
import type { CreateLocationDemandClaimRequest } from '../models/CreateLocationDemandClaimRequest';
import type { CreateLogisticsFlowRequest } from '../models/CreateLogisticsFlowRequest';
import type { CreateSelfSuppliedRequest } from '../models/CreateSelfSuppliedRequest';
import type { CreateShipmentRequest } from '../models/CreateShipmentRequest';
import type { CreateTripRequest } from '../models/CreateTripRequest';
import type { LocationDemandClaim } from '../models/LocationDemandClaim';
import type { LogisticsFlow } from '../models/LogisticsFlow';
import type { LogisticsGraph } from '../models/LogisticsGraph';
import type { RepeatShipmentRequest } from '../models/RepeatShipmentRequest';
import type { RepeatTripRequest } from '../models/RepeatTripRequest';
import type { SelfSuppliedEntry } from '../models/SelfSuppliedEntry';
import type { Shipment } from '../models/Shipment';
import type { SuggestStopTimesRequest } from '../models/SuggestStopTimesRequest';
import type { SuggestStopTimesResponse } from '../models/SuggestStopTimesResponse';
import type { Trip } from '../models/Trip';
import type { UpdateLocationDemandClaimRequest } from '../models/UpdateLocationDemandClaimRequest';
import type { UpdateLogisticsFlowRequest } from '../models/UpdateLogisticsFlowRequest';
import type { UpdateShipmentRequest } from '../models/UpdateShipmentRequest';
import type { UpdateTripRequest } from '../models/UpdateTripRequest';
import type { UpdateTripStatusRequest } from '../models/UpdateTripStatusRequest';
import type { UserShip } from '../models/UserShip';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class LogisticsService {
    /**
     * List the user's ships, with embedded current flight (if any), repair
     * materials, current fuel state, and a resolved display name for the
     * ship's location (when parked).
     * @returns UserShip Ok
     * @throws ApiError
     */
    public static listShips(): CancelablePromise<Array<UserShip>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships',
        });
    }
    /**
     * List the user's trips, ordered by first stop's planned arrival ascending.
     * @returns Trip Ok
     * @throws ApiError
     */
    public static listTrips(): CancelablePromise<Array<Trip>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logistics/trips',
        });
    }
    /**
     * Create a new trip in `planned` status.
     * @returns Trip Created
     * @throws ApiError
     */
    public static createTrip({
        requestBody,
    }: {
        requestBody: CreateTripRequest,
    }): CancelablePromise<Trip> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/trips',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get one trip with stops + assigned shipments.
     * @returns Trip Ok
     * @throws ApiError
     */
    public static getTrip({
        id,
    }: {
        id: number,
    }): CancelablePromise<Trip> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logistics/trips/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Replace a planned trip's stops + shipment assignments. Shipments that
     * were on the trip but aren't in the new list go back to the queue
     * (trip_id null). Non-planned trips can update only `shipDbId` and `notes`.
     * @returns Trip Ok
     * @throws ApiError
     */
    public static updateTrip({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateTripRequest,
    }): CancelablePromise<Trip> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/logistics/trips/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete a planned or cancelled trip. Assigned shipments are returned to
     * the queue first. Dispatched/delivered trips are historical records —
     * cancel before deleting.
     * @returns any Ok
     * @throws ApiError
     */
    public static deleteTrip({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/logistics/trips/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Transition a trip status; stamp actualDispatchAt / actualArrivalAt.
     * @returns Trip Ok
     * @throws ApiError
     */
    public static setTripStatus({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateTripStatusRequest,
    }): CancelablePromise<Trip> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/logistics/trips/{id}/status',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Clone a past trip as a new draft. Stops + assigned shipments copy; flow-
     * linked shipment line amounts refresh from the current solver. Stop times
     * shift forward so the first stop lands at `firstStopAt` (defaults to now).
     * The cloned shipments are FRESH parcels (new shipment ids) so the source
     * trip's history isn't disturbed.
     * @returns Trip Created
     * @throws ApiError
     */
    public static repeatTrip({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: RepeatTripRequest,
    }): CancelablePromise<Trip> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/trips/{id}/repeat',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Tier-1 stop-time suggester. Given the trip's stops + assigned shipments
     * + (optional) ship, accumulate per-leg estimates from FIO jump count + a
     * cargo-load factor. Stop 1's time is taken from `startAt`.
     * @returns SuggestStopTimesResponse Ok
     * @throws ApiError
     */
    public static suggestStopTimes({
        requestBody,
    }: {
        requestBody: SuggestStopTimesRequest,
    }): CancelablePromise<SuggestStopTimesResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/trips/suggest-times',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * List the user's shipments. By default returns all shipments; pass
     * `queued=true` to filter to those not yet assigned to a trip.
     * @returns Shipment Ok
     * @throws ApiError
     */
    public static listShipments({
        queued,
    }: {
        queued?: boolean,
    }): CancelablePromise<Array<Shipment>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logistics/shipments',
            query: {
                'queued': queued,
            },
        });
    }
    /**
     * Create a new queued shipment (no trip assigned).
     * @returns Shipment Created
     * @throws ApiError
     */
    public static createShipment({
        requestBody,
    }: {
        requestBody: CreateShipmentRequest,
    }): CancelablePromise<Shipment> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/shipments',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get one shipment with its lines.
     * @returns Shipment Ok
     * @throws ApiError
     */
    public static getShipment({
        id,
    }: {
        id: number,
    }): CancelablePromise<Shipment> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logistics/shipments/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update a shipment's notes / lines / origin / destination. Origin and
     * destination can only be edited while the shipment is queued (no trip).
     * Lines, when supplied, fully replace the existing manifest.
     * @returns Shipment Ok
     * @throws ApiError
     */
    public static updateShipment({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateShipmentRequest,
    }): CancelablePromise<Shipment> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/logistics/shipments/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete a shipment. Only allowed when queued — shipments on a trip must
     * be unassigned first (via the trip update endpoint) or removed when the
     * trip itself is deleted/cancelled.
     * @returns any Ok
     * @throws ApiError
     */
    public static deleteShipment({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/logistics/shipments/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Clone a shipment back into the queue with refreshed flow-linked amounts.
     * The new shipment is unassigned (trip_id = null). Useful for "ship the
     * H2O run again" without rebuilding the manifest.
     * @returns Shipment Created
     * @throws ApiError
     */
    public static repeatShipment({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: RepeatShipmentRequest,
    }): CancelablePromise<Shipment> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/shipments/{id}/repeat',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * List all of the user's self-supplied entries.
     * @returns SelfSuppliedEntry Ok
     * @throws ApiError
     */
    public static list(): CancelablePromise<Array<SelfSuppliedEntry>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logistics/self-supplied',
        });
    }
    /**
     * Create a new self-supplied entry. Returns 200 with the existing entry
     * if the (location, ticker) pair is already marked — make repeat clicks
     * a no-op rather than an error.
     * @returns SelfSuppliedEntry Created
     * @throws ApiError
     */
    public static create({
        requestBody,
    }: {
        requestBody: CreateSelfSuppliedRequest,
    }): CancelablePromise<SelfSuppliedEntry> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/self-supplied',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Remove a self-supplied entry.
     * @returns any Ok
     * @throws ApiError
     */
    public static delete({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/logistics/self-supplied/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get the full logistics graph for the current user, with solver state applied.
     * Returns nodes (with balances, derived flows, shopping lists) and edges
     * (with solver-committed amounts).
     * @returns LogisticsGraph Ok
     * @throws ApiError
     */
    public static getGraph(): CancelablePromise<LogisticsGraph> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logistics/graph',
        });
    }
    /**
     * List all logistics flows for the current user.
     * @returns LogisticsFlow Ok
     * @throws ApiError
     */
    public static listFlows(): CancelablePromise<Array<LogisticsFlow>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logistics/flows',
        });
    }
    /**
     * Create a new logistics flow (edge).
     * @returns LogisticsFlow Created
     * @throws ApiError
     */
    public static createFlow({
        requestBody,
    }: {
        requestBody: CreateLogisticsFlowRequest,
    }): CancelablePromise<LogisticsFlow> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/flows',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Update an existing logistics flow.
     * @returns LogisticsFlow Ok
     * @throws ApiError
     */
    public static updateFlow({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateLogisticsFlowRequest,
    }): CancelablePromise<LogisticsFlow> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/logistics/flows/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete a logistics flow.
     * @returns any Ok
     * @throws ApiError
     */
    public static deleteFlow({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/logistics/flows/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Bulk-create logistics flows from auto-detected FIO material categories.
     *
     * For `consumables`, `inputs`, and `repair`: tickers come from the destination
     * planet's FIO data and become `demand` edges.
     *
     * For `production_output`: tickers come from the source planet's FIO data
     * and become `surplus` edges.
     *
     * Skips dupes (existing flow with same from/to/ticker) and skips any edge
     * that would create a cycle. Returns a summary of what happened.
     * @returns BulkCreateLogisticsFlowsResponse Created
     * @throws ApiError
     */
    public static bulkCreateFlows({
        requestBody,
    }: {
        requestBody: BulkCreateLogisticsFlowsRequest,
    }): CancelablePromise<BulkCreateLogisticsFlowsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/flows/bulk',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Template-based bulk create: connect a single hub to many planets in one
     * operation. Direction auto-orients per category — consumption categories
     * become hub→planet demand edges; production_output becomes planet→hub
     * surplus edges. Supports granular categories (burn, production_input,
     * repair, government, contract, reserve, production_output) and per-planet
     * ticker exclusions from the review step.
     * @returns BulkMultiCreateLogisticsFlowsResponse Created
     * @throws ApiError
     */
    public static bulkMultiCreateFlows({
        requestBody,
    }: {
        requestBody: BulkMultiCreateLogisticsFlowsRequest,
    }): CancelablePromise<BulkMultiCreateLogisticsFlowsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/flows/bulk-multi',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Preview what the bulk-multi endpoint would create, without writing to the
     * database. Returns per-planet detected tickers grouped by granular category
     * (burn, production_input, repair, government, contract, reserve,
     * production_output). The frontend review step uses this to let the user
     * deselect individual materials before committing.
     * @returns BulkMultiPreviewResponse Ok
     * @throws ApiError
     */
    public static previewBulkMultiFlows({
        requestBody,
    }: {
        requestBody: BulkMultiPreviewRequest,
    }): CancelablePromise<BulkMultiPreviewResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/flows/bulk-multi/preview',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * List all location demand claims for the current user.
     * @returns LocationDemandClaim Ok
     * @throws ApiError
     */
    public static listClaims(): CancelablePromise<Array<LocationDemandClaim>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logistics/claims',
        });
    }
    /**
     * Create a new location demand claim.
     * @returns LocationDemandClaim Created
     * @throws ApiError
     */
    public static createClaim({
        requestBody,
    }: {
        requestBody: CreateLocationDemandClaimRequest,
    }): CancelablePromise<LocationDemandClaim> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/logistics/claims',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Update an existing location demand claim.
     * @returns LocationDemandClaim Ok
     * @throws ApiError
     */
    public static updateClaim({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateLocationDemandClaimRequest,
    }): CancelablePromise<LocationDemandClaim> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/logistics/claims/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete a location demand claim.
     * @returns any Ok
     * @throws ApiError
     */
    public static deleteClaim({
        id,
    }: {
        id: number,
    }): CancelablePromise<{
        success: boolean;
    }> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/logistics/claims/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * @returns ContractCoverageEntry Ok
     * @throws ApiError
     */
    public static list1(): CancelablePromise<Array<ContractCoverageEntry>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/logistics/contract-coverage',
        });
    }
}
