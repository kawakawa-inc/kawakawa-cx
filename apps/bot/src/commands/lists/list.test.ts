import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockRequireLinkedUser,
  mockGetCommandPrefix,
  mockParseTokens,
  mockParseXitJson,
  mockFormatCommodity,
  mockDbInsert,
  mockReturning,
  _mockValues,
} = vi.hoisted(() => {
  const mockReturning = vi.fn()
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
  return {
    mockRequireLinkedUser: vi.fn(),
    mockGetCommandPrefix: vi.fn(),
    mockParseTokens: vi.fn(),
    mockParseXitJson: vi.fn(),
    mockFormatCommodity: vi.fn(),
    mockDbInsert: vi.fn().mockReturnValue({ values: mockValues }),
    mockReturning,
    _mockValues: mockValues,
  }
})

vi.mock('discord.js', () => ({
  SlashCommandBuilder: class {
    setName() {
      return this
    }
    setDescription() {
      return this
    }
    addStringOption(fn: (opt: unknown) => unknown) {
      fn({ setName: () => ({ setDescription: () => ({ setRequired: () => ({}) }) }) })
      return this
    }
  },
  MessageFlags: { Ephemeral: 64 },
}))

vi.mock('@kawakawa/db', () => ({
  db: {
    insert: mockDbInsert,
  },
  shoppingLists: {},
}))
vi.mock('@kawakawa/parser/xit', () => ({ parseXitJson: mockParseXitJson }))
vi.mock('@kawakawa/parser', () => ({ parseTokens: mockParseTokens }))
vi.mock('../../utils/resolvers.js', () => ({ botResolvers: {} }))
vi.mock('../../utils/auth.js', () => ({ requireLinkedUser: mockRequireLinkedUser }))
vi.mock('../../services/display.js', () => ({ formatCommodity: mockFormatCommodity }))
vi.mock('../../adapters/messageInteraction.js', () => ({ getCommandPrefix: mockGetCommandPrefix }))
vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { list } from './list.js'

function createMockInteraction(input = '100 COF', name: string | null = null) {
  return {
    user: { id: 'discord123' },
    options: {
      getString: vi.fn((n: string) => {
        if (n === 'input') return input
        if (n === 'name') return name
        return null
      }),
    },
    reply: vi.fn(),
  } as never
}

describe('list command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCommandPrefix.mockReturnValue('/')
    mockFormatCommodity.mockImplementation((t: string) => t)
  })

  it('returns early when user not linked', async () => {
    mockRequireLinkedUser.mockResolvedValue(null)
    const interaction = createMockInteraction()
    await list.execute(interaction)
    expect(mockParseTokens).not.toHaveBeenCalled()
  })

  it('shows error for invalid XIT JSON', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseXitJson.mockReturnValue({ valid: false, error: 'Bad JSON' })

    const interaction = createMockInteraction('{"invalid": true}')
    await list.execute(interaction)

    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Invalid XIT JSON'),
      })
    )
  })

  it('creates list from valid XIT JSON', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseXitJson.mockReturnValue({
      valid: true,
      materials: [
        { ticker: 'COF', amount: 100 },
        { ticker: 'RAT', amount: 50 },
      ],
      name: 'Base Supply',
    })
    mockReturning.mockResolvedValue([{ id: 1 }])

    const interaction = createMockInteraction('{"groups":[]}')
    await list.execute(interaction)

    expect(mockDbInsert).toHaveBeenCalled()
    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Base Supply'),
      })
    )
  })

  it('shows error when commodity has no quantity', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseTokens.mockResolvedValue({
      items: [{ commodity: { ticker: 'COF' }, quantity: null }],
      location: null,
      unresolved: [],
      actions: new Set(),
      errors: [],
      user: null,
    })

    const interaction = createMockInteraction('COF')
    await list.execute(interaction)

    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("doesn't have a quantity"),
      })
    )
  })

  it('shows error when all tokens unresolved', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseTokens.mockResolvedValue({
      items: [],
      location: null,
      unresolved: ['XYZ'],
      actions: new Set(),
      errors: [],
      user: null,
    })

    const interaction = createMockInteraction('XYZ')
    await list.execute(interaction)

    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Could not resolve'),
      })
    )
  })

  it('creates list from parsed tokens', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseTokens.mockResolvedValue({
      items: [
        { commodity: { ticker: 'COF' }, quantity: 100 },
        { commodity: { ticker: 'RAT' }, quantity: 50 },
      ],
      location: null,
      unresolved: [],
      actions: new Set(),
      errors: [],
      user: null,
    })
    mockReturning.mockResolvedValue([{ id: 1 }])

    const interaction = createMockInteraction('100 COF 50 RAT', 'My List')
    await list.execute(interaction)

    expect(mockDbInsert).toHaveBeenCalled()
    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('My List'),
      })
    )
  })

  it('handles DB error gracefully', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseTokens.mockResolvedValue({
      items: [{ commodity: { ticker: 'COF' }, quantity: 100 }],
      location: null,
      unresolved: [],
      actions: new Set(),
      errors: [],
      user: null,
    })
    mockReturning.mockRejectedValue(new Error('DB error'))

    const interaction = createMockInteraction('100 COF')
    await list.execute(interaction)

    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Failed to create list'),
      })
    )
  })
})
