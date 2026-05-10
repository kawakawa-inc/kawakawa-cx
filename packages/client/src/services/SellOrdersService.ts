/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateSellOrderRequest } from '../models/CreateSellOrderRequest'
import type { SellOrderResponse } from '../models/SellOrderResponse'
import type { UpdateSellOrderRequest } from '../models/UpdateSellOrderRequest'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class SellOrdersService {
  /**
   * Get all sell orders for the current user
   * @returns SellOrderResponse Ok
   * @throws ApiError
   */
  public static getSellOrders(): CancelablePromise<Array<SellOrderResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/sell-orders',
    })
  }
  /**
   * Create a new sell order
   * @returns SellOrderResponse Created
   * @throws ApiError
   */
  public static createSellOrder({
    requestBody,
  }: {
    requestBody: CreateSellOrderRequest
  }): CancelablePromise<SellOrderResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/sell-orders',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get a specific sell order
   * @returns SellOrderResponse Ok
   * @throws ApiError
   */
  public static getSellOrder({ id }: { id: number }): CancelablePromise<SellOrderResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/sell-orders/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Update a sell order
   * @returns SellOrderResponse Ok
   * @throws ApiError
   */
  public static updateSellOrder({
    id,
    requestBody,
  }: {
    id: number
    requestBody: UpdateSellOrderRequest
  }): CancelablePromise<SellOrderResponse> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/sell-orders/{id}',
      path: {
        id: id,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a sell order (soft-delete: marks deletedAt so existing reservations and invoice
   * line items keep their FK pointers intact)
   * @returns void
   * @throws ApiError
   */
  public static deleteSellOrder({ id }: { id: number }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/sell-orders/{id}',
      path: {
        id: id,
      },
    })
  }
}
