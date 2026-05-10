/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SyncState } from '../models/SyncState'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class SyncService {
  /**
   * Get sync state including unread count, app version, and data versions
   * Used for polling to detect app updates and cache invalidation
   * @returns SyncState Ok
   * @throws ApiError
   */
  public static getSyncState(): CancelablePromise<SyncState> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/sync/state',
    })
  }
}
