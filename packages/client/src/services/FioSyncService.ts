/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SyncJobStartResponse } from '../models/SyncJobStartResponse'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class FioSyncService {
  /**
   * Enqueue a full FIO sync for the current user (inventory + planet list).
   * Dedup is applied server-side — repeated calls return the same job IDs
   * until the current sync finishes.
   * @returns SyncJobStartResponse Sync enqueued
   * @throws ApiError
   */
  public static startSyncAll(): CancelablePromise<SyncJobStartResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/fio/sync-all',
    })
  }
}
