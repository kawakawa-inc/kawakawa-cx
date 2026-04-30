/**
 * Resolve the set of users whose data contributes to corp-wide burn/repair
 * views and snapshots.
 *
 * "Active members" = users who hold one of the configured corp-member roles
 * AND whose most recent FIO upload is within the staleness window. The filter
 * was previously a private method on BurnRepairController; it's lifted here so
 * the daily snapshot cron (which has no requesting-user context) can use the
 * same resolution rules the live corp endpoint uses.
 */

import { db, fioUserStorage, userRoles, users, userSettings } from '@kawakawa/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getAdminDefaults } from '../user-settings/user-settings-service.js'
import * as userSettingsService from '../user-settings/user-settings-service.js'

/** FIO uploads older than this mean the player hasn't connected recently. */
export const STALE_DATA_DAYS = 30

export interface ActiveMembersResult {
  /** Users whose data should be included in corp views/snapshots right now. */
  activeUserIds: number[]
  /** Members excluded because their FIO data is stale or missing. */
  staleUserCount: number
  /** Stale member user IDs in role order — surfaces who's behind the count. */
  staleUserIds: number[]
  /** userId → ISO timestamp of the oldest FIO upload across their storages. */
  fioAgeMap: Map<number, string>
}

/**
 * Read the effective `burnRepair.includedRoles` value.
 *
 * Two modes:
 * - Per-user (`forUserId`): cascades user override → admin default → code default.
 *   Matches live endpoints where each user's view respects their overrides.
 * - Cron / corp-wide (`forUserId` omitted): reads admin default directly. Used
 *   by the daily snapshot job, which has no requesting user.
 */
async function resolveIncludedRoles(forUserId?: number): Promise<string[]> {
  if (forUserId !== undefined) {
    const raw = await userSettingsService.getSetting(forUserId, 'burnRepair.includedRoles')
    return Array.isArray(raw) ? (raw as string[]) : []
  }
  const defaults = await getAdminDefaults()
  const raw = defaults['burnRepair.includedRoles']
  return Array.isArray(raw) ? (raw as string[]) : []
}

/**
 * Look up which users should be included in corp-wide aggregation.
 *
 * Pass `forUserId` when calling from a per-user context (a live endpoint) to
 * honor any per-user role-list override; omit it in cron/system contexts to
 * use the corp-wide admin default.
 */
export async function resolveActiveMembers(forUserId?: number): Promise<ActiveMembersResult> {
  const includedRoles = await resolveIncludedRoles(forUserId)

  if (includedRoles.length === 0) {
    return { activeUserIds: [], staleUserCount: 0, staleUserIds: [], fioAgeMap: new Map() }
  }

  const roleRows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.roleId, includedRoles))

  const allUserIds = [...new Set(roleRows.map(r => r.userId))]
  if (allUserIds.length === 0) {
    return { activeUserIds: [], staleUserCount: 0, staleUserIds: [], fioAgeMap: new Map() }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - STALE_DATA_DAYS)

  // MIN(fio_uploaded_at) across each user's storages — their oldest FIO sync
  // signal. Users with no rows (never connected FIO) are excluded entirely.
  const ageRows = await db
    .select({
      userId: fioUserStorage.userId,
      oldest: sql<Date | null>`MIN(${fioUserStorage.fioUploadedAt})`,
    })
    .from(fioUserStorage)
    .where(inArray(fioUserStorage.userId, allUserIds))
    .groupBy(fioUserStorage.userId)

  const fioAgeMap = new Map<number, string>()
  const activeUserIds: number[] = []
  for (const r of ageRows) {
    if (r.oldest === null || r.oldest === undefined) continue
    const date = r.oldest instanceof Date ? r.oldest : new Date(r.oldest)
    fioAgeMap.set(r.userId, date.toISOString())
    if (date > cutoff) activeUserIds.push(r.userId)
  }

  const activeSet = new Set(activeUserIds)
  const staleUserIds = allUserIds.filter(id => !activeSet.has(id))
  const staleUserCount = staleUserIds.length
  return { activeUserIds, staleUserCount, staleUserIds, fioAgeMap }
}

/**
 * Build a userId → display name map for the given users.
 *
 * Prefers the FIO username (`fio.username` user setting, JSON-encoded in
 * `user_settings.value`) since PrUn usernames match it 1:1. Falls back to
 * `users.username` when the FIO setting is unset or malformed.
 */
export async function resolveDisplayUsernames(userIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (userIds.length === 0) return map

  const [loginRows, fioRows] = await Promise.all([
    db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, userIds)),
    db
      .select({ userId: userSettings.userId, value: userSettings.value })
      .from(userSettings)
      .where(
        and(inArray(userSettings.userId, userIds), eq(userSettings.settingKey, 'fio.username'))
      ),
  ])

  for (const r of loginRows) map.set(r.id, r.username)
  for (const r of fioRows) {
    try {
      const parsed = JSON.parse(r.value)
      if (typeof parsed === 'string' && parsed.length > 0) map.set(r.userId, parsed)
    } catch {
      // Malformed setting value; keep login username fallback
    }
  }
  return map
}
