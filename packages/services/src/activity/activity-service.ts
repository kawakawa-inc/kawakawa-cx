import { getAdminDefaults } from '../user-settings/user-settings-service.js'
import { getSettingDefault } from '@kawakawa/types/settings'

export interface ActivityStatus {
  active: boolean
  reason?: 'vacation' | 'stale' | 'no_activity'
}

/**
 * Determine if a user is considered active based on:
 * 1. Vacation mode (inactive_until in the future)
 * 2. Last activity timestamp vs configured threshold
 *
 * Reads the threshold from admin-configured Global Defaults
 * (activity.inactiveDays), falling back to the code default (30 days).
 */
export async function isUserActive(user: {
  inactiveUntil: Date | null
  lastActiveAt: Date | null
}): Promise<ActivityStatus> {
  // Check vacation mode first
  if (user.inactiveUntil && user.inactiveUntil > new Date()) {
    return { active: false, reason: 'vacation' }
  }

  // Get the inactivity threshold from admin defaults, falling back to code default
  const adminDefaults = await getAdminDefaults()
  const inactiveDays =
    (typeof adminDefaults['activity.inactiveDays'] === 'number'
      ? adminDefaults['activity.inactiveDays']
      : null) ?? (getSettingDefault('activity.inactiveDays') as number)

  // No activity recorded at all
  if (!user.lastActiveAt) {
    return { active: false, reason: 'no_activity' }
  }

  // Check if last activity is older than threshold
  const thresholdMs = inactiveDays * 24 * 60 * 60 * 1000
  const ageMs = Date.now() - user.lastActiveAt.getTime()
  if (ageMs > thresholdMs) {
    return { active: false, reason: 'stale' }
  }

  return { active: true }
}
