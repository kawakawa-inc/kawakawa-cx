import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const { mockFindFirst, mockDelete } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockDelete: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: {
      userDiscordProfiles: {
        findFirst: mockFindFirst,
      },
    },
    delete: mockDelete,
  },
  userDiscordProfiles: {
    discordId: 'discordId',
  },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
}))

// Import after mocks
import { unlink } from './unlink.js'

function setupDiscordOnlyMock() {
  mockFindFirst.mockResolvedValueOnce({
    userId: 1,
    discordId: '123456789',
    user: {
      id: 1,
      username: 'testuser',
      displayName: 'Test User',
      isActive: true,
      passwordHash: 'discord:123456789:1234567890',
    },
  })
}

describe('unlink command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct command metadata', () => {
    expect(unlink.data).toBeDefined()
  })

  it('returns error when no profile exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction()

    await unlink.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: "You don't have a linked Kawakawa account.",
      flags: 64,
    })
  })

  it('shows confirmation buttons for Discord-only accounts and cancels', async () => {
    setupDiscordOnlyMock()

    const updateFn = vi.fn()
    const awaitComponent = vi.fn().mockResolvedValue({
      customId: 'unlink-confirm:123:no',
      user: { id: '123456789' },
      update: updateFn,
    })

    const { interaction, replyFn } = createMockInteraction()
    // fetchReply returns the message with awaitMessageComponent
    ;(interaction as Record<string, unknown>).fetchReply = vi
      .fn()
      .mockResolvedValue({ awaitMessageComponent: awaitComponent })

    await unlink.execute(interaction as never)

    // Should reply with embed AND button components
    expect(replyFn).toHaveBeenCalledWith({
      embeds: expect.any(Array),
      components: expect.any(Array),
      flags: 64,
    })

    // Should not delete the profile when cancelled
    expect(mockDelete).not.toHaveBeenCalled()
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Unlink cancelled.',
      })
    )
  })

  it('unlinks Discord-only account when confirmed via button', async () => {
    setupDiscordOnlyMock()

    const updateFn = vi.fn()
    const awaitComponent = vi.fn().mockResolvedValue({
      customId: 'unlink-confirm:123:yes',
      user: { id: '123456789' },
      update: updateFn,
    })

    const mockWhere = vi.fn().mockResolvedValue(undefined)
    mockDelete.mockReturnValue({ where: mockWhere })

    const { interaction } = createMockInteraction()
    ;(interaction as Record<string, unknown>).fetchReply = vi
      .fn()
      .mockResolvedValue({ awaitMessageComponent: awaitComponent })

    await unlink.execute(interaction as never)

    expect(mockDelete).toHaveBeenCalled()
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Successfully unlinked'),
        embeds: [],
        components: [],
      })
    )
  })

  it('shows error when DB fails during confirmed unlink', async () => {
    setupDiscordOnlyMock()

    const updateFn = vi.fn()
    const awaitComponent = vi.fn().mockResolvedValue({
      customId: 'unlink-confirm:123:yes',
      user: { id: '123456789' },
      update: updateFn,
    })

    const mockWhere = vi.fn().mockRejectedValue(new Error('DB error'))
    mockDelete.mockReturnValue({ where: mockWhere })

    const { interaction } = createMockInteraction()
    ;(interaction as Record<string, unknown>).fetchReply = vi
      .fn()
      .mockResolvedValue({ awaitMessageComponent: awaitComponent })

    await unlink.execute(interaction as never)

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('error occurred'),
      })
    )
  })

  it('successfully unlinks for account with password', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        isActive: true,
        passwordHash: '$2b$10$hashedpassword',
      },
    })

    const mockWhere = vi.fn().mockResolvedValue(undefined)
    mockDelete.mockReturnValue({ where: mockWhere })

    const { interaction, replyFn } = createMockInteraction()

    await unlink.execute(interaction as never)

    expect(mockDelete).toHaveBeenCalled()
    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Successfully unlinked'),
      flags: 64,
    })
  })

  it('handles DB error for password account unlink', async () => {
    mockFindFirst.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
      user: {
        id: 1,
        username: 'testuser',
        displayName: 'Test User',
        isActive: true,
        passwordHash: '$2b$10$hashedpassword',
      },
    })

    const mockWhere = vi.fn().mockRejectedValue(new Error('DB error'))
    mockDelete.mockReturnValue({ where: mockWhere })

    const { interaction, replyFn } = createMockInteraction()

    await unlink.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('error occurred'),
      flags: 64,
    })
  })

  it('handles confirmation timeout gracefully', async () => {
    setupDiscordOnlyMock()

    const awaitComponent = vi.fn().mockRejectedValue(new Error('Collector timed out'))

    const { interaction, editReplyFn } = createMockInteraction()
    ;(interaction as Record<string, unknown>).fetchReply = vi
      .fn()
      .mockResolvedValue({ awaitMessageComponent: awaitComponent })

    await unlink.execute(interaction as never)

    expect(mockDelete).not.toHaveBeenCalled()
    expect(editReplyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('timed out'),
      })
    )
  })
})
