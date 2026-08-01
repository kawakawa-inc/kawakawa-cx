/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MarketBuyRequest } from '../models/MarketBuyRequest'
import type { MarketListing } from '../models/MarketListing'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class MarketService {
  /**
   * Get all available sell orders on the market (from other users)
   * Filters by order type based on user permissions
   * @returns MarketListing Ok
   * @throws ApiError
   */
  public static getMarketListings({
    commodity,
    location,
    destination,
    includeInactive,
  }: {
    commodity?: string
    location?: string
    /**
     * Location ID to calculate jump counts from (optional)
     */
    destination?: string
    includeInactive?: boolean
  }): CancelablePromise<Array<MarketListing>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/market/listings',
      query: {
        commodity: commodity,
        location: location,
        destination: destination,
        includeInactive: includeInactive,
      },
    })
  }
  /**
   * Get all buy requests on the market (from all users)
   * Filters by order type based on user permissions
   * @returns MarketBuyRequest Ok
   * @throws ApiError
   */
  public static getMarketBuyRequests({
    commodity,
    location,
    destination,
    includeInactive,
  }: {
    commodity?: string
    location?: string
    /**
     * Location ID to calculate jump counts from (optional)
     */
    destination?: string
    includeInactive?: boolean
  }): CancelablePromise<Array<MarketBuyRequest>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/market/buy-requests',
      query: {
        commodity: commodity,
        location: location,
        destination: destination,
        includeInactive: includeInactive,
      },
    })
  }
}
