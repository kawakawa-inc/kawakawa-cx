/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BuyOrderResponse } from '../models/BuyOrderResponse';
import type { CreateBuyOrderRequest } from '../models/CreateBuyOrderRequest';
import type { UpdateBuyOrderRequest } from '../models/UpdateBuyOrderRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class BuyOrdersService {
    /**
     * Get all buy orders for the current user
     * @returns BuyOrderResponse Ok
     * @throws ApiError
     */
    public static getBuyOrders(): CancelablePromise<Array<BuyOrderResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/buy-orders',
        });
    }
    /**
     * Create a new buy order
     * @returns BuyOrderResponse Created
     * @throws ApiError
     */
    public static createBuyOrder({
        requestBody,
    }: {
        requestBody: CreateBuyOrderRequest,
    }): CancelablePromise<BuyOrderResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/buy-orders',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get a specific buy order
     * @returns BuyOrderResponse Ok
     * @throws ApiError
     */
    public static getBuyOrder({
        id,
    }: {
        id: number,
    }): CancelablePromise<BuyOrderResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/buy-orders/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update a buy order
     * @returns BuyOrderResponse Ok
     * @throws ApiError
     */
    public static updateBuyOrder({
        id,
        requestBody,
    }: {
        id: number,
        requestBody: UpdateBuyOrderRequest,
    }): CancelablePromise<BuyOrderResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/buy-orders/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete a buy order (soft-delete: marks deletedAt so existing reservations and invoice
     * line items keep their FK pointers intact)
     * @returns void
     * @throws ApiError
     */
    public static deleteBuyOrder({
        id,
    }: {
        id: number,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/buy-orders/{id}',
            path: {
                'id': id,
            },
        });
    }
}
