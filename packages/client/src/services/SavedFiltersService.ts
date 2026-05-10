/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateSavedFilterRequest } from '../models/CreateSavedFilterRequest'
import type { SavedMarketFilter } from '../models/SavedMarketFilter'
import type { UpdateSavedFilterRequest } from '../models/UpdateSavedFilterRequest'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class SavedFiltersService {
  /**
   * List the caller's own saved filters plus all public filters from other users.
   * @returns SavedMarketFilter Ok
   * @throws ApiError
   */
  public static list(): CancelablePromise<Array<SavedMarketFilter>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/saved-filters',
    })
  }
  /**
   * Create a new saved filter.
   * @returns SavedMarketFilter Saved filter created
   * @throws ApiError
   */
  public static create({
    requestBody,
  }: {
    requestBody: CreateSavedFilterRequest
  }): CancelablePromise<SavedMarketFilter> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/saved-filters',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get all pinned saved filters. These appear globally for all users on the Market page.
   * @returns SavedMarketFilter Ok
   * @throws ApiError
   */
  public static getPinned(): CancelablePromise<Array<SavedMarketFilter>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/saved-filters/pinned',
    })
  }
  /**
   * Browse all public saved filters with optional name search. Paginated.
   * @returns SavedMarketFilter Ok
   * @throws ApiError
   */
  public static browse({
    search,
    page,
  }: {
    search?: string
    page?: number
  }): CancelablePromise<Array<SavedMarketFilter>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/saved-filters/browse',
      query: {
        search: search,
        page: page,
      },
    })
  }
  /**
   * Get a saved filter by ID. Private filters are only accessible by their owner.
   * Link-privacy filters are accessible by any authenticated user who has the ID.
   * @returns SavedMarketFilter Ok
   * @throws ApiError
   */
  public static getById({ id }: { id: number }): CancelablePromise<SavedMarketFilter> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/saved-filters/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Update a saved filter. Only the owner can update.
   * @returns SavedMarketFilter Ok
   * @throws ApiError
   */
  public static update({
    id,
    requestBody,
  }: {
    id: number
    requestBody: UpdateSavedFilterRequest
  }): CancelablePromise<SavedMarketFilter> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/saved-filters/{id}',
      path: {
        id: id,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a saved filter. Only the owner can delete.
   * @returns void
   * @throws ApiError
   */
  public static delete({ id }: { id: number }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/saved-filters/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Toggle the pinned state of a saved filter. Requires the filters.pin permission.
   * Pinned filters appear globally for all users on the Market page.
   * Only public filters can be pinned.
   * @returns SavedMarketFilter Ok
   * @throws ApiError
   */
  public static togglePin({ id }: { id: number }): CancelablePromise<SavedMarketFilter> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/saved-filters/{id}/pin',
      path: {
        id: id,
      },
    })
  }
}
