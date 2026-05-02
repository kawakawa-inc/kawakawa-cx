// Database schema using Drizzle ORM
// Based on Kawakawa CX types and mock data

import {
  pgTable,
  serial,
  text,
  integer,
  decimal,
  timestamp,
  date,
  varchar,
  pgEnum,
  boolean,
  uniqueIndex,
  index,
  jsonb,
  foreignKey,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// Enums
export const currencyEnum = pgEnum('currency', ['ICA', 'CIS', 'AIC', 'NCC'])
export const locationTypeEnum = pgEnum('location_type', ['Station', 'Planet'])
export const locationDisplayModeEnum = pgEnum('location_display_mode', [
  'names-only',
  'natural-ids-only',
  'both',
])
export const commodityDisplayModeEnum = pgEnum('commodity_display_mode', [
  'ticker-only',
  'name-only',
  'both',
])
export const sellOrderLimitModeEnum = pgEnum('sell_order_limit_mode', [
  'none',
  'max_sell',
  'reserve',
])
export const orderTypeEnum = pgEnum('order_type', ['internal', 'partner']) // Shared enum for sell/buy orders
export const syncJobTypeEnum = pgEnum('sync_job_type', [
  'user-inventory',
  'user-planets-list',
  'planet-detail',
  'cache-recompute',
  'commodities',
  'locations',
  'stations',
])
export const syncJobStatusEnum = pgEnum('sync_job_status', ['pending', 'running', 'done', 'failed'])
export const syncJobSourceEnum = pgEnum('sync_job_source', ['user', 'system'])
export const notificationTypeEnum = pgEnum('notification_type', [
  'reservation_placed',
  'reservation_confirmed',
  'reservation_rejected',
  'reservation_fulfilled',
  'reservation_cancelled',
  'reservation_expired',
  'invoice_submitted',
  'invoice_cancelled',
  'invoice_fulfilled',
  'user_needs_approval',
  'user_auto_approved',
  'user_approved',
  'user_rejected',
  'sync_queued',
  'sync_completed',
  'sync_failed',
])
export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'confirmed',
  'rejected',
  'fulfilled',
  'expired',
  'cancelled',
])

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft', // Open invoice being accumulated
  'pending', // Submitted, awaiting counterparty confirmation
  'confirmed', // Counterparty confirmed, reservations active
  'fulfilled', // All reservations fulfilled
  'partially_fulfilled', // Some reservations fulfilled, some in other states
  'cancelled', // Invoice cancelled
])

// ==================== PRICING SYSTEM ENUMS ====================
export const priceSourceEnum = pgEnum('price_source', [
  'manual',
  'csv_import',
  'google_sheets',
  'fio_exchange',
])

export const adjustmentTypeEnum = pgEnum('adjustment_type', ['percentage', 'fixed'])

export const priceListTypeEnum = pgEnum('price_list_type', ['fio', 'custom'])

export const importSourceTypeEnum = pgEnum('import_source_type', ['csv', 'google_sheets'])

export const importFormatEnum = pgEnum('import_format', ['flat', 'pivot', 'kawa'])

export const filterPrivacyEnum = pgEnum('filter_privacy', ['private', 'unlisted', 'public'])

export const buyOrderSourceModeEnum = pgEnum('buy_order_source_mode', ['manual', 'demand'])
export const reserveSourceEnum = pgEnum('reserve_source', ['manual', 'demand'])
export const demandSourceEnum = pgEnum('demand_source', ['burn', 'repair'])
export const logisticsFlowKindEnum = pgEnum('logistics_flow_kind', ['demand', 'surplus', 'fixed'])
export const logisticsClaimCategoryEnum = pgEnum('logistics_claim_category', [
  'government',
  'contract',
  'reserve',
  'other',
])
export const logisticsClaimSourceEnum = pgEnum('logistics_claim_source', ['manual', 'auto'])

export const demandRateEnum = pgEnum('demand_rate', ['total', 'daily'])

// ==================== SETTINGS (Generic key-value with history) ====================
export const settings = pgTable(
  'settings',
  {
    id: serial('id').primaryKey(),
    key: varchar('key', { length: 100 }).notNull(), // Setting key (e.g., 'discord.clientId')
    value: text('value').notNull(), // Setting value (JSON-encoded for complex values)
    changedByUserId: integer('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }), // null = system default
    effectiveAt: timestamp('effective_at').defaultNow().notNull(), // When this setting became effective
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    keyEffectiveIdx: uniqueIndex('settings_key_effective_idx').on(table.key, table.effectiveAt),
  })
)

// ==================== DISCORD ROLE MAPPINGS ====================
export const discordRoleMappings = pgTable(
  'discord_role_mappings',
  {
    id: serial('id').primaryKey(),
    discordRoleId: varchar('discord_role_id', { length: 100 }).notNull(), // Discord role snowflake ID
    discordRoleName: varchar('discord_role_name', { length: 100 }).notNull(), // Cached Discord role name
    appRoleId: varchar('app_role_id', { length: 50 })
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(0), // Higher priority = checked first for auto-approval
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueDiscordRole: uniqueIndex('discord_role_mappings_discord_role_idx').on(
      table.discordRoleId
    ),
  })
)

// ==================== DISCORD CHANNEL CONFIG (Key-value settings per channel) ====================
// Stores channel-specific settings using key-value pattern for flexibility
// Keys: priceList, visibility, currency, priceListEnforced, visibilityEnforced,
//       currencyEnforced, announceInternal, announcePartner
export const channelConfig = pgTable(
  'channel_config',
  {
    id: serial('id').primaryKey(),
    channelId: varchar('channel_id', { length: 30 }).notNull(), // Discord channel snowflake ID
    key: varchar('key', { length: 50 }).notNull(), // Setting key
    value: text('value').notNull(), // Setting value (stored as text)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueChannelKey: uniqueIndex('channel_config_channel_key_idx').on(table.channelId, table.key),
    channelIdx: index('channel_config_channel_idx').on(table.channelId),
  })
)

// ==================== USER DISCORD PROFILES ====================
export const userDiscordProfiles = pgTable(
  'user_discord_profiles',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    discordId: varchar('discord_id', { length: 100 }).notNull().unique(), // Discord user snowflake ID
    discordUsername: varchar('discord_username', { length: 100 }).notNull(), // Discord username (cached)
    discordAvatar: varchar('discord_avatar', { length: 255 }), // Avatar hash for display
    accessToken: text('access_token'), // OAuth access token (encrypted)
    refreshToken: text('refresh_token'), // OAuth refresh token (encrypted)
    tokenExpiresAt: timestamp('token_expires_at'), // When access token expires
    connectedAt: timestamp('connected_at').defaultNow().notNull(), // When user connected Discord
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueDiscordId: uniqueIndex('user_discord_profiles_discord_id_idx').on(table.discordId),
  })
)

// ==================== ROLES ====================
export const roles = pgTable('roles', {
  id: varchar('id', { length: 50 }).primaryKey(), // 'applicant', 'member', 'lead', etc.
  name: varchar('name', { length: 100 }).notNull(), // 'Applicant', 'Member', 'Lead', etc.
  color: varchar('color', { length: 20 }).notNull().default('grey'), // UI chip color (vuetify color names)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== PERMISSIONS ====================
export const permissions = pgTable('permissions', {
  id: varchar('id', { length: 100 }).primaryKey(), // 'orders.view_internal', 'orders.post_partner', etc.
  name: varchar('name', { length: 100 }).notNull(), // Display name
  description: text('description'), // Explanation of what this permission does
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== ROLE PERMISSIONS (Many-to-Many) ====================
export const rolePermissions = pgTable('role_permissions', {
  id: serial('id').primaryKey(),
  roleId: varchar('role_id', { length: 50 })
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: varchar('permission_id', { length: 100 })
    .notNull()
    .references(() => permissions.id, { onDelete: 'cascade' }),
  allowed: boolean('allowed').notNull().default(true), // true = granted, false = explicitly denied
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== USERS ====================
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 100 }).notNull().unique(), // Login username
  email: varchar('email', { length: 255 }), // Optional email for password resets
  displayName: varchar('display_name', { length: 100 }).notNull(), // Display name
  passwordHash: text('password_hash').notNull(), // Bcrypt hashed password with salt
  isActive: boolean('is_active').notNull().default(true), // Account active status
  tokenVersion: integer('token_version').notNull().default(0), // Bumped on password change to invalidate JWTs
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== USER SETTINGS (Key-value settings per user) ====================
// Stores user preference overrides; defaults come from SETTING_DEFINITIONS in code
// All settings including FIO credentials (fio.username, fio.apiKey) are stored here
export const userSettings = pgTable(
  'user_settings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    settingKey: varchar('setting_key', { length: 100 }).notNull(), // e.g., 'display.preferredCurrency', 'fio.apiKey'
    value: text('value').notNull(), // JSON-encoded value
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueUserSetting: uniqueIndex('user_settings_user_key_idx').on(table.userId, table.settingKey),
  })
)

// ==================== PASSWORD RESET TOKENS ====================
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(), // Unique token
  expiresAt: timestamp('expires_at').notNull(), // Expiration timestamp
  used: boolean('used').notNull().default(false), // Whether token has been used
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== DISCORD LINK TOKENS ====================
// Used for web-based Discord account linking (user clicks link from bot, logs in on web)
export const discordLinkTokens = pgTable('discord_link_tokens', {
  id: serial('id').primaryKey(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  discordId: varchar('discord_id', { length: 50 }).notNull(), // Discord user ID
  discordUsername: varchar('discord_username', { length: 100 }).notNull(),
  discordAvatar: varchar('discord_avatar', { length: 255 }), // Avatar hash (nullable)
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== USER ROLES (Many-to-Many) ====================
export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: varchar('role_id', { length: 50 })
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== FIO COMMODITIES (Materials from FIO API) ====================
export const fioCommodities = pgTable('fio_commodities', {
  ticker: varchar('ticker', { length: 10 }).primaryKey(), // 'H2O', 'RAT', 'FE', etc.
  materialId: varchar('material_id', { length: 40 }), // FIO UUID for mapping
  name: varchar('name', { length: 100 }).notNull(), // 'water', 'rations', 'iron', etc.
  categoryName: varchar('category_name', { length: 50 }), // 'consumables (basic)', 'ores', 'metals', etc.
  categoryId: varchar('category_id', { length: 40 }), // FIO category UUID
  weight: decimal('weight', { precision: 10, scale: 6 }), // Weight per unit
  volume: decimal('volume', { precision: 10, scale: 6 }), // Volume per unit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== FIO LOCATIONS (Planets/Stations from FIO API) ====================
export const fioLocations = pgTable('fio_locations', {
  naturalId: varchar('natural_id', { length: 20 }).primaryKey(), // 'BEN', 'UV-351a', 'KW-689c', etc.
  name: varchar('name', { length: 100 }).notNull(), // 'Benten Station', 'Katoa', etc.
  type: locationTypeEnum('type').notNull(), // 'Station' or 'Planet'
  systemId: varchar('system_id', { length: 40 }), // FIO system UUID
  systemNaturalId: varchar('system_natural_id', { length: 20 }).notNull(), // 'UV-351', 'KW-689', etc.
  systemName: varchar('system_name', { length: 100 }).notNull(), // 'Benten', 'Shadow Garden', 'Hubur', etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== FIO USER STORAGE (Storage locations from FIO API) ====================
export const fioUserStorage = pgTable(
  'fio_user_storage',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageId: varchar('storage_id', { length: 40 }).notNull(), // Generated as grouphub-{locationId}-{type}
    locationId: varchar('location_id', { length: 20 }).references(() => fioLocations.naturalId),
    type: varchar('type', { length: 30 }).notNull(), // 'STORE', 'WAREHOUSE_STORE', 'SHIP_STORE', etc.
    fioUploadedAt: timestamp('fio_uploaded_at'), // When FIO last got data from game (from LastUpdated)
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(), // When we last synced from FIO
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueUserStorage: uniqueIndex('fio_user_storage_user_storage_idx').on(
      table.userId,
      table.storageId
    ),
  })
)

// ==================== FIO INVENTORY (Items in storage from FIO API) ====================
export const fioInventory = pgTable(
  'fio_inventory',
  {
    id: serial('id').primaryKey(),
    userStorageId: integer('user_storage_id')
      .notNull()
      .references(() => fioUserStorage.id, { onDelete: 'cascade' }),
    commodityTicker: varchar('commodity_ticker', { length: 10 })
      .notNull()
      .references(() => fioCommodities.ticker),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    storageTickerIdx: index('fio_inventory_storage_ticker_idx').on(
      table.userStorageId,
      table.commodityTicker
    ),
  })
)

// ==================== FIO USER PLANETS (Planet base data for supply planning) ====================
export const fioUserPlanets = pgTable(
  'fio_user_planets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planetNaturalId: varchar('planet_natural_id', { length: 20 }).notNull(),
    planetName: varchar('planet_name', { length: 100 }).notNull(),
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    uniqueUserPlanet: uniqueIndex('fio_user_planets_user_planet_idx').on(
      table.userId,
      table.planetNaturalId
    ),
  })
)

// ==================== FIO PLANET BUILDINGS (Building data from /sites endpoint) ====================
export const fioPlanetBuildings = pgTable(
  'fio_planet_buildings',
  {
    id: serial('id').primaryKey(),
    userPlanetId: integer('user_planet_id')
      .notNull()
      .references(() => fioUserPlanets.id, { onDelete: 'cascade' }),
    buildingId: varchar('building_id', { length: 40 }).notNull(),
    buildingTicker: varchar('building_ticker', { length: 10 }).notNull(),
    buildingCreated: timestamp('building_created').notNull(), // from epoch ms
    buildingLastRepair: timestamp('building_last_repair'), // null = never repaired
    condition: decimal('condition', { precision: 6, scale: 4 }).notNull(),
    repairMaterials: jsonb('repair_materials').notNull(), // FioSiteMaterial[]
    reclaimableMaterials: jsonb('reclaimable_materials').notNull(), // FioSiteMaterial[]
    constructionCosts: jsonb('construction_costs').notNull(), // { MaterialTicker, MaterialAmount }[] — true CC including env materials
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userPlanetIdx: index('fio_planet_buildings_user_planet_idx').on(table.userPlanetId),
  })
)

// ==================== FIO PLANET WORKFORCE (Workforce burn from /workforce endpoint) ====================
export const fioPlanetWorkforce = pgTable(
  'fio_planet_workforce',
  {
    id: serial('id').primaryKey(),
    userPlanetId: integer('user_planet_id')
      .notNull()
      .references(() => fioUserPlanets.id, { onDelete: 'cascade' }),
    workforceType: varchar('workforce_type', { length: 30 }).notNull(), // PIONEER, SETTLER, etc.
    population: integer('population').notNull(),
    required: integer('required').notNull(),
    needs: jsonb('needs').notNull(), // FioWorkforceNeed[]
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userPlanetIdx: index('fio_planet_workforce_user_planet_idx').on(table.userPlanetId),
  })
)

// ==================== FIO PLANET PRODUCTION (Production from /production endpoint) ====================
export const fioPlanetProduction = pgTable(
  'fio_planet_production',
  {
    id: serial('id').primaryKey(),
    userPlanetId: integer('user_planet_id')
      .notNull()
      .references(() => fioUserPlanets.id, { onDelete: 'cascade' }),
    lineType: varchar('line_type', { length: 40 }).notNull(),
    capacity: integer('capacity').notNull().default(0),
    condition: decimal('condition', { precision: 6, scale: 4 }).notNull(),
    efficiency: decimal('efficiency', { precision: 6, scale: 4 }).notNull(),
    orders: jsonb('orders').notNull(), // FioProductionOrder[]
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userPlanetIdx: index('fio_planet_production_user_planet_idx').on(table.userPlanetId),
  })
)

// ==================== SELL ORDERS ====================
export const sellOrders = pgTable(
  'sell_orders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commodityTicker: varchar('commodity_ticker', { length: 10 })
      .notNull()
      .references(() => fioCommodities.ticker),
    locationId: varchar('location_id', { length: 20 })
      .notNull()
      .references(() => fioLocations.naturalId),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    priceListCode: varchar('price_list_code', { length: 20 }), // null = custom/fixed price, set = dynamic pricing from price list
    orderType: orderTypeEnum('order_type').notNull().default('internal'), // internal = members only, partner = trade partners
    limitMode: sellOrderLimitModeEnum('limit_mode').notNull().default('none'),
    limitQuantity: integer('limit_quantity'), // Only used when limitMode is 'max_sell' or 'reserve'
    reserveSource: reserveSourceEnum('reserve_source').notNull().default('manual'), // manual = fixed limitQuantity, demand = auto-calculated from burn
    reserveDemandSource: demandSourceEnum('reserve_demand_source'), // null for manual, 'burn' for demand (repair not applicable to reserves)
    reserveTargetDays: integer('reserve_target_days'), // days of burn to reserve (demand only)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'), // soft-delete tombstone; preserves history for fulfilled invoices
  },
  table => ({
    // Unique constraint: one ACTIVE sell order per commodity/location/orderType/currency per user.
    // Partial index lets a user re-create a listing after the prior one was soft-deleted.
    uniqueUserCommodityLocationTypeCurrency: uniqueIndex(
      'sell_orders_user_commodity_location_type_currency_idx'
    )
      .on(table.userId, table.commodityTicker, table.locationId, table.orderType, table.currency)
      .where(sql`${table.deletedAt} IS NULL`),
    deletedAtIdx: index('sell_orders_deleted_at_idx').on(table.deletedAt),
  })
)

// ==================== BUY ORDERS ====================
export const buyOrders = pgTable(
  'buy_orders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commodityTicker: varchar('commodity_ticker', { length: 10 })
      .notNull()
      .references(() => fioCommodities.ticker),
    locationId: varchar('location_id', { length: 20 })
      .notNull()
      .references(() => fioLocations.naturalId),
    quantity: integer('quantity').notNull(),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    priceListCode: varchar('price_list_code', { length: 20 }), // null = custom/fixed price, set = dynamic pricing from price list
    orderType: orderTypeEnum('order_type').notNull().default('internal'), // internal = members only, partner = trade partners
    sourceMode: buyOrderSourceModeEnum('source_mode').notNull().default('manual'), // manual = fixed qty, demand = auto-calculated
    demandSource: demandSourceEnum('demand_source'), // null for manual, 'burn' or 'repair' for demand
    targetDays: integer('target_days'), // days of stock to maintain (burn only)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'), // soft-delete tombstone; preserves history for fulfilled invoices
  },
  table => ({
    // Unique constraint: one ACTIVE buy order per commodity/location/orderType/currency per user.
    // Partial index lets a user re-create a listing after the prior one was soft-deleted.
    uniqueUserCommodityLocationTypeCurrency: uniqueIndex(
      'buy_orders_user_commodity_location_type_currency_idx'
    )
      .on(table.userId, table.commodityTicker, table.locationId, table.orderType, table.currency)
      .where(sql`${table.deletedAt} IS NULL`),
    deletedAtIdx: index('buy_orders_deleted_at_idx').on(table.deletedAt),
  })
)

// ==================== LOGISTICS FLOWS (directed graph edges) ====================
// See docs/guides/logistics-plan.md. One row = one physical flow of a material
// between two real locations. Solver sizes the edge based on `kind`:
//   - demand:  amount = destination's required inflow (downstream pull)
//   - surplus: amount = source's leftover after demand commitments (upstream push)
//   - fixed:   amount = amountOverride (user-specified)
export const logisticsFlows = pgTable(
  'logistics_flows',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull(),
    fromLocationId: varchar('from_location_id', { length: 20 }).notNull(),
    fromStorageTypes: jsonb('from_storage_types').notNull(), // string[]
    toLocationId: varchar('to_location_id', { length: 20 }).notNull(),
    toStorageTypes: jsonb('to_storage_types').notNull(), // string[]
    kind: logisticsFlowKindEnum('kind').notNull(),
    amountOverride: integer('amount_override'), // required when kind='fixed'
    rate: demandRateEnum('rate').notNull().default('daily'),
    priority: integer('priority'), // null = fall through to jump-distance ordering
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userIdx: index('logistics_flows_user_idx').on(table.userId),
    fromIdx: index('logistics_flows_from_idx').on(table.userId, table.fromLocationId),
    toIdx: index('logistics_flows_to_idx').on(table.userId, table.toLocationId),
    commodityFk: foreignKey({
      name: 'logistics_flows_commodity_fk',
      columns: [table.commodityTicker],
      foreignColumns: [fioCommodities.ticker],
    }),
    fromLocationFk: foreignKey({
      name: 'logistics_flows_from_location_fk',
      columns: [table.fromLocationId],
      foreignColumns: [fioLocations.naturalId],
    }),
    toLocationFk: foreignKey({
      name: 'logistics_flows_to_location_fk',
      columns: [table.toLocationId],
      foreignColumns: [fioLocations.naturalId],
    }),
  })
)

// ==================== LOCATION DEMAND CLAIMS (manual node augmentations) ====================
// Manual demand entries that are not auto-derivable from FIO: government/COGC/upkeep,
// contract deliveries, safety-stock reserves. Each row adds to nativeConsumption at
// its location; the solver treats them identically to workforce burn once they've been
// converted to a daily rate against burnDays.
export const locationDemandClaims = pgTable(
  'location_demand_claims',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    locationId: varchar('location_id', { length: 20 }).notNull(),
    commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull(),
    quantity: integer('quantity').notNull(),
    rate: demandRateEnum('rate').notNull(),
    category: logisticsClaimCategoryEnum('category').notNull(),
    note: text('note'),
    source: logisticsClaimSourceEnum('source').notNull().default('manual'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userIdx: index('location_demand_claims_user_idx').on(table.userId),
    locationIdx: index('location_demand_claims_location_idx').on(table.userId, table.locationId),
    commodityFk: foreignKey({
      name: 'ldc_commodity_fk',
      columns: [table.commodityTicker],
      foreignColumns: [fioCommodities.ticker],
    }),
    locationFk: foreignKey({
      name: 'ldc_location_fk',
      columns: [table.locationId],
      foreignColumns: [fioLocations.naturalId],
    }),
  })
)

// ==================== BURN/REPAIR CACHE (pre-computed supply needs per user per planet per ticker) ====================
// Populated during FIO sync. Corp-wide aggregation is a plain SQL SUM query.
export const burnRepairCache = pgTable(
  'burn_repair_cache',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userPlanetId: integer('user_planet_id')
      .notNull()
      .references(() => fioUserPlanets.id, { onDelete: 'cascade' }),
    planetNaturalId: varchar('planet_natural_id', { length: 20 }).notNull(),
    planetName: varchar('planet_name', { length: 100 }).notNull(),
    commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull(),
    burnDaily: decimal('burn_daily', { precision: 12, scale: 4 }).notNull().default('0'),
    inputsDaily: decimal('inputs_daily', { precision: 12, scale: 4 }).notNull().default('0'),
    repairTotal: decimal('repair_total', { precision: 12, scale: 4 }).notNull().default('0'),
    productionDaily: decimal('production_daily', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    computedAt: timestamp('computed_at').defaultNow().notNull(),
  },
  table => ({
    userPlanetTickerIdx: uniqueIndex('burn_repair_cache_user_planet_ticker_idx').on(
      table.userId,
      table.planetNaturalId,
      table.commodityTicker
    ),
    userIdx: index('burn_repair_cache_user_idx').on(table.userId),
    userPlanetIdx: index('burn_repair_cache_user_planet_idx').on(table.userPlanetId),
  })
)

// ==================== SYNC QUEUE ====================
// Centralized queue for all FIO-bound work. One worker pulls jobs by
// (status, priority desc, next_attempt_at asc) and processes them one at a time,
// so nothing parallel-slams the FIO API. Planet-detail jobs are enqueued as
// children of a planets-list job; when the last child finishes, a
// cache-recompute job is auto-enqueued for that user.
export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: serial('id').primaryKey(),
    jobType: syncJobTypeEnum('job_type').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Job-specific data, e.g. { planetNaturalId: "CB-282d" } for planet-detail. */
    payload: jsonb('payload').notNull().default({}),
    /** Higher = runs sooner. Defaults: 100 system, 200 user-requested. */
    priority: integer('priority').notNull().default(100),
    source: syncJobSourceEnum('source').notNull().default('system'),
    status: syncJobStatusEnum('status').notNull().default('pending'),
    parentJobId: integer('parent_job_id'),
    notifyOnComplete: boolean('notify_on_complete').notNull().default(false),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    nextAttemptAt: timestamp('next_attempt_at').defaultNow().notNull(),
    enqueuedAt: timestamp('enqueued_at').defaultNow().notNull(),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    error: text('error'),
  },
  table => ({
    // Worker's "next job" query — highest priority, oldest ready-to-run pending job.
    pickNextIdx: index('sync_jobs_pick_next_idx').on(
      table.status,
      table.priority,
      table.nextAttemptAt
    ),
    // Dedup lookup: does this user already have an unfinished job of this type?
    userStatusIdx: index('sync_jobs_user_status_idx').on(table.userId, table.status, table.jobType),
    // Children of a given parent (for completion tracking + cache-recompute fanout).
    parentIdx: index('sync_jobs_parent_idx').on(table.parentJobId),
    parentFk: foreignKey({
      columns: [table.parentJobId],
      foreignColumns: [table.id],
      name: 'sync_jobs_parent_job_id_fk',
    }).onDelete('set null'),
  })
)

// ==================== NOTIFICATIONS ====================
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    message: text('message'),
    data: jsonb('data'), // { orderId, reservationId, counterpartyId, roles, etc. }
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userReadIdx: index('notifications_user_read_idx').on(
      table.userId,
      table.isRead,
      table.createdAt
    ),
  })
)

// ==================== ORDER RESERVATIONS (User reserving from/filling an order) ====================
// A reservation links a counterparty user to an order they want to reserve from or fill
// Either sellOrderId OR buyOrderId is set (not both) - indicating which order is being acted upon
export const orderReservations = pgTable(
  'order_reservations',
  {
    id: serial('id').primaryKey(),
    // One of these will be set - indicates which order is being reserved from / filled
    sellOrderId: integer('sell_order_id').references(() => sellOrders.id, { onDelete: 'cascade' }),
    buyOrderId: integer('buy_order_id').references(() => buyOrders.id, { onDelete: 'cascade' }),
    // The user making the reservation (buyer if reserving from sell, seller if filling buy)
    counterpartyUserId: integer('counterparty_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    status: reservationStatusEnum('status').notNull().default('pending'),
    notes: text('notes'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    sellOrderIdx: index('order_reservations_sell_order_idx').on(table.sellOrderId),
    buyOrderIdx: index('order_reservations_buy_order_idx').on(table.buyOrderId),
    counterpartyIdx: index('order_reservations_counterparty_idx').on(table.counterpartyUserId),
    statusExpiresIdx: index('order_reservations_status_expires_idx').on(
      table.status,
      table.expiresAt
    ),
  })
)

// ==================== INVOICES (Container for grouped reservations between two parties) ====================
// An invoice groups multiple line items (reservations) between two users
// Status: draft (accumulating), pending (submitted), confirmed, fulfilled, partially_fulfilled, cancelled
export const invoices = pgTable(
  'invoices',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    counterpartyUserId: integer('counterparty_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    name: varchar('name', { length: 100 }), // Optional custom name, defaults to counterparty display name
    notes: text('notes'),
    submittedAt: timestamp('submitted_at'), // When invoice was submitted
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userIdx: index('invoices_user_idx').on(table.userId),
    counterpartyIdx: index('invoices_counterparty_idx').on(table.counterpartyUserId),
    statusIdx: index('invoices_status_idx').on(table.status),
  })
)

// ==================== SHOPPING LISTS (Saved shopping lists for users) ====================
// Users can save shopping lists to the server for later use
// Each list contains a set of materials (ticker -> quantity)
export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    materials: jsonb('materials').notNull(), // Record<string, number> (ticker -> quantity)
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userIdx: index('shopping_lists_user_idx').on(table.userId),
  })
)

// ==================== SAVED MARKET FILTERS ====================
// Users can save filter configurations for quick reuse and sharing
export const savedMarketFilters = pgTable(
  'saved_market_filters',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    filterData: jsonb('filter_data').notNull(), // SavedFilterData shape
    privacy: filterPrivacyEnum('privacy').notNull().default('private'),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userIdx: index('saved_market_filters_user_idx').on(table.userId),
    privacyIdx: index('saved_market_filters_privacy_idx').on(table.privacy),
    pinnedIdx: index('saved_market_filters_pinned_idx').on(table.isPinned),
  })
)

// ==================== CORP OVERVIEW VIEWS ====================
// User-owned, shareable views for the Burn & Repair Corp Overview page.
// A view = a ticker scope + a list of dashboard card configs.
export const corpOverviewViews = pgTable(
  'corp_overview_views',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    tickers: jsonb('tickers').notNull(), // string[]; empty array = all corp tickers
    cards: jsonb('cards').notNull(), // ViewCard[]
    /**
     * User IDs the view excludes from corp aggregation. Acts as the saved
     * baseline — the page UI keeps a separate local working copy so non-owners
     * (and the built-in view) can still filter without mutating the row.
     */
    excludedUserIds: jsonb('excluded_user_ids').notNull().default([]),
    /**
     * Ordered list of MetricKey values to render as columns in the panel-level
     * Materials table. Empty array = use the client-side default column set.
     * Per-card columns live inside the `cards` blob; this is for the standalone
     * table that shows every in-scope ticker.
     */
    materialsTableColumns: jsonb('materials_table_columns').notNull().default([]),
    /**
     * Optional ticker scope for the panel-level Materials table, layered on top
     * of the view's overall `tickers` scope. Same mixed-entry shape (bare
     * tickers + `category:Foo` refs). Empty array = no extra constraint; the
     * materials table follows the view's full scope.
     */
    materialsTableTickers: jsonb('materials_table_tickers').notNull().default([]),
    privacy: filterPrivacyEnum('privacy').notNull().default('private'),
    isPinned: boolean('is_pinned').notNull().default(false),
    /**
     * Soft-delete tombstone. Null = active row. All read paths filter
     * `deleted_at IS NULL`; admin recovery can clear this in a future revision.
     */
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    privacyIdx: index('corp_overview_views_privacy_idx').on(table.privacy),
    pinnedIdx: index('corp_overview_views_pinned_idx').on(table.isPinned),
    deletedAtIdx: index('corp_overview_views_deleted_at_idx').on(table.deletedAt),
  })
)

// ==================== VIEW OWNERS (JOIN) ====================
// Many-to-many between views and users. A view's "owners" are the set of users
// in this table for that view; any owner has full read/edit/delete/share rights
// on the view. Min-1 owner is enforced at the application layer (deleting the
// last owner is rejected; deleting a user cascades that user's owner rows away
// and may leave the view ownerless — acceptable, see Phase 1 design notes).
export const viewOwners = pgTable(
  'view_owners',
  {
    viewId: integer('view_id')
      .notNull()
      .references(() => corpOverviewViews.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.viewId, table.userId] }),
    userIdx: index('view_owners_user_idx').on(table.userId),
  })
)

// ==================== USER VISITED VIEWS ====================
// Tracks which unlisted views a user has opened, so that view stays accessible
// in their selector across browsers/devices without forcing them to keep the
// link around. Public/private views don't need this — public is discoverable
// via Browse, private is only visible to owners. The visit upsert is a no-op
// for those tiers but harmless.
export const userVisitedViews = pgTable(
  'user_visited_views',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    viewId: integer('view_id')
      .notNull()
      .references(() => corpOverviewViews.id, { onDelete: 'cascade' }),
    lastVisitedAt: timestamp('last_visited_at').defaultNow().notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.userId, table.viewId] }),
    userIdx: index('user_visited_views_user_idx').on(table.userId),
  })
)

// ==================== CORP SNAPSHOT — PER USER × TICKER ====================
// Daily snapshot of each included user's concrete burn/input/production rates
// and current-state repair total, per commodity. Upserted at the end of each
// computeBurnRepairCache pass. Rates here are computed with repairDays=0 and
// willRepair=false — "what the buildings actually are" at snapshot time, not
// the user's planning-window projection.
export const corpSnapshotUserTicker = pgTable(
  'corp_snapshot_user_ticker',
  {
    id: serial('id').primaryKey(),
    snapshotAt: date('snapshot_at').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull(),
    burnDaily: decimal('burn_daily', { precision: 12, scale: 4 }).notNull(),
    inputsDaily: decimal('inputs_daily', { precision: 12, scale: 4 }).notNull(),
    productionDaily: decimal('production_daily', { precision: 12, scale: 4 }).notNull(),
    /** Concrete repair materials owed right now — NOT projected over a planning window. */
    repairTotal: decimal('repair_total', { precision: 12, scale: 4 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    uniq: uniqueIndex('corp_snapshot_user_ticker_uniq').on(
      table.userId,
      table.commodityTicker,
      table.snapshotAt
    ),
    byTickerTime: index('corp_snapshot_user_ticker_ticker_time_idx').on(
      table.commodityTicker,
      table.snapshotAt
    ),
    byTime: index('corp_snapshot_user_ticker_time_idx').on(table.snapshotAt),
  })
)

// ==================== CORP SNAPSHOT — TICKER STOCK ====================
// Daily snapshot of corp-wide available stock per commodity (sum of remaining
// sell-order quantities across included users). Written by the daily stock
// capture cron, not per-user sync.
export const corpSnapshotTickerStock = pgTable(
  'corp_snapshot_ticker_stock',
  {
    id: serial('id').primaryKey(),
    snapshotAt: date('snapshot_at').notNull(),
    commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull(),
    stock: integer('stock').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    uniq: uniqueIndex('corp_snapshot_ticker_stock_uniq').on(
      table.commodityTicker,
      table.snapshotAt
    ),
    byTime: index('corp_snapshot_ticker_stock_time_idx').on(table.snapshotAt),
  })
)

// ==================== INVOICE LINE ITEMS (Individual items within an invoice) ====================
// Each line item represents a buy or sell action within the invoice
// Before submission: stores intent (which order to reserve from / fill)
// After submission: links to the created reservation
export const invoiceLineItems = pgTable(
  'invoice_line_items',
  {
    id: serial('id').primaryKey(),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    // Order reference - one of these is set to indicate intent
    sellOrderId: integer('sell_order_id').references(() => sellOrders.id, { onDelete: 'set null' }),
    buyOrderId: integer('buy_order_id').references(() => buyOrders.id, { onDelete: 'set null' }),
    // After submission, links to created reservation
    reservationId: integer('reservation_id').references(() => orderReservations.id, {
      onDelete: 'set null',
    }),
    // Snapshot of order details at time of adding (for display and audit)
    commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull(),
    locationId: varchar('location_id', { length: 20 }).notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: decimal('unit_price', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    priceListCode: varchar('price_list_code', { length: 20 }), // null = custom price
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    invoiceIdx: index('invoice_line_items_invoice_idx').on(table.invoiceId),
    sellOrderIdx: index('invoice_line_items_sell_order_idx').on(table.sellOrderId),
    buyOrderIdx: index('invoice_line_items_buy_order_idx').on(table.buyOrderId),
    reservationIdx: index('invoice_line_items_reservation_idx').on(table.reservationId),
  })
)

// ==================== PRICE LISTS (Exchange definitions - CI1, KAWA, etc.) ====================
// Defines available price lists/exchanges and their properties
export const priceLists = pgTable('price_lists', {
  code: varchar('code', { length: 20 }).primaryKey(), // CI1, NC1, IC1, AI1, KAWA, etc.
  name: varchar('name', { length: 100 }).notNull(), // "Commodity Exchange - Benten", "KAWA Internal", etc.
  description: text('description'), // Optional description
  type: priceListTypeEnum('type').notNull(), // 'fio' = synced from FIO API, 'custom' = user-managed
  currency: currencyEnum('currency').notNull(), // Fixed currency for this price list
  isActive: boolean('is_active').notNull().default(true),
  currentVersion: integer('current_version').notNull().default(1), // Active version pointer
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== PRICE LIST VERSIONS (Version metadata for price lists) ====================
// Tracks version labels, creation, and promotion history
// defaultLocationId is per-version: a new version can rebase to a different location
export const priceListVersions = pgTable(
  'price_list_versions',
  {
    id: serial('id').primaryKey(),
    priceListCode: varchar('price_list_code', { length: 20 })
      .notNull()
      .references(() => priceLists.code, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    label: varchar('label', { length: 100 }), // e.g., "Phase 1 - Electronics"
    description: text('description'),
    // Required: prices belong to a base location. Named FK below so the
    // constraint name fits Postgres's 63-char identifier limit (the default
    // drizzle-generated name `price_list_versions_default_location_id_fio_locations_natural_id_fk`
    // is 64 chars and gets silently truncated, surfacing as a NOTICE on every
    // migration apply).
    defaultLocationId: varchar('default_location_id', { length: 20 }).notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    promotedAt: timestamp('promoted_at'), // When this version was set as current (null if never)
  },
  table => ({
    uniquePriceListVersion: uniqueIndex('price_list_versions_code_version_idx').on(
      table.priceListCode,
      table.version
    ),
    priceListIdx: index('price_list_versions_price_list_idx').on(table.priceListCode),
    defaultLocationFk: foreignKey({
      name: 'price_list_versions_default_location_fk',
      columns: [table.defaultLocationId],
      foreignColumns: [fioLocations.naturalId],
    }),
  })
)

// ==================== PRICES (Individual price records per commodity/location) ====================
export const prices = pgTable(
  'prices',
  {
    id: serial('id').primaryKey(),
    priceListCode: varchar('price_list_code', { length: 20 })
      .notNull()
      .references(() => priceLists.code), // FK to price list
    version: integer('version').notNull().default(1), // Price list version this price belongs to
    commodityTicker: varchar('commodity_ticker', { length: 10 })
      .notNull()
      .references(() => fioCommodities.ticker),
    locationId: varchar('location_id', { length: 20 })
      .notNull()
      .references(() => fioLocations.naturalId),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    // Currency is derived from price list, not stored per-price
    source: priceSourceEnum('source').notNull(), // How this price was set
    sourceReference: text('source_reference'), // Google Sheets URL, CSV filename, sync timestamp, etc.
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique constraint: one price per price list/version/commodity/location combination
    uniquePriceListVersionCommodityLocation: uniqueIndex(
      'prices_price_list_version_commodity_location_idx'
    ).on(table.priceListCode, table.version, table.commodityTicker, table.locationId),
    // Index for efficient lookups by price list and version
    priceListVersionIdx: index('prices_price_list_version_idx').on(
      table.priceListCode,
      table.version
    ),
  })
)

// ==================== PRICE ADJUSTMENTS (Modifiers for prices) ====================
// Adjustments can target specific price lists, locations, commodities, or any combination
// NULL fields act as wildcards (match anything)
export const priceAdjustments = pgTable(
  'price_adjustments',
  {
    id: serial('id').primaryKey(),
    priceListCode: varchar('price_list_code', { length: 20 }).references(() => priceLists.code), // NULL = applies to all price lists
    commodityTicker: varchar('commodity_ticker', { length: 10 }).references(
      () => fioCommodities.ticker
    ), // NULL = applies to all commodities
    locationId: varchar('location_id', { length: 20 }).references(() => fioLocations.naturalId), // NULL = applies to all locations
    // Currency is now fixed per price list, so no currency field here
    adjustmentType: adjustmentTypeEnum('adjustment_type').notNull(), // 'percentage' or 'fixed'
    adjustmentValue: decimal('adjustment_value', { precision: 12, scale: 4 }).notNull(), // e.g., 5.00 for +5% or +5 units
    priority: integer('priority').notNull().default(0), // Order of application (lower = first)
    description: text('description'), // Human-readable explanation
    isActive: boolean('is_active').notNull().default(true), // Enable/disable without deleting
    effectiveFrom: timestamp('effective_from'), // NULL = immediately effective
    effectiveUntil: timestamp('effective_until'), // NULL = no expiration
    createdByUserId: integer('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Index for efficient lookups when calculating effective prices
    adjustmentLookupIdx: index('price_adjustments_lookup_idx').on(
      table.priceListCode,
      table.locationId,
      table.commodityTicker
    ),
    // Index for active adjustments
    activeIdx: index('price_adjustments_active_idx').on(table.isActive),
  })
)

// ==================== IMPORT CONFIGS (Saved import configurations for price lists) ====================
// Stores configurations for importing prices from external sources (Google Sheets, CSV)
export const importConfigs = pgTable(
  'import_configs',
  {
    id: serial('id').primaryKey(),
    priceListCode: varchar('price_list_code', { length: 20 })
      .notNull()
      .references(() => priceLists.code, { onDelete: 'cascade' }), // Target price list
    version: integer('version').notNull().default(1), // Price list version this config belongs to
    name: varchar('name', { length: 100 }).notNull(), // Configuration name, e.g., "KAWA Price Sheet"
    sourceType: importSourceTypeEnum('source_type').notNull(), // 'csv' or 'google_sheets'
    format: importFormatEnum('format').notNull(), // 'flat' or 'pivot'
    sheetsUrl: text('sheets_url'), // Google Sheets URL (for google_sheets source type)
    sheetGid: integer('sheet_gid'), // Specific sheet tab (null = first sheet)
    config: jsonb('config'), // Format-specific config (FlatConfig or PivotConfig as JSON)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Index for finding configs by price list and version
    priceListVersionIdx: index('import_configs_price_list_version_idx').on(
      table.priceListCode,
      table.version
    ),
  })
)

// ==================== RELATIONS ====================

export const usersRelations = relations(users, ({ many, one }) => ({
  settings: many(userSettings), // Key-value user settings (preferences & FIO credentials)
  userRoles: many(userRoles),
  passwordResetTokens: many(passwordResetTokens),
  fioUserStorage: many(fioUserStorage),
  fioUserPlanets: many(fioUserPlanets),
  logisticsFlows: many(logisticsFlows),
  locationDemandClaims: many(locationDemandClaims),
  sellOrders: many(sellOrders),
  buyOrders: many(buyOrders),
  notifications: many(notifications),
  reservations: many(orderReservations), // Reservations where user is the counterparty
  invoices: many(invoices), // Invoices created by this user
  shoppingLists: many(shoppingLists), // Shopping lists created by this user
  savedMarketFilters: many(savedMarketFilters), // Saved market filters created by this user
  discordProfile: one(userDiscordProfiles, {
    fields: [users.id],
    references: [userDiscordProfiles.userId],
  }),
  createdPriceAdjustments: many(priceAdjustments), // Adjustments created by this user
  burnRepairCache: many(burnRepairCache), // Pre-computed burn/repair needs
}))

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}))

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
  discordRoleMappings: many(discordRoleMappings),
}))

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}))

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}))

export const fioCommoditiesRelations = relations(fioCommodities, ({ many }) => ({
  fioInventory: many(fioInventory),
  sellOrders: many(sellOrders),
  prices: many(prices),
  priceAdjustments: many(priceAdjustments),
}))

export const fioLocationsRelations = relations(fioLocations, ({ many }) => ({
  fioUserStorage: many(fioUserStorage),
  sellOrders: many(sellOrders),
  priceLists: many(priceLists), // Price lists with this as default location
  prices: many(prices),
  priceAdjustments: many(priceAdjustments),
}))

export const fioUserStorageRelations = relations(fioUserStorage, ({ one, many }) => ({
  user: one(users, {
    fields: [fioUserStorage.userId],
    references: [users.id],
  }),
  location: one(fioLocations, {
    fields: [fioUserStorage.locationId],
    references: [fioLocations.naturalId],
  }),
  fioInventory: many(fioInventory),
}))

export const fioInventoryRelations = relations(fioInventory, ({ one }) => ({
  userStorage: one(fioUserStorage, {
    fields: [fioInventory.userStorageId],
    references: [fioUserStorage.id],
  }),
  commodity: one(fioCommodities, {
    fields: [fioInventory.commodityTicker],
    references: [fioCommodities.ticker],
  }),
}))

export const fioUserPlanetsRelations = relations(fioUserPlanets, ({ one, many }) => ({
  user: one(users, {
    fields: [fioUserPlanets.userId],
    references: [users.id],
  }),
  buildings: many(fioPlanetBuildings),
  workforce: many(fioPlanetWorkforce),
  production: many(fioPlanetProduction),
  burnRepairCache: many(burnRepairCache),
}))

export const fioPlanetBuildingsRelations = relations(fioPlanetBuildings, ({ one }) => ({
  userPlanet: one(fioUserPlanets, {
    fields: [fioPlanetBuildings.userPlanetId],
    references: [fioUserPlanets.id],
  }),
}))

export const fioPlanetWorkforceRelations = relations(fioPlanetWorkforce, ({ one }) => ({
  userPlanet: one(fioUserPlanets, {
    fields: [fioPlanetWorkforce.userPlanetId],
    references: [fioUserPlanets.id],
  }),
}))

export const fioPlanetProductionRelations = relations(fioPlanetProduction, ({ one }) => ({
  userPlanet: one(fioUserPlanets, {
    fields: [fioPlanetProduction.userPlanetId],
    references: [fioUserPlanets.id],
  }),
}))

export const burnRepairCacheRelations = relations(burnRepairCache, ({ one }) => ({
  user: one(users, {
    fields: [burnRepairCache.userId],
    references: [users.id],
  }),
  userPlanet: one(fioUserPlanets, {
    fields: [burnRepairCache.userPlanetId],
    references: [fioUserPlanets.id],
  }),
}))

export const sellOrdersRelations = relations(sellOrders, ({ one, many }) => ({
  user: one(users, {
    fields: [sellOrders.userId],
    references: [users.id],
  }),
  commodity: one(fioCommodities, {
    fields: [sellOrders.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  location: one(fioLocations, {
    fields: [sellOrders.locationId],
    references: [fioLocations.naturalId],
  }),
  reservations: many(orderReservations),
}))

export const buyOrdersRelations = relations(buyOrders, ({ one, many }) => ({
  user: one(users, {
    fields: [buyOrders.userId],
    references: [users.id],
  }),
  commodity: one(fioCommodities, {
    fields: [buyOrders.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  location: one(fioLocations, {
    fields: [buyOrders.locationId],
    references: [fioLocations.naturalId],
  }),
  reservations: many(orderReservations),
}))

export const logisticsFlowsRelations = relations(logisticsFlows, ({ one }) => ({
  user: one(users, {
    fields: [logisticsFlows.userId],
    references: [users.id],
  }),
  commodity: one(fioCommodities, {
    fields: [logisticsFlows.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  fromLocation: one(fioLocations, {
    fields: [logisticsFlows.fromLocationId],
    references: [fioLocations.naturalId],
  }),
  toLocation: one(fioLocations, {
    fields: [logisticsFlows.toLocationId],
    references: [fioLocations.naturalId],
  }),
}))

export const locationDemandClaimsRelations = relations(locationDemandClaims, ({ one }) => ({
  user: one(users, {
    fields: [locationDemandClaims.userId],
    references: [users.id],
  }),
  commodity: one(fioCommodities, {
    fields: [locationDemandClaims.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  location: one(fioLocations, {
    fields: [locationDemandClaims.locationId],
    references: [fioLocations.naturalId],
  }),
}))

// ==================== DISCORD & SETTINGS RELATIONS ====================

export const settingsRelations = relations(settings, ({ one }) => ({
  changedByUser: one(users, {
    fields: [settings.changedByUserId],
    references: [users.id],
  }),
}))

export const discordRoleMappingsRelations = relations(discordRoleMappings, ({ one }) => ({
  appRole: one(roles, {
    fields: [discordRoleMappings.appRoleId],
    references: [roles.id],
  }),
}))

export const userDiscordProfilesRelations = relations(userDiscordProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userDiscordProfiles.userId],
    references: [users.id],
  }),
}))

// ==================== NOTIFICATIONS & RESERVATIONS RELATIONS ====================

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}))

export const orderReservationsRelations = relations(orderReservations, ({ one }) => ({
  buyOrder: one(buyOrders, {
    fields: [orderReservations.buyOrderId],
    references: [buyOrders.id],
  }),
  sellOrder: one(sellOrders, {
    fields: [orderReservations.sellOrderId],
    references: [sellOrders.id],
  }),
  counterpartyUser: one(users, {
    fields: [orderReservations.counterpartyUserId],
    references: [users.id],
  }),
}))

// ==================== INVOICE RELATIONS ====================

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
  }),
  counterparty: one(users, {
    fields: [invoices.counterpartyUserId],
    references: [users.id],
  }),
  lineItems: many(invoiceLineItems),
}))

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
  sellOrder: one(sellOrders, {
    fields: [invoiceLineItems.sellOrderId],
    references: [sellOrders.id],
  }),
  buyOrder: one(buyOrders, {
    fields: [invoiceLineItems.buyOrderId],
    references: [buyOrders.id],
  }),
  reservation: one(orderReservations, {
    fields: [invoiceLineItems.reservationId],
    references: [orderReservations.id],
  }),
}))

// ==================== SHOPPING LIST RELATIONS ====================

export const shoppingListsRelations = relations(shoppingLists, ({ one }) => ({
  user: one(users, {
    fields: [shoppingLists.userId],
    references: [users.id],
  }),
}))

// ==================== SAVED MARKET FILTER RELATIONS ====================

export const savedMarketFiltersRelations = relations(savedMarketFilters, ({ one }) => ({
  user: one(users, {
    fields: [savedMarketFilters.userId],
    references: [users.id],
  }),
}))

// ==================== CORP OVERVIEW VIEW RELATIONS ====================

export const corpOverviewViewsRelations = relations(corpOverviewViews, ({ many }) => ({
  owners: many(viewOwners),
}))

export const viewOwnersRelations = relations(viewOwners, ({ one }) => ({
  view: one(corpOverviewViews, {
    fields: [viewOwners.viewId],
    references: [corpOverviewViews.id],
  }),
  user: one(users, {
    fields: [viewOwners.userId],
    references: [users.id],
  }),
}))

export const userVisitedViewsRelations = relations(userVisitedViews, ({ one }) => ({
  view: one(corpOverviewViews, {
    fields: [userVisitedViews.viewId],
    references: [corpOverviewViews.id],
  }),
  user: one(users, {
    fields: [userVisitedViews.userId],
    references: [users.id],
  }),
}))

// ==================== CORP SNAPSHOT RELATIONS ====================

export const corpSnapshotUserTickerRelations = relations(corpSnapshotUserTicker, ({ one }) => ({
  user: one(users, {
    fields: [corpSnapshotUserTicker.userId],
    references: [users.id],
  }),
}))

// corp_snapshot_ticker_stock has no FK relations beyond its own timestamp-ticker key.

// ==================== PRICING SYSTEM RELATIONS ====================

export const priceListsRelations = relations(priceLists, ({ many }) => ({
  prices: many(prices),
  priceAdjustments: many(priceAdjustments),
  importConfigs: many(importConfigs),
  versions: many(priceListVersions),
}))

export const pricesRelations = relations(prices, ({ one }) => ({
  priceList: one(priceLists, {
    fields: [prices.priceListCode],
    references: [priceLists.code],
  }),
  commodity: one(fioCommodities, {
    fields: [prices.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  location: one(fioLocations, {
    fields: [prices.locationId],
    references: [fioLocations.naturalId],
  }),
}))

export const priceAdjustmentsRelations = relations(priceAdjustments, ({ one }) => ({
  priceList: one(priceLists, {
    fields: [priceAdjustments.priceListCode],
    references: [priceLists.code],
  }),
  commodity: one(fioCommodities, {
    fields: [priceAdjustments.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  location: one(fioLocations, {
    fields: [priceAdjustments.locationId],
    references: [fioLocations.naturalId],
  }),
  createdByUser: one(users, {
    fields: [priceAdjustments.createdByUserId],
    references: [users.id],
  }),
}))

export const importConfigsRelations = relations(importConfigs, ({ one }) => ({
  priceList: one(priceLists, {
    fields: [importConfigs.priceListCode],
    references: [priceLists.code],
  }),
}))

export const priceListVersionsRelations = relations(priceListVersions, ({ one }) => ({
  priceList: one(priceLists, {
    fields: [priceListVersions.priceListCode],
    references: [priceLists.code],
  }),
  defaultLocation: one(fioLocations, {
    fields: [priceListVersions.defaultLocationId],
    references: [fioLocations.naturalId],
  }),
  createdByUser: one(users, {
    fields: [priceListVersions.createdByUserId],
    references: [users.id],
  }),
}))
