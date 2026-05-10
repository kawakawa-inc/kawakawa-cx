/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateBuyOrderReservationRequest } from '../models/CreateBuyOrderReservationRequest';
import type { CreateSellOrderReservationRequest } from '../models/CreateSellOrderReservationRequest';
import type { OrderReservationSummary } from '../models/OrderReservationSummary';
import type { ReservationResponse } from '../models/ReservationResponse';
import type { ReservationStatus } from '../models/ReservationStatus';
import type { ReservationWithDetails } from '../models/ReservationWithDetails';
import type { UpdateReservationStatusRequest } from '../models/UpdateReservationStatusRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ReservationsService {
    /**
     * Get all reservations for the current user (as order owner or counterparty)
     * @returns ReservationWithDetails Ok
     * @throws ApiError
     */
    public static getReservations({
        role,
        status,
    }: {
        /**
         * Filter by role: 'owner' (my orders being reserved), 'counterparty' (my reservations), or 'all'
         */
        role?: 'owner' | 'counterparty' | 'all',
        /**
         * Filter by reservation status
         */
        status?: ReservationStatus,
    }): CancelablePromise<Array<ReservationWithDetails>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/reservations',
            query: {
                'role': role,
                'status': status,
            },
        });
    }
    /**
     * Get a specific reservation by ID
     * @returns ReservationWithDetails Ok
     * @throws ApiError
     */
    public static getReservation({
        id,
    }: {
        id: number,
    }): CancelablePromise<ReservationWithDetails> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/reservations/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Delete a reservation (counterparty only, if pending)
     * @returns void
     * @throws ApiError
     */
    public static deleteReservation({
        id,
    }: {
        id: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/reservations/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Get reservations against a specific sell order. Visible to the order owner
     * unconditionally; everyone else gated by the order's orderType permission
     * (orders.view_internal / orders.view_partner). Notes are only included for
     * the order owner and the reservation's own counterparty.
     * @returns OrderReservationSummary Ok
     * @throws ApiError
     */
    public static getReservationsForSellOrder({
        sellOrderId,
        all,
    }: {
        sellOrderId: number,
        /**
         * If true, include cancelled/rejected/expired reservations and the
         * full fulfilled history. Default omits those and caps fulfilled to 30 days.
         */
        all?: boolean,
    }): CancelablePromise<Array<OrderReservationSummary>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/reservations/sell-order/{sellOrderId}',
            path: {
                'sellOrderId': sellOrderId,
            },
            query: {
                'all': all,
            },
        });
    }
    /**
     * Get reservations against a specific buy order. Same visibility model as
     * .
     * @returns OrderReservationSummary Ok
     * @throws ApiError
     */
    public static getReservationsForBuyOrder({
        buyOrderId,
        all,
    }: {
        buyOrderId: number,
        all?: boolean,
    }): CancelablePromise<Array<OrderReservationSummary>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/reservations/buy-order/{buyOrderId}',
            path: {
                'buyOrderId': buyOrderId,
            },
            query: {
                'all': all,
            },
        });
    }
    /**
     * Create a reservation against a sell order (user wants to buy)
     * @returns ReservationResponse Reservation created
     * @throws ApiError
     */
    public static createSellOrderReservation({
        requestBody,
    }: {
        requestBody: CreateSellOrderReservationRequest,
    }): CancelablePromise<ReservationResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/reservations/sell-order',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Create a reservation against a buy order (user wants to sell/fill)
     * @returns ReservationResponse Reservation created
     * @throws ApiError
     */
    public static createBuyOrderReservation({
        requestBody,
    }: {
        requestBody: CreateBuyOrderReservationRequest,
    }): CancelablePromise<ReservationResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/reservations/buy-order',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Confirm a reservation (order owner only)
     * @returns ReservationResponse Reservation confirmed
     * @throws ApiError
     */
    public static confirmReservation({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateReservationStatusRequest,
    }): CancelablePromise<ReservationResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/reservations/{id}/confirm',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Reject a reservation (order owner only)
     * @returns ReservationResponse Reservation rejected
     * @throws ApiError
     */
    public static rejectReservation({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateReservationStatusRequest,
    }): CancelablePromise<ReservationResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/reservations/{id}/reject',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Mark a reservation as fulfilled (either party)
     * @returns ReservationResponse Reservation fulfilled
     * @throws ApiError
     */
    public static fulfillReservation({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateReservationStatusRequest,
    }): CancelablePromise<ReservationResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/reservations/{id}/fulfill',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Cancel a reservation (counterparty can cancel pending, owner can cancel any)
     * @returns ReservationResponse Reservation cancelled
     * @throws ApiError
     */
    public static cancelReservation({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateReservationStatusRequest,
    }): CancelablePromise<ReservationResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/reservations/{id}/cancel',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Reopen a cancelled or fulfilled reservation (either party)
     * @returns ReservationResponse Reservation reopened
     * @throws ApiError
     */
    public static reopenReservation({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateReservationStatusRequest,
    }): CancelablePromise<ReservationResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/reservations/{id}/reopen',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
