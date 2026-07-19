// API service that switches between mock and real backend
import { mockApi, USE_MOCK_API } from './mockApi'
import { fetchWithLogging } from './logService'
import { handleAuthFailure } from './authBus'
import type {
  User,
  Currency,
  LocationDisplayMode,
  CommodityDisplayMode,
  Role,
  SellOrderLimitMode,
  PricingMode,
  OrderType,
  DiscordSettings,
  UpdateDiscordSettingsRequest,
  DiscordRoleMapping,
  DiscordRoleMappingRequest,
  DiscordRole,
  DiscordTestConnectionResponse,
  DiscordConnectionStatus,
  DiscordCallbackRequest,
  UserDiscordProfile,
  DiscordAuthUrlResponse,
  DiscordAuthResult,
  DiscordRegisterRequest,
  DiscordRegisterResponse,
  GlobalDefaultsResponse,
  UpdateGlobalDefaultsRequest,
  ChannelConfigMap,
  UpdateChannelConfigRequest,
  InvoiceStatus,
  InvoiceSummary,
  Invoice,
  InvoiceLineItem,
  CreateInvoiceRequest,
  AddLineItemRequest,
  UpdateLineItemRequest,
  SubmitInvoiceResponse,
  SavedShoppingList,
  ShoppingListSummary,
  CreateShoppingListRequest,
  UpdateShoppingListRequest,
  SavedMarketFilter,
  CreateSavedFilterRequest,
  UpdateSavedFilterRequest,
  CorpOverviewView,
  CreateCorpOverviewViewRequest,
  UpdateCorpOverviewViewRequest,
  SnapshotQueryRequest,
  SnapshotSeriesResponse,
  LogisticsGraph,
  LogisticsFlow,
  CreateLogisticsFlowRequest,
  UpdateLogisticsFlowRequest,
  BulkMultiCreateLogisticsFlowsRequest,
  BulkMultiCreateLogisticsFlowsResponse,
  BulkMultiPreviewRequest,
  BulkMultiPreviewResponse,
  LocationDemandClaim,
  CreateLocationDemandClaimRequest,
  UpdateLocationDemandClaimRequest,
  BurnRepairMyBasesResponse,
  BurnRepairCorpResponse,
  BurnRepairCorpBuildingsResponse,
  BurnRepairCorpWorkforceResponse,
  BurnRepairCorpMaterialBreakdown,
  BurnRepairShoppingListRequest,
  BurnRepairShoppingListResponse,
  UserShip,
  Trip,
  TripStatus,
  CreateTripRequest,
  UpdateTripRequest,
  RepeatTripRequest,
  SelfSuppliedEntry,
  CreateSelfSuppliedRequest,
  ContractCoverageEntry,
  Shipment,
  CreateShipmentRequest,
  SuggestStopTimesRequest,
  SuggestStopTimesResponse,
} from '@kawakawa/types'

interface LoginRequest {
  username: string
  password: string
}

interface RegisterRequest {
  username: string
  password: string
}

interface UpdateProfileRequest {
  displayName?: string
  email?: string | null
  fioUsername?: string
  fioApiKey?: string
  preferredCurrency?: Currency
  locationDisplayMode?: LocationDisplayMode
  commodityDisplayMode?: CommodityDisplayMode
}

interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

interface FioSyncInfo {
  fioUsername: string | null
  lastSyncedAt: string | null
}

interface DiscordInfo {
  connected: boolean
  discordUsername: string | null
  discordId: string | null
  connectedAt: string | null
}

interface AdminUser {
  id: number
  username: string
  email: string | null
  displayName: string
  isLocked: boolean
  roles: Role[]
  fioSync: FioSyncInfo
  discord: DiscordInfo
  createdAt: string
  lastActiveAt: string | null
  inactiveUntil: string | null
  activity: { active: boolean; reason?: string }
}

interface Permission {
  id: string
  name: string
  description: string | null
}

interface RolePermissionWithDetails {
  id: number
  roleId: string
  roleName: string
  roleColor: string
  permissionId: string
  permissionName: string
  allowed: boolean
}

interface CreateRoleRequest {
  id: string
  name: string
  color: string
}

interface SetRolePermissionRequest {
  roleId: string
  permissionId: string
  allowed: boolean
}

interface RolePermission {
  id: number
  roleId: string
  permissionId: string
  allowed: boolean
}

interface AdminUserListResponse {
  users: AdminUser[]
  total: number
  page: number
  pageSize: number
}

interface UpdateUserRequest {
  isLocked?: boolean
  roles?: string[]
  inactiveUntil?: string | null
}

interface PasswordResetLinkResponse {
  token: string
  expiresAt: string
  username: string
}

interface ResetPasswordRequest {
  token: string
  newPassword: string
}

interface ValidateTokenResponse {
  valid: boolean
  username?: string
  expiresAt?: string
}

interface ValidateDiscordLinkTokenResponse {
  valid: boolean
  discordUsername?: string
  expiresAt?: string
  error?: string
}

interface CompleteDiscordLinkRequest {
  token: string
}

interface UsernameAvailabilityResponse {
  available: boolean
  message?: string
}

interface FioSyncEnqueueResponse {
  jobIds: { inventory: number; planets: number }
}

interface AdminFioSyncEnqueueResponse extends FioSyncEnqueueResponse {
  username: string
}

// FIO Inventory types
interface FioInventoryItem {
  id: number
  commodityTicker: string
  quantity: number
  locationId: string | null
  lastSyncedAt: string
  commodityName: string
  commodityCategory: string | null
  locationName: string | null
  locationType: string | null
  storageType: string
  fioUploadedAt: string | null
}

interface FioLastSyncResponse {
  lastSyncedAt: string | null
  fioUploadedAt: string | null
}

// Price List types
type PriceSource = 'manual' | 'csv_import' | 'google_sheets' | 'fio_exchange'

interface PriceListResponse {
  id: number
  exchangeCode: string
  commodityTicker: string
  commodityName: string | null
  locationId: string
  locationName: string | null
  price: string
  currency: Currency
  source: PriceSource
  sourceReference: string | null
  createdAt: string
  updatedAt: string
}

interface CreatePriceRequest {
  exchangeCode: string
  commodityTicker: string
  locationId: string
  price: number
  version?: number
  currency: Currency
  source?: PriceSource
  sourceReference?: string | null
}

interface UpdatePriceRequest {
  price?: number
  currency?: Currency
  source?: PriceSource
  sourceReference?: string | null
}

// Effective Price types
interface AppliedAdjustment {
  id: number
  description: string | null
  type: 'percentage' | 'fixed'
  value: number
  appliedAmount: number
}

interface EffectivePrice {
  exchangeCode: string
  commodityTicker: string
  commodityName: string | null
  locationId: string
  locationName: string | null
  currency: Currency
  basePrice: number
  source: PriceSource
  sourceReference: string | null
  adjustments: AppliedAdjustment[]
  finalPrice: number
  // Fallback information - indicates if price came from default location
  isFallback?: boolean
  requestedLocationId?: string // Original location when isFallback is true
}

// Price Adjustments types
type AdjustmentType = 'percentage' | 'fixed'

interface PriceAdjustmentResponse {
  id: number
  priceListCode: string | null
  commodityTicker: string | null
  commodityName: string | null
  locationId: string | null
  locationName: string | null
  currency: Currency | null
  adjustmentType: AdjustmentType
  adjustmentValue: string
  priority: number
  description: string | null
  isActive: boolean
  effectiveFrom: string | null
  effectiveUntil: string | null
  createdByUserId: number | null
  createdByUsername: string | null
  createdAt: string
  updatedAt: string
}

interface CreatePriceAdjustmentRequest {
  priceListCode?: string | null
  commodityTicker?: string | null
  locationId?: string | null
  adjustmentType: AdjustmentType
  adjustmentValue: number
  priority?: number
  description?: string | null
  isActive?: boolean
  effectiveFrom?: string | null
  effectiveUntil?: string | null
}

interface UpdatePriceAdjustmentRequest {
  priceListCode?: string | null
  commodityTicker?: string | null
  locationId?: string | null
  adjustmentType?: AdjustmentType
  adjustmentValue?: number
  priority?: number
  description?: string | null
  isActive?: boolean
  effectiveFrom?: string | null
  effectiveUntil?: string | null
}

// FIO Exchanges types
interface FioExchangeResponse {
  code: string
  name: string
  type: PriceListType
  locationId: string | null
  locationName: string | null
  currency: Currency
  createdAt: string
}

// User Settings types
interface SettingDefinitionDto {
  key: string
  type: 'string' | 'boolean' | 'number' | 'enum' | 'string[]'
  defaultValue: unknown
  category: string
  label: string
  description: string
  enumOptions?: string[]
}

interface UserSettingsResponse {
  values: Record<string, unknown>
  definitions: Record<string, SettingDefinitionDto>
}

// CSV Import types
interface CsvFieldMapping {
  ticker: string | number
  location?: string | number
  price: string | number
  currency?: string | number
}

interface CsvRowError {
  rowNumber: number
  field: string
  value: string
  message: string
}

interface CsvImportResult {
  imported: number
  updated: number
  skipped: number
  errors: CsvRowError[]
}

// Admin Price Settings types
type FioPriceField = 'PriceAverage' | 'MMBuy' | 'MMSell' | 'Ask' | 'Bid'

interface PriceSettingsResponse {
  fioBaseUrl: string
  fioPriceField: FioPriceField
  hasGoogleSheetsApiKey: boolean
}

interface UpdateFioSettingsRequest {
  baseUrl?: string
  priceField?: FioPriceField
}

interface UpdateGoogleSettingsRequest {
  apiKey?: string
}

// Price List types
type PriceListType = 'fio' | 'custom'

interface PriceListDefinition {
  code: string
  name: string
  description: string | null
  type: PriceListType
  currency: Currency
  defaultLocationId: string | null
  defaultLocationName: string | null
  isActive: boolean
  currentVersion: number
  createdAt: string
  updatedAt: string
  priceCount?: number
  importConfigCount?: number
}

// Price List Version types
interface VersionSummary {
  id: number
  version: number
  label: string | null
  description: string | null
  defaultLocationId: string
  defaultLocationName: string | null
  priceCount: number
  isCurrent: boolean
  isLatest: boolean
  createdAt: string
  promotedAt: string | null
}

interface VersionDetail extends VersionSummary {
  createdByUserId: number | null
}

interface CreateVersionRequest {
  label?: string
  description?: string
  defaultLocationId: string
  copyFrom?: number | 'current' | 'latest'
}

interface UpdateVersionRequest {
  label?: string | null
  description?: string | null
  defaultLocationId?: string
}

interface PriceDiffEntry {
  commodityTicker: string
  locationId: string
  oldPrice: string | null
  newPrice: string | null
}

interface VersionDiff {
  added: PriceDiffEntry[]
  removed: PriceDiffEntry[]
  changed: PriceDiffEntry[]
  unchanged: number
}

interface CreatePriceListRequest {
  code: string
  name: string
  description?: string | null
  type: PriceListType
  currency: Currency
  /** Required: default location for the initial version */
  defaultLocationId: string
  isActive?: boolean
}

interface UpdatePriceListRequest {
  name?: string
  description?: string | null
  currency?: Currency
  isActive?: boolean
}

// Package types (bills of materials sold as a bundle, e.g. ships)
type PackageType = 'ship' | 'building'
type PackagePricingMode = 'fixed' | 'margin'

interface PackageInputDto {
  commodityTicker: string
  commodityName: string | null
  quantity: number
}

interface PackageResponse {
  id: number
  name: string
  type: PackageType
  salePrice: number | null
  currency: Currency | null
  pricingMode: PackagePricingMode
  marginMultiplier: number | null
  description: string | null
  isActive: boolean
  createdByUserId: number | null
  createdByUsername: string | null
  createdAt: string
  updatedAt: string
  inputs: PackageInputDto[]
}

interface PackageInputRequest {
  commodityTicker: string
  quantity: number
}

interface CreatePackageRequest {
  name: string
  type?: PackageType
  salePrice?: number | null
  currency?: Currency | null
  pricingMode?: PackagePricingMode
  marginMultiplier?: number | null
  description?: string | null
  isActive?: boolean
  inputs: PackageInputRequest[]
}

interface UpdatePackageRequest {
  name?: string
  type?: PackageType
  salePrice?: number | null
  currency?: Currency | null
  pricingMode?: PackagePricingMode
  marginMultiplier?: number | null
  description?: string | null
  isActive?: boolean
  inputs?: PackageInputRequest[]
}

interface PackageLinePrice {
  commodityTicker: string
  commodityName: string | null
  quantity: number
  unitPrice: number | null
  lineTotal: number | null
  isFallback: boolean
}

interface PackagePriceBreakdown {
  packageId: number
  packageName: string
  type: PackageType
  priceListCode: string
  version: number
  locationId: string
  currency: Currency
  lines: PackageLinePrice[]
  materialCost: number
  missingPriceTickers: string[]
  salePrice: number | null
  saleCurrency: Currency | null
  currencyMismatch: boolean
  margin: number | null
  marginPercent: number | null
  pricingMode: PackagePricingMode
  marginMultiplier: number | null
}

// Import Config types
type ImportSourceType = 'csv' | 'google_sheets'
type ImportFormat = 'flat' | 'pivot'

interface ImportConfigResponse {
  id: number
  priceListCode: string
  version: number
  name: string
  sourceType: ImportSourceType
  format: ImportFormat
  sheetsUrl: string | null
  sheetGid: number | null
  config: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

interface CreateImportConfigRequest {
  priceListCode: string
  version?: number
  name: string
  sourceType: ImportSourceType
  format: ImportFormat
  sheetsUrl?: string | null
  sheetGid?: number | null
  config?: Record<string, unknown> | null
}

interface UpdateImportConfigRequest {
  name?: string
  sheetsUrl?: string | null
  sheetGid?: number | null
  config?: Record<string, unknown> | null
}

interface PivotImportResult {
  imported: number
  updated: number
  skipped: number
  errors: string[]
}

// FIO Price Sync types
interface ExchangeSyncResultResponse {
  exchangeCode: string
  locationId: string | null
  currency: Currency
  pricesUpdated: number
  pricesSkipped: number
  syncedAt: string
}

interface SyncPricesResponse {
  success: boolean
  exchanges: ExchangeSyncResultResponse[]
  totalUpdated: number
  totalSkipped: number
  errors: string[]
}

export interface FioStatsResponse {
  totalItems: number
  totalQuantity: number
  uniqueCommodities: number
  storageLocations: number
  newestSyncTime: string | null
  oldestFioUploadTime: string | null
  oldestFioUploadLocation: {
    storageType: string
    locationNaturalId: string | null
  } | null
  newestFioUploadTime: string | null
}

interface FioClearResponse {
  success: boolean
  deletedItems: number
  deletedStorages: number
}

// Sell Order types
interface SellOrderResponse {
  id: number
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  priceListCode: string | null
  orderType: OrderType
  limitMode: SellOrderLimitMode
  limitQuantity: number | null
  fioQuantity: number
  availableQuantity: number
  activeReservationCount: number
  reservedQuantity: number
  fulfilledQuantity: number
  remainingQuantity: number
  fioUploadedAt: string | null // When seller's FIO inventory was last synced from game
  // Dynamic pricing fields
  pricingMode: PricingMode
  effectivePrice: number | null
  isFallback: boolean
  priceLocationId: string | null
}

interface CreateSellOrderRequest {
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  priceListCode?: string | null
  orderType?: OrderType
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
}

interface UpdateSellOrderRequest {
  price?: number
  currency?: Currency
  priceListCode?: string | null
  orderType?: OrderType
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
}

// Buy Order types
interface BuyOrderResponse {
  id: number
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  priceListCode: string | null
  orderType: OrderType
  activeReservationCount: number
  reservedQuantity: number
  fulfilledQuantity: number
  remainingQuantity: number
  // Dynamic pricing fields
  pricingMode: PricingMode
  effectivePrice: number | null
  isFallback: boolean
  priceLocationId: string | null
}

interface CreateBuyOrderRequest {
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  priceListCode?: string | null
  orderType?: OrderType
}

interface UpdateBuyOrderRequest {
  quantity?: number
  price?: number
  currency?: Currency
  priceListCode?: string | null
  orderType?: OrderType
}

// Market listing types
interface MarketListing {
  id: number
  userId: number
  sellerName: string
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  priceListCode: string | null
  effectivePrice: number | null
  isFallback: boolean // true if price came from price list's default location
  priceLocationId: string | null // Location the price came from (different from locationId if fallback)
  pricingMode: PricingMode
  orderType: OrderType
  availableQuantity: number
  isOwn: boolean
  jumpCount: number | null
  activeReservationCount: number
  reservedQuantity: number
  remainingQuantity: number
  fioUploadedAt: string | null
}

interface MarketBuyRequest {
  id: number
  userId: number
  buyerName: string
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  priceListCode: string | null
  effectivePrice: number | null
  isFallback: boolean // true if price came from price list's default location
  priceLocationId: string | null // Location the price came from (different from locationId if fallback)
  pricingMode: PricingMode
  orderType: OrderType
  isOwn: boolean
  jumpCount: number | null
  activeReservationCount: number
  reservedQuantity: number
  remainingQuantity: number
  fioUploadedAt: string | null
}

// Notification types
type NotificationType =
  | 'reservation_placed'
  | 'reservation_confirmed'
  | 'reservation_rejected'
  | 'reservation_fulfilled'
  | 'reservation_cancelled'
  | 'reservation_expired'
  | 'invoice_submitted'
  | 'invoice_cancelled'
  | 'invoice_fulfilled'
  | 'user_needs_approval'
  | 'user_auto_approved'
  | 'user_approved'
  | 'user_rejected'
  | 'sync_queued'
  | 'sync_completed'
  | 'sync_failed'
  | 'fio_data_stale'

interface Notification {
  id: number
  type: NotificationType
  title: string
  message: string | null
  data: Record<string, unknown> | null
  isRead: boolean
  createdAt: string
}

// Reservation types
type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'fulfilled'
  | 'expired'
  | 'cancelled'

interface ReservationWithDetails {
  id: number
  sellOrderId: number | null
  buyOrderId: number | null
  counterpartyUserId: number
  quantity: number
  status: ReservationStatus
  notes: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  orderOwnerName: string
  orderOwnerUserId: number
  counterpartyName: string
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  pricingMode: 'fixed' | 'dynamic'
  effectivePrice: number | null
  priceListCode: string | null
  isOrderOwner: boolean
  isCounterparty: boolean
}

// Compact reservation surfaced in the per-order expanded view in MarketView /
// MyOrdersView. `notes` is null unless the caller is the order owner or this
// reservation's own counterparty. `canViewInvoice` is true only when the
// caller is allowed to open the linked invoice — used to gate the link UI so
// we don't render a clickable link that would 403 on click.
export interface OrderReservationSummary {
  id: number
  status: ReservationStatus
  quantity: number
  counterpartyUserId: number
  counterpartyName: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  invoiceId: number | null
  canViewInvoice: boolean
  notes: string | null
}

interface CreateSellOrderReservationRequest {
  sellOrderId: number
  quantity: number
  notes?: string
  expiresAt?: string
}

interface CreateBuyOrderReservationRequest {
  buyOrderId: number
  quantity: number
  notes?: string
  expiresAt?: string
}

interface UpdateReservationStatusRequest {
  notes?: string
}

// Helper to get JWT token from localStorage
const getAuthToken = (): string | null => {
  return localStorage.getItem('jwt')
}

// Helper to create auth headers
const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// Check for refreshed token header and update stored token
const handleRefreshedToken = (response: Response): void => {
  const refreshedToken = response.headers.get('X-Refreshed-Token')
  if (refreshedToken) {
    localStorage.setItem('jwt', refreshedToken)
    // Dispatch event so app can update user state if needed
    window.dispatchEvent(new CustomEvent('token-refreshed', { detail: { token: refreshedToken } }))
  }
}

/**
 * Build the `?excludedUserIds=...` suffix shared by every corp endpoint that
 * supports the planning-exclusion feature. Returns an empty string when the
 * list is empty/missing so endpoints look the same as before for the default
 * "no exclusions" case.
 */
function corpQueryString(excludedUserIds?: number[]): string {
  if (!excludedUserIds || excludedUserIds.length === 0) return ''
  return `?excludedUserIds=${encodeURIComponent(excludedUserIds.join(','))}`
}

// ── Centralized fetch wrapper with auth + retry ──────────────────────────

const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Centralized fetch wrapper that handles:
 * - Auth headers (JWT from localStorage)
 * - Refreshed token detection (X-Refreshed-Token header)
 * - 401 → centralized auth failure (clears token, notifies App.vue)
 * - Network errors and 5xx → exponential backoff retry
 *
 * Use `authenticatedFetch` for endpoints that require a JWT.
 * Use `rawFetch` for unauthenticated endpoints (login, register, etc.).
 */
async function rawFetch(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithLogging(url, init)

      // Always check for refreshed token before anything else
      handleRefreshedToken(response)

      // Centralized 401 handling — one place, not 60
      if (response.status === 401) {
        handleAuthFailure()
        throw new Error('Session expired. Please log in again.')
      }

      // Retry on server errors (502/503/504 are transient; 500 is ambiguous but retry once)
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
        continue
      }

      return response
    } catch (error) {
      // Don't retry auth failures or application errors
      if (error instanceof Error && error.message === 'Session expired. Please log in again.') {
        throw error
      }

      lastError = error

      // Only retry on network errors (TypeError from fetch), not application errors
      if (error instanceof TypeError && attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
        continue
      }

      throw error
    }
  }

  throw lastError
}

/** Authenticated fetch — adds Bearer token and Content-Type headers. */
async function authenticatedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return rawFetch(url, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init.headers || {}),
    },
  })
}

/** Authenticated fetch for FormData — adds Bearer token but NOT Content-Type (browser sets it for multipart). */
async function authenticatedFormFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken()
  return rawFetch(url, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
}

/**
 * Check a response for non-success status and throw a descriptive error.
 * Call this AFTER rawFetch/authenticatedFetch handles 401 + retry.
 * Use `expectOk` for methods that return parsed JSON or void.
 */
function ensureOk(response: Response, context: string): void {
  if (!response.ok) {
    throw new Error(`${context}: ${response.statusText}`)
  }
}

// ── Typed convenience wrappers ────────────────────────────────────────────
// Collapse the authenticatedFetch → ensureOk → response.json() pattern
// that ~90% of methods follow into one-liners.

async function apiGet<T>(url: string): Promise<T> {
  const response = await authenticatedFetch(url)
  ensureOk(response, `GET ${url}`)
  return response.json()
}

async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'PUT',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  ensureOk(response, `PUT ${url}`)
  return response.json()
}

async function apiDelete<T = void>(url: string): Promise<T> {
  const response = await authenticatedFetch(url, { method: 'DELETE' })
  ensureOk(response, `DELETE ${url}`)
  return response.json() as T
}

// Real API calls (to be used when backend is ready)
const realApi = {
  login: async (request: LoginRequest): Promise<Response> => {
    return fetchWithLogging('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: request.username,
        password: request.password,
      }),
    })
  },

  register: async (request: RegisterRequest): Promise<Response> => {
    return fetchWithLogging('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: request.username,
        password: request.password,
        displayName: request.username,
      }),
    })
  },

  getProfile: () => apiGet<User>('/api/account'),

  updateProfile: (updates: UpdateProfileRequest) => apiPut<User>('/api/account', updates),

  changePassword: async (request: ChangePasswordRequest): Promise<void> => {
    const response = await authenticatedFetch('/api/account/password', {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        throw new Error('Current password is incorrect')
      }
      throw new Error(`Failed to change password: ${response.statusText}`)
    }
  },

  deleteAccount: async (): Promise<void> => {
    const response = await authenticatedFetch('/api/account', {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Account not found')
      }
      throw new Error(`Failed to delete account: ${response.statusText}`)
    }

    // Clear local storage after successful deletion
    localStorage.removeItem('jwt')
    localStorage.removeItem('user')
  },

  setInactiveUntil: async (
    inactiveUntil: string | null
  ): Promise<{ inactiveUntil: string | null }> => {
    const response = await authenticatedFetch('/api/account/inactive-until', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inactiveUntil }),
    })

    if (!response.ok) {
      throw new Error(`Failed to update vacation mode: ${response.statusText}`)
    }

    return response.json()
  },

  listUsers: async (
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<AdminUserListResponse> => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })
    if (search) params.append('search', search)

    const response = await authenticatedFetch(`/api/admin/users?${params}`, {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to list users: ${response.statusText}`)
    }

    return response.json()
  },

  updateUser: async (userId: number, updates: UpdateUserRequest): Promise<AdminUser> => {
    const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 400) {
        const error = await response.json()
        throw new Error(error.message || 'Invalid request')
      }
      throw new Error(`Failed to update user: ${response.statusText}`)
    }

    return response.json()
  },

  listRoles: async (): Promise<Role[]> => {
    const response = await authenticatedFetch('/api/admin/roles', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to list roles: ${response.statusText}`)
    }

    return response.json()
  },

  generatePasswordResetLink: async (userId: number): Promise<PasswordResetLinkResponse> => {
    const response = await authenticatedFetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 404) {
        throw new Error('User not found')
      }
      throw new Error(`Failed to generate reset link: ${response.statusText}`)
    }

    return response.json()
  },

  syncUserFio: async (userId: number): Promise<AdminFioSyncEnqueueResponse> => {
    const response = await authenticatedFetch(`/api/admin/users/${userId}/sync-fio`, {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 404) {
        throw new Error('User not found')
      }
      if (response.status === 400) {
        throw new Error('User does not have FIO credentials configured')
      }
      throw new Error(`Failed to enqueue FIO sync: ${response.statusText}`)
    }

    return response.json()
  },

  startFioSyncAll: async (): Promise<FioSyncEnqueueResponse> => {
    const response = await authenticatedFetch('/api/fio/sync-all', {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'FIO credentials not configured')
      }
      throw new Error(`Failed to enqueue FIO sync: ${response.statusText}`)
    }

    return response.json()
  },

  deleteUser: async (userId: number): Promise<{ success: boolean; username: string }> => {
    const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 404) {
        throw new Error('User not found')
      }
      if (response.status === 400) {
        const data = await response.json()
        throw new Error(data.message || 'Cannot delete this user')
      }
      throw new Error(`Failed to delete user: ${response.statusText}`)
    }

    return response.json()
  },

  disconnectUserDiscord: async (
    userId: number
  ): Promise<{ success: boolean; username: string }> => {
    const response = await authenticatedFetch(`/api/admin/users/${userId}/discord`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 404) {
        throw new Error('User not found')
      }
      if (response.status === 400) {
        throw new Error('User does not have Discord connected')
      }
      throw new Error(`Failed to disconnect Discord: ${response.statusText}`)
    }

    return response.json()
  },

  // Pending approvals
  getPendingApprovalsCount: async (): Promise<{ count: number }> => {
    const response = await authenticatedFetch('/api/admin/pending-approvals/count', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get pending approvals count: ${response.statusText}`)
    }

    return response.json()
  },

  listPendingApprovals: async (): Promise<AdminUser[]> => {
    const response = await authenticatedFetch('/api/admin/pending-approvals', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to list pending approvals: ${response.statusText}`)
    }

    return response.json()
  },

  approveUser: async (userId: number, roleId?: string): Promise<AdminUser> => {
    const response = await authenticatedFetch(`/api/admin/users/${userId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ roleId }),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 404) {
        throw new Error('User not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      throw new Error(`Failed to approve user: ${response.statusText}`)
    }

    return response.json()
  },

  resetPassword: async (request: ResetPasswordRequest): Promise<void> => {
    const response = await fetchWithLogging('/api/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid or expired reset token')
      }
      throw new Error(`Failed to reset password: ${response.statusText}`)
    }
  },

  validateResetToken: async (token: string): Promise<ValidateTokenResponse> => {
    const response = await fetchWithLogging(
      `/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
      }
    )

    if (!response.ok) {
      return { valid: false }
    }

    return response.json()
  },

  checkUsernameAvailability: async (username: string): Promise<UsernameAvailabilityResponse> => {
    const response = await fetchWithLogging(
      `/api/auth/check-username?username=${encodeURIComponent(username)}`,
      {
        method: 'GET',
      }
    )

    if (!response.ok) {
      return { available: false, message: 'Failed to check username availability' }
    }

    return response.json()
  },

  validateDiscordLinkToken: async (token: string): Promise<ValidateDiscordLinkTokenResponse> => {
    const response = await fetchWithLogging(
      `/api/auth/validate-discord-link-token?token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
      }
    )

    if (!response.ok) {
      return { valid: false, error: 'Failed to validate link token' }
    }

    return response.json()
  },

  completeDiscordLink: async (
    request: CompleteDiscordLinkRequest
  ): Promise<{ message: string }> => {
    const response = await authenticatedFetch('/api/auth/complete-discord-link', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to link Discord account')
    }

    return response.json()
  },

  // Role management
  createRole: async (request: CreateRoleRequest): Promise<Role> => {
    const response = await authenticatedFetch('/api/admin/roles', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('Role with this ID already exists')
      }
      throw new Error(`Failed to create role: ${response.statusText}`)
    }

    return response.json()
  },

  updateRole: async (roleId: string, updates: { name?: string; color?: string }): Promise<Role> => {
    const response = await authenticatedFetch(`/api/admin/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Role not found')
      }
      throw new Error(`Failed to update role: ${response.statusText}`)
    }

    return response.json()
  },

  deleteRole: async (roleId: string): Promise<void> => {
    const response = await authenticatedFetch(`/api/admin/roles/${roleId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Role not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Cannot delete role')
      }
      throw new Error(`Failed to delete role: ${response.statusText}`)
    }
  },

  // Permission management
  listPermissions: () => apiGet<Permission[]>('/api/admin/permissions'),

  listRolePermissions: () => apiGet<RolePermissionWithDetails[]>('/api/admin/role-permissions'),

  setRolePermission: async (request: SetRolePermissionRequest): Promise<RolePermission> => {
    const response = await authenticatedFetch('/api/admin/role-permissions', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 404) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Role or permission not found')
      }
      throw new Error(`Failed to set role permission: ${response.statusText}`)
    }

    return response.json()
  },

  deleteRolePermission: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/admin/role-permissions/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Role permission mapping not found')
      }
      throw new Error(`Failed to delete role permission: ${response.statusText}`)
    }
  },

  // FIO Inventory methods
  getFioInventory: () => apiGet<FioInventoryItem[]>('/api/fio/inventory'),

  getFioLastSync: () => apiGet<FioLastSyncResponse>('/api/fio/inventory/last-sync'),

  getFioStats: () => apiGet<FioStatsResponse>('/api/fio/inventory/stats'),

  getFioStorageLocations: () => apiGet<{ locationIds: string[] }>('/api/fio/inventory/locations'),

  clearFioInventory: () => apiDelete<FioClearResponse>('/api/fio/inventory'),

  // Sell Orders methods
  getSellOrders: () => apiGet<SellOrderResponse[]>('/api/sell-orders'),

  getSellOrder: async (id: number): Promise<SellOrderResponse> => {
    const response = await authenticatedFetch(`/api/sell-orders/${id}`, {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Sell order not found')
      }
      throw new Error(`Failed to get sell order: ${response.statusText}`)
    }

    return response.json()
  },

  createSellOrder: async (request: CreateSellOrderRequest): Promise<SellOrderResponse> => {
    const response = await authenticatedFetch('/api/sell-orders', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to create sell order: ${response.statusText}`)
    }

    return response.json()
  },

  updateSellOrder: async (
    id: number,
    request: UpdateSellOrderRequest
  ): Promise<SellOrderResponse> => {
    const response = await authenticatedFetch(`/api/sell-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Sell order not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to update sell order: ${response.statusText}`)
    }

    return response.json()
  },

  deleteSellOrder: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/sell-orders/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Sell order not found')
      }
      throw new Error(`Failed to delete sell order: ${response.statusText}`)
    }
  },

  // Public roles endpoint (for sell order targeting)
  getRoles: async (): Promise<Role[]> => {
    const response = await fetchWithLogging('/api/roles', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    ensureOk(response, 'Failed to get roles')

    return response.json()
  },

  // Market methods
  getMarketListings: async (
    commodity?: string,
    location?: string,
    destination?: string
  ): Promise<MarketListing[]> => {
    const params = new URLSearchParams()
    if (commodity) params.append('commodity', commodity)
    if (location) params.append('location', location)
    if (destination) params.append('destination', destination)

    const url = `/api/market/listings${params.toString() ? '?' + params.toString() : ''}`
    const response = await authenticatedFetch(url, {
      method: 'GET',
    })

    ensureOk(response, 'Failed to get market listings')

    return response.json()
  },

  getMarketBuyRequests: async (
    commodity?: string,
    location?: string,
    destination?: string
  ): Promise<MarketBuyRequest[]> => {
    const params = new URLSearchParams()
    if (commodity) params.append('commodity', commodity)
    if (location) params.append('location', location)
    if (destination) params.append('destination', destination)

    const url = `/api/market/buy-requests${params.toString() ? '?' + params.toString() : ''}`
    const response = await authenticatedFetch(url, {
      method: 'GET',
    })

    ensureOk(response, 'Failed to get market buy requests')

    return response.json()
  },

  // Buy Orders methods
  getBuyOrders: () => apiGet<BuyOrderResponse[]>('/api/buy-orders'),

  getBuyOrder: async (id: number): Promise<BuyOrderResponse> => {
    const response = await authenticatedFetch(`/api/buy-orders/${id}`, {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Buy order not found')
      }
      throw new Error(`Failed to get buy order: ${response.statusText}`)
    }

    return response.json()
  },

  createBuyOrder: async (request: CreateBuyOrderRequest): Promise<BuyOrderResponse> => {
    const response = await authenticatedFetch('/api/buy-orders', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to create buy order: ${response.statusText}`)
    }

    return response.json()
  },

  updateBuyOrder: async (id: number, request: UpdateBuyOrderRequest): Promise<BuyOrderResponse> => {
    const response = await authenticatedFetch(`/api/buy-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Buy order not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to update buy order: ${response.statusText}`)
    }

    return response.json()
  },

  deleteBuyOrder: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/buy-orders/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Buy order not found')
      }
      throw new Error(`Failed to delete buy order: ${response.statusText}`)
    }
  },

  // Admin Discord methods
  getDiscordSettings: async (): Promise<DiscordSettings> => {
    const response = await authenticatedFetch('/api/admin/discord/settings', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get Discord settings: ${response.statusText}`)
    }

    return response.json()
  },

  updateDiscordSettings: async (
    settings: UpdateDiscordSettingsRequest
  ): Promise<DiscordSettings> => {
    const response = await authenticatedFetch('/api/admin/discord/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to update Discord settings: ${response.statusText}`)
    }

    return response.json()
  },

  testDiscordConnection: async (): Promise<DiscordTestConnectionResponse> => {
    const response = await authenticatedFetch('/api/admin/discord/settings/test-connection', {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to test Discord connection')
    }

    return response.json()
  },

  getDiscordGuildRoles: async (): Promise<DiscordRole[]> => {
    const response = await authenticatedFetch('/api/admin/discord/guild/roles', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 400) {
        throw new Error('Discord guild not configured')
      }
      throw new Error(`Failed to get Discord guild roles: ${response.statusText}`)
    }

    return response.json()
  },

  getDiscordGuildChannels: async (): Promise<Array<{ id: string; name: string }>> => {
    const response = await authenticatedFetch('/api/admin/discord/guild/channels', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 400) {
        throw new Error('Discord guild not configured')
      }
      throw new Error(`Failed to get Discord guild channels: ${response.statusText}`)
    }

    return response.json()
  },

  getDiscordRoleMappings: async (): Promise<DiscordRoleMapping[]> => {
    const response = await authenticatedFetch('/api/admin/discord/role-mappings', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get Discord role mappings: ${response.statusText}`)
    }

    return response.json()
  },

  createDiscordRoleMapping: async (
    mapping: DiscordRoleMappingRequest
  ): Promise<DiscordRoleMapping> => {
    const response = await authenticatedFetch('/api/admin/discord/role-mappings', {
      method: 'POST',
      body: JSON.stringify(mapping),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 409) {
        throw new Error('Mapping for this Discord role already exists')
      }
      throw new Error(`Failed to create Discord role mapping: ${response.statusText}`)
    }

    return response.json()
  },

  updateDiscordRoleMapping: async (
    id: number,
    mapping: DiscordRoleMappingRequest
  ): Promise<DiscordRoleMapping> => {
    const response = await authenticatedFetch(`/api/admin/discord/role-mappings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(mapping),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 404) {
        throw new Error('Role mapping not found')
      }
      throw new Error(`Failed to update Discord role mapping: ${response.statusText}`)
    }

    return response.json()
  },

  deleteDiscordRoleMapping: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/admin/discord/role-mappings/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 404) {
        throw new Error('Role mapping not found')
      }
      throw new Error(`Failed to delete Discord role mapping: ${response.statusText}`)
    }
  },

  // Channel Config methods
  getChannelConfigs: async (): Promise<ChannelConfigMap[]> => {
    const response = await authenticatedFetch('/api/admin/discord/channel-config', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get channel configs: ${response.statusText}`)
    }

    return response.json()
  },

  updateChannelConfig: async (
    channelId: string,
    data: UpdateChannelConfigRequest
  ): Promise<ChannelConfigMap> => {
    const response = await authenticatedFetch(
      `/api/admin/discord/channel-config/${encodeURIComponent(channelId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    )

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to update channel config: ${response.statusText}`)
    }

    return response.json()
  },

  deleteChannelConfig: async (channelId: string): Promise<void> => {
    const response = await authenticatedFetch(
      `/api/admin/discord/channel-config/${encodeURIComponent(channelId)}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 404) {
        throw new Error('Channel config not found')
      }
      throw new Error(`Failed to delete channel config: ${response.statusText}`)
    }
  },

  // Admin Global Defaults methods
  getGlobalDefaults: async (): Promise<GlobalDefaultsResponse> => {
    const response = await authenticatedFetch('/api/admin/global-defaults', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get global defaults: ${response.statusText}`)
    }

    return response.json()
  },

  updateGlobalDefaults: async (
    request: UpdateGlobalDefaultsRequest
  ): Promise<GlobalDefaultsResponse> => {
    const response = await authenticatedFetch('/api/admin/global-defaults', {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to update global defaults')
    }

    return response.json()
  },

  resetGlobalDefault: async (key: string): Promise<GlobalDefaultsResponse> => {
    const response = await authenticatedFetch(
      `/api/admin/global-defaults/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to reset global default')
    }

    return response.json()
  },

  // User Discord methods
  getDiscordAuthUrl: () => apiGet<{ url: string; state: string }>('/api/discord/auth-url'),

  handleDiscordCallback: async (
    request: DiscordCallbackRequest
  ): Promise<{ success: boolean; profile: UserDiscordProfile }> => {
    const response = await authenticatedFetch('/api/discord/callback', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid callback request')
      }
      throw new Error(`Failed to link Discord account: ${response.statusText}`)
    }

    return response.json()
  },

  disconnectDiscord: async (): Promise<void> => {
    const response = await authenticatedFetch('/api/discord/connection', {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 400) {
        throw new Error('Discord is not connected to this account')
      }
      throw new Error(`Failed to disconnect Discord: ${response.statusText}`)
    }
  },

  syncDiscordRoles: async (): Promise<{ synced: boolean; rolesAdded: string[] }> => {
    const response = await authenticatedFetch('/api/discord/sync-roles', {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to sync Discord roles')
      }
      throw new Error(`Failed to sync Discord roles: ${response.statusText}`)
    }

    return response.json()
  },

  getDiscordStatus: () => apiGet<DiscordConnectionStatus>('/api/discord/status'),

  // Discord auth (unauthenticated - for login/register)
  getDiscordLoginAuthUrl: async (prompt?: 'none' | 'consent'): Promise<DiscordAuthUrlResponse> => {
    const params = prompt ? `?prompt=${prompt}` : ''
    const response = await fetchWithLogging(`/api/auth/discord/auth-url${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    ensureOk(response, 'Failed to get Discord auth URL')

    return response.json()
  },

  handleDiscordAuthCallback: async (
    code?: string,
    state?: string,
    error?: string,
    errorDescription?: string
  ): Promise<DiscordAuthResult> => {
    const params = new URLSearchParams()
    if (code) params.set('code', code)
    if (state) params.set('state', state)
    if (error) params.set('error', error)
    if (errorDescription) params.set('error_description', errorDescription)

    const response = await fetchWithLogging(`/api/auth/discord/callback?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    ensureOk(response, 'Failed to handle Discord callback')

    return response.json()
  },

  completeDiscordRegistration: async (
    request: DiscordRegisterRequest
  ): Promise<DiscordRegisterResponse> => {
    const response = await fetchWithLogging('/api/auth/discord/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Registration failed')
      }
      throw new Error(`Failed to complete Discord registration: ${response.statusText}`)
    }

    return response.json()
  },

  // Notifications methods
  getNotifications: async (
    limit?: number,
    offset?: number,
    unreadOnly?: boolean
  ): Promise<Notification[]> => {
    const params = new URLSearchParams()
    if (limit !== undefined) params.append('limit', String(limit))
    if (offset !== undefined) params.append('offset', String(offset))
    if (unreadOnly !== undefined) params.append('unreadOnly', String(unreadOnly))

    const url = `/api/notifications${params.toString() ? '?' + params.toString() : ''}`
    const response = await authenticatedFetch(url, {
      method: 'GET',
    })

    ensureOk(response, 'Failed to get notifications')

    return response.json()
  },

  markNotificationAsRead: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/notifications/${id}/read`, {
      method: 'PUT',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Notification not found')
      }
      throw new Error(`Failed to mark as read: ${response.statusText}`)
    }
  },

  markAllNotificationsAsRead: () => apiPut<{ count: number }>('/api/notifications/read-all'),

  deleteNotification: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/notifications/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Notification not found')
      }
      throw new Error(`Failed to delete notification: ${response.statusText}`)
    }
  },

  // Reservations methods
  getReservations: async (
    role?: 'owner' | 'counterparty' | 'all',
    status?: ReservationStatus
  ): Promise<ReservationWithDetails[]> => {
    const params = new URLSearchParams()
    if (role) params.append('role', role)
    if (status) params.append('status', status)

    const url = `/api/reservations${params.toString() ? '?' + params.toString() : ''}`
    const response = await authenticatedFetch(url, {
      method: 'GET',
    })

    ensureOk(response, 'Failed to get reservations')

    return response.json()
  },

  getReservationsForSellOrder: async (
    sellOrderId: number,
    opts?: { all?: boolean }
  ): Promise<OrderReservationSummary[]> => {
    const params = opts?.all ? '?all=true' : ''
    const response = await fetchWithLogging(
      `/api/reservations/sell-order/${sellOrderId}${params}`,
      { method: 'GET', headers: getAuthHeaders() }
    )

    if (!response.ok) {
      if (response.status === 403) throw new Error('Permission denied')
      if (response.status === 404) throw new Error('Sell order not found')
      throw new Error(`Failed to get reservations: ${response.statusText}`)
    }
    return response.json()
  },

  getReservationsForBuyOrder: async (
    buyOrderId: number,
    opts?: { all?: boolean }
  ): Promise<OrderReservationSummary[]> => {
    const params = opts?.all ? '?all=true' : ''
    const response = await authenticatedFetch(
      `/api/reservations/buy-order/${buyOrderId}${params}`,
      {
        method: 'GET',
      }
    )

    if (!response.ok) {
      if (response.status === 403) throw new Error('Permission denied')
      if (response.status === 404) throw new Error('Buy order not found')
      throw new Error(`Failed to get reservations: ${response.statusText}`)
    }
    return response.json()
  },

  createSellOrderReservation: async (
    request: CreateSellOrderReservationRequest
  ): Promise<ReservationWithDetails> => {
    const response = await authenticatedFetch('/api/reservations/sell-order', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to create reservation: ${response.statusText}`)
    }

    return response.json()
  },

  createBuyOrderReservation: async (
    request: CreateBuyOrderReservationRequest
  ): Promise<ReservationWithDetails> => {
    const response = await authenticatedFetch('/api/reservations/buy-order', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to create reservation: ${response.statusText}`)
    }

    return response.json()
  },

  confirmReservation: async (
    id: number,
    request?: UpdateReservationStatusRequest
  ): Promise<ReservationWithDetails> => {
    const response = await authenticatedFetch(`/api/reservations/${id}/confirm`, {
      method: 'PUT',
      body: JSON.stringify(request || {}),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid status transition')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to confirm reservation: ${response.statusText}`)
    }

    return response.json()
  },

  rejectReservation: async (
    id: number,
    request?: UpdateReservationStatusRequest
  ): Promise<ReservationWithDetails> => {
    const response = await authenticatedFetch(`/api/reservations/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify(request || {}),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid status transition')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to reject reservation: ${response.statusText}`)
    }

    return response.json()
  },

  fulfillReservation: async (
    id: number,
    request?: UpdateReservationStatusRequest
  ): Promise<ReservationWithDetails> => {
    const response = await authenticatedFetch(`/api/reservations/${id}/fulfill`, {
      method: 'PUT',
      body: JSON.stringify(request || {}),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid status transition')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to fulfill reservation: ${response.statusText}`)
    }

    return response.json()
  },

  cancelReservation: async (
    id: number,
    request?: UpdateReservationStatusRequest
  ): Promise<ReservationWithDetails> => {
    const response = await authenticatedFetch(`/api/reservations/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify(request || {}),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid status transition')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to cancel reservation: ${response.statusText}`)
    }

    return response.json()
  },

  reopenReservation: async (
    id: number,
    request?: UpdateReservationStatusRequest
  ): Promise<ReservationWithDetails> => {
    const response = await authenticatedFetch(`/api/reservations/${id}/reopen`, {
      method: 'PUT',
      body: JSON.stringify(request || {}),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid status transition')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      throw new Error(`Failed to reopen reservation: ${response.statusText}`)
    }

    return response.json()
  },

  getPricesByExchange: async (exchange: string, version?: number): Promise<PriceListResponse[]> => {
    const params = version !== undefined ? `?version=${version}` : ''
    const response = await authenticatedFetch(`/api/prices/${exchange}${params}`, {
      method: 'GET',
    })

    ensureOk(response, 'Failed to get prices')

    return response.json()
  },

  createPrice: async (request: CreatePriceRequest): Promise<PriceListResponse> => {
    const response = await authenticatedFetch('/api/prices', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400 || response.status === 409) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to create price: ${response.statusText}`)
    }

    return response.json()
  },

  updatePrice: async (id: number, request: UpdatePriceRequest): Promise<PriceListResponse> => {
    const response = await authenticatedFetch(`/api/prices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Price not found')
      }
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to update price: ${response.statusText}`)
    }

    return response.json()
  },

  deletePrice: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/prices/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Price not found')
      }
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to delete price: ${response.statusText}`)
    }
  },

  getEffectivePrices: async (
    exchange: string,
    locationId: string,
    currency: Currency,
    options?: { commodity?: string; fallback?: boolean; version?: number }
  ): Promise<EffectivePrice[]> => {
    const params = new URLSearchParams({ currency })
    if (options?.commodity) {
      params.set('commodity', options.commodity)
    }
    // Fallback defaults to true on backend, only send if explicitly false
    if (options?.fallback === false) {
      params.set('fallback', 'false')
    }
    if (options?.version !== undefined) {
      params.set('version', String(options.version))
    }
    const response = await authenticatedFetch(
      `/api/prices/effective/${exchange}/${locationId}?${params}`,
      {
        method: 'GET',
      }
    )

    ensureOk(response, 'Failed to get effective prices')

    return response.json()
  },

  // Price Adjustments methods
  getPriceAdjustments: async (
    exchange?: string,
    location?: string,
    activeOnly?: boolean
  ): Promise<PriceAdjustmentResponse[]> => {
    const params = new URLSearchParams()
    if (exchange) params.append('exchange', exchange)
    if (location) params.append('location', location)
    if (activeOnly !== undefined) params.append('activeOnly', String(activeOnly))

    const url = `/api/price-adjustments${params.toString() ? '?' + params.toString() : ''}`
    const response = await authenticatedFetch(url, {
      method: 'GET',
    })

    ensureOk(response, 'Failed to get price adjustments')

    return response.json()
  },

  createPriceAdjustment: async (
    request: CreatePriceAdjustmentRequest
  ): Promise<PriceAdjustmentResponse> => {
    const response = await authenticatedFetch('/api/price-adjustments', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to create adjustment: ${response.statusText}`)
    }

    return response.json()
  },

  updatePriceAdjustment: async (
    id: number,
    request: UpdatePriceAdjustmentRequest
  ): Promise<PriceAdjustmentResponse> => {
    const response = await authenticatedFetch(`/api/price-adjustments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Adjustment not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to update adjustment: ${response.statusText}`)
    }

    return response.json()
  },

  deletePriceAdjustment: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/price-adjustments/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Adjustment not found')
      }
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to delete adjustment: ${response.statusText}`)
    }
  },

  // FIO Exchanges methods
  getFioExchanges: () => apiGet<FioExchangeResponse[]>('/api/fio-exchanges'),

  syncFioPrices: async (
    exchangeCode?: string,
    priceField?: string
  ): Promise<SyncPricesResponse> => {
    const url = exchangeCode
      ? `/api/prices/sync/fio/${exchangeCode}${priceField ? '?priceField=' + priceField : ''}`
      : '/api/prices/sync/fio'

    const response = await authenticatedFetch(url, {
      method: 'POST',
      body: exchangeCode ? undefined : JSON.stringify({ priceField }),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to sync prices: ${response.statusText}`)
    }

    return response.json()
  },

  // Price Lists methods
  getPriceLists: async (): Promise<PriceListDefinition[]> => {
    const response = await authenticatedFetch('/api/price-lists', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to get price lists: ${response.statusText}`)
    }

    return response.json()
  },

  createPriceList: async (request: CreatePriceListRequest): Promise<PriceListDefinition> => {
    const response = await fetchWithLogging('/api/price-lists', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      if (response.status === 409) {
        throw new Error(`Price list '${request.code}' already exists`)
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to create price list: ${response.statusText}`)
    }

    return response.json()
  },

  updatePriceList: async (
    code: string,
    request: UpdatePriceListRequest
  ): Promise<PriceListDefinition> => {
    const response = await fetchWithLogging(`/api/price-lists/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      if (response.status === 404) {
        throw new Error(`Price list '${code}' not found`)
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to update price list: ${response.statusText}`)
    }

    return response.json()
  },

  deletePriceList: async (code: string): Promise<void> => {
    const response = await authenticatedFetch(`/api/price-lists/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      if (response.status === 404) {
        throw new Error(`Price list '${code}' not found`)
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to delete price list: ${response.statusText}`)
    }
  },

  // Price List Version methods
  getPriceListVersions: async (code: string): Promise<VersionSummary[]> => {
    const response = await authenticatedFetch(
      `/api/price-lists/${encodeURIComponent(code)}/versions`,
      {
        method: 'GET',
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Price list '${code}' not found`)
      }
      throw new Error(`Failed to get versions: ${response.statusText}`)
    }

    return response.json()
  },

  createPriceListVersion: async (
    code: string,
    request: CreateVersionRequest
  ): Promise<VersionDetail> => {
    const response = await fetchWithLogging(
      `/api/price-lists/${encodeURIComponent(code)}/versions`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    )

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to create version: ${response.statusText}`)
    }

    return response.json()
  },

  promotePriceListVersion: async (code: string, version: number): Promise<VersionDetail> => {
    const response = await authenticatedFetch(
      `/api/price-lists/${encodeURIComponent(code)}/versions/${version}/promote`,
      {
        method: 'POST',
      }
    )

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to promote version: ${response.statusText}`)
    }

    return response.json()
  },

  deletePriceListVersion: async (code: string, version: number): Promise<void> => {
    const response = await authenticatedFetch(
      `/api/price-lists/${encodeURIComponent(code)}/versions/${version}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to delete version: ${response.statusText}`)
    }
  },

  diffPriceListVersions: (code: string, version: number, otherVersion: number) =>
    apiGet<VersionDiff>(
      `/api/price-lists/${encodeURIComponent(code)}/versions/${version}/diff/${otherVersion}`
    ),

  // Packages methods (bills of materials sold as a bundle, e.g. ships)
  getPackages: (type?: PackageType, activeOnly?: boolean): Promise<PackageResponse[]> => {
    const params = new URLSearchParams()
    if (type) params.set('type', type)
    if (activeOnly !== undefined) params.set('activeOnly', String(activeOnly))
    const qs = params.toString()
    return apiGet<PackageResponse[]>(`/api/packages${qs ? '?' + qs : ''}`)
  },

  getPackage: (id: number): Promise<PackageResponse> =>
    apiGet<PackageResponse>(`/api/packages/${id}`),

  getPackagePrice: (
    id: number,
    priceListCode: string,
    options?: { locationId?: string; version?: number }
  ): Promise<PackagePriceBreakdown> => {
    const params = new URLSearchParams({ priceListCode })
    if (options?.locationId) params.set('locationId', options.locationId)
    if (options?.version !== undefined) params.set('version', String(options.version))
    return apiGet<PackagePriceBreakdown>(`/api/packages/${id}/price?${params}`)
  },

  getAllPackagePrices: (
    priceListCode: string,
    options?: { locationId?: string; version?: number; type?: PackageType }
  ): Promise<PackagePriceBreakdown[]> => {
    const params = new URLSearchParams({ priceListCode })
    if (options?.locationId) params.set('locationId', options.locationId)
    if (options?.version !== undefined) params.set('version', String(options.version))
    if (options?.type) params.set('type', options.type)
    return apiGet<PackagePriceBreakdown[]>(`/api/packages/price?${params}`)
  },

  createPackage: async (request: CreatePackageRequest): Promise<PackageResponse> => {
    const response = await authenticatedFetch('/api/packages', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to create package: ${response.statusText}`)
    }

    return response.json()
  },

  updatePackage: async (id: number, request: UpdatePackageRequest): Promise<PackageResponse> => {
    const response = await authenticatedFetch(`/api/packages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Package not found')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to update package: ${response.statusText}`)
    }

    return response.json()
  },

  deletePackage: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/packages/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Package not found')
      }
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to delete package: ${response.statusText}`)
    }
  },

  // Import Configs methods
  getImportConfigs: async (): Promise<ImportConfigResponse[]> => {
    const response = await authenticatedFetch('/api/import-configs', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to get import configs: ${response.statusText}`)
    }

    return response.json()
  },

  createImportConfig: async (request: CreateImportConfigRequest): Promise<ImportConfigResponse> => {
    const response = await fetchWithLogging('/api/import-configs', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to create import config: ${response.statusText}`)
    }

    return response.json()
  },

  updateImportConfig: async (
    id: number,
    request: UpdateImportConfigRequest
  ): Promise<ImportConfigResponse> => {
    const response = await fetchWithLogging(`/api/import-configs/${id}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      if (response.status === 404) {
        throw new Error(`Import config not found`)
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to update import config: ${response.statusText}`)
    }

    return response.json()
  },

  deleteImportConfig: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/import-configs/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      if (response.status === 404) {
        throw new Error(`Import config not found`)
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to delete import config: ${response.statusText}`)
    }
  },

  syncImportConfig: async (
    id: number,
    version?: number
  ): Promise<CsvImportResult | PivotImportResult> => {
    const params = version !== undefined ? `?version=${version}` : ''
    const response = await authenticatedFetch(`/api/import-configs/${id}/sync${params}`, {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      if (response.status === 404) {
        throw new Error(`Import config not found`)
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to sync import config: ${response.statusText}`)
    }

    return response.json()
  },

  syncImportConfigUpload: async (
    id: number,
    file: File,
    version?: number
  ): Promise<CsvImportResult> => {
    const formData = new FormData()
    formData.append('file', file)
    if (version !== undefined) {
      formData.append('version', String(version))
    }

    const response = await authenticatedFormFetch(`/api/import-configs/${id}/sync/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      if (response.status === 404) {
        throw new Error(`Import config not found`)
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to upload CSV: ${response.statusText}`)
    }

    return response.json()
  },

  // Admin Price Settings methods
  getPriceSettings: async (): Promise<PriceSettingsResponse> => {
    const response = await authenticatedFetch('/api/admin/price-settings', {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get price settings: ${response.statusText}`)
    }

    return response.json()
  },

  updateFioSettings: async (request: UpdateFioSettingsRequest): Promise<PriceSettingsResponse> => {
    const response = await authenticatedFetch('/api/admin/price-settings/fio', {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid FIO settings')
      }
      throw new Error(`Failed to update FIO settings: ${response.statusText}`)
    }

    return response.json()
  },

  updateGoogleSettings: async (
    request: UpdateGoogleSettingsRequest
  ): Promise<PriceSettingsResponse> => {
    const response = await authenticatedFetch('/api/admin/price-settings/google', {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to update Google settings: ${response.statusText}`)
    }

    return response.json()
  },

  // ==================== USER SETTINGS ====================

  getUserSettings: async (): Promise<UserSettingsResponse> => {
    const response = await fetchWithLogging('/api/user-settings', {
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      throw new Error('Failed to get user settings')
    }

    return response.json()
  },

  updateUserSettings: async (settings: Record<string, unknown>): Promise<UserSettingsResponse> => {
    const response = await authenticatedFetch('/api/user-settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid settings')
      }
      throw new Error('Failed to update user settings')
    }

    return response.json()
  },

  resetUserSetting: async (key: string): Promise<UserSettingsResponse> => {
    const response = await authenticatedFetch(`/api/user-settings/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid setting key')
      }
      throw new Error('Failed to reset user setting')
    }

    return response.json()
  },

  resetAllUserSettings: async (): Promise<UserSettingsResponse> => {
    const response = await authenticatedFetch('/api/user-settings', {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to reset user settings')
    }

    return response.json()
  },

  // Invoice methods
  getInvoices: async (
    status?: 'draft' | 'submitted' | 'completed' | 'cancelled'
  ): Promise<InvoiceSummary[]> => {
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    const url = `/api/invoices${params.toString() ? `?${params}` : ''}`

    const response = await authenticatedFetch(url, {
      method: 'GET',
    })

    ensureOk(response, 'Failed to get invoices')

    return response.json()
  },

  getInvoice: async (id: number): Promise<Invoice> => {
    const response = await authenticatedFetch(`/api/invoices/${id}`, {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Invoice not found')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this invoice')
      }
      throw new Error(`Failed to get invoice: ${response.statusText}`)
    }

    return response.json()
  },

  getOrCreateInvoiceForPartner: async (counterpartyUserId: number): Promise<Invoice> => {
    const response = await authenticatedFetch(`/api/invoices/for-partner/${counterpartyUserId}`, {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 404) {
        throw new Error('User not found')
      }
      throw new Error(`Failed to get or create invoice: ${response.statusText}`)
    }

    return response.json()
  },

  deleteInvoice: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/invoices/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Only draft invoices can be deleted')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this invoice')
      }
      if (response.status === 404) {
        throw new Error('Invoice not found')
      }
      throw new Error(`Failed to delete invoice: ${response.statusText}`)
    }
  },

  addInvoiceLineItem: async (
    invoiceId: number,
    request: AddLineItemRequest
  ): Promise<InvoiceLineItem> => {
    const response = await authenticatedFetch(`/api/invoices/${invoiceId}/items`, {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this invoice')
      }
      if (response.status === 404) {
        throw new Error('Invoice or order not found')
      }
      throw new Error(`Failed to add line item: ${response.statusText}`)
    }

    return response.json()
  },

  updateInvoiceLineItem: async (
    invoiceId: number,
    itemId: number,
    request: UpdateLineItemRequest
  ): Promise<InvoiceLineItem> => {
    const response = await authenticatedFetch(`/api/invoices/${invoiceId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this invoice')
      }
      if (response.status === 404) {
        throw new Error('Invoice or line item not found')
      }
      throw new Error(`Failed to update line item: ${response.statusText}`)
    }

    return response.json()
  },

  removeInvoiceLineItem: async (invoiceId: number, itemId: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/invoices/${invoiceId}/items/${itemId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Can only remove items from draft invoices')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this invoice')
      }
      if (response.status === 404) {
        throw new Error('Invoice or line item not found')
      }
      throw new Error(`Failed to remove line item: ${response.statusText}`)
    }
  },

  submitInvoice: async (id: number): Promise<SubmitInvoiceResponse> => {
    const response = await authenticatedFetch(`/api/invoices/${id}/submit`, {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Only draft invoices can be submitted')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this invoice')
      }
      if (response.status === 404) {
        throw new Error('Invoice not found')
      }
      throw new Error(`Failed to submit invoice: ${response.statusText}`)
    }

    return response.json()
  },

  cancelInvoice: async (id: number): Promise<Invoice> => {
    const response = await authenticatedFetch(`/api/invoices/${id}/cancel`, {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Only submitted invoices can be cancelled')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this invoice')
      }
      if (response.status === 404) {
        throw new Error('Invoice not found')
      }
      throw new Error(`Failed to cancel invoice: ${response.statusText}`)
    }

    return response.json()
  },

  fulfillInvoice: async (id: number): Promise<Invoice> => {
    const response = await authenticatedFetch(`/api/invoices/${id}/fulfill`, {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'This invoice cannot be fulfilled')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this invoice')
      }
      if (response.status === 404) {
        throw new Error('Invoice not found')
      }
      throw new Error(`Failed to fulfill invoice: ${response.statusText}`)
    }

    return response.json()
  },

  // Shopping Lists API
  getShoppingLists: () => apiGet<ShoppingListSummary[]>('/api/lists'),

  getShoppingList: async (id: number): Promise<SavedShoppingList> => {
    const response = await authenticatedFetch(`/api/lists/${id}`, {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Shopping list not found')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this shopping list')
      }
      throw new Error(`Failed to get shopping list: ${response.statusText}`)
    }

    return response.json()
  },

  createShoppingList: async (request: CreateShoppingListRequest): Promise<SavedShoppingList> => {
    const response = await authenticatedFetch('/api/lists', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      throw new Error(`Failed to create shopping list: ${response.statusText}`)
    }

    return response.json()
  },

  updateShoppingList: async (
    id: number,
    request: UpdateShoppingListRequest
  ): Promise<SavedShoppingList> => {
    const response = await authenticatedFetch(`/api/lists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this shopping list')
      }
      if (response.status === 404) {
        throw new Error('Shopping list not found')
      }
      throw new Error(`Failed to update shopping list: ${response.statusText}`)
    }

    return response.json()
  },

  deleteShoppingList: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/lists/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('You do not have access to this shopping list')
      }
      if (response.status === 404) {
        throw new Error('Shopping list not found')
      }
      throw new Error(`Failed to delete shopping list: ${response.statusText}`)
    }
  },

  // Saved Market Filters API
  getSavedFilters: () => apiGet<SavedMarketFilter[]>('/api/saved-filters'),

  getPinnedFilters: () => apiGet<SavedMarketFilter[]>('/api/saved-filters/pinned'),

  browsePublicFilters: async (search?: string, page?: number): Promise<SavedMarketFilter[]> => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (page) params.set('page', String(page))
    const query = params.toString() ? `?${params.toString()}` : ''

    const response = await authenticatedFetch(`/api/saved-filters/browse${query}`, {
      method: 'GET',
    })

    ensureOk(response, 'Failed to browse public filters')

    return response.json()
  },

  getSavedFilter: async (id: number): Promise<SavedMarketFilter> => {
    const response = await authenticatedFetch(`/api/saved-filters/${id}`, {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Saved filter not found')
      }
      throw new Error(`Failed to get saved filter: ${response.statusText}`)
    }

    return response.json()
  },

  createSavedFilter: async (request: CreateSavedFilterRequest): Promise<SavedMarketFilter> => {
    const response = await authenticatedFetch('/api/saved-filters', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      throw new Error(`Failed to create saved filter: ${response.statusText}`)
    }

    return response.json()
  },

  updateSavedFilter: async (
    id: number,
    request: UpdateSavedFilterRequest
  ): Promise<SavedMarketFilter> => {
    const response = await authenticatedFetch(`/api/saved-filters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('You do not have permission to update this filter')
      }
      if (response.status === 404) {
        throw new Error('Saved filter not found')
      }
      throw new Error(`Failed to update saved filter: ${response.statusText}`)
    }

    return response.json()
  },

  deleteSavedFilter: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/saved-filters/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('You do not have permission to delete this filter')
      }
      if (response.status === 404) {
        throw new Error('Saved filter not found')
      }
      throw new Error(`Failed to delete saved filter: ${response.statusText}`)
    }
  },

  togglePinSavedFilter: async (id: number): Promise<SavedMarketFilter> => {
    const response = await authenticatedFetch(`/api/saved-filters/${id}/pin`, {
      method: 'PUT',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Only public filters can be pinned')
      }
      if (response.status === 403) {
        throw new Error('You do not have permission to pin filters')
      }
      if (response.status === 404) {
        throw new Error('Saved filter not found')
      }
      throw new Error(`Failed to toggle pin: ${response.statusText}`)
    }

    return response.json()
  },

  // ==================== CORP OVERVIEW VIEWS ====================

  listCorpOverviewViews: async (): Promise<CorpOverviewView[]> => {
    const response = await authenticatedFetch('/api/corp-overview-views', {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to list views: ${response.statusText}`)
    return response.json()
  },

  browseCorpOverviewViews: async (search?: string, page?: number): Promise<CorpOverviewView[]> => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (page) params.set('page', String(page))
    const query = params.toString() ? `?${params.toString()}` : ''
    const response = await authenticatedFetch(`/api/corp-overview-views/browse${query}`, {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to browse views: ${response.statusText}`)
    return response.json()
  },

  getCorpOverviewView: async (id: number): Promise<CorpOverviewView> => {
    const response = await authenticatedFetch(`/api/corp-overview-views/${id}`, {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 404) throw new Error('View not found')
      throw new Error(`Failed to get view: ${response.statusText}`)
    }
    return response.json()
  },

  createCorpOverviewView: async (
    request: CreateCorpOverviewViewRequest
  ): Promise<CorpOverviewView> => {
    const response = await authenticatedFetch('/api/corp-overview-views', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      throw new Error(`Failed to create view: ${response.statusText}`)
    }
    return response.json()
  },

  updateCorpOverviewView: async (
    id: number,
    request: UpdateCorpOverviewViewRequest
  ): Promise<CorpOverviewView> => {
    const response = await authenticatedFetch(`/api/corp-overview-views/${id}`, {
      method: 'PUT',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 403) {
        throw new Error('You do not have permission to update this view')
      }
      if (response.status === 404) throw new Error('View not found')
      throw new Error(`Failed to update view: ${response.statusText}`)
    }
    return response.json()
  },

  deleteCorpOverviewView: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/corp-overview-views/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('You do not have permission to delete this view')
      }
      if (response.status === 404) throw new Error('View not found')
      throw new Error(`Failed to delete view: ${response.statusText}`)
    }
  },

  togglePinCorpOverviewView: async (id: number): Promise<CorpOverviewView> => {
    const response = await authenticatedFetch(`/api/corp-overview-views/${id}/pin`, {
      method: 'PUT',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Only public views can be pinned')
      }
      if (response.status === 403) {
        throw new Error('You do not have permission to pin views')
      }
      if (response.status === 404) throw new Error('View not found')
      throw new Error(`Failed to toggle pin: ${response.statusText}`)
    }
    return response.json()
  },

  addCorpOverviewViewOwner: async (id: number, userId: number): Promise<CorpOverviewView> => {
    const response = await authenticatedFetch(`/api/corp-overview-views/${id}/owners`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    })

    if (!response.ok) {
      if (response.status === 400 || response.status === 409) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Could not add owner')
      }
      if (response.status === 403) {
        throw new Error('You do not have permission to manage owners on this view')
      }
      if (response.status === 404) throw new Error('View or user not found')
      throw new Error(`Failed to add owner: ${response.statusText}`)
    }
    return response.json()
  },

  removeCorpOverviewViewOwner: async (id: number, userId: number): Promise<CorpOverviewView> => {
    const response = await authenticatedFetch(`/api/corp-overview-views/${id}/owners/${userId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      // 409 covers the last-owner refusal — preserve the server's message so
      // the UI can show "delete the view instead" verbatim.
      if (response.status === 409) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Cannot remove the last owner')
      }
      if (response.status === 403) {
        throw new Error('You do not have permission to manage owners on this view')
      }
      if (response.status === 404) throw new Error('View or user not found')
      throw new Error(`Failed to remove owner: ${response.statusText}`)
    }
    return response.json()
  },

  /**
   * Record that the caller visited a view. Used after deep-link navigation
   * to an unlisted view so the view shows up in the selector across devices.
   * Idempotent server-side; safe to call repeatedly. Failures are logged but
   * non-fatal — the user can still see the view they just navigated to.
   */
  recordCorpOverviewViewVisit: async (id: number): Promise<void> => {
    const response = await authenticatedFetch(`/api/corp-overview-views/${id}/visit`, {
      method: 'POST',
    })

    if (!response.ok && response.status !== 404) {
      // Don't throw on 404 — view became inaccessible between fetch and visit;
      // not worth interrupting the user. Other errors propagate so callers can
      // log them.
      throw new Error(`Failed to record visit: ${response.statusText}`)
    }
  },

  // ==================== CORP SNAPSHOTS (histogram query) ====================

  queryCorpSnapshots: async (req: SnapshotQueryRequest): Promise<SnapshotSeriesResponse> => {
    const params = new URLSearchParams()
    params.set('yMetric', req.yMetric)
    params.set('seriesBy', req.seriesBy)
    if (req.preset) params.set('preset', req.preset)
    if (req.from) params.set('from', req.from)
    if (req.to) params.set('to', req.to)
    if (req.bucket) params.set('bucket', req.bucket)
    if (req.tickers && req.tickers.length > 0) params.set('tickers', req.tickers.join(','))
    if (req.seriesLimit !== undefined) params.set('seriesLimit', String(req.seriesLimit))
    if (req.excludedUserIds && req.excludedUserIds.length > 0) {
      params.set('excludedUserIds', req.excludedUserIds.join(','))
    }
    if (req.includeOther) params.set('includeOther', 'true')

    const response = await authenticatedFetch(`/api/corp-snapshots?${params.toString()}`, {
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid snapshot query')
      }
      throw new Error(`Failed to query corp snapshots: ${response.statusText}`)
    }
    return response.json()
  },

  // ==================== LOGISTICS ====================

  getLogisticsGraph: async (): Promise<LogisticsGraph> => {
    const response = await authenticatedFetch('/api/logistics/graph', {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to get logistics graph: ${response.statusText}`)
    return response.json()
  },

  listLogisticsFlows: async (): Promise<LogisticsFlow[]> => {
    const response = await authenticatedFetch('/api/logistics/flows', {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to list logistics flows: ${response.statusText}`)
    return response.json()
  },

  createLogisticsFlow: async (body: CreateLogisticsFlowRequest): Promise<LogisticsFlow> => {
    const response = await authenticatedFetch('/api/logistics/flows', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to create logistics flow')
    }
    return response.json()
  },

  bulkMultiCreateLogisticsFlows: async (
    body: BulkMultiCreateLogisticsFlowsRequest
  ): Promise<BulkMultiCreateLogisticsFlowsResponse> => {
    const response = await authenticatedFetch('/api/logistics/flows/bulk-multi', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to bulk-multi create logistics flows')
    }
    return response.json()
  },

  previewBulkMultiCreateLogisticsFlows: async (
    body: BulkMultiPreviewRequest
  ): Promise<BulkMultiPreviewResponse> => {
    const response = await authenticatedFetch('/api/logistics/flows/bulk-multi/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to preview bulk-multi logistics flows')
    }
    return response.json()
  },

  updateLogisticsFlow: async (
    id: number,
    body: UpdateLogisticsFlowRequest
  ): Promise<LogisticsFlow> => {
    const response = await authenticatedFetch(`/api/logistics/flows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to update logistics flow')
    }
    return response.json()
  },

  deleteLogisticsFlow: async (id: number): Promise<{ success: boolean }> => {
    const response = await authenticatedFetch(`/api/logistics/flows/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) throw new Error(`Failed to delete logistics flow: ${response.statusText}`)
    return response.json()
  },

  listLogisticsClaims: async (): Promise<LocationDemandClaim[]> => {
    const response = await authenticatedFetch('/api/logistics/claims', {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to list logistics claims: ${response.statusText}`)
    return response.json()
  },

  createLogisticsClaim: async (
    body: CreateLocationDemandClaimRequest
  ): Promise<LocationDemandClaim> => {
    const response = await authenticatedFetch('/api/logistics/claims', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to create claim')
    }
    return response.json()
  },

  updateLogisticsClaim: async (
    id: number,
    body: UpdateLocationDemandClaimRequest
  ): Promise<LocationDemandClaim> => {
    const response = await authenticatedFetch(`/api/logistics/claims/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to update claim')
    }
    return response.json()
  },

  deleteLogisticsClaim: async (id: number): Promise<{ success: boolean }> => {
    const response = await authenticatedFetch(`/api/logistics/claims/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) throw new Error(`Failed to delete claim: ${response.statusText}`)
    return response.json()
  },

  // ==================== CONTRACT COVERAGE (buy-invoice incoming) ====================
  listContractCoverage: () => apiGet<ContractCoverageEntry[]>('/api/logistics/contract-coverage'),

  // ==================== SELF-SUPPLIED (hide-from-contracts) ====================
  listSelfSupplied: async (): Promise<SelfSuppliedEntry[]> => {
    const response = await authenticatedFetch('/api/logistics/self-supplied', {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to list self-supplied: ${response.statusText}`)
    return response.json()
  },

  createSelfSupplied: async (body: CreateSelfSuppliedRequest): Promise<SelfSuppliedEntry> => {
    const response = await authenticatedFetch('/api/logistics/self-supplied', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to mark self-supplied')
    }
    return response.json()
  },

  deleteSelfSupplied: async (id: number): Promise<{ success: boolean }> => {
    const response = await authenticatedFetch(`/api/logistics/self-supplied/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) throw new Error(`Failed to remove self-supplied: ${response.statusText}`)
    return response.json()
  },

  listShips: async (): Promise<UserShip[]> => {
    const response = await authenticatedFetch('/api/ships', {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to list ships: ${response.statusText}`)
    return response.json()
  },

  // ==================== TRIPS (the ship's run) ====================
  listTrips: async (): Promise<Trip[]> => {
    const response = await authenticatedFetch('/api/logistics/trips', {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to list trips: ${response.statusText}`)
    return response.json()
  },

  createTrip: async (body: CreateTripRequest): Promise<Trip> => {
    const response = await authenticatedFetch('/api/logistics/trips', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to create trip')
    }
    return response.json()
  },

  updateTrip: async (id: number, body: UpdateTripRequest): Promise<Trip> => {
    const response = await authenticatedFetch(`/api/logistics/trips/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to update trip')
    }
    return response.json()
  },

  setTripStatus: async (id: number, status: TripStatus): Promise<Trip> => {
    const response = await authenticatedFetch(`/api/logistics/trips/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to update trip status')
    }
    return response.json()
  },

  deleteTrip: async (id: number): Promise<{ success: boolean }> => {
    const response = await authenticatedFetch(`/api/logistics/trips/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) throw new Error(`Failed to delete trip: ${response.statusText}`)
    return response.json()
  },

  repeatTrip: async (id: number, body: RepeatTripRequest): Promise<Trip> => {
    const response = await authenticatedFetch(`/api/logistics/trips/${id}/repeat`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to repeat trip')
    }
    return response.json()
  },

  suggestStopTimes: async (body: SuggestStopTimesRequest): Promise<SuggestStopTimesResponse> => {
    const response = await authenticatedFetch('/api/logistics/trips/suggest-times', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to suggest stop times')
    }
    return response.json()
  },

  // ==================== SHIPMENTS (parcels — queued + assigned) ====================
  listShipments: async (queued?: boolean): Promise<Shipment[]> => {
    const url = queued ? '/api/logistics/shipments?queued=true' : '/api/logistics/shipments'
    const response = await authenticatedFetch(url, {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to list shipments: ${response.statusText}`)
    return response.json()
  },

  getShipment: async (id: number): Promise<Shipment> => {
    const response = await authenticatedFetch(`/api/logistics/shipments/${id}`, {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to get shipment: ${response.statusText}`)
    return response.json()
  },

  createShipment: async (body: CreateShipmentRequest): Promise<Shipment> => {
    const response = await authenticatedFetch('/api/logistics/shipments', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to create shipment')
    }
    return response.json()
  },

  deleteShipment: async (id: number): Promise<{ success: boolean }> => {
    const response = await authenticatedFetch(`/api/logistics/shipments/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) throw new Error(`Failed to delete shipment: ${response.statusText}`)
    return response.json()
  },

  getSupplyPlanets: async (): Promise<SupplyPlanetSummary[]> => {
    const response = await authenticatedFetch('/api/supply-planning/planets', {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to get supply planets: ${response.statusText}`)
    return response.json()
  },

  // ==================== BURN & REPAIR ====================

  getBurnRepairMyBases: async (): Promise<BurnRepairMyBasesResponse> => {
    const response = await authenticatedFetch('/api/burn-repair/my-bases', {
      method: 'GET',
    })

    if (!response.ok) throw new Error(`Failed to get burn/repair data: ${response.statusText}`)
    return response.json()
  },

  // CSV-encode the planning exclusion list — empty/missing => no param.
  // Inlined here (rather than in a util) so the api.ts file stays self-
  // contained for the corp endpoints.

  getBurnRepairCorp: async (excludedUserIds?: number[]): Promise<BurnRepairCorpResponse> => {
    const response = await fetchWithLogging(
      `/api/burn-repair/corp${corpQueryString(excludedUserIds)}`,
      { method: 'GET', headers: getAuthHeaders() }
    )

    if (!response.ok) throw new Error(`Failed to get corp burn/repair: ${response.statusText}`)
    return response.json()
  },

  getBurnRepairCorpBuildings: async (
    excludedUserIds?: number[]
  ): Promise<BurnRepairCorpBuildingsResponse> => {
    const response = await fetchWithLogging(
      `/api/burn-repair/corp/buildings${corpQueryString(excludedUserIds)}`,
      { method: 'GET', headers: getAuthHeaders() }
    )

    if (!response.ok) throw new Error(`Failed to get corp buildings: ${response.statusText}`)
    return response.json()
  },

  getBurnRepairCorpWorkforce: async (
    excludedUserIds?: number[]
  ): Promise<BurnRepairCorpWorkforceResponse> => {
    const response = await fetchWithLogging(
      `/api/burn-repair/corp/workforce${corpQueryString(excludedUserIds)}`,
      { method: 'GET', headers: getAuthHeaders() }
    )

    if (!response.ok) throw new Error(`Failed to get corp workforce: ${response.statusText}`)
    return response.json()
  },

  getBurnRepairCorpMaterialBreakdown: async (
    ticker: string,
    excludedUserIds?: number[]
  ): Promise<BurnRepairCorpMaterialBreakdown> => {
    const response = await fetchWithLogging(
      `/api/burn-repair/corp/material/${encodeURIComponent(ticker)}${corpQueryString(excludedUserIds)}`,
      { method: 'GET', headers: getAuthHeaders() }
    )

    if (!response.ok) throw new Error(`Failed to get material breakdown: ${response.statusText}`)
    return response.json()
  },

  getBurnRepairShoppingList: async (
    body: BurnRepairShoppingListRequest
  ): Promise<BurnRepairShoppingListResponse> => {
    const response = await fetchWithLogging('/api/burn-repair/shopping-list', {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) throw new Error(`Failed to get shopping list: ${response.statusText}`)
    return response.json()
  },
}

interface SupplyPlanetSummary {
  id: number
  planetNaturalId: string
  planetName: string
  lastSyncedAt: string
}

// Export the API interface that automatically uses mock or real based on configuration
export const api = {
  auth: {
    login: (request: LoginRequest) => {
      return USE_MOCK_API ? mockApi.login(request) : realApi.login(request)
    },
    register: (request: RegisterRequest) => {
      return USE_MOCK_API ? mockApi.register(request) : realApi.register(request)
    },
    resetPassword: (request: ResetPasswordRequest) => realApi.resetPassword(request),
    validateResetToken: (token: string) => realApi.validateResetToken(token),
    checkUsernameAvailability: (username: string) => realApi.checkUsernameAvailability(username),
    validateDiscordLinkToken: (token: string) => realApi.validateDiscordLinkToken(token),
    completeDiscordLink: (request: CompleteDiscordLinkRequest) =>
      realApi.completeDiscordLink(request),
  },
  account: {
    getProfile: () => realApi.getProfile(),
    updateProfile: (updates: UpdateProfileRequest) => realApi.updateProfile(updates),
    changePassword: (request: ChangePasswordRequest) => realApi.changePassword(request),
    deleteAccount: () => realApi.deleteAccount(),
    setInactiveUntil: (inactiveUntil: string | null) => realApi.setInactiveUntil(inactiveUntil),
  },
  admin: {
    listUsers: (page?: number, pageSize?: number, search?: string) =>
      realApi.listUsers(page, pageSize, search),
    updateUser: (userId: number, updates: UpdateUserRequest) => realApi.updateUser(userId, updates),
    listRoles: () => realApi.listRoles(),
    createRole: (request: CreateRoleRequest) => realApi.createRole(request),
    updateRole: (roleId: string, updates: { name?: string; color?: string }) =>
      realApi.updateRole(roleId, updates),
    deleteRole: (roleId: string) => realApi.deleteRole(roleId),
    generatePasswordResetLink: (userId: number) => realApi.generatePasswordResetLink(userId),
    syncUserFio: (userId: number) => realApi.syncUserFio(userId),
    deleteUser: (userId: number) => realApi.deleteUser(userId),
    disconnectUserDiscord: (userId: number) => realApi.disconnectUserDiscord(userId),
    listPermissions: () => realApi.listPermissions(),
    listRolePermissions: () => realApi.listRolePermissions(),
    setRolePermission: (request: SetRolePermissionRequest) => realApi.setRolePermission(request),
    deleteRolePermission: (id: number) => realApi.deleteRolePermission(id),
    getPendingApprovalsCount: () => realApi.getPendingApprovalsCount(),
    listPendingApprovals: () => realApi.listPendingApprovals(),
    approveUser: (userId: number, roleId?: string) => realApi.approveUser(userId, roleId),
  },
  fioInventory: {
    get: () => realApi.getFioInventory(),
    getLastSync: () => realApi.getFioLastSync(),
    getStats: () => realApi.getFioStats(),
    getStorageLocations: () => realApi.getFioStorageLocations(),
    clear: () => realApi.clearFioInventory(),
  },
  fioSync: {
    startAll: () => realApi.startFioSyncAll(),
  },
  sellOrders: {
    list: () => realApi.getSellOrders(),
    get: (id: number) => realApi.getSellOrder(id),
    create: (request: CreateSellOrderRequest) => realApi.createSellOrder(request),
    update: (id: number, request: UpdateSellOrderRequest) => realApi.updateSellOrder(id, request),
    delete: (id: number) => realApi.deleteSellOrder(id),
  },
  buyOrders: {
    list: () => realApi.getBuyOrders(),
    get: (id: number) => realApi.getBuyOrder(id),
    create: (request: CreateBuyOrderRequest) => realApi.createBuyOrder(request),
    update: (id: number, request: UpdateBuyOrderRequest) => realApi.updateBuyOrder(id, request),
    delete: (id: number) => realApi.deleteBuyOrder(id),
  },
  market: {
    getListings: (commodity?: string, location?: string, destination?: string) =>
      realApi.getMarketListings(commodity, location, destination),
    getBuyRequests: (commodity?: string, location?: string, destination?: string) =>
      realApi.getMarketBuyRequests(commodity, location, destination),
  },
  roles: {
    list: () => realApi.getRoles(),
  },
  adminDiscord: {
    getSettings: () => realApi.getDiscordSettings(),
    updateSettings: (settings: UpdateDiscordSettingsRequest) =>
      realApi.updateDiscordSettings(settings),
    testConnection: () => realApi.testDiscordConnection(),
    getGuildRoles: () => realApi.getDiscordGuildRoles(),
    getGuildChannels: () => realApi.getDiscordGuildChannels(),
    getRoleMappings: () => realApi.getDiscordRoleMappings(),
    createRoleMapping: (mapping: DiscordRoleMappingRequest) =>
      realApi.createDiscordRoleMapping(mapping),
    updateRoleMapping: (id: number, mapping: DiscordRoleMappingRequest) =>
      realApi.updateDiscordRoleMapping(id, mapping),
    deleteRoleMapping: (id: number) => realApi.deleteDiscordRoleMapping(id),
    getChannelConfigs: () => realApi.getChannelConfigs(),
    updateChannelConfig: (channelId: string, data: UpdateChannelConfigRequest) =>
      realApi.updateChannelConfig(channelId, data),
    deleteChannelConfig: (channelId: string) => realApi.deleteChannelConfig(channelId),
  },
  discord: {
    getAuthUrl: () => realApi.getDiscordAuthUrl(),
    handleCallback: (request: DiscordCallbackRequest) => realApi.handleDiscordCallback(request),
    disconnect: () => realApi.disconnectDiscord(),
    getStatus: () => realApi.getDiscordStatus(),
    syncRoles: () => realApi.syncDiscordRoles(),
  },
  discordAuth: {
    getAuthUrl: (prompt?: 'none' | 'consent') => realApi.getDiscordLoginAuthUrl(prompt),
    handleCallback: (code?: string, state?: string, error?: string, errorDescription?: string) =>
      realApi.handleDiscordAuthCallback(code, state, error, errorDescription),
    completeRegistration: (request: DiscordRegisterRequest) =>
      realApi.completeDiscordRegistration(request),
  },
  notifications: {
    list: (limit?: number, offset?: number, unreadOnly?: boolean) =>
      realApi.getNotifications(limit, offset, unreadOnly),
    markAsRead: (id: number) => realApi.markNotificationAsRead(id),
    markAllAsRead: () => realApi.markAllNotificationsAsRead(),
    delete: (id: number) => realApi.deleteNotification(id),
  },
  reservations: {
    list: (role?: 'owner' | 'counterparty' | 'all', status?: ReservationStatus) =>
      realApi.getReservations(role, status),
    createForSellOrder: (request: CreateSellOrderReservationRequest) =>
      realApi.createSellOrderReservation(request),
    createForBuyOrder: (request: CreateBuyOrderReservationRequest) =>
      realApi.createBuyOrderReservation(request),
    confirm: (id: number, request?: UpdateReservationStatusRequest) =>
      realApi.confirmReservation(id, request),
    reject: (id: number, request?: UpdateReservationStatusRequest) =>
      realApi.rejectReservation(id, request),
    fulfill: (id: number, request?: UpdateReservationStatusRequest) =>
      realApi.fulfillReservation(id, request),
    cancel: (id: number, request?: UpdateReservationStatusRequest) =>
      realApi.cancelReservation(id, request),
    reopen: (id: number, request?: UpdateReservationStatusRequest) =>
      realApi.reopenReservation(id, request),
    forSellOrder: (sellOrderId: number, opts?: { all?: boolean }) =>
      realApi.getReservationsForSellOrder(sellOrderId, opts),
    forBuyOrder: (buyOrderId: number, opts?: { all?: boolean }) =>
      realApi.getReservationsForBuyOrder(buyOrderId, opts),
  },
  invoices: {
    // Status filter uses stored DB status, not calculated display status
    list: (status?: 'draft' | 'submitted' | 'completed' | 'cancelled') =>
      realApi.getInvoices(status),
    get: (id: number) => realApi.getInvoice(id),
    getOrCreateForPartner: (counterpartyUserId: number) =>
      realApi.getOrCreateInvoiceForPartner(counterpartyUserId),
    delete: (id: number) => realApi.deleteInvoice(id),
    addLineItem: (invoiceId: number, request: AddLineItemRequest) =>
      realApi.addInvoiceLineItem(invoiceId, request),
    updateLineItem: (invoiceId: number, itemId: number, request: UpdateLineItemRequest) =>
      realApi.updateInvoiceLineItem(invoiceId, itemId, request),
    removeLineItem: (invoiceId: number, itemId: number) =>
      realApi.removeInvoiceLineItem(invoiceId, itemId),
    submit: (id: number) => realApi.submitInvoice(id),
    cancel: (id: number) => realApi.cancelInvoice(id),
    fulfill: (id: number) => realApi.fulfillInvoice(id),
  },
  lists: {
    list: () => realApi.getShoppingLists(),
    get: (id: number) => realApi.getShoppingList(id),
    create: (request: CreateShoppingListRequest) => realApi.createShoppingList(request),
    update: (id: number, request: UpdateShoppingListRequest) =>
      realApi.updateShoppingList(id, request),
    delete: (id: number) => realApi.deleteShoppingList(id),
  },
  prices: {
    getByExchange: (exchange: string, version?: number) =>
      realApi.getPricesByExchange(exchange, version),
    create: (request: CreatePriceRequest) => realApi.createPrice(request),
    update: (id: number, request: UpdatePriceRequest) => realApi.updatePrice(id, request),
    delete: (id: number) => realApi.deletePrice(id),
    getEffective: (
      exchange: string,
      locationId: string,
      currency: Currency,
      options?: { version?: number }
    ) => realApi.getEffectivePrices(exchange, locationId, currency, options),
  },
  priceAdjustments: {
    list: (exchange?: string, location?: string, activeOnly?: boolean) =>
      realApi.getPriceAdjustments(exchange, location, activeOnly),
    create: (request: CreatePriceAdjustmentRequest) => realApi.createPriceAdjustment(request),
    update: (id: number, request: UpdatePriceAdjustmentRequest) =>
      realApi.updatePriceAdjustment(id, request),
    delete: (id: number) => realApi.deletePriceAdjustment(id),
  },
  fioExchanges: {
    list: () => realApi.getFioExchanges(),
  },
  fioPriceSync: {
    syncExchange: (exchangeCode: string, priceField?: string) =>
      realApi.syncFioPrices(exchangeCode, priceField),
  },
  adminPriceSettings: {
    get: () => realApi.getPriceSettings(),
    updateFio: (request: UpdateFioSettingsRequest) => realApi.updateFioSettings(request),
    updateGoogle: (request: UpdateGoogleSettingsRequest) => realApi.updateGoogleSettings(request),
  },
  adminGlobalDefaults: {
    get: () => realApi.getGlobalDefaults(),
    update: (request: UpdateGlobalDefaultsRequest) => realApi.updateGlobalDefaults(request),
    reset: (key: string) => realApi.resetGlobalDefault(key),
  },
  priceLists: {
    list: () => realApi.getPriceLists(),
    create: (request: CreatePriceListRequest) => realApi.createPriceList(request),
    update: (code: string, request: UpdatePriceListRequest) =>
      realApi.updatePriceList(code, request),
    delete: (code: string) => realApi.deletePriceList(code),
    versions: {
      list: (code: string) => realApi.getPriceListVersions(code),
      create: (code: string, request: CreateVersionRequest) =>
        realApi.createPriceListVersion(code, request),
      promote: (code: string, version: number) => realApi.promotePriceListVersion(code, version),
      delete: (code: string, version: number) => realApi.deletePriceListVersion(code, version),
      diff: (code: string, version: number, otherVersion: number) =>
        realApi.diffPriceListVersions(code, version, otherVersion),
    },
  },
  importConfigs: {
    list: () => realApi.getImportConfigs(),
    create: (request: CreateImportConfigRequest) => realApi.createImportConfig(request),
    update: (id: number, request: UpdateImportConfigRequest) =>
      realApi.updateImportConfig(id, request),
    delete: (id: number) => realApi.deleteImportConfig(id),
    sync: (id: number, version?: number) => realApi.syncImportConfig(id, version),
    syncUpload: (id: number, file: File, version?: number) =>
      realApi.syncImportConfigUpload(id, file, version),
  },
  packages: {
    list: (type?: PackageType, activeOnly?: boolean) => realApi.getPackages(type, activeOnly),
    get: (id: number) => realApi.getPackage(id),
    getPrice: (
      id: number,
      priceListCode: string,
      options?: { locationId?: string; version?: number }
    ) => realApi.getPackagePrice(id, priceListCode, options),
    getAllPrices: (
      priceListCode: string,
      options?: { locationId?: string; version?: number; type?: PackageType }
    ) => realApi.getAllPackagePrices(priceListCode, options),
    create: (request: CreatePackageRequest) => realApi.createPackage(request),
    update: (id: number, request: UpdatePackageRequest) => realApi.updatePackage(id, request),
    delete: (id: number) => realApi.deletePackage(id),
  },
  // User Settings
  getUserSettings: () => realApi.getUserSettings(),
  updateUserSettings: (settings: Record<string, unknown>) => realApi.updateUserSettings(settings),
  resetUserSetting: (key: string) => realApi.resetUserSetting(key),
  resetAllUserSettings: () => realApi.resetAllUserSettings(),
  savedFilters: {
    list: () => realApi.getSavedFilters(),
    getPinned: () => realApi.getPinnedFilters(),
    browse: (search?: string, page?: number) => realApi.browsePublicFilters(search, page),
    get: (id: number) => realApi.getSavedFilter(id),
    create: (request: CreateSavedFilterRequest) => realApi.createSavedFilter(request),
    update: (id: number, request: UpdateSavedFilterRequest) =>
      realApi.updateSavedFilter(id, request),
    delete: (id: number) => realApi.deleteSavedFilter(id),
    togglePin: (id: number) => realApi.togglePinSavedFilter(id),
  },
  corpOverviewViews: {
    list: () => realApi.listCorpOverviewViews(),
    browse: (search?: string, page?: number) => realApi.browseCorpOverviewViews(search, page),
    get: (id: number) => realApi.getCorpOverviewView(id),
    create: (request: CreateCorpOverviewViewRequest) => realApi.createCorpOverviewView(request),
    update: (id: number, request: UpdateCorpOverviewViewRequest) =>
      realApi.updateCorpOverviewView(id, request),
    delete: (id: number) => realApi.deleteCorpOverviewView(id),
    togglePin: (id: number) => realApi.togglePinCorpOverviewView(id),
    addOwner: (id: number, userId: number) => realApi.addCorpOverviewViewOwner(id, userId),
    removeOwner: (id: number, userId: number) => realApi.removeCorpOverviewViewOwner(id, userId),
    visit: (id: number) => realApi.recordCorpOverviewViewVisit(id),
  },
  corpSnapshots: {
    query: (req: SnapshotQueryRequest) => realApi.queryCorpSnapshots(req),
  },
  supplyPlanning: {
    getPlanets: () => realApi.getSupplyPlanets(),
  },
  burnRepair: {
    myBases: () => realApi.getBurnRepairMyBases(),
    corp: (excludedUserIds?: number[]) => realApi.getBurnRepairCorp(excludedUserIds),
    corpBuildings: (excludedUserIds?: number[]) =>
      realApi.getBurnRepairCorpBuildings(excludedUserIds),
    corpWorkforce: (excludedUserIds?: number[]) =>
      realApi.getBurnRepairCorpWorkforce(excludedUserIds),
    corpMaterialBreakdown: (ticker: string, excludedUserIds?: number[]) =>
      realApi.getBurnRepairCorpMaterialBreakdown(ticker, excludedUserIds),
    shoppingList: (body: BurnRepairShoppingListRequest) => realApi.getBurnRepairShoppingList(body),
  },
  logistics: {
    graph: () => realApi.getLogisticsGraph(),
    listFlows: () => realApi.listLogisticsFlows(),
    createFlow: (body: CreateLogisticsFlowRequest) => realApi.createLogisticsFlow(body),
    bulkMultiCreateFlows: (body: BulkMultiCreateLogisticsFlowsRequest) =>
      realApi.bulkMultiCreateLogisticsFlows(body),
    previewBulkMultiFlows: (body: BulkMultiPreviewRequest) =>
      realApi.previewBulkMultiCreateLogisticsFlows(body),
    updateFlow: (id: number, body: UpdateLogisticsFlowRequest) =>
      realApi.updateLogisticsFlow(id, body),
    deleteFlow: (id: number) => realApi.deleteLogisticsFlow(id),
    listClaims: () => realApi.listLogisticsClaims(),
    createClaim: (body: CreateLocationDemandClaimRequest) => realApi.createLogisticsClaim(body),
    updateClaim: (id: number, body: UpdateLocationDemandClaimRequest) =>
      realApi.updateLogisticsClaim(id, body),
    deleteClaim: (id: number) => realApi.deleteLogisticsClaim(id),

    // Contract coverage (buy-invoice incoming offsets)
    listContractCoverage: () => realApi.listContractCoverage(),

    // Self-supplied (hide-from-contracts)
    listSelfSupplied: () => realApi.listSelfSupplied(),
    createSelfSupplied: (body: CreateSelfSuppliedRequest) => realApi.createSelfSupplied(body),
    deleteSelfSupplied: (id: number) => realApi.deleteSelfSupplied(id),

    listShips: () => realApi.listShips(),

    // Trips (the ship's run — owns status, stops, assigned shipments)
    listTrips: () => realApi.listTrips(),
    createTrip: (body: CreateTripRequest) => realApi.createTrip(body),
    updateTrip: (id: number, body: UpdateTripRequest) => realApi.updateTrip(id, body),
    setTripStatus: (id: number, status: TripStatus) => realApi.setTripStatus(id, status),
    deleteTrip: (id: number) => realApi.deleteTrip(id),
    repeatTrip: (id: number, body: RepeatTripRequest = {}) => realApi.repeatTrip(id, body),
    suggestStopTimes: (body: SuggestStopTimesRequest) => realApi.suggestStopTimes(body),

    // Shipments (parcels — queued or assigned to a trip)
    listShipments: (queued?: boolean) => realApi.listShipments(queued),
    getShipment: (id: number) => realApi.getShipment(id),
    createShipment: (body: CreateShipmentRequest) => realApi.createShipment(body),
    deleteShipment: (id: number) => realApi.deleteShipment(id),
  },
}

// Export types for use in components
export type {
  FioInventoryItem,
  SellOrderResponse,
  CreateSellOrderRequest,
  UpdateSellOrderRequest,
  BuyOrderResponse,
  CreateBuyOrderRequest,
  UpdateBuyOrderRequest,
  MarketListing,
  MarketBuyRequest,
  PricingMode,
  Notification,
  NotificationType,
  ReservationStatus,
  ReservationWithDetails,
  CreateSellOrderReservationRequest,
  CreateBuyOrderReservationRequest,
  UpdateReservationStatusRequest,
  // Invoice types
  InvoiceStatus,
  InvoiceSummary,
  Invoice,
  InvoiceLineItem,
  CreateInvoiceRequest,
  AddLineItemRequest,
  UpdateLineItemRequest,
  SubmitInvoiceResponse,
  // Price types
  PriceSource,
  PriceListResponse,
  CreatePriceRequest,
  UpdatePriceRequest,
  EffectivePrice,
  AppliedAdjustment,
  AdjustmentType,
  PriceAdjustmentResponse,
  CreatePriceAdjustmentRequest,
  UpdatePriceAdjustmentRequest,
  FioExchangeResponse,
  SyncPricesResponse,
  // Import types
  CsvFieldMapping,
  CsvRowError,
  CsvImportResult,
  // Admin Price Settings types
  FioPriceField,
  PriceSettingsResponse,
  UpdateFioSettingsRequest,
  UpdateGoogleSettingsRequest,
  // Price List types
  PriceListType,
  PriceListDefinition,
  CreatePriceListRequest,
  UpdatePriceListRequest,
  // Price List Version types
  VersionSummary,
  VersionDetail,
  CreateVersionRequest,
  UpdateVersionRequest,
  PriceDiffEntry,
  VersionDiff,
  // Import Config types
  ImportSourceType,
  ImportFormat,
  ImportConfigResponse,
  CreateImportConfigRequest,
  UpdateImportConfigRequest,
  PivotImportResult,
  // Package types
  PackageType,
  PackagePricingMode,
  PackageInputDto,
  PackageResponse,
  PackageInputRequest,
  CreatePackageRequest,
  UpdatePackageRequest,
  PackageLinePrice,
  PackagePriceBreakdown,
  // Saved filter types
  SavedMarketFilter,
  CreateSavedFilterRequest,
  UpdateSavedFilterRequest,
  // Corp Overview Views
  CorpOverviewView,
  CreateCorpOverviewViewRequest,
  UpdateCorpOverviewViewRequest,
  // Corp Snapshots
  SnapshotQueryRequest,
  SnapshotSeriesResponse,
  SupplyPlanetSummary,
}
