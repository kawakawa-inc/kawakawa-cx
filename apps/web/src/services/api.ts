// API service that switches between mock and real backend
import { mockApi, USE_MOCK_API } from './mockApi'
import { fetchWithLogging } from './logService'
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
  SettingHistoryEntry,
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
  BulkCreateLogisticsFlowsRequest,
  BulkCreateLogisticsFlowsResponse,
  BulkMultiCreateLogisticsFlowsRequest,
  BulkMultiCreateLogisticsFlowsResponse,
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
  isActive: boolean
  roles: Role[]
  fioSync: FioSyncInfo
  discord: DiscordInfo
  createdAt: string
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
  isActive?: boolean
  roles?: string[]
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

interface ParsedPriceRow {
  rowNumber: number
  ticker: string
  location: string
  price: number
  currency: Currency
  raw: Record<string, string>
}

interface CsvImportResult {
  imported: number
  updated: number
  skipped: number
  errors: CsvRowError[]
}

interface CsvPreviewResult {
  headers: string[]
  sampleRows: ParsedPriceRow[]
  parseErrors: CsvRowError[]
  validationErrors: CsvRowError[]
  delimiter: string
  totalRows: number
  validRows: number
}

interface CsvImportRequest {
  exchangeCode: string
  mapping: CsvFieldMapping
  locationDefault?: string
  currencyDefault?: Currency
  delimiter?: string
  hasHeader?: boolean
}

interface GoogleSheetsImportRequest {
  url: string
  exchangeCode: string
  fieldMapping: CsvFieldMapping
  locationDefault?: string | null
  currencyDefault?: Currency | null
}

// Admin Price Settings types
type FioPriceField = 'PriceAverage' | 'MMBuy' | 'MMSell' | 'Ask' | 'Bid'

interface PriceSettingsResponse {
  fioBaseUrl: string
  fioPriceField: FioPriceField
  hasGoogleSheetsApiKey: boolean
  kawaSheetUrl: string | null
  kawaSheetGid: number | null
}

interface UpdateFioSettingsRequest {
  baseUrl?: string
  priceField?: FioPriceField
}

interface UpdateGoogleSettingsRequest {
  apiKey?: string
}

interface UpdateKawaSheetRequest {
  url?: string
  gid?: number | null
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

// Import Config types
type ImportSourceType = 'csv' | 'google_sheets'
type ImportFormat = 'flat' | 'pivot' | 'kawa'

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
interface ExchangeSyncStatus {
  exchangeCode: string
  locationId: string | null
  lastSyncedAt: string | null
  priceCount: number
}

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

interface FioStatsResponse {
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
  | 'user_needs_approval'
  | 'user_auto_approved'
  | 'user_approved'
  | 'user_rejected'

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

  getProfile: async (): Promise<User> => {
    const response = await fetchWithLogging('/api/account', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        // Clear auth and redirect to login
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get profile: ${response.statusText}`)
    }

    return response.json()
  },

  updateProfile: async (updates: UpdateProfileRequest): Promise<User> => {
    const response = await fetchWithLogging('/api/account', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to update profile: ${response.statusText}`)
    }

    return response.json()
  },

  changePassword: async (request: ChangePasswordRequest): Promise<void> => {
    const response = await fetchWithLogging('/api/account/password', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 400) {
        throw new Error('Current password is incorrect')
      }
      throw new Error(`Failed to change password: ${response.statusText}`)
    }
  },

  deleteAccount: async (): Promise<void> => {
    const response = await fetchWithLogging('/api/account', {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized')
      }
      if (response.status === 404) {
        throw new Error('Account not found')
      }
      throw new Error(`Failed to delete account: ${response.statusText}`)
    }

    // Clear local storage after successful deletion
    localStorage.removeItem('jwt')
    localStorage.removeItem('user')
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

    const response = await fetchWithLogging(`/api/admin/users?${params}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to list users: ${response.statusText}`)
    }

    return response.json()
  },

  updateUser: async (userId: number, updates: UpdateUserRequest): Promise<AdminUser> => {
    const response = await fetchWithLogging(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/admin/roles', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to list roles: ${response.statusText}`)
    }

    return response.json()
  },

  generatePasswordResetLink: async (userId: number): Promise<PasswordResetLinkResponse> => {
    const response = await fetchWithLogging(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging(`/api/admin/users/${userId}/sync-fio`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/fio/sync-all', {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'FIO credentials not configured')
      }
      throw new Error(`Failed to enqueue FIO sync: ${response.statusText}`)
    }

    return response.json()
  },

  deleteUser: async (userId: number): Promise<{ success: boolean; username: string }> => {
    const response = await fetchWithLogging(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging(`/api/admin/users/${userId}/discord`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/admin/pending-approvals/count', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get pending approvals count: ${response.statusText}`)
    }

    return response.json()
  },

  listPendingApprovals: async (): Promise<AdminUser[]> => {
    const response = await fetchWithLogging('/api/admin/pending-approvals', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to list pending approvals: ${response.statusText}`)
    }

    return response.json()
  },

  approveUser: async (userId: number, roleId?: string): Promise<AdminUser> => {
    const response = await fetchWithLogging(`/api/admin/users/${userId}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ roleId }),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/auth/complete-discord-link', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to link Discord account')
    }

    return response.json()
  },

  // Role management
  createRole: async (request: CreateRoleRequest): Promise<Role> => {
    const response = await fetchWithLogging('/api/admin/roles', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('Role with this ID already exists')
      }
      throw new Error(`Failed to create role: ${response.statusText}`)
    }

    return response.json()
  },

  updateRole: async (roleId: string, updates: { name?: string; color?: string }): Promise<Role> => {
    const response = await fetchWithLogging(`/api/admin/roles/${roleId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Role not found')
      }
      throw new Error(`Failed to update role: ${response.statusText}`)
    }

    return response.json()
  },

  deleteRole: async (roleId: string): Promise<void> => {
    const response = await fetchWithLogging(`/api/admin/roles/${roleId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
  listPermissions: async (): Promise<Permission[]> => {
    const response = await fetchWithLogging('/api/admin/permissions', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to list permissions: ${response.statusText}`)
    }

    return response.json()
  },

  listRolePermissions: async (): Promise<RolePermissionWithDetails[]> => {
    const response = await fetchWithLogging('/api/admin/role-permissions', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to list role permissions: ${response.statusText}`)
    }

    return response.json()
  },

  setRolePermission: async (request: SetRolePermissionRequest): Promise<RolePermission> => {
    const response = await fetchWithLogging('/api/admin/role-permissions', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/admin/role-permissions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Role permission mapping not found')
      }
      throw new Error(`Failed to delete role permission: ${response.statusText}`)
    }
  },

  // FIO Inventory methods
  getFioInventory: async (): Promise<FioInventoryItem[]> => {
    const response = await fetchWithLogging('/api/fio/inventory', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get FIO inventory: ${response.statusText}`)
    }

    return response.json()
  },

  getFioLastSync: async (): Promise<FioLastSyncResponse> => {
    const response = await fetchWithLogging('/api/fio/inventory/last-sync', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get last sync time: ${response.statusText}`)
    }

    return response.json()
  },

  getFioStats: async (): Promise<FioStatsResponse> => {
    const response = await fetchWithLogging('/api/fio/inventory/stats', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get FIO stats: ${response.statusText}`)
    }

    return response.json()
  },

  getFioStorageLocations: async (): Promise<{ locationIds: string[] }> => {
    const response = await fetchWithLogging('/api/fio/inventory/locations', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get FIO storage locations: ${response.statusText}`)
    }

    return response.json()
  },

  clearFioInventory: async (): Promise<FioClearResponse> => {
    const response = await fetchWithLogging('/api/fio/inventory', {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to clear FIO inventory: ${response.statusText}`)
    }

    return response.json()
  },

  // Sell Orders methods
  getSellOrders: async (): Promise<SellOrderResponse[]> => {
    const response = await fetchWithLogging('/api/sell-orders', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get sell orders: ${response.statusText}`)
    }

    return response.json()
  },

  getSellOrder: async (id: number): Promise<SellOrderResponse> => {
    const response = await fetchWithLogging(`/api/sell-orders/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Sell order not found')
      }
      throw new Error(`Failed to get sell order: ${response.statusText}`)
    }

    return response.json()
  },

  createSellOrder: async (request: CreateSellOrderRequest): Promise<SellOrderResponse> => {
    const response = await fetchWithLogging('/api/sell-orders', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/sell-orders/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/sell-orders/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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

    if (!response.ok) {
      throw new Error(`Failed to get roles: ${response.statusText}`)
    }

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
    const response = await fetchWithLogging(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get market listings: ${response.statusText}`)
    }

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
    const response = await fetchWithLogging(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get market buy requests: ${response.statusText}`)
    }

    return response.json()
  },

  // Buy Orders methods
  getBuyOrders: async (): Promise<BuyOrderResponse[]> => {
    const response = await fetchWithLogging('/api/buy-orders', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get buy orders: ${response.statusText}`)
    }

    return response.json()
  },

  getBuyOrder: async (id: number): Promise<BuyOrderResponse> => {
    const response = await fetchWithLogging(`/api/buy-orders/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Buy order not found')
      }
      throw new Error(`Failed to get buy order: ${response.statusText}`)
    }

    return response.json()
  },

  createBuyOrder: async (request: CreateBuyOrderRequest): Promise<BuyOrderResponse> => {
    const response = await fetchWithLogging('/api/buy-orders', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/buy-orders/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/buy-orders/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Buy order not found')
      }
      throw new Error(`Failed to delete buy order: ${response.statusText}`)
    }
  },

  // Admin Discord methods
  getDiscordSettings: async (): Promise<DiscordSettings> => {
    const response = await fetchWithLogging('/api/admin/discord/settings', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/admin/discord/settings', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to update Discord settings: ${response.statusText}`)
    }

    return response.json()
  },

  testDiscordConnection: async (): Promise<DiscordTestConnectionResponse> => {
    const response = await fetchWithLogging('/api/admin/discord/settings/test-connection', {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to test Discord connection')
    }

    return response.json()
  },

  getDiscordGuildRoles: async (): Promise<DiscordRole[]> => {
    const response = await fetchWithLogging('/api/admin/discord/guild/roles', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/admin/discord/guild/channels', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/admin/discord/role-mappings', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/admin/discord/role-mappings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(mapping),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging(`/api/admin/discord/role-mappings/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(mapping),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging(`/api/admin/discord/role-mappings/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 404) {
        throw new Error('Role mapping not found')
      }
      throw new Error(`Failed to delete Discord role mapping: ${response.statusText}`)
    }
  },

  getSettingsHistory: async (key: string): Promise<SettingHistoryEntry[]> => {
    const response = await fetchWithLogging(
      `/api/admin/discord/settings/history/${encodeURIComponent(key)}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get settings history: ${response.statusText}`)
    }

    return response.json()
  },

  // Channel Config methods
  getChannelConfigs: async (): Promise<ChannelConfigMap[]> => {
    const response = await fetchWithLogging('/api/admin/discord/channel-config', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get channel configs: ${response.statusText}`)
    }

    return response.json()
  },

  getChannelConfig: async (channelId: string): Promise<ChannelConfigMap> => {
    const response = await fetchWithLogging(
      `/api/admin/discord/channel-config/${encodeURIComponent(channelId)}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get channel config: ${response.statusText}`)
    }

    return response.json()
  },

  updateChannelConfig: async (
    channelId: string,
    data: UpdateChannelConfigRequest
  ): Promise<ChannelConfigMap> => {
    const response = await fetchWithLogging(
      `/api/admin/discord/channel-config/${encodeURIComponent(channelId)}`,
      {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to update channel config: ${response.statusText}`)
    }

    return response.json()
  },

  deleteChannelConfig: async (channelId: string): Promise<void> => {
    const response = await fetchWithLogging(
      `/api/admin/discord/channel-config/${encodeURIComponent(channelId)}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/admin/global-defaults', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/admin/global-defaults', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to update global defaults')
    }

    return response.json()
  },

  resetGlobalDefault: async (key: string): Promise<GlobalDefaultsResponse> => {
    const response = await fetchWithLogging(
      `/api/admin/global-defaults/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to reset global default')
    }

    return response.json()
  },

  getGlobalDefaultHistory: async (key: string): Promise<SettingHistoryEntry[]> => {
    const response = await fetchWithLogging(
      `/api/admin/global-defaults/history/${encodeURIComponent(key)}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get global default history: ${response.statusText}`)
    }

    return response.json()
  },

  // User Discord methods
  getDiscordAuthUrl: async (): Promise<{ url: string; state: string }> => {
    const response = await fetchWithLogging('/api/discord/auth-url', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get Discord auth URL: ${response.statusText}`)
    }

    return response.json()
  },

  handleDiscordCallback: async (
    request: DiscordCallbackRequest
  ): Promise<{ success: boolean; profile: UserDiscordProfile }> => {
    const response = await fetchWithLogging('/api/discord/callback', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid callback request')
      }
      throw new Error(`Failed to link Discord account: ${response.statusText}`)
    }

    return response.json()
  },

  disconnectDiscord: async (): Promise<void> => {
    const response = await fetchWithLogging('/api/discord/connection', {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 400) {
        throw new Error('Discord is not connected to this account')
      }
      throw new Error(`Failed to disconnect Discord: ${response.statusText}`)
    }
  },

  syncDiscordRoles: async (): Promise<{ synced: boolean; rolesAdded: string[] }> => {
    const response = await fetchWithLogging('/api/discord/sync-roles', {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 400) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to sync Discord roles')
      }
      throw new Error(`Failed to sync Discord roles: ${response.statusText}`)
    }

    return response.json()
  },

  getDiscordStatus: async (): Promise<DiscordConnectionStatus> => {
    const response = await fetchWithLogging('/api/discord/status', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get Discord status: ${response.statusText}`)
    }

    return response.json()
  },

  // Discord auth (unauthenticated - for login/register)
  getDiscordLoginAuthUrl: async (prompt?: 'none' | 'consent'): Promise<DiscordAuthUrlResponse> => {
    const params = prompt ? `?prompt=${prompt}` : ''
    const response = await fetchWithLogging(`/api/auth/discord/auth-url${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get Discord auth URL: ${response.statusText}`)
    }

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

    if (!response.ok) {
      throw new Error(`Failed to handle Discord callback: ${response.statusText}`)
    }

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
    const response = await fetchWithLogging(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get notifications: ${response.statusText}`)
    }

    return response.json()
  },

  markNotificationAsRead: async (id: number): Promise<void> => {
    const response = await fetchWithLogging(`/api/notifications/${id}/read`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Notification not found')
      }
      throw new Error(`Failed to mark as read: ${response.statusText}`)
    }
  },

  markAllNotificationsAsRead: async (): Promise<{ count: number }> => {
    const response = await fetchWithLogging('/api/notifications/read-all', {
      method: 'PUT',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to mark all as read: ${response.statusText}`)
    }

    return response.json()
  },

  deleteNotification: async (id: number): Promise<void> => {
    const response = await fetchWithLogging(`/api/notifications/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get reservations: ${response.statusText}`)
    }

    return response.json()
  },

  getReservation: async (id: number): Promise<ReservationWithDetails> => {
    const response = await fetchWithLogging(`/api/reservations/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Reservation not found')
      }
      throw new Error(`Failed to get reservation: ${response.statusText}`)
    }

    return response.json()
  },

  createSellOrderReservation: async (
    request: CreateSellOrderReservationRequest
  ): Promise<ReservationWithDetails> => {
    const response = await fetchWithLogging('/api/reservations/sell-order', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging('/api/reservations/buy-order', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/reservations/${id}/confirm`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request || {}),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/reservations/${id}/reject`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request || {}),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/reservations/${id}/fulfill`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request || {}),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/reservations/${id}/cancel`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request || {}),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/reservations/${id}/reopen`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request || {}),
    })

    handleRefreshedToken(response)

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

  deleteReservation: async (id: number): Promise<void> => {
    const response = await fetchWithLogging(`/api/reservations/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Cannot delete reservation')
      }
      if (response.status === 403) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Permission denied')
      }
      if (response.status === 404) {
        throw new Error('Reservation not found')
      }
      throw new Error(`Failed to delete reservation: ${response.statusText}`)
    }
  },

  // Location distance
  getLocationDistance: async (
    from: string,
    to: string
  ): Promise<{ from: string; to: string; jumpCount: number | null }> => {
    const params = new URLSearchParams({ from, to })
    const response = await fetchWithLogging(`/api/locations/distance?${params}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get distance: ${response.statusText}`)
    }

    return response.json()
  },

  // Price List methods
  getPrices: async (
    exchange?: string,
    location?: string,
    commodity?: string,
    currency?: Currency
  ): Promise<PriceListResponse[]> => {
    const params = new URLSearchParams()
    if (exchange) params.append('exchange', exchange)
    if (location) params.append('location', location)
    if (commodity) params.append('commodity', commodity)
    if (currency) params.append('currency', currency)

    const url = `/api/prices${params.toString() ? '?' + params.toString() : ''}`
    const response = await fetchWithLogging(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get prices: ${response.statusText}`)
    }

    return response.json()
  },

  getPricesByExchange: async (exchange: string, version?: number): Promise<PriceListResponse[]> => {
    const params = version !== undefined ? `?version=${version}` : ''
    const response = await fetchWithLogging(`/api/prices/${exchange}${params}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get prices: ${response.statusText}`)
    }

    return response.json()
  },

  createPrice: async (request: CreatePriceRequest): Promise<PriceListResponse> => {
    const response = await fetchWithLogging('/api/prices', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/prices/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/prices/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(
      `/api/prices/effective/${exchange}/${locationId}?${params}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get effective prices: ${response.statusText}`)
    }

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
    const response = await fetchWithLogging(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get price adjustments: ${response.statusText}`)
    }

    return response.json()
  },

  getPriceAdjustment: async (id: number): Promise<PriceAdjustmentResponse> => {
    const response = await fetchWithLogging(`/api/price-adjustments/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Adjustment not found')
      }
      throw new Error(`Failed to get adjustment: ${response.statusText}`)
    }

    return response.json()
  },

  createPriceAdjustment: async (
    request: CreatePriceAdjustmentRequest
  ): Promise<PriceAdjustmentResponse> => {
    const response = await fetchWithLogging('/api/price-adjustments', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/price-adjustments/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/price-adjustments/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
  getFioExchanges: async (): Promise<FioExchangeResponse[]> => {
    const response = await fetchWithLogging('/api/fio-exchanges', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get FIO exchanges: ${response.statusText}`)
    }

    return response.json()
  },

  // FIO Price Sync methods
  getFioPriceSyncStatus: async (): Promise<ExchangeSyncStatus[]> => {
    const response = await fetchWithLogging('/api/prices/sync/fio/status', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get sync status: ${response.statusText}`)
    }

    return response.json()
  },

  syncFioPrices: async (
    exchangeCode?: string,
    priceField?: string
  ): Promise<SyncPricesResponse> => {
    const url = exchangeCode
      ? `/api/prices/sync/fio/${exchangeCode}${priceField ? '?priceField=' + priceField : ''}`
      : '/api/prices/sync/fio'

    const response = await fetchWithLogging(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: exchangeCode ? undefined : JSON.stringify({ priceField }),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to sync prices: ${response.statusText}`)
    }

    return response.json()
  },

  // CSV Import methods
  previewCsvImport: async (file: File, config: CsvImportRequest): Promise<CsvPreviewResult> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('config', JSON.stringify(config))

    const response = await fetchWithLogging('/api/import-configs/csv/preview', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`,
      },
      body: formData,
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to preview CSV: ${response.statusText}`)
    }

    return response.json()
  },

  importCsv: async (file: File, config: CsvImportRequest): Promise<CsvImportResult> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('config', JSON.stringify(config))

    const response = await fetchWithLogging('/api/import-configs/csv', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`,
      },
      body: formData,
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to import CSV: ${response.statusText}`)
    }

    return response.json()
  },

  // Google Sheets Import methods
  previewGoogleSheetsImport: async (
    request: GoogleSheetsImportRequest
  ): Promise<CsvPreviewResult> => {
    const response = await fetchWithLogging('/api/import-configs/google-sheets/preview', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to preview Google Sheets: ${response.statusText}`)
    }

    return response.json()
  },

  importGoogleSheets: async (request: GoogleSheetsImportRequest): Promise<CsvImportResult> => {
    const response = await fetchWithLogging('/api/import-configs/google-sheets', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(
        error.message || `Failed to import from Google Sheets: ${response.statusText}`
      )
    }

    return response.json()
  },

  // Price Lists methods
  getPriceLists: async (): Promise<PriceListDefinition[]> => {
    const response = await fetchWithLogging('/api/price-lists', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to get price lists: ${response.statusText}`)
    }

    return response.json()
  },

  getPriceList: async (code: string): Promise<PriceListDefinition> => {
    const response = await fetchWithLogging(`/api/price-lists/${encodeURIComponent(code)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Price list '${code}' not found`)
      }
      throw new Error(`Failed to get price list: ${response.statusText}`)
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

    handleRefreshedToken(response)

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

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/price-lists/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(
      `/api/price-lists/${encodeURIComponent(code)}/versions`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Price list '${code}' not found`)
      }
      throw new Error(`Failed to get versions: ${response.statusText}`)
    }

    return response.json()
  },

  getPriceListVersion: async (code: string, version: number): Promise<VersionDetail> => {
    const response = await fetchWithLogging(
      `/api/price-lists/${encodeURIComponent(code)}/versions/${version}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Version not found`)
      }
      throw new Error(`Failed to get version: ${response.statusText}`)
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

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to create version: ${response.statusText}`)
    }

    return response.json()
  },

  updatePriceListVersion: async (
    code: string,
    version: number,
    request: UpdateVersionRequest
  ): Promise<VersionDetail> => {
    const response = await fetchWithLogging(
      `/api/price-lists/${encodeURIComponent(code)}/versions/${version}`,
      {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to update version: ${response.statusText}`)
    }

    return response.json()
  },

  promotePriceListVersion: async (code: string, version: number): Promise<VersionDetail> => {
    const response = await fetchWithLogging(
      `/api/price-lists/${encodeURIComponent(code)}/versions/${version}/promote`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(
      `/api/price-lists/${encodeURIComponent(code)}/versions/${version}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to delete version: ${response.statusText}`)
    }
  },

  diffPriceListVersions: async (
    code: string,
    version: number,
    otherVersion: number
  ): Promise<VersionDiff> => {
    const response = await fetchWithLogging(
      `/api/price-lists/${encodeURIComponent(code)}/versions/${version}/diff/${otherVersion}`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
      }
    )

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to diff versions: ${response.statusText}`)
    }

    return response.json()
  },

  // Import Configs methods
  getImportConfigs: async (): Promise<ImportConfigResponse[]> => {
    const response = await fetchWithLogging('/api/import-configs', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      throw new Error(`Failed to get import configs: ${response.statusText}`)
    }

    return response.json()
  },

  getImportConfig: async (id: number): Promise<ImportConfigResponse> => {
    const response = await fetchWithLogging(`/api/import-configs/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Import config not found`)
      }
      throw new Error(`Failed to get import config: ${response.statusText}`)
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

    handleRefreshedToken(response)

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

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/import-configs/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/import-configs/${id}/sync${params}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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

    const response = await fetchWithLogging(`/api/import-configs/${id}/sync/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`,
      },
      body: formData,
    })

    handleRefreshedToken(response)

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

  previewImportConfig: async (id: number): Promise<CsvPreviewResult | PivotImportResult> => {
    const response = await fetchWithLogging(`/api/import-configs/${id}/preview`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Permission denied')
      }
      if (response.status === 404) {
        throw new Error(`Import config not found`)
      }
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || `Failed to preview import config: ${response.statusText}`)
    }

    return response.json()
  },

  // Admin Price Settings methods
  getPriceSettings: async (): Promise<PriceSettingsResponse> => {
    const response = await fetchWithLogging('/api/admin/price-settings', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to get price settings: ${response.statusText}`)
    }

    return response.json()
  },

  updateFioSettings: async (request: UpdateFioSettingsRequest): Promise<PriceSettingsResponse> => {
    const response = await fetchWithLogging('/api/admin/price-settings/fio', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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
    const response = await fetchWithLogging('/api/admin/price-settings/google', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      throw new Error(`Failed to update Google settings: ${response.statusText}`)
    }

    return response.json()
  },

  updateKawaSheetSettings: async (
    request: UpdateKawaSheetRequest
  ): Promise<PriceSettingsResponse> => {
    const response = await fetchWithLogging('/api/admin/price-settings/kawa-sheet', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid KAWA sheet settings')
      }
      throw new Error(`Failed to update KAWA sheet settings: ${response.statusText}`)
    }

    return response.json()
  },

  previewKawaSheet: async (): Promise<KawaSheetPreviewResponse> => {
    const response = await fetchWithLogging('/api/admin/price-settings/kawa-sheet/preview', {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Failed to preview KAWA sheet')
      }
      throw new Error(`Failed to preview KAWA sheet: ${response.statusText}`)
    }

    return response.json()
  },

  syncKawaSheet: async (request: KawaSheetSyncRequest): Promise<CsvImportResult> => {
    const response = await fetchWithLogging('/api/admin/price-settings/kawa-sheet/sync', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Administrator access required')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Failed to sync KAWA sheet')
      }
      throw new Error(`Failed to sync KAWA sheet: ${response.statusText}`)
    }

    return response.json()
  },

  // ==================== USER SETTINGS ====================

  getUserSettings: async (): Promise<UserSettingsResponse> => {
    const response = await fetchWithLogging('/api/user-settings', {
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error('Failed to get user settings')
    }

    return response.json()
  },

  updateUserSettings: async (settings: Record<string, unknown>): Promise<UserSettingsResponse> => {
    const response = await fetchWithLogging('/api/user-settings', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ settings }),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid settings')
      }
      throw new Error('Failed to update user settings')
    }

    return response.json()
  },

  resetUserSetting: async (key: string): Promise<UserSettingsResponse> => {
    const response = await fetchWithLogging(`/api/user-settings/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid setting key')
      }
      throw new Error('Failed to reset user setting')
    }

    return response.json()
  },

  resetAllUserSettings: async (): Promise<UserSettingsResponse> => {
    const response = await fetchWithLogging('/api/user-settings', {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
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

    const response = await fetchWithLogging(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get invoices: ${response.statusText}`)
    }

    return response.json()
  },

  getInvoice: async (id: number): Promise<Invoice> => {
    const response = await fetchWithLogging(`/api/invoices/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/invoices/for-partner/${counterpartyUserId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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

  createInvoice: async (request: CreateInvoiceRequest): Promise<Invoice> => {
    const response = await fetchWithLogging('/api/invoices', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Invalid request')
      }
      if (response.status === 404) {
        throw new Error('Counterparty user not found')
      }
      throw new Error(`Failed to create invoice: ${response.statusText}`)
    }

    return response.json()
  },

  updateInvoice: async (
    id: number,
    request: { name?: string; notes?: string }
  ): Promise<Invoice> => {
    const response = await fetchWithLogging(`/api/invoices/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Only draft invoices can be updated')
      }
      if (response.status === 403) {
        throw new Error('You do not have access to this invoice')
      }
      if (response.status === 404) {
        throw new Error('Invoice not found')
      }
      throw new Error(`Failed to update invoice: ${response.statusText}`)
    }

    return response.json()
  },

  deleteInvoice: async (id: number): Promise<void> => {
    const response = await fetchWithLogging(`/api/invoices/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/invoices/${invoiceId}/items`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/invoices/${invoiceId}/items/${itemId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/invoices/${invoiceId}/items/${itemId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/invoices/${id}/submit`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/invoices/${id}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/invoices/${id}/fulfill`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
  getShoppingLists: async (): Promise<ShoppingListSummary[]> => {
    const response = await fetchWithLogging('/api/lists', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('jwt')
        localStorage.removeItem('user')
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      throw new Error(`Failed to get shopping lists: ${response.statusText}`)
    }

    return response.json()
  },

  getShoppingList: async (id: number): Promise<SavedShoppingList> => {
    const response = await fetchWithLogging(`/api/lists/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging('/api/lists', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/lists/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/lists/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
  getSavedFilters: async (): Promise<SavedMarketFilter[]> => {
    const response = await fetchWithLogging('/api/saved-filters', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get saved filters: ${response.statusText}`)
    }

    return response.json()
  },

  getPinnedFilters: async (): Promise<SavedMarketFilter[]> => {
    const response = await fetchWithLogging('/api/saved-filters/pinned', {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to get pinned filters: ${response.statusText}`)
    }

    return response.json()
  },

  browsePublicFilters: async (search?: string, page?: number): Promise<SavedMarketFilter[]> => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (page) params.set('page', String(page))
    const query = params.toString() ? `?${params.toString()}` : ''

    const response = await fetchWithLogging(`/api/saved-filters/browse${query}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      throw new Error(`Failed to browse public filters: ${response.statusText}`)
    }

    return response.json()
  },

  getSavedFilter: async (id: number): Promise<SavedMarketFilter> => {
    const response = await fetchWithLogging(`/api/saved-filters/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Saved filter not found')
      }
      throw new Error(`Failed to get saved filter: ${response.statusText}`)
    }

    return response.json()
  },

  createSavedFilter: async (request: CreateSavedFilterRequest): Promise<SavedMarketFilter> => {
    const response = await fetchWithLogging('/api/saved-filters', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/saved-filters/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/saved-filters/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging(`/api/saved-filters/${id}/pin`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    })

    handleRefreshedToken(response)

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
    const response = await fetchWithLogging('/api/corp-overview-views', {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to list views: ${response.statusText}`)
    return response.json()
  },

  getPinnedCorpOverviewViews: async (): Promise<CorpOverviewView[]> => {
    const response = await fetchWithLogging('/api/corp-overview-views/pinned', {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to get pinned views: ${response.statusText}`)
    return response.json()
  },

  browseCorpOverviewViews: async (search?: string, page?: number): Promise<CorpOverviewView[]> => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (page) params.set('page', String(page))
    const query = params.toString() ? `?${params.toString()}` : ''
    const response = await fetchWithLogging(`/api/corp-overview-views/browse${query}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to browse views: ${response.statusText}`)
    return response.json()
  },

  getCorpOverviewView: async (id: number): Promise<CorpOverviewView> => {
    const response = await fetchWithLogging(`/api/corp-overview-views/${id}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) {
      if (response.status === 404) throw new Error('View not found')
      throw new Error(`Failed to get view: ${response.statusText}`)
    }
    return response.json()
  },

  createCorpOverviewView: async (
    request: CreateCorpOverviewViewRequest
  ): Promise<CorpOverviewView> => {
    const response = await fetchWithLogging('/api/corp-overview-views', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })
    handleRefreshedToken(response)
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
    const response = await fetchWithLogging(`/api/corp-overview-views/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(request),
    })
    handleRefreshedToken(response)
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
    const response = await fetchWithLogging(`/api/corp-overview-views/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('You do not have permission to delete this view')
      }
      if (response.status === 404) throw new Error('View not found')
      throw new Error(`Failed to delete view: ${response.statusText}`)
    }
  },

  togglePinCorpOverviewView: async (id: number): Promise<CorpOverviewView> => {
    const response = await fetchWithLogging(`/api/corp-overview-views/${id}/pin`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
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
    const response = await fetchWithLogging(`/api/corp-overview-views/${id}/owners`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    })
    handleRefreshedToken(response)
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
    const response = await fetchWithLogging(`/api/corp-overview-views/${id}/owners/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
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
    const response = await fetchWithLogging(`/api/corp-overview-views/${id}/visit`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok && response.status !== 404) {
      // Don't throw on 404 — view became inaccessible between fetch and visit;
      // not worth interrupting the user. Other errors propagate so callers can
      // log them.
      throw new Error(`Failed to record visit: ${response.statusText}`)
    }
  },

  getVisitedCorpOverviewViews: async (page?: number): Promise<CorpOverviewView[]> => {
    const params = new URLSearchParams()
    if (page) params.set('page', String(page))
    const query = params.toString() ? `?${params.toString()}` : ''
    const response = await fetchWithLogging(`/api/corp-overview-views/visited${query}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to list visited views: ${response.statusText}`)
    return response.json()
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

    const response = await fetchWithLogging(`/api/corp-snapshots?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
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
    const response = await fetchWithLogging('/api/logistics/graph', {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to get logistics graph: ${response.statusText}`)
    return response.json()
  },

  listLogisticsFlows: async (): Promise<LogisticsFlow[]> => {
    const response = await fetchWithLogging('/api/logistics/flows', {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to list logistics flows: ${response.statusText}`)
    return response.json()
  },

  createLogisticsFlow: async (body: CreateLogisticsFlowRequest): Promise<LogisticsFlow> => {
    const response = await fetchWithLogging('/api/logistics/flows', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
    handleRefreshedToken(response)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to create logistics flow')
    }
    return response.json()
  },

  bulkCreateLogisticsFlows: async (
    body: BulkCreateLogisticsFlowsRequest
  ): Promise<BulkCreateLogisticsFlowsResponse> => {
    const response = await fetchWithLogging('/api/logistics/flows/bulk', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
    handleRefreshedToken(response)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to bulk create logistics flows')
    }
    return response.json()
  },

  bulkMultiCreateLogisticsFlows: async (
    body: BulkMultiCreateLogisticsFlowsRequest
  ): Promise<BulkMultiCreateLogisticsFlowsResponse> => {
    const response = await fetchWithLogging('/api/logistics/flows/bulk-multi', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
    handleRefreshedToken(response)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to bulk-multi create logistics flows')
    }
    return response.json()
  },

  updateLogisticsFlow: async (
    id: number,
    body: UpdateLogisticsFlowRequest
  ): Promise<LogisticsFlow> => {
    const response = await fetchWithLogging(`/api/logistics/flows/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
    handleRefreshedToken(response)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to update logistics flow')
    }
    return response.json()
  },

  deleteLogisticsFlow: async (id: number): Promise<{ success: boolean }> => {
    const response = await fetchWithLogging(`/api/logistics/flows/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to delete logistics flow: ${response.statusText}`)
    return response.json()
  },

  listLogisticsClaims: async (): Promise<LocationDemandClaim[]> => {
    const response = await fetchWithLogging('/api/logistics/claims', {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to list logistics claims: ${response.statusText}`)
    return response.json()
  },

  createLogisticsClaim: async (
    body: CreateLocationDemandClaimRequest
  ): Promise<LocationDemandClaim> => {
    const response = await fetchWithLogging('/api/logistics/claims', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
    handleRefreshedToken(response)
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
    const response = await fetchWithLogging(`/api/logistics/claims/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
    handleRefreshedToken(response)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || 'Failed to update claim')
    }
    return response.json()
  },

  deleteLogisticsClaim: async (id: number): Promise<{ success: boolean }> => {
    const response = await fetchWithLogging(`/api/logistics/claims/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to delete claim: ${response.statusText}`)
    return response.json()
  },

  listShips: async (): Promise<UserShip[]> => {
    const response = await fetchWithLogging('/api/ships', {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to list ships: ${response.statusText}`)
    return response.json()
  },

  getSupplyPlanets: async (): Promise<SupplyPlanetSummary[]> => {
    const response = await fetchWithLogging('/api/supply-planning/planets', {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
    if (!response.ok) throw new Error(`Failed to get supply planets: ${response.statusText}`)
    return response.json()
  },

  // ==================== BURN & REPAIR ====================

  getBurnRepairMyBases: async (): Promise<BurnRepairMyBasesResponse> => {
    const response = await fetchWithLogging('/api/burn-repair/my-bases', {
      method: 'GET',
      headers: getAuthHeaders(),
    })
    handleRefreshedToken(response)
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
    handleRefreshedToken(response)
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
    handleRefreshedToken(response)
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
    handleRefreshedToken(response)
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
    handleRefreshedToken(response)
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
    handleRefreshedToken(response)
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

// Types for KAWA sheet preview and sync
interface KawaSheetPreviewResponse {
  headers: string[]
  rows: string[][]
}

interface KawaSheetSyncRequest {
  tickerColumn: string | number
  priceColumn: string | number
  locationColumn?: string | number
  locationDefault?: string
  currencyColumn?: string | number
  currencyDefault?: 'ICA' | 'CIS' | 'AIC' | 'NCC'
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
    getSettingsHistory: (key: string) => realApi.getSettingsHistory(key),
    getChannelConfigs: () => realApi.getChannelConfigs(),
    getChannelConfig: (channelId: string) => realApi.getChannelConfig(channelId),
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
    get: (id: number) => realApi.getReservation(id),
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
    delete: (id: number) => realApi.deleteReservation(id),
  },
  invoices: {
    // Status filter uses stored DB status, not calculated display status
    list: (status?: 'draft' | 'submitted' | 'completed' | 'cancelled') =>
      realApi.getInvoices(status),
    get: (id: number) => realApi.getInvoice(id),
    getOrCreateForPartner: (counterpartyUserId: number) =>
      realApi.getOrCreateInvoiceForPartner(counterpartyUserId),
    create: (request: CreateInvoiceRequest) => realApi.createInvoice(request),
    update: (id: number, request: { name?: string; notes?: string }) =>
      realApi.updateInvoice(id, request),
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
  locations: {
    getDistance: (from: string, to: string) => realApi.getLocationDistance(from, to),
  },
  prices: {
    list: (exchange?: string, location?: string, commodity?: string, currency?: Currency) =>
      realApi.getPrices(exchange, location, commodity, currency),
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
    get: (id: number) => realApi.getPriceAdjustment(id),
    create: (request: CreatePriceAdjustmentRequest) => realApi.createPriceAdjustment(request),
    update: (id: number, request: UpdatePriceAdjustmentRequest) =>
      realApi.updatePriceAdjustment(id, request),
    delete: (id: number) => realApi.deletePriceAdjustment(id),
  },
  fioExchanges: {
    list: () => realApi.getFioExchanges(),
  },
  fioPriceSync: {
    getStatus: () => realApi.getFioPriceSyncStatus(),
    syncAll: (priceField?: string) => realApi.syncFioPrices(undefined, priceField),
    syncExchange: (exchangeCode: string, priceField?: string) =>
      realApi.syncFioPrices(exchangeCode, priceField),
  },
  priceImport: {
    previewCsv: (file: File, config: CsvImportRequest) => realApi.previewCsvImport(file, config),
    importCsv: (file: File, config: CsvImportRequest) => realApi.importCsv(file, config),
    previewGoogleSheets: (request: GoogleSheetsImportRequest) =>
      realApi.previewGoogleSheetsImport(request),
    importGoogleSheets: (request: GoogleSheetsImportRequest) => realApi.importGoogleSheets(request),
  },
  adminPriceSettings: {
    get: () => realApi.getPriceSettings(),
    updateFio: (request: UpdateFioSettingsRequest) => realApi.updateFioSettings(request),
    updateGoogle: (request: UpdateGoogleSettingsRequest) => realApi.updateGoogleSettings(request),
    updateKawaSheet: (request: UpdateKawaSheetRequest) => realApi.updateKawaSheetSettings(request),
    previewKawaSheet: () => realApi.previewKawaSheet(),
    syncKawaSheet: (request: KawaSheetSyncRequest) => realApi.syncKawaSheet(request),
  },
  adminGlobalDefaults: {
    get: () => realApi.getGlobalDefaults(),
    update: (request: UpdateGlobalDefaultsRequest) => realApi.updateGlobalDefaults(request),
    reset: (key: string) => realApi.resetGlobalDefault(key),
    getHistory: (key: string) => realApi.getGlobalDefaultHistory(key),
  },
  priceLists: {
    list: () => realApi.getPriceLists(),
    get: (code: string) => realApi.getPriceList(code),
    create: (request: CreatePriceListRequest) => realApi.createPriceList(request),
    update: (code: string, request: UpdatePriceListRequest) =>
      realApi.updatePriceList(code, request),
    delete: (code: string) => realApi.deletePriceList(code),
    versions: {
      list: (code: string) => realApi.getPriceListVersions(code),
      get: (code: string, version: number) => realApi.getPriceListVersion(code, version),
      create: (code: string, request: CreateVersionRequest) =>
        realApi.createPriceListVersion(code, request),
      update: (code: string, version: number, request: UpdateVersionRequest) =>
        realApi.updatePriceListVersion(code, version, request),
      promote: (code: string, version: number) => realApi.promotePriceListVersion(code, version),
      delete: (code: string, version: number) => realApi.deletePriceListVersion(code, version),
      diff: (code: string, version: number, otherVersion: number) =>
        realApi.diffPriceListVersions(code, version, otherVersion),
    },
  },
  importConfigs: {
    list: () => realApi.getImportConfigs(),
    get: (id: number) => realApi.getImportConfig(id),
    create: (request: CreateImportConfigRequest) => realApi.createImportConfig(request),
    update: (id: number, request: UpdateImportConfigRequest) =>
      realApi.updateImportConfig(id, request),
    delete: (id: number) => realApi.deleteImportConfig(id),
    sync: (id: number, version?: number) => realApi.syncImportConfig(id, version),
    syncUpload: (id: number, file: File, version?: number) =>
      realApi.syncImportConfigUpload(id, file, version),
    preview: (id: number) => realApi.previewImportConfig(id),
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
    getPinned: () => realApi.getPinnedCorpOverviewViews(),
    browse: (search?: string, page?: number) => realApi.browseCorpOverviewViews(search, page),
    visited: (page?: number) => realApi.getVisitedCorpOverviewViews(page),
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
    bulkCreateFlows: (body: BulkCreateLogisticsFlowsRequest) =>
      realApi.bulkCreateLogisticsFlows(body),
    bulkMultiCreateFlows: (body: BulkMultiCreateLogisticsFlowsRequest) =>
      realApi.bulkMultiCreateLogisticsFlows(body),
    updateFlow: (id: number, body: UpdateLogisticsFlowRequest) =>
      realApi.updateLogisticsFlow(id, body),
    deleteFlow: (id: number) => realApi.deleteLogisticsFlow(id),
    listClaims: () => realApi.listLogisticsClaims(),
    createClaim: (body: CreateLocationDemandClaimRequest) => realApi.createLogisticsClaim(body),
    updateClaim: (id: number, body: UpdateLocationDemandClaimRequest) =>
      realApi.updateLogisticsClaim(id, body),
    deleteClaim: (id: number) => realApi.deleteLogisticsClaim(id),
    listShips: () => realApi.listShips(),
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
  ExchangeSyncStatus,
  SyncPricesResponse,
  // Import types
  CsvFieldMapping,
  CsvRowError,
  ParsedPriceRow,
  CsvImportResult,
  CsvPreviewResult,
  CsvImportRequest,
  GoogleSheetsImportRequest,
  // Admin Price Settings types
  FioPriceField,
  PriceSettingsResponse,
  UpdateFioSettingsRequest,
  UpdateGoogleSettingsRequest,
  UpdateKawaSheetRequest,
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
  KawaSheetPreviewResponse,
  KawaSheetSyncRequest,
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
