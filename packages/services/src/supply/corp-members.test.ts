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
}))

vi.mock('../user-settings/user-settings-service.js', () => ({
  getSetting: vi.fn(),
  getAdminDefaults: vi.fn(),
}))

import { db } from '@kawakawa/db'
import * as userSettingsService from '../user-settings/user-settings-service.js'
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

describe('resolveActiveMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty when no includedRoles are configured', async () => {
    vi.mocked(userSettingsService.getSetting).mockResolvedValue([])

    const result = await resolveActiveMembers(1)
    expect(result.activeUserIds).toEqual([])
    expect(result.staleUserCount).toBe(0)
    expect(result.fioAgeMap.size).toBe(0)
  })

  it('excludes users whose oldest FIO upload is past the stale cutoff', async () => {
    vi.mocked(userSettingsService.getSetting).mockResolvedValue(['member'])
    const now = Date.now()
    vi.mocked(db.select)
      .mockReturnValueOnce(mockChain([{ userId: 1 }, { userId: 2 }, { userId: 3 }]))
      .mockReturnValueOnce(
        mockChain([
          { userId: 1, oldest: new Date(now - 2 * 86_400_000) }, // fresh
          { userId: 2, oldest: new Date(now - 10 * 86_400_000) }, // fresh
          { userId: 3, oldest: new Date(now - 50 * 86_400_000) }, // stale (>30d)
        ])
      )

    const result = await resolveActiveMembers(1)
    expect(result.activeUserIds.sort()).toEqual([1, 2])
    expect(result.staleUserCount).toBe(1)
    expect(result.fioAgeMap.size).toBe(3)
  })

  it('excludes users who have never uploaded to FIO', async () => {
    vi.mocked(userSettingsService.getSetting).mockResolvedValue(['member'])
    vi.mocked(db.select)
      .mockReturnValueOnce(mockChain([{ userId: 1 }, { userId: 2 }]))
      // Only user 1 has an upload row; user 2 is silently absent.
      .mockReturnValueOnce(mockChain([{ userId: 1, oldest: new Date() }]))

    const result = await resolveActiveMembers(1)
    expect(result.activeUserIds).toEqual([1])
    expect(result.staleUserCount).toBe(1)
  })

  it('reads from admin defaults when called without a requesting user', async () => {
    vi.mocked(userSettingsService.getAdminDefaults).mockResolvedValue({
      'burnRepair.includedRoles': ['member'],
    })
    vi.mocked(db.select)
      .mockReturnValueOnce(mockChain([{ userId: 1 }]))
      .mockReturnValueOnce(mockChain([{ userId: 1, oldest: new Date() }]))

    const result = await resolveActiveMembers()
    expect(result.activeUserIds).toEqual([1])
    expect(userSettingsService.getAdminDefaults).toHaveBeenCalled()
    expect(userSettingsService.getSetting).not.toHaveBeenCalled()
  })
})
