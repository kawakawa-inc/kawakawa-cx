import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const { mockFindFirstProfile, mockInsert, mockGetWebUrl } = vi.hoisted(() => ({
  mockFindFirstProfile: vi.fn(),
  mockInsert: vi.fn(),
  mockGetWebUrl: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: {
      userDiscordProfiles: {
        findFirst: mockFindFirstProfile,
      },
    },
    insert: mockInsert,
  },
  userDiscordProfiles: {
    discordId: 'discordId',
  },
  discordLinkTokens: {},
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
}))

// Mock config
vi.mock('../../config.js', () => ({
  getWebUrl: mockGetWebUrl,
}))

// Mock crypto
vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue({
      toString: () => 'test-token-12345',
    }),
  },
}))

// Import after mocks
import { link } from './link.js'

describe('link command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWebUrl.mockResolvedValue('https://example.com')
  })

  it('has correct command metadata', () => {
    expect(link.data).toBeDefined()
    expect(link.data.name).toBe('link')
    expect(link.data.description).toBe('Link your Discord to an existing Kawakawa account')
  })

  it('returns error when Discord is already linked', async () => {
    mockFindFirstProfile.mockResolvedValueOnce({
      userId: 1,
      discordId: '123456789',
    })

    const { interaction, replyFn } = createMockInteraction({})

    await link.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('already linked'),
      flags: 64, // Ephemeral
    })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('generates link token when Discord is not linked', async () => {
    mockFindFirstProfile.mockResolvedValueOnce(null)

    const mockValues = vi.fn().mockResolvedValue(undefined)
    mockInsert.mockReturnValue({ values: mockValues })

    const { interaction, replyFn } = createMockInteraction({})

    await link.execute(interaction as never)

    // Should insert a token
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'test-token-12345',
        discordId: '123456789',
        discordUsername: 'TestUser',
        discordAvatar: 'avatar123',
        used: false,
      })
    )

    // Should reply with embed and button
    expect(replyFn).toHaveBeenCalledWith({
      embeds: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            title: '🔗 Link Your Discord Account',
          }),
        }),
      ]),
      components: expect.arrayContaining([
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                label: '🔗 Link Account',
                style: 5, // ButtonStyle.Link
                url: 'https://example.com/link-discord?token=test-token-12345',
              }),
            }),
          ]),
        }),
      ]),
      flags: 64, // Ephemeral
    })
  })

  it('includes expiration time in embed', async () => {
    mockFindFirstProfile.mockResolvedValueOnce(null)

    const mockValues = vi.fn().mockResolvedValue(undefined)
    mockInsert.mockReturnValue({ values: mockValues })

    const { interaction, replyFn } = createMockInteraction({})

    await link.execute(interaction as never)

    // Check embed includes expiration field
    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: 'Expires',
                }),
              ]),
            }),
          }),
        ]),
      })
    )
  })
})
