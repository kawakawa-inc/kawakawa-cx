/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateImportConfigRequest } from '../models/CreateImportConfigRequest'
import type { CreatePriceAdjustmentRequest } from '../models/CreatePriceAdjustmentRequest'
import type { CreatePriceListRequest } from '../models/CreatePriceListRequest'
import type { CreatePriceRequest } from '../models/CreatePriceRequest'
import type { CreateVersionRequest } from '../models/CreateVersionRequest'
import type { CsvImportRequest } from '../models/CsvImportRequest'
import type { CsvImportResult } from '../models/CsvImportResult'
import type { CsvPreviewResult } from '../models/CsvPreviewResult'
import type { EffectivePrice } from '../models/EffectivePrice'
import type { ExchangeSyncStatus } from '../models/ExchangeSyncStatus'
import type { FioExchangeResponse } from '../models/FioExchangeResponse'
import type { FioPriceField } from '../models/FioPriceField'
import type { GoogleSheetsImportRequest } from '../models/GoogleSheetsImportRequest'
import type { ImportConfigResponse } from '../models/ImportConfigResponse'
import type { PivotImportRequest } from '../models/PivotImportRequest'
import type { PivotImportResult } from '../models/PivotImportResult'
import type { PriceAdjustmentResponse } from '../models/PriceAdjustmentResponse'
import type { PriceCheckResponse } from '../models/PriceCheckResponse'
import type { PriceListDefinition } from '../models/PriceListDefinition'
import type { PriceListResponse } from '../models/PriceListResponse'
import type { SyncPricesRequest } from '../models/SyncPricesRequest'
import type { SyncPricesResponse } from '../models/SyncPricesResponse'
import type { UpdateImportConfigRequest } from '../models/UpdateImportConfigRequest'
import type { UpdatePriceAdjustmentRequest } from '../models/UpdatePriceAdjustmentRequest'
import type { UpdatePriceListRequest } from '../models/UpdatePriceListRequest'
import type { UpdatePriceRequest } from '../models/UpdatePriceRequest'
import type { UpdateVersionRequest } from '../models/UpdateVersionRequest'
import type { VersionDetail } from '../models/VersionDetail'
import type { VersionDiff } from '../models/VersionDiff'
import type { VersionSummary } from '../models/VersionSummary'
import type { CancelablePromise } from '../core/CancelablePromise'
import { OpenAPI } from '../core/OpenAPI'
import { request as __request } from '../core/request'
export class PricingService {
  /**
   * Get sync status for all FIO exchanges
   * Returns last sync time and price count for each exchange
   * @returns ExchangeSyncStatus Ok
   * @throws ApiError
   */
  public static getSyncStatus(): CancelablePromise<Array<ExchangeSyncStatus>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/prices/sync/fio/status',
    })
  }
  /**
   * Sync prices from all FIO exchanges
   * Fetches current market prices from FIO API and updates the price list
   * @returns SyncPricesResponse Sync completed
   * @throws ApiError
   */
  public static syncAllExchanges({
    requestBody,
  }: {
    /**
     * Optional request body specifying which price field to use
     */
    requestBody?: SyncPricesRequest
  }): CancelablePromise<SyncPricesResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/prices/sync/fio',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Sync prices from a specific FIO exchange
   * @returns SyncPricesResponse Sync completed
   * @throws ApiError
   */
  public static syncExchange({
    exchangeCode,
    priceField,
  }: {
    /**
     * The exchange code to sync (e.g., 'CI1', 'NC1')
     */
    exchangeCode: string
    /**
     * Which FIO price field to use (default: PriceAverage)
     */
    priceField?: FioPriceField
  }): CancelablePromise<SyncPricesResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/prices/sync/fio/{exchangeCode}',
      path: {
        exchangeCode: exchangeCode,
      },
      query: {
        priceField: priceField,
      },
    })
  }
  /**
   * Get all price list definitions
   * @returns PriceListDefinition Ok
   * @throws ApiError
   */
  public static getPriceLists(): CancelablePromise<Array<PriceListDefinition>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-lists',
    })
  }
  /**
   * Create a new price list
   * @returns PriceListDefinition Created
   * @throws ApiError
   */
  public static createPriceList({
    requestBody,
  }: {
    /**
     * The price list data
     */
    requestBody: CreatePriceListRequest
  }): CancelablePromise<PriceListDefinition> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/price-lists',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get a specific price list definition
   * @returns PriceListDefinition Ok
   * @throws ApiError
   */
  public static getPriceList({
    code,
  }: {
    /**
     * The price list code
     */
    code: string
  }): CancelablePromise<PriceListDefinition> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-lists/{code}',
      path: {
        code: code,
      },
    })
  }
  /**
   * Update an existing price list
   * @returns PriceListDefinition Ok
   * @throws ApiError
   */
  public static updatePriceList({
    code,
    requestBody,
  }: {
    /**
     * The price list code
     */
    code: string
    /**
     * The fields to update
     */
    requestBody: UpdatePriceListRequest
  }): CancelablePromise<PriceListDefinition> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/price-lists/{code}',
      path: {
        code: code,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a price list and all associated data
   * @returns void
   * @throws ApiError
   */
  public static deletePriceList({
    code,
  }: {
    /**
     * The price list code
     */
    code: string
  }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/price-lists/{code}',
      path: {
        code: code,
      },
    })
  }
  /**
   * List all versions for a price list
   * @returns VersionSummary Ok
   * @throws ApiError
   */
  public static getVersions({ code }: { code: string }): CancelablePromise<Array<VersionSummary>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-lists/{code}/versions',
      path: {
        code: code,
      },
    })
  }
  /**
   * Create a new version for a price list
   * @returns VersionDetail
   * @throws ApiError
   */
  public static createVersion({
    code,
    requestBody,
  }: {
    code: string
    requestBody: CreateVersionRequest
  }): CancelablePromise<VersionDetail> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/price-lists/{code}/versions',
      path: {
        code: code,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get a specific version's details
   * @returns VersionDetail Ok
   * @throws ApiError
   */
  public static getVersion({
    code,
    version,
  }: {
    code: string
    version: number
  }): CancelablePromise<VersionDetail> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-lists/{code}/versions/{version}',
      path: {
        code: code,
        version: version,
      },
    })
  }
  /**
   * Promote a version to current
   * @returns VersionDetail Ok
   * @throws ApiError
   */
  public static updateVersion({
    code,
    version,
    requestBody,
  }: {
    code: string
    version: number
    requestBody: UpdateVersionRequest
  }): CancelablePromise<VersionDetail> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/price-lists/{code}/versions/{version}',
      path: {
        code: code,
        version: version,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a version (cannot delete the current version)
   * @returns void
   * @throws ApiError
   */
  public static deleteVersion({
    code,
    version,
  }: {
    code: string
    version: number
  }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/price-lists/{code}/versions/{version}',
      path: {
        code: code,
        version: version,
      },
    })
  }
  /**
   * @returns VersionDetail Ok
   * @throws ApiError
   */
  public static promoteVersion({
    code,
    version,
  }: {
    code: string
    version: number
  }): CancelablePromise<VersionDetail> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/price-lists/{code}/versions/{version}/promote',
      path: {
        code: code,
        version: version,
      },
    })
  }
  /**
   * Compare two versions of a price list
   * @returns VersionDiff Ok
   * @throws ApiError
   */
  public static diffVersions({
    code,
    version,
    otherVersion,
  }: {
    code: string
    version: number
    otherVersion: number
  }): CancelablePromise<VersionDiff> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-lists/{code}/versions/{version}/diff/{otherVersion}',
      path: {
        code: code,
        version: version,
        otherVersion: otherVersion,
      },
    })
  }
  /**
   * Get all prices with optional filters
   * @returns PriceListResponse Ok
   * @throws ApiError
   */
  public static getPrices({
    exchange,
    location,
    commodity,
    version,
  }: {
    /**
     * Filter by exchange code (KAWA, CI1, etc.)
     */
    exchange?: string
    /**
     * Filter by location ID
     */
    location?: string
    /**
     * Filter by commodity ticker
     */
    commodity?: string
    version?: number
  }): CancelablePromise<Array<PriceListResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/prices',
      query: {
        exchange: exchange,
        location: location,
        commodity: commodity,
        version: version,
      },
    })
  }
  /**
   * Create a new price entry
   * @returns PriceListResponse Created
   * @throws ApiError
   */
  public static createPrice({
    requestBody,
  }: {
    /**
     * The price data
     */
    requestBody: CreatePriceRequest
  }): CancelablePromise<PriceListResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/prices',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get effective price (base + adjustments) for a specific commodity
   * @returns EffectivePrice Ok
   * @throws ApiError
   */
  public static getEffectivePrice({
    exchange,
    locationId,
    ticker,
    fallback,
    version,
  }: {
    /**
     * The exchange code (KAWA, CI1, etc.)
     */
    exchange: string
    /**
     * The location ID
     */
    locationId: string
    /**
     * The commodity ticker
     */
    ticker: string
    /**
     * Falls back to default location when price not found (default: true)
     */
    fallback?: boolean
    version?: number
  }): CancelablePromise<EffectivePrice> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/prices/effective/{exchange}/{locationId}/{ticker}',
      path: {
        exchange: exchange,
        locationId: locationId,
        ticker: ticker,
      },
      query: {
        fallback: fallback,
        version: version,
      },
    })
  }
  /**
   * Get all effective prices for an exchange and location
   * @returns EffectivePrice Ok
   * @throws ApiError
   */
  public static getEffectivePrices({
    exchange,
    locationId,
    commodity,
    fallback,
    version,
  }: {
    /**
     * The exchange code
     */
    exchange: string
    /**
     * The location ID
     */
    locationId: string
    /**
     * Optional commodity ticker to filter results
     */
    commodity?: string
    /**
     * Falls back to default location when no prices found (default: true)
     */
    fallback?: boolean
    version?: number
  }): CancelablePromise<Array<EffectivePrice>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/prices/effective/{exchange}/{locationId}',
      path: {
        exchange: exchange,
        locationId: locationId,
      },
      query: {
        commodity: commodity,
        fallback: fallback,
        version: version,
      },
    })
  }
  /**
   * Export base prices as CSV for an exchange
   * @returns void
   * @throws ApiError
   */
  public static exportBasePrices({
    exchange,
    location,
    version,
  }: {
    /**
     * The exchange code (KAWA, CI1, etc.)
     */
    exchange: string
    /**
     * Optional location filter
     */
    location?: string
    version?: number
  }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/prices/export/{exchange}',
      path: {
        exchange: exchange,
      },
      query: {
        location: location,
        version: version,
      },
    })
  }
  /**
   * Export effective prices (with adjustments applied) as CSV for an exchange
   * @returns void
   * @throws ApiError
   */
  public static exportEffectivePrices({
    exchange,
    locationId,
    version,
  }: {
    /**
     * The exchange code (KAWA, CI1, etc.)
     */
    exchange: string
    /**
     * The location ID
     */
    locationId: string
    version?: number
  }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/prices/export/{exchange}/{locationId}/effective',
      path: {
        exchange: exchange,
        locationId: locationId,
      },
      query: {
        version: version,
      },
    })
  }
  /**
   * Get prices for a specific exchange
   * @returns PriceListResponse Ok
   * @throws ApiError
   */
  public static getPricesByExchange({
    exchange,
    version,
  }: {
    /**
     * The exchange code (KAWA, CI1, NC1, IC1, AI1)
     */
    exchange: string
    version?: number
  }): CancelablePromise<Array<PriceListResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/prices/{exchange}',
      path: {
        exchange: exchange,
      },
      query: {
        version: version,
      },
    })
  }
  /**
   * Get prices for a specific exchange at a specific location
   * @returns PriceListResponse Ok
   * @throws ApiError
   */
  public static getPricesByExchangeAndLocation({
    exchange,
    locationId,
    version,
  }: {
    /**
     * The exchange code
     */
    exchange: string
    /**
     * The location ID
     */
    locationId: string
    version?: number
  }): CancelablePromise<Array<PriceListResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/prices/{exchange}/{locationId}',
      path: {
        exchange: exchange,
        locationId: locationId,
      },
      query: {
        version: version,
      },
    })
  }
  /**
   * Get a specific price by exchange, location, and commodity
   * @returns PriceListResponse Ok
   * @throws ApiError
   */
  public static getPrice({
    exchange,
    locationId,
    ticker,
    version,
  }: {
    /**
     * The exchange code
     */
    exchange: string
    /**
     * The location ID
     */
    locationId: string
    /**
     * The commodity ticker
     */
    ticker: string
    version?: number
  }): CancelablePromise<PriceListResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/prices/{exchange}/{locationId}/{ticker}',
      path: {
        exchange: exchange,
        locationId: locationId,
        ticker: ticker,
      },
      query: {
        version: version,
      },
    })
  }
  /**
   * Update an existing price
   * @returns PriceListResponse Ok
   * @throws ApiError
   */
  public static updatePrice({
    id,
    requestBody,
  }: {
    /**
     * The price ID
     */
    id: number
    /**
     * The fields to update
     */
    requestBody: UpdatePriceRequest
  }): CancelablePromise<PriceListResponse> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/prices/{id}',
      path: {
        id: id,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a price entry
   * @returns void
   * @throws ApiError
   */
  public static deletePrice({
    id,
  }: {
    /**
     * The price ID
     */
    id: number
  }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/prices/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Preview CSV import without committing changes
   * Returns sample rows with validation status
   * @returns CsvPreviewResult Ok
   * @throws ApiError
   */
  public static previewCsvImport({
    formData,
  }: {
    formData: {
      /**
       * The CSV file to preview
       */
      file: Blob
      /**
       * JSON configuration for the import
       */
      config: string
    }
  }): CancelablePromise<CsvPreviewResult> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs/csv/preview',
      formData: formData,
      mediaType: 'multipart/form-data',
    })
  }
  /**
   * Import prices from CSV file
   * Creates new prices or updates existing ones
   * @returns CsvImportResult Ok
   * @throws ApiError
   */
  public static importCsv({
    formData,
  }: {
    formData: {
      /**
       * The CSV file to import
       */
      file: Blob
      /**
       * JSON configuration for the import
       */
      config: string
    }
  }): CancelablePromise<CsvImportResult> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs/csv',
      formData: formData,
      mediaType: 'multipart/form-data',
    })
  }
  /**
   * Import prices from CSV content (JSON body instead of file upload)
   * Useful for testing or when content is already available
   * @returns CsvImportResult Ok
   * @throws ApiError
   */
  public static importCsvContent({
    requestBody,
  }: {
    /**
     * The import request with CSV content
     */
    requestBody: CsvImportRequest & {
      content: string
    }
  }): CancelablePromise<CsvImportResult> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs/csv/content',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Preview CSV import from content (JSON body)
   * @returns CsvPreviewResult Ok
   * @throws ApiError
   */
  public static previewCsvContent({
    requestBody,
  }: {
    /**
     * The preview request with CSV content
     */
    requestBody: CsvImportRequest & {
      content: string
    }
  }): CancelablePromise<CsvPreviewResult> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs/csv/content/preview',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Look up effective prices for one or more materials at a location.
   *
   * Example: `/price-check/KAWA?material=DW&material=Drinking%20Water&material=rations`
   * @returns PriceCheckResponse Ok
   * @throws ApiError
   */
  public static checkPrices({
    priceListCode,
    material,
    location,
    version,
  }: {
    /**
     * The price list code (e.g., 'KAWA', 'CI1')
     */
    priceListCode: string
    /**
     * Repeatable. Each value resolved as ticker, API name, or localized name.
     */
    material: Array<string>
    /**
     * Optional. Natural ID or display name. Defaults to the version's default location.
     */
    location?: string
    /**
     * Optional. Specific version to query. Defaults to the current promoted version.
     */
    version?: number
  }): CancelablePromise<PriceCheckResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-check/{priceListCode}',
      path: {
        priceListCode: priceListCode,
      },
      query: {
        material: material,
        location: location,
        version: version,
      },
    })
  }
  /**
   * Get all price adjustments with optional filters
   * @returns PriceAdjustmentResponse Ok
   * @throws ApiError
   */
  public static getAdjustments({
    priceList,
    location,
    activeOnly,
  }: {
    /**
     * Filter by price list code (exact match or NULL)
     */
    priceList?: string
    /**
     * Filter by location ID (exact match or NULL)
     */
    location?: string
    /**
     * Only return active adjustments
     */
    activeOnly?: boolean
  }): CancelablePromise<Array<PriceAdjustmentResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-adjustments',
      query: {
        priceList: priceList,
        location: location,
        activeOnly: activeOnly,
      },
    })
  }
  /**
   * Create a new price adjustment
   * @returns PriceAdjustmentResponse Created
   * @throws ApiError
   */
  public static createAdjustment({
    requestBody,
  }: {
    /**
     * The adjustment data
     */
    requestBody: CreatePriceAdjustmentRequest
  }): CancelablePromise<PriceAdjustmentResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/price-adjustments',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get adjustments that apply to a specific price list
   * @returns PriceAdjustmentResponse Ok
   * @throws ApiError
   */
  public static getAdjustmentsByPriceList({
    priceListCode,
  }: {
    /**
     * The price list code
     */
    priceListCode: string
  }): CancelablePromise<Array<PriceAdjustmentResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-adjustments/price-list/{priceListCode}',
      path: {
        priceListCode: priceListCode,
      },
    })
  }
  /**
   * Get adjustments that apply to a specific location
   * @returns PriceAdjustmentResponse Ok
   * @throws ApiError
   */
  public static getAdjustmentsByLocation({
    locationId,
  }: {
    /**
     * The location ID
     */
    locationId: string
  }): CancelablePromise<Array<PriceAdjustmentResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-adjustments/location/{locationId}',
      path: {
        locationId: locationId,
      },
    })
  }
  /**
   * Get a specific adjustment by ID
   * @returns PriceAdjustmentResponse Ok
   * @throws ApiError
   */
  public static getAdjustment({
    id,
  }: {
    /**
     * The adjustment ID
     */
    id: number
  }): CancelablePromise<PriceAdjustmentResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/price-adjustments/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Update an existing price adjustment
   * @returns PriceAdjustmentResponse Ok
   * @throws ApiError
   */
  public static updateAdjustment({
    id,
    requestBody,
  }: {
    /**
     * The adjustment ID
     */
    id: number
    /**
     * The fields to update
     */
    requestBody: UpdatePriceAdjustmentRequest
  }): CancelablePromise<PriceAdjustmentResponse> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/price-adjustments/{id}',
      path: {
        id: id,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete a price adjustment
   * @returns void
   * @throws ApiError
   */
  public static deleteAdjustment({
    id,
  }: {
    /**
     * The adjustment ID
     */
    id: number
  }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/price-adjustments/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * List all saved import configurations
   * @returns ImportConfigResponse Ok
   * @throws ApiError
   */
  public static getConfigs(): CancelablePromise<Array<ImportConfigResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/import-configs',
    })
  }
  /**
   * Create a new import configuration
   * @returns ImportConfigResponse Created
   * @throws ApiError
   */
  public static createConfig({
    requestBody,
  }: {
    /**
     * The configuration data
     */
    requestBody: CreateImportConfigRequest
  }): CancelablePromise<ImportConfigResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get a specific import configuration
   * @returns ImportConfigResponse Ok
   * @throws ApiError
   */
  public static getConfig({
    id,
  }: {
    /**
     * The configuration ID
     */
    id: number
  }): CancelablePromise<ImportConfigResponse> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/import-configs/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Update an existing import configuration
   * @returns ImportConfigResponse Ok
   * @throws ApiError
   */
  public static updateConfig({
    id,
    requestBody,
  }: {
    /**
     * The configuration ID
     */
    id: number
    /**
     * The fields to update
     */
    requestBody: UpdateImportConfigRequest
  }): CancelablePromise<ImportConfigResponse> {
    return __request(OpenAPI, {
      method: 'PUT',
      url: '/import-configs/{id}',
      path: {
        id: id,
      },
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Delete an import configuration
   * @returns void
   * @throws ApiError
   */
  public static deleteConfig({
    id,
  }: {
    /**
     * The configuration ID
     */
    id: number
  }): CancelablePromise<void> {
    return __request(OpenAPI, {
      method: 'DELETE',
      url: '/import-configs/{id}',
      path: {
        id: id,
      },
    })
  }
  /**
   * Trigger a sync for a saved configuration
   * Fetches the data from the configured source and imports it
   * @returns any Ok
   * @throws ApiError
   */
  public static syncConfig({
    id,
    version,
  }: {
    /**
     * The configuration ID
     */
    id: number
    version?: number
  }): CancelablePromise<CsvImportResult | PivotImportResult> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs/{id}/sync',
      path: {
        id: id,
      },
      query: {
        version: version,
      },
    })
  }
  /**
   * Sync a CSV-source configuration by uploading a file
   * Uses the stored field mapping to import the uploaded CSV
   * @returns CsvImportResult Ok
   * @throws ApiError
   */
  public static syncConfigUpload({
    id,
    formData,
  }: {
    /**
     * The configuration ID
     */
    id: number
    formData: {
      /**
       * The CSV file to import
       */
      file: Blob
      /**
       * Optional target version (defaults to current)
       */
      version?: string
    }
  }): CancelablePromise<CsvImportResult> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs/{id}/sync/upload',
      path: {
        id: id,
      },
      formData: formData,
      mediaType: 'multipart/form-data',
    })
  }
  /**
   * One-time import from Google Sheets (flat format, without saving a configuration)
   * @returns CsvImportResult Ok
   * @throws ApiError
   */
  public static importFromGoogleSheets({
    requestBody,
  }: {
    /**
     * The import parameters
     */
    requestBody: GoogleSheetsImportRequest
  }): CancelablePromise<CsvImportResult> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs/google-sheets',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * One-time import from Google Sheets (pivot format)
   * @returns PivotImportResult Ok
   * @throws ApiError
   */
  public static importPivotFromGoogleSheets({
    requestBody,
  }: {
    /**
     * The import parameters
     */
    requestBody: PivotImportRequest
  }): CancelablePromise<PivotImportResult> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs/google-sheets/pivot',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Preview import from Google Sheets (without importing)
   * @returns CsvPreviewResult Ok
   * @throws ApiError
   */
  public static previewGoogleSheetsImport({
    requestBody,
  }: {
    /**
     * The import parameters
     */
    requestBody: GoogleSheetsImportRequest
  }): CancelablePromise<CsvPreviewResult> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/import-configs/google-sheets/preview',
      body: requestBody,
      mediaType: 'application/json',
    })
  }
  /**
   * Get all price lists (exchanges)
   * Returns all exchange codes with their location mappings
   * @returns FioExchangeResponse Ok
   * @throws ApiError
   */
  public static getFioExchanges(): CancelablePromise<Array<FioExchangeResponse>> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/fio-exchanges',
    })
  }
}
