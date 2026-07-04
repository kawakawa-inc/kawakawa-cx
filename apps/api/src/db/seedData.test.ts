import { describe, it, expect } from 'vitest'
import {
  ROLES_DATA,
  PERMISSIONS_DATA,
  DEFAULT_ROLE_PERMISSIONS,
  PRICE_LISTS_DATA,
} from './seedData.js'

// These checks exist because this data previously lived as two independent
// copies (db/seed.ts and scripts/db-init-idempotent.ts) that silently drifted
// — a permission was added to one but not the other. Now that both scripts
// import from this single module, these tests catch the same class of
// mistake (typo'd id, granting a role/permission that doesn't exist) at test
// time instead of "why isn't this permission showing up in prod" time.

describe('seedData consistency', () => {
  it('has no duplicate role ids', () => {
    const ids = ROLES_DATA.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no duplicate permission ids', () => {
    const ids = PERMISSIONS_DATA.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no duplicate price list codes', () => {
    const codes = PRICE_LISTS_DATA.map(p => p.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('every DEFAULT_ROLE_PERMISSIONS key is a known role id', () => {
    const knownRoleIds = new Set(ROLES_DATA.map(r => r.id))
    for (const roleId of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
      expect(knownRoleIds.has(roleId)).toBe(true)
    }
  })

  it('every role in ROLES_DATA has a DEFAULT_ROLE_PERMISSIONS entry', () => {
    for (const role of ROLES_DATA) {
      expect(Object.prototype.hasOwnProperty.call(DEFAULT_ROLE_PERMISSIONS, role.id)).toBe(true)
    }
  })

  it('every permission granted in DEFAULT_ROLE_PERMISSIONS is a known permission id', () => {
    const knownPermissionIds = new Set(PERMISSIONS_DATA.map(p => p.id))
    for (const [roleId, permissionIds] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const permissionId of permissionIds) {
        expect(
          knownPermissionIds.has(permissionId),
          `role '${roleId}' grants unknown permission '${permissionId}'`
        ).toBe(true)
      }
    }
  })

  it('every role grants no duplicate permission twice', () => {
    for (const [roleId, permissionIds] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      expect(new Set(permissionIds).size, `role '${roleId}' has a duplicate grant`).toBe(
        permissionIds.length
      )
    }
  })

  it('every price list has a defaultLocationId for its initial version', () => {
    for (const pl of PRICE_LISTS_DATA) {
      expect(
        pl.defaultLocationId,
        `price list '${pl.code}' is missing defaultLocationId`
      ).toBeTruthy()
    }
  })
})
