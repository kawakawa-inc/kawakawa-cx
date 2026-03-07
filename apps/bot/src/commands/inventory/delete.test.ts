import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockRequireLinkedUser,
  mockGetDisplaySettings,
  mockGetCommandPrefix,
  mockParseTokens,
  mockFormatCommodity,
  mockFormatLocation,
  mockResolveLocation,
  mockDbQuery,
  mockDbDelete,
  mockWhere,
} = vi.hoisted(() => ({
  mockRequireLinkedUser: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockGetCommandPrefix: vi.fn(),
  mockParseTokens: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockResolveLocation: vi.fn(),
  mockDbQuery: {
    sellOrders: { findMany: vi.fn() },
    buyOrders: { findMany: vi.fn() },
  },
  mockDbDelete: vi.fn(),
  mockWhere: vi.fn().mockReturnValue(Promise.resolve(undefined)),
}))

vi.mock('discord.js', () => {
  const self = {
    setName: () => self,
    setDescription: () => self,
    setRequired: () => self,
    setAutocomplete: () => self,
    addChoices: () => self,
  }
  return {
    SlashCommandBuilder: class {
      setName() {
        return this
      }
      setDescription() {
        return this
      }
      addStringOption(fn: Function) {
        fn(self)
        return this
      }
    },
    MessageFlags: { Ephemeral: 64 },
    ActionRowBuilder: class {
      addComponents() {
        return this
      }
    },
    StringSelectMenuBuilder: class {
      setCustomId() {
        return this
      }
      setPlaceholder() {
        return this
      }
      setMinValues() {
        return this
      }
      setMaxValues() {
        return this
      }
      addOptions() {
        return this
      }
    },
    ButtonBuilder: class {
      setCustomId() {
        return this
      }
      setLabel() {
        return this
      }
      setStyle() {
        return this
      }
    },
    ButtonStyle: { Danger: 4, Secondary: 2 },
  }
})

vi.mock('@kawakawa/db', () => ({
  db: {
    query: mockDbQuery,
    delete: mockDbDelete.mockReturnValue({ where: mockWhere }),
  },
  sellOrders: {
    userId: 'userId',
    locationId: 'locationId',
    commodityTicker: 'commodityTicker',
    id: 'id',
  },
  buyOrders: {
    userId: 'userId',
    locationId: 'locationId',
    commodityTicker: 'commodityTicker',
    id: 'id',
  },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), inArray: vi.fn() }))
vi.mock('../../autocomplete/index.js', () => ({ searchLocations: vi.fn() }))
vi.mock('../../services/display.js', () => ({
  formatCommodity: mockFormatCommodity,
  formatLocation: mockFormatLocation,
  resolveLocation: mockResolveLocation,
}))
vi.mock('../../services/userSettings.js', () => ({ getDisplaySettings: mockGetDisplaySettings }))
vi.mock('../../utils/auth.js', () => ({ requireLinkedUser: mockRequireLinkedUser }))
vi.mock('@kawakawa/parser', () => ({ parseTokens: mockParseTokens }))
vi.mock('../../utils/resolvers.js', () => ({ botResolvers: {} }))
vi.mock('../../adapters/messageInteraction.js', () => ({ getCommandPrefix: mockGetCommandPrefix }))
vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { deleteCommand } from './delete.js'

function createMockInteraction(
  input = 'COF BEN',
  location: string | null = null,
  type: string | null = null
) {
  return {
    user: { id: 'discord123' },
    options: {
      getString: vi.fn((name: string) => {
        if (name === 'input') return input
        if (name === 'location') return location
        if (name === 'type') return type
        return null
      }),
    },
    reply: vi.fn(),
  } as never
}

describe('delete command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCommandPrefix.mockReturnValue('/')
    mockGetDisplaySettings.mockResolvedValue({ locationDisplayMode: 'natural-ids-only' })
    mockFormatCommodity.mockImplementation((t: string) => t)
    mockFormatLocation.mockResolvedValue('BEN')
  })

  it('returns early when user not linked', async () => {
    mockRequireLinkedUser.mockResolvedValue(null)
    const interaction = createMockInteraction()
    await deleteCommand.execute(interaction)
    expect(mockParseTokens).not.toHaveBeenCalled()
  })

  it('shows error when no tickers parsed', async () => {
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
    await deleteCommand.execute(interaction)

    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Could not find commodities'),
      })
    )
  })

  it('shows error when no location specified', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseTokens.mockResolvedValue({
      items: [{ commodity: { ticker: 'COF' } }],
      location: null,
      unresolved: [],
      actions: new Set(),
      errors: [],
      user: null,
    })

    const interaction = createMockInteraction('COF')
    await deleteCommand.execute(interaction)

    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Please specify a location'),
      })
    )
  })

  it('shows error when location override not found', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseTokens.mockResolvedValue({
      items: [{ commodity: { ticker: 'COF' } }],
      location: null,
      unresolved: [],
      actions: new Set(),
      errors: [],
      user: null,
    })
    mockResolveLocation.mockResolvedValue(null)

    const interaction = createMockInteraction('COF', 'INVALID')
    await deleteCommand.execute(interaction)

    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('not found'),
      })
    )
  })

  it('shows no matching orders message', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseTokens.mockResolvedValue({
      items: [{ commodity: { ticker: 'COF' } }],
      location: { naturalId: 'BEN', name: 'Benten' },
      unresolved: [],
      actions: new Set(),
      errors: [],
      user: null,
    })
    mockDbQuery.sellOrders.findMany.mockResolvedValue([])
    mockDbQuery.buyOrders.findMany.mockResolvedValue([])

    const interaction = createMockInteraction('COF BEN')
    await deleteCommand.execute(interaction)

    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('No matching orders'),
      })
    )
  })

  it('deletes orders directly when 5 or fewer', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseTokens.mockResolvedValue({
      items: [{ commodity: { ticker: 'COF' } }],
      location: { naturalId: 'BEN', name: 'Benten' },
      unresolved: [],
      actions: new Set(),
      errors: [],
      user: null,
    })
    mockDbQuery.sellOrders.findMany.mockResolvedValue([
      {
        id: 1,
        commodityTicker: 'COF',
        locationId: 'BEN',
        price: '50.00',
        currency: 'CIS',
        orderType: 'internal',
      },
    ])
    mockDbQuery.buyOrders.findMany.mockResolvedValue([])

    const interaction = createMockInteraction('COF BEN')
    await deleteCommand.execute(interaction)

    expect(mockDbDelete).toHaveBeenCalled()
    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Deleted 1 order'),
      })
    )
  })

  it('respects sell-only type filter', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockParseTokens.mockResolvedValue({
      items: [{ commodity: { ticker: 'COF' } }],
      location: { naturalId: 'BEN', name: 'Benten' },
      unresolved: [],
      actions: new Set(),
      errors: [],
      user: null,
    })
    mockDbQuery.sellOrders.findMany.mockResolvedValue([])
    mockDbQuery.buyOrders.findMany.mockResolvedValue([])

    const interaction = createMockInteraction('COF BEN', null, 'sell')
    await deleteCommand.execute(interaction)

    expect(mockDbQuery.sellOrders.findMany).toHaveBeenCalled()
    expect(mockDbQuery.buyOrders.findMany).not.toHaveBeenCalled()
  })
})
