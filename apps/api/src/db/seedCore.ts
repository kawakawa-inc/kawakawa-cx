// Shared DB seeding logic used by both `db/seed.ts` (db:seed) and
// `scripts/db-init-idempotent.ts` (db:init). All upserts, so safe to call
// repeatedly against a non-empty database.
import { db, roles, permissions, rolePermissions, priceLists, priceListVersions } from './index.js'
import { sql } from 'drizzle-orm'
import {
  ROLES_DATA,
  PERMISSIONS_DATA,
  DEFAULT_ROLE_PERMISSIONS,
  PRICE_LISTS_DATA,
} from './seedData.js'

export interface SeedRolesAndPermissionsResult {
  roleCount: number
  permissionCount: number
  rolePermissionCount: number
}

/**
 * Upsert roles, permissions, and the default role→permission grants from
 * `seedData.ts`. Roles/permissions are upserted by id (name/description kept
 * in sync with the source data). Role-permission grants are upserted against
 * the (roleId, permissionId) unique index, so re-running this never creates
 * duplicate grant rows.
 */
export async function seedRolesAndPermissions(): Promise<SeedRolesAndPermissionsResult> {
  await db
    .insert(roles)
    .values(ROLES_DATA)
    .onConflictDoUpdate({
      target: roles.id,
      set: { name: sql`EXCLUDED.name`, color: sql`EXCLUDED.color` },
    })

  await db
    .insert(permissions)
    .values(PERMISSIONS_DATA)
    .onConflictDoUpdate({
      target: permissions.id,
      set: { name: sql`EXCLUDED.name`, description: sql`EXCLUDED.description` },
    })

  const rolePermissionsData: { roleId: string; permissionId: string; allowed: boolean }[] = []
  for (const [roleId, permissionIds] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const permissionId of permissionIds) {
      rolePermissionsData.push({ roleId, permissionId, allowed: true })
    }
  }

  if (rolePermissionsData.length > 0) {
    await db
      .insert(rolePermissions)
      .values(rolePermissionsData)
      .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.permissionId] })
  }

  return {
    roleCount: ROLES_DATA.length,
    permissionCount: PERMISSIONS_DATA.length,
    rolePermissionCount: rolePermissionsData.length,
  }
}

/**
 * Upsert the baseline price lists and their initial (version 1) metadata.
 * Requires locations to already be synced, since `defaultLocationId` is an FK.
 */
export async function seedPriceLists(): Promise<void> {
  await db
    .insert(priceLists)
    .values(PRICE_LISTS_DATA.map(({ defaultLocationId: _ignored, ...rest }) => rest))
    .onConflictDoUpdate({
      target: priceLists.code,
      set: {
        name: sql`EXCLUDED.name`,
        description: sql`EXCLUDED.description`,
        type: sql`EXCLUDED.type`,
        currency: sql`EXCLUDED.currency`,
      },
    })

  await db
    .insert(priceListVersions)
    .values(
      PRICE_LISTS_DATA.map(pl => ({
        priceListCode: pl.code,
        version: 1,
        label: 'Initial version',
        defaultLocationId: pl.defaultLocationId,
        promotedAt: new Date(),
      }))
    )
    .onConflictDoNothing()
}
