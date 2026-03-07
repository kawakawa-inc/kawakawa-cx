/**
 * Tests for /reservations command (deprecated)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

vi.mock('discord.js', () => getDiscordMock())
vi.mock('@kawakawa/db', () => ({
  db: { query: {} },
}))

import { reservations } from './reservations.js'

describe('/reservations command (deprecated)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows deprecation message redirecting to invoices', async () => {
    const { interaction, replyFn } = createMockInteraction()

    await reservations.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('This command has been replaced'),
      })
    )
    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('invoices'),
      })
    )
  })

  it('does not have helpInfo (hidden from help)', () => {
    expect(reservations.helpInfo).toBeUndefined()
  })
})
