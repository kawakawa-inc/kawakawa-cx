/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AddLineItemRequest } from '../models/AddLineItemRequest'
import type { CreateInvoiceRequest } from '../models/CreateInvoiceRequest'
import type { Invoice } from '../models/Invoice'
import type { InvoiceDirection } from '../models/InvoiceDirection'
import type { InvoiceLineItem } from '../models/InvoiceLineItem'
import type { InvoiceSummary } from '../models/InvoiceSummary'
import type { StoredInvoiceStatus } from '../models/StoredInvoiceStatus'
import type { SubmitInvoiceResponse } from '../models/SubmitInvoiceResponse'
import type { UpdateInvoiceRequest } from '../models/UpdateInvoiceRequest'
import type { UpdateLineItemRequest } from '../models/UpdateLineItemRequest'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class InvoicesService {
  /**
   * Get all invoices for the current user (both sent and received)
   * @returns InvoiceSummary Ok
   * @throws ApiError
   */
  public static getInvoices({
    status,
    direction,
  }: {
    /**
     * Filter by stored invoice status (draft, submitted, cancelled)
     */
    status?: StoredInvoiceStatus
    /**
     * Filter by direction: 'sent' (user created) or 'received' (sent to user)
     */
    direction?: InvoiceDirection
  }): CancelablePromise<Array<InvoiceSummary>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/invoices',
      query: {
        status: status,
        direction: direction,
      },
    })
  }
  /**
   * Create a new invoice
   * @returns Invoice Invoice created
   * @throws ApiError
   */
  public static createInvoice({
    requestBody,
  }: {
    requestBody: CreateInvoiceRequest
  }): CancelablePromise<Invoice> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/invoices',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get a specific invoice by ID with all line items
   * Invoice owner can always view. Counterparty can view submitted+ invoices.
   * @returns Invoice Ok
   * @throws ApiError
   */
  public static getInvoice({ id }: { id: number }): CancelablePromise<Invoice> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/invoices/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Update invoice name or notes
   * @returns Invoice Ok
   * @throws ApiError
   */
  public static updateInvoice({
    id,
    requestBody,
  }: {
    id: number
    requestBody: UpdateInvoiceRequest
  }): CancelablePromise<Invoice> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/invoices/{id}',
      path: {
        id: id,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a draft invoice
   * @returns void
   * @throws ApiError
   */
  public static deleteInvoice({ id }: { id: number }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/invoices/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Get or create a draft invoice for a specific trading partner
   * @returns Invoice Ok
   * @throws ApiError
   */
  public static getOrCreateForPartner({
    counterpartyUserId,
  }: {
    counterpartyUserId: number
  }): CancelablePromise<Invoice> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/invoices/for-partner/{counterpartyUserId}',
      path: {
        counterpartyUserId: counterpartyUserId,
      },
    })
  }
  /**
   * Add a line item to an invoice
   * @returns InvoiceLineItem Line item added
   * @throws ApiError
   */
  public static addLineItem({
    id,
    requestBody,
  }: {
    id: number
    requestBody: AddLineItemRequest
  }): CancelablePromise<InvoiceLineItem> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/invoices/{id}/items',
      path: {
        id: id,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Update a line item quantity or notes
   * @returns InvoiceLineItem Ok
   * @throws ApiError
   */
  public static updateLineItem({
    id,
    itemId,
    requestBody,
  }: {
    id: number
    itemId: number
    requestBody: UpdateLineItemRequest
  }): CancelablePromise<InvoiceLineItem> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/invoices/{id}/items/{itemId}',
      path: {
        id: id,
        itemId: itemId,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Remove a line item from an invoice
   * @returns void
   * @throws ApiError
   */
  public static removeLineItem({
    id,
    itemId,
  }: {
    id: number
    itemId: number
  }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/invoices/{id}/items/{itemId}',
      path: {
        id: id,
        itemId: itemId,
      },
    })
  }
  /**
   * Submit an invoice - creates reservations for all line items
   * @returns SubmitInvoiceResponse Ok
   * @throws ApiError
   */
  public static submitInvoice({ id }: { id: number }): CancelablePromise<SubmitInvoiceResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/invoices/{id}/submit',
      path: {
        id: id,
      },
    })
  }
  /**
   * Cancel a pending invoice
   * @returns Invoice Ok
   * @throws ApiError
   */
  public static cancelInvoice({ id }: { id: number }): CancelablePromise<Invoice> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/invoices/{id}/cancel',
      path: {
        id: id,
      },
    })
  }
  /**
   * Fulfill an invoice — marks all reservations as fulfilled, releases holds, and triggers FIO sync for both users
   * @returns Invoice Ok
   * @throws ApiError
   */
  public static fulfillInvoice({ id }: { id: number }): CancelablePromise<Invoice> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/invoices/{id}/fulfill',
      path: {
        id: id,
      },
    })
  }
}
