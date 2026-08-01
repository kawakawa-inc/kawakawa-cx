/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateSalesOrderRequest } from '../models/CreateSalesOrderRequest'
import type { SalesOrderReadinessResponse } from '../models/SalesOrderReadinessResponse'
import type { SalesOrderResponse } from '../models/SalesOrderResponse'
import type { SalesOrderStatus } from '../models/SalesOrderStatus'
import type { SalesSlipDocument } from '../models/SalesSlipDocument'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class SalesOrdersService {
  /**
   * List sales orders. Defaults to the open queue; pass filters to narrow.
   * @returns SalesOrderResponse Ok
   * @throws ApiError
   */
  public static listSalesOrders({
    status,
    mine,
  }: {
    /**
     * Filter by status (open/claimed/fulfilled/cancelled)
     */
    status?: SalesOrderStatus
    /**
     * If true, only orders the caller requested or claimed
     */
    mine?: boolean
  }): CancelablePromise<Array<SalesOrderResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/sales-orders',
      query: {
        status: status,
        mine: mine,
      },
    })
  }
  /**
   * Create + submit a new sales order to the queue. Unit prices are
   * (re)computed server-side from the given price list/version/location so the
   * order snapshot is authoritative, not client-supplied.
   * @returns SalesOrderResponse Created
   * @throws ApiError
   */
  public static createSalesOrder({
    requestBody,
  }: {
    requestBody: CreateSalesOrderRequest
  }): CancelablePromise<SalesOrderResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/sales-orders',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get a single sales order with its line items.
   * @returns SalesOrderResponse Ok
   * @throws ApiError
   */
  public static getSalesOrder({ id }: { id: number }): CancelablePromise<SalesOrderResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/sales-orders/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Claim an open order off the queue, assigning it to the caller.
   * @returns SalesOrderResponse Ok
   * @throws ApiError
   */
  public static claimSalesOrder({ id }: { id: number }): CancelablePromise<SalesOrderResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/sales-orders/{id}/claim',
      path: {
        id: id,
      },
    })
  }
  /**
   * Mark a claimed order fulfilled (delivered + contracted). Claimer only.
   * @returns SalesOrderResponse Ok
   * @throws ApiError
   */
  public static fulfillSalesOrder({ id }: { id: number }): CancelablePromise<SalesOrderResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/sales-orders/{id}/fulfill',
      path: {
        id: id,
      },
    })
  }
  /**
   * Cancel an order. The requestor can cancel an open or claimed order; the
   * claimer can release (cancel) an order they claimed.
   * @returns SalesOrderResponse Ok
   * @throws ApiError
   */
  public static cancelSalesOrder({ id }: { id: number }): CancelablePromise<SalesOrderResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/sales-orders/{id}/cancel',
      path: {
        id: id,
      },
    })
  }
  /**
   * FIO readiness for a claimed order: expand the ordered packages to their
   * combined bill of materials and compare against the claimer's on-hand
   * inventory at the pickup location (falling back to all their locations if
   * the order has no pickup location), highlighting shortfalls to source.
   * @returns SalesOrderReadinessResponse Ok
   * @throws ApiError
   */
  public static getSalesOrderReadiness({
    id,
  }: {
    id: number
  }): CancelablePromise<SalesOrderReadinessResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/sales-orders/{id}/readiness',
      path: {
        id: id,
      },
    })
  }
  /**
   * Generate (and record) the customer-facing "sales slip" for a claimed
   * order. This is the priced document the claimer hands the external customer
   * — it is NOT a member-to-member `invoices` row. Marks the order's slip as
   * generated (idempotent).
   * @returns SalesSlipDocument Ok
   * @throws ApiError
   */
  public static generateSalesSlip({ id }: { id: number }): CancelablePromise<SalesSlipDocument> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/sales-orders/{id}/slip',
      path: {
        id: id,
      },
    })
  }
}
