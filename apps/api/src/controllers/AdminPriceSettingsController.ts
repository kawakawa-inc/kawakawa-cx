import { Body, Controller, Get, Put, Request, Route, Security, Tags } from 'tsoa'
import type { JwtPayload } from '../utils/jwt.js'
import { settingsService } from '../services/settingsService.js'
// FioPriceField is re-declared locally in PriceSyncFioController.ts because
// TSOA cannot resolve type declarations across package boundaries. Importing
// the re-declaration here keeps the OpenAPI schema using a single model.
import type { FioPriceField } from './PriceSyncFioController.js'

// Setting keys for price-related configuration
const SETTING_KEYS = {
  FIO_BASE_URL: 'fio.base_url',
  FIO_PRICE_FIELD: 'fio.price_field',
  GOOGLE_SHEETS_API_KEY: 'google.sheets_api_key',
} as const

// Default values
const DEFAULTS = {
  [SETTING_KEYS.FIO_BASE_URL]: 'https://rest.fnar.net',
  [SETTING_KEYS.FIO_PRICE_FIELD]: 'PriceAverage',
} as const

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

@Route('admin/price-settings')
@Tags('Admin')
export class AdminPriceSettingsController extends Controller {
  /**
   * Get current pricing settings
   */
  @Get()
  @Security('jwt', ['admin.manage_users'])
  public async getSettings(): Promise<PriceSettingsResponse> {
    const allSettings = await settingsService.getAll()

    const googleApiKey = allSettings[SETTING_KEYS.GOOGLE_SHEETS_API_KEY]

    return {
      fioBaseUrl: allSettings[SETTING_KEYS.FIO_BASE_URL] || DEFAULTS[SETTING_KEYS.FIO_BASE_URL],
      fioPriceField:
        (allSettings[SETTING_KEYS.FIO_PRICE_FIELD] as FioPriceField) ||
        DEFAULTS[SETTING_KEYS.FIO_PRICE_FIELD],
      hasGoogleSheetsApiKey: !!googleApiKey && googleApiKey.length > 0,
    }
  }

  /**
   * Update FIO API settings
   */
  @Put('fio')
  @Security('jwt', ['admin.manage_users'])
  public async updateFioSettings(
    @Request() request: { user: JwtPayload },
    @Body() body: UpdateFioSettingsRequest
  ): Promise<PriceSettingsResponse> {
    const userId = request.user.userId
    const updates: Record<string, string> = {}

    if (body.baseUrl !== undefined) {
      // Validate URL format
      try {
        new URL(body.baseUrl)
      } catch {
        this.setStatus(400)
        throw new Error('Invalid URL format for FIO base URL')
      }
      updates[SETTING_KEYS.FIO_BASE_URL] = body.baseUrl
    }

    if (body.priceField !== undefined) {
      const validFields: FioPriceField[] = ['PriceAverage', 'MMBuy', 'MMSell', 'Ask', 'Bid']
      if (!validFields.includes(body.priceField)) {
        this.setStatus(400)
        throw new Error('Invalid price field')
      }
      updates[SETTING_KEYS.FIO_PRICE_FIELD] = body.priceField
    }

    if (Object.keys(updates).length > 0) {
      await settingsService.setMany(updates, userId)
    }

    return this.getSettings()
  }

  /**
   * Update Google Sheets API settings
   */
  @Put('google')
  @Security('jwt', ['admin.manage_users'])
  public async updateGoogleSettings(
    @Request() request: { user: JwtPayload },
    @Body() body: UpdateGoogleSettingsRequest
  ): Promise<PriceSettingsResponse> {
    const userId = request.user.userId

    if (body.apiKey !== undefined) {
      await settingsService.set(SETTING_KEYS.GOOGLE_SHEETS_API_KEY, body.apiKey, userId)
    }

    return this.getSettings()
  }
}

// Export setting keys for use in other services
export { SETTING_KEYS as PRICE_SETTING_KEYS, DEFAULTS as PRICE_SETTING_DEFAULTS }
