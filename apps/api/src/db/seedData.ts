// Single source of truth for roles/permissions/role-permission-grants and the
// baseline FIO/custom price lists. Both `db/seed.ts` (the `db:seed` script,
// used by `make db-reset`/`db-reset-mock`) and `scripts/db-init-idempotent.ts`
// (the `db:init` script, used by `make db-init`/`db-init-dev`) import from
// here — previously each maintained its own independent copy of this data,
// and they drifted (a new permission was added to one but not the other).
//
// When adding a new permission: add it once, here, to both `PERMISSIONS_DATA`
// and whichever role(s) in `DEFAULT_ROLE_PERMISSIONS` should get it. Both
// seeding entry points will pick it up automatically. `seedData.test.ts`
// guards against the most common mistakes (typos, granting a role/permission
// that was never defined).

export interface RoleData {
  id: string
  name: string
  color: string
}

export interface PermissionData {
  id: string
  name: string
  description: string
}

export type Currency = 'CIS' | 'NCC' | 'ICA' | 'AIC'
export type PriceListType = 'fio' | 'custom'

export interface PriceListSeedData {
  code: string
  name: string
  description: string | null
  type: PriceListType
  /** Default location for the initial version. Not a column on price_lists itself. */
  defaultLocationId: string
  currency: Currency
}

export const ROLES_DATA: RoleData[] = [
  { id: 'unverified', name: 'Unverified', color: 'grey' }, // New registrations, awaiting approval
  { id: 'applicant', name: 'Applicant', color: 'teal' },
  { id: 'member', name: 'Member', color: 'blue' },
  { id: 'lead', name: 'Lead', color: 'green' },
  { id: 'trade-partner', name: 'Trade Partner', color: 'red' },
  { id: 'administrator', name: 'Administrator', color: 'purple' },
]

export const PERMISSIONS_DATA: PermissionData[] = [
  {
    id: 'orders.view_internal',
    name: 'View Internal Orders',
    description: 'Can view orders with no target role (internal orders)',
  },
  {
    id: 'orders.post_internal',
    name: 'Post Internal Orders',
    description: 'Can create orders with no target role (internal orders)',
  },
  {
    id: 'orders.view_partner',
    name: 'View Partner Orders',
    description: 'Can view orders for trade partners',
  },
  {
    id: 'orders.post_partner',
    name: 'Post Partner Orders',
    description: 'Can create orders for trade partners',
  },
  {
    id: 'reservations.place_internal',
    name: 'Place Internal Reservations',
    description: 'Can place reservations on internal orders',
  },
  {
    id: 'reservations.place_partner',
    name: 'Place Partner Reservations',
    description: 'Can place reservations on partner orders',
  },
  {
    id: 'admin.manage_users',
    name: 'Manage Users',
    description: 'Can view and modify user accounts',
  },
  {
    id: 'admin.manage_roles',
    name: 'Manage Roles',
    description: 'Can modify roles and their permissions',
  },
  // Pricing system permissions
  {
    id: 'prices.view',
    name: 'View Price Lists',
    description: 'Can view price lists and effective prices',
  },
  {
    id: 'prices.manage',
    name: 'Manage Prices',
    description: 'Can create, update, and delete prices manually',
  },
  {
    id: 'prices.import',
    name: 'Import Prices',
    description: 'Can import prices from CSV or Google Sheets',
  },
  {
    id: 'prices.sync_fio',
    name: 'Sync FIO Prices',
    description: 'Can trigger FIO exchange price synchronization',
  },
  {
    id: 'adjustments.view',
    name: 'View Price Adjustments',
    description: 'Can view price adjustment rules',
  },
  {
    id: 'adjustments.manage',
    name: 'Manage Price Adjustments',
    description: 'Can create, update, and delete price adjustment rules',
  },
  {
    id: 'import_configs.manage',
    name: 'Manage Import Configurations',
    description: 'Can manage saved import configurations for Google Sheets',
  },
  // Package (bill-of-materials bundle, e.g. ships) permissions
  {
    id: 'packages.view',
    name: 'View Packages',
    description: 'Can view packages (e.g. ship bills of materials) and their computed pricing',
  },
  {
    id: 'packages.manage',
    name: 'Manage Packages',
    description: 'Can create, update, and delete packages and their material lines',
  },
  // Sales order queue permissions
  {
    id: 'sales_orders.view',
    name: 'View Sales Orders',
    description: 'Can view the sales order queue and their own orders',
  },
  {
    id: 'sales_orders.create',
    name: 'Create Sales Orders',
    description: 'Can submit new package sales orders to the queue',
  },
  {
    id: 'sales_orders.claim',
    name: 'Claim Sales Orders',
    description: 'Can claim and fulfill sales orders off the queue',
  },
  // Filter management permissions
  {
    id: 'filters.pin',
    name: 'Pin Filters',
    description: 'Can pin saved market filters to appear globally for all users',
  },
]

// Default role permissions (roleId -> list of permissionIds that are allowed)
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  unverified: [
    // No permissions - users must be verified before they can do anything
  ],
  applicant: [
    'orders.view_internal',
    'orders.view_partner',
    'prices.view', // Can view price lists
    'adjustments.view', // Can view adjustments
    // Note: applicants cannot post by default
    'packages.view',
    'sales_orders.view',
    'sales_orders.create',
  ],
  member: [
    'orders.view_internal',
    'orders.view_partner',
    'orders.post_internal',
    'reservations.place_internal',
    'prices.view',
    'adjustments.view',
    'packages.view',
    'sales_orders.view',
    'sales_orders.create',
    'sales_orders.claim',
  ],
  lead: [
    'orders.view_internal',
    'orders.view_partner',
    'orders.post_internal',
    'orders.post_partner',
    'reservations.place_internal',
    'reservations.place_partner',
    'prices.view',
    'prices.manage',
    'prices.import',
    'prices.sync_fio',
    'adjustments.view',
    'adjustments.manage',
    'import_configs.manage',
    'packages.view',
    'packages.manage',
    'sales_orders.view',
    'sales_orders.create',
    'sales_orders.claim',
  ],
  'trade-partner': [
    'orders.view_partner', // Can only see partner orders
    'orders.post_partner', // Can post partner orders
    'reservations.place_partner', // Can place reservations on partner orders
    'prices.view', // Can view prices
    'adjustments.view', // Can view adjustments
    'packages.view',
    'sales_orders.view',
    'sales_orders.create',
  ],
  administrator: [
    'orders.view_internal',
    'orders.view_partner',
    // Note: administrators do NOT get order posting permissions by default
    // Combine with 'member' or 'trade-partner' roles if they need to create orders
    'admin.manage_users',
    'admin.manage_roles',
    'prices.view',
    'prices.manage',
    'prices.import',
    'prices.sync_fio',
    'adjustments.view',
    'adjustments.manage',
    'import_configs.manage',
    'packages.view',
    'packages.manage',
    'sales_orders.view',
    'sales_orders.create',
    'sales_orders.claim',
    'filters.pin',
  ],
}

// Baseline price lists. Only db-init-idempotent.ts seeds these today (it runs
// after locations/stations are synced, which price_list_versions.defaultLocationId
// depends on via FK) but the data lives here so nothing else has to duplicate it.
export const PRICE_LISTS_DATA: PriceListSeedData[] = [
  {
    code: 'CI1',
    name: 'Commodity Exchange - Benten',
    description: 'FIO CI1 exchange at Benten station',
    type: 'fio',
    defaultLocationId: 'BEN',
    currency: 'CIS',
  },
  {
    code: 'NC1',
    name: 'Commodity Exchange - Moria',
    description: 'FIO NC1 exchange at Moria station',
    type: 'fio',
    defaultLocationId: 'MOR',
    currency: 'NCC',
  },
  {
    code: 'IC1',
    name: 'Commodity Exchange - Hortus',
    description: 'FIO IC1 exchange at Hortus station',
    type: 'fio',
    defaultLocationId: 'HRT',
    currency: 'ICA',
  },
  {
    code: 'AI1',
    name: 'Commodity Exchange - Antares',
    description: 'FIO AI1 exchange at Antares station',
    type: 'fio',
    defaultLocationId: 'ANT',
    currency: 'AIC',
  },
  {
    code: 'KAWA',
    name: 'KAWA Internal Exchange',
    description: 'Internal price list for KAWA members',
    type: 'custom',
    defaultLocationId: 'UV-796b',
    currency: 'CIS',
  },
]
