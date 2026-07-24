/**
 * Resolve the set of users whose data contributes to corp-wide burn/repair
 * views and snapshots.
 *
 * "Active members" = users who hold one of the configured corp-member roles
 * AND are considered active by the shared activity system (`isUserActive` —
 * not on vacation, and recently active per `lastActiveAt`). This mirrors the
 * same activity gate `activeUserCondition()` applies to the Market, so a
 * member excluded there for being on vacation or generally inactive is
 * excluded here too. The filter was previously a private method on
 * BurnRepairController; it's lifted here so the daily snapshot cron (which
 * has no requesting-user context) can use the same resolution rules the live
 * corp endpoint uses.
 */

import { db, fioUserStorage, userRoles, users, userSettings } from '@kawakawa/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getAdminDefaults } from '../user-settings/user-settings-service.js'
import * as userSettingsService from '../user-settings/user-settings-service.js'
import { isUserActive } from '../activity/activity-service.js'

export interface ActiveMembersResult {
  /** Users whose data should be included in corp views/snapshots right now. */
  activeUserIds: number[]
  /** Members excluded because they're generally inactive (stale or never active). */
  staleUserCount: number
  /** Stale member user IDs in role order — surfaces who's behind the count. */
  staleUserIds: number[]
  /** Members excluded because they're currently in vacation mode. */
  vacationUserIds: number[]
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
  const empty: ActiveMembersResult = {
    activeUserIds: [],
    staleUserCount: 0,
    staleUserIds: [],
    vacationUserIds: [],
    fioAgeMap: new Map(),
  }

  const includedRoles = await resolveIncludedRoles(forUserId)
  if (includedRoles.length === 0) return empty

  const roleRows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(inArray(userRoles.roleId, includedRoles))

  const allUserIds = [...new Set(roleRows.map(r => r.userId))]
  if (allUserIds.length === 0) return empty

  // MIN(fio_uploaded_at) across each user's storages — their oldest FIO sync
  // signal. Purely informational now (surfaced as `fioDataAge` on per-user
  // rows and the excluded-members chip); it no longer drives the active/
  // inactive decision, which comes from the shared activity system below.
  const [ageRows, activityRows] = await Promise.all([
    db
      .select({
        userId: fioUserStorage.userId,
        oldest: sql<Date | null>`MIN(${fioUserStorage.fioUploadedAt})`,
      })
      .from(fioUserStorage)
      .where(inArray(fioUserStorage.userId, allUserIds))
      .groupBy(fioUserStorage.userId),
    db
      .select({
        userId: users.id,
        inactiveUntil: users.inactiveUntil,
        lastActiveAt: users.lastActiveAt,
      })
      .from(users)
      .where(inArray(users.id, allUserIds)),
  ])

  const fioAgeMap = new Map<number, string>()
  for (const r of ageRows) {
    if (r.oldest === null || r.oldest === undefined) continue
    const date = r.oldest instanceof Date ? r.oldest : new Date(r.oldest)
    fioAgeMap.set(r.userId, date.toISOString())
  }

  // Same activity gate the Market applies via `activeUserCondition()`: not
  // currently on vacation, and recently active per `lastActiveAt`. Vacation
  // and general staleness are surfaced as distinct exclusion reasons so the
  // UI can explain *why* a member isn't counted.
  const activeUserIds: number[] = []
  const staleUserIds: number[] = []
  const vacationUserIds: number[] = []
  for (const row of activityRows) {
    const status = await isUserActive({
      inactiveUntil: row.inactiveUntil,
      lastActiveAt: row.lastActiveAt,
    })
    if (status.active) {
      activeUserIds.push(row.userId)
    } else if (status.reason === 'vacation') {
      vacationUserIds.push(row.userId)
    } else {
      staleUserIds.push(row.userId)
    }
  }

  return {
    activeUserIds,
    staleUserCount: staleUserIds.length,
    staleUserIds,
    vacationUserIds,
    fioAgeMap,
  }
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
