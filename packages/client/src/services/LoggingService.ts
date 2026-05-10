/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LogBatchRequest } from '../models/LogBatchRequest'
import type { LogBatchResponse } from '../models/LogBatchResponse'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class LoggingService {
  /**
   * Submit frontend logs
   *
   * This endpoint accepts log entries from the frontend application.
   * Logs are anonymized and rate-limited to prevent abuse.
   * No authentication is required.
   * @returns LogBatchResponse Ok
   * @throws ApiError
   */
  public static submitLogs({
    requestBody,
  }: {
    requestBody: LogBatchRequest
  }): CancelablePromise<LogBatchResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/logs',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
}
