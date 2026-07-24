import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@kawakawa/db', () => ({
  db: {
    select: vi.fn(),
  },
  userRoles: { userId: 'user_id', roleId: 'role_id' },
  fioUserStorage: {
    userId: 'user_id',
    fioUploadedAt: 'fio_uploaded_at',
  },
  users: {
    id: 'id',
    inactiveUntil: 'inactive_until',
    lastActiveAt: 'last_active_at',
  },
}))

vi.mock('../user-settings/user-settings-service.js', () => ({
  getSetting: vi.fn(),
  getAdminDefaults: vi.fn(),
}))

vi.mock('../activity/activity-service.js', () => ({
  isUserActive: vi.fn(),
}))

import { db } from '@kawakawa/db'
import * as userSettingsService from '../user-settings/user-settings-service.js'
import { isUserActive } from '../activity/activity-service.js'
import { resolveActiveMembers } from './corp-members.js'

/** Build a thenable chain that resolves to `rows` regardless of which terminal method is called. */
function mockChain(rows: unknown[]): ReturnType<typeof db.select> {
  const thenable = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
    catch: (reject: (v: unknown) => void) => Promise.resolve(rows).catch(reject),
  }
  const chain: Record<string, unknown> = { ...thenable }
  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.groupBy = vi.fn().mockReturnValue(chain)
  return chain as unknown as ReturnType<typeof db.select>
}

/**
 * Queue `db.select()` responses for the two calls made in parallel after the
 * role lookup: the FIO-age query (informational only) then the users/
 * activity query (`{id, inactiveUntil, lastActiveAt}`, drives the isUserActive
 * partition below).
 */
function queueMemberQueries(roleRows: unknown[], ageRows: unknown[], activityRows: unknown[]) {
  vi.mocked(db.select)
    .mockReturnValueOnce(mockChain(roleRows))
    .mockReturnValueOnce(mockChain(ageRows))
    .mockReturnValueOnce(mockChain(activityRows))
}

describe('resolveActiveMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty when no includedRoles are configured', async () => {
    vi.mocked(userSettingsService.getSetting).mockResolvedValue([])

    const result = await resolveActiveMembers(1)
    expect(result.activeUserIds).toEqual([])
    expect(result.staleUserCount).toBe(0)
    expect(result.vacationUserIds).toEqual([])
    expect(result.fioAgeMap.size).toBe(0)
  })

  it('excludes users who are stale or on vacation per the activity gate', async () => {
    vi.mocked(userSettingsService.getSetting).mockResolvedValue(['member'])
    const now = Date.now()
    queueMemberQueries(
      [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
      [
        { userId: 1, oldest: new Date(now - 2 * 86_400_000) },
        { userId: 2, oldest: new Date(now - 10 * 86_400_000) },
        { userId: 3, oldest: new Date(now - 50 * 86_400_000) },
      ],
      [
        { userId: 1, inactiveUntil: null, lastActiveAt: new Date(now - 2 * 86_400_000) },
        { userId: 2, inactiveUntil: null, lastActiveAt: new Date(now - 10 * 86_400_000) },
        { userId: 3, inactiveUntil: null, lastActiveAt: new Date(now - 50 * 86_400_000) },
      ]
    )
    vi.mocked(isUserActive)
      .mockResolvedValueOnce({ active: true })
      .mockResolvedValueOnce({ active: true })
      .mockResolvedValueOnce({ active: false, reason: 'stale' })

    const result = await resolveActiveMembers(1)
    expect(result.activeUserIds.sort()).toEqual([1, 2])
    expect(result.staleUserCount).toBe(1)
    expect(result.staleUserIds).toEqual([3])
    expect(result.vacationUserIds).toEqual([])
    // FIO age is still tracked for all three — informational, decoupled from the gate.
    expect(result.fioAgeMap.size).toBe(3)
  })

  it('excludes users currently on vacation as a distinct bucket from stale', async () => {
    vi.mocked(userSettingsService.getSetting).mockResolvedValue(['member'])
    queueMemberQueries(
      [{ userId: 1 }, { userId: 2 }],
      [],
      [
        {
          userId: 1,
          inactiveUntil: new Date(Date.now() + 7 * 86_400_000),
          lastActiveAt: new Date(),
        },
        { userId: 2, inactiveUntil: null, lastActiveAt: new Date() },
      ]
    )
    vi.mocked(isUserActive)
      .mockResolvedValueOnce({ active: false, reason: 'vacation' })
      .mockResolvedValueOnce({ active: true })

    const result = await resolveActiveMembers(1)
    expect(result.activeUserIds).toEqual([2])
    expect(result.vacationUserIds).toEqual([1])
    expect(result.staleUserIds).toEqual([])
    expect(result.staleUserCount).toBe(0)
  })

  it('buckets no_activity users alongside stale users', async () => {
    vi.mocked(userSettingsService.getSetting).mockResolvedValue(['member'])
    queueMemberQueries(
      [{ userId: 1 }],
      [],
      [{ userId: 1, inactiveUntil: null, lastActiveAt: null }]
    )
    vi.mocked(isUserActive).mockResolvedValueOnce({ active: false, reason: 'no_activity' })

    const result = await resolveActiveMembers(1)
    expect(result.activeUserIds).toEqual([])
    expect(result.staleUserIds).toEqual([1])
    expect(result.staleUserCount).toBe(1)
  })

  it('reads from admin defaults when called without a requesting user', async () => {
    vi.mocked(userSettingsService.getAdminDefaults).mockResolvedValue({
      'burnRepair.includedRoles': ['member'],
    })
    queueMemberQueries(
      [{ userId: 1 }],
      [{ userId: 1, oldest: new Date() }],
      [{ userId: 1, inactiveUntil: null, lastActiveAt: new Date() }]
    )
    vi.mocked(isUserActive).mockResolvedValueOnce({ active: true })

    const result = await resolveActiveMembers()
    expect(result.activeUserIds).toEqual([1])
    expect(userSettingsService.getAdminDefaults).toHaveBeenCalled()
    expect(userSettingsService.getSetting).not.toHaveBeenCalled()
  })
})
