import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isUserActive } from './activity-service.js'

vi.mock('../user-settings/user-settings-service.js', () => ({
  getAdminDefaults: vi.fn(),
}))

import { getAdminDefaults } from '../user-settings/user-settings-service.js'

const mockGetAdminDefaults = vi.mocked(getAdminDefaults)

describe('isUserActive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no admin override, use code default (30 days)
    mockGetAdminDefaults.mockResolvedValue({})
  })

  it('returns inactive with vacation reason when inactive_until is in the future', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    const result = await isUserActive({
      inactiveUntil: futureDate,
      lastActiveAt: new Date(),
    })

    expect(result).toEqual({ active: false, reason: 'vacation' })
  })

  it('returns active when inactive_until is in the past', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
    const result = await isUserActive({
      inactiveUntil: pastDate,
      lastActiveAt: new Date(),
    })

    expect(result).toEqual({ active: true })
  })

  it('returns inactive with no_activity reason when last_active_at is null', async () => {
    const result = await isUserActive({
      inactiveUntil: null,
      lastActiveAt: null,
    })

    expect(result).toEqual({ active: false, reason: 'no_activity' })
  })

  it('returns inactive with stale reason when last_active_at exceeds threshold', async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) // 31 days ago
    const result = await isUserActive({
      inactiveUntil: null,
      lastActiveAt: oldDate,
    })

    expect(result).toEqual({ active: false, reason: 'stale' })
  })

  it('returns active when last_active_at is within threshold', async () => {
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
    const result = await isUserActive({
      inactiveUntil: null,
      lastActiveAt: recentDate,
    })

    expect(result).toEqual({ active: true })
  })

  it('uses admin-configured threshold over code default', async () => {
    mockGetAdminDefaults.mockResolvedValue({ 'activity.inactiveDays': 7 })

    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
    const result = await isUserActive({
      inactiveUntil: null,
      lastActiveAt: oldDate,
    })

    expect(result).toEqual({ active: false, reason: 'stale' })
  })

  it('returns active when within admin-configured threshold', async () => {
    mockGetAdminDefaults.mockResolvedValue({ 'activity.inactiveDays': 7 })

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
    const result = await isUserActive({
      inactiveUntil: null,
      lastActiveAt: recentDate,
    })

    expect(result).toEqual({ active: true })
  })

  it('vacation takes priority over stale activity', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
    const result = await isUserActive({
      inactiveUntil: futureDate,
      lastActiveAt: oldDate,
    })

    expect(result).toEqual({ active: false, reason: 'vacation' })
  })

  it('handles exactly at threshold boundary as active', async () => {
    // Exactly 30 days ago (code default)
    const boundaryDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await isUserActive({
      inactiveUntil: null,
      lastActiveAt: boundaryDate,
    })

    // ageMs == thresholdMs should be active (> is strict)
    expect(result).toEqual({ active: true })
  })
})
