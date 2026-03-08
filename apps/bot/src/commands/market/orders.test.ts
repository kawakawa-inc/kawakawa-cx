import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockResolveCommodity,
  mockResolveLocation,
  mockFormatCommodity,
  mockFormatLocation,
  mockGetDisplaySettings,
  mockGetFioUsernames,
  mockSearchCommodities,
  mockSearchLocations,
  mockSearchUsers,
  mockDbQuery,
  mockDbDelete,
  mockEnrichSellOrdersWithQuantities,
  mockFormatGroupedOrdersMulti,
  mockBuildFilterDescription,
} = vi.hoisted(() => ({
  mockResolveCommodity: vi.fn(),
  mockResolveLocation: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockGetFioUsernames: vi.fn(),
  mockSearchCommodities: vi.fn(),
  mockSearchLocations: vi.fn(),
  mockSearchUsers: vi.fn(),
  mockDbQuery: {
    sellOrders: { findMany: vi.fn() },
    buyOrders: { findMany: vi.fn() },
    users: { findFirst: vi.fn() },
    userDiscordProfiles: { findFirst: vi.fn() },
  },
  mockDbDelete: vi.fn().mockReturnValue({ where: vi.fn() }),
  mockEnrichSellOrdersWithQuantities: vi.fn(),
  mockFormatGroupedOrdersMulti: vi.fn(),
  mockBuildFilterDescription: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock the display service
vi.mock('../../services/display.js', () => ({
  resolveCommodity: mockResolveCommodity,
  resolveLocation: mockResolveLocation,
  formatCommodity: mockFormatCommodity,
  formatLocation: mockFormatLocation,
}))

// Mock user settings service
vi.mock('../../services/userSettings.js', () => ({
  getDisplaySettings: mockGetDisplaySettings,
  getFioUsernames: mockGetFioUsernames,
}))

// Mock autocomplete
vi.mock('../../autocomplete/index.js', () => ({
  searchCommodities: mockSearchCommodities,
  searchLocations: mockSearchLocations,
  searchUsers: mockSearchUsers,
}))

// Mock pagination component (still needed for other imports)
vi.mock('../../components/pagination.js', () => ({
  sendPaginatedResponse: vi.fn(),
}))

// Mock market service
vi.mock('@kawakawa/services/market', () => ({
  enrichSellOrdersWithQuantities: mockEnrichSellOrdersWithQuantities,
}))

// Mock order formatter
vi.mock('../../services/orderFormatter.js', () => ({
  formatGroupedOrdersMulti: mockFormatGroupedOrdersMulti,
  buildFilterDescription: mockBuildFilterDescription,
}))

// Mock channel config service
vi.mock('../../services/channelConfig.js', () => ({
  getChannelConfig: vi.fn().mockResolvedValue(null),
  resolveEffectiveValue: vi.fn(
    (
      commandOption: unknown,
      _channelDefault: unknown,
      _channelEnforced: boolean,
      _userDefault: unknown,
      systemDefault: unknown
    ) => commandOption ?? systemDefault
  ),
  resolveMessageVisibility: vi.fn(() => ({ visibility: 'ephemeral', isEphemeral: true })),
}))

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: mockDbQuery,
    delete: mockDbDelete,
  },
  sellOrders: {
    id: 'id',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    userId: 'userId',
    orderType: 'orderType',
  },
  buyOrders: {
    id: 'id',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    userId: 'userId',
    orderType: 'orderType',
  },
  users: { username: 'username' },
  userDiscordProfiles: { discordId: 'discordId', userId: 'userId' },
  channelConfig: {},
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
  and: vi.fn().mockImplementation((...args) => ({ and: args })),
  desc: vi.fn().mockImplementation(field => ({ desc: field })),
  inArray: vi.fn().mockImplementation((field, values) => ({ inArray: { field, values } })),
}))

// Import after mocks
import { orders } from './orders.js'

describe('orders command (strict)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDisplaySettings.mockResolvedValue({
      locationDisplayMode: 'both',
      commodityDisplayMode: 'ticker-only',
      messageVisibility: 'ephemeral',
      preferredCurrency: 'CIS',
      favoritedLocations: [],
      favoritedCommodities: [],
    })
    mockFormatCommodity.mockImplementation(ticker => ticker)
    mockFormatLocation.mockResolvedValue('Benten (BEN)')
    // Default mock for getFioUsernames - returns empty map
    mockGetFioUsernames.mockResolvedValue(new Map())
    // Default mock for enrichSellOrdersWithQuantities - returns empty map
    mockEnrichSellOrdersWithQuantities.mockResolvedValue(new Map())
    // Default mock for formatGroupedOrdersMulti - returns empty result
    mockFormatGroupedOrdersMulti.mockResolvedValue({ items: [] })
    // Default mock for buildFilterDescription - returns a simple description
    mockBuildFilterDescription.mockReturnValue('📤Sell | 👤 Internal')
    // Default mock for userDiscordProfiles - linked user with ID 10
    mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue({ userId: 10, discordId: '123' })
  })

  it('has correct command metadata', () => {
    expect(orders.data).toBeDefined()
  })

  describe('execute', () => {
    it('returns error when user is not linked', async () => {
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })

      await orders.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('link your account first'),
        flags: 64,
      })
      expect(mockDbQuery.sellOrders.findMany).not.toHaveBeenCalled()
    })

    it('returns no orders message when no filters provided and no orders exist', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })

      await orders.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('No orders found'),
        flags: 64,
      })
    })

    it('queries sell orders with commodity filter', async () => {
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { commodity: 'COF' },
      })

      await orders.execute(interaction as never)

      expect(mockResolveCommodity).toHaveBeenCalledWith('COF')
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('returns error for invalid commodity', async () => {
      mockResolveCommodity.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { commodity: 'INVALID' },
      })

      await orders.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Commodity "INVALID" not found'),
        flags: 64,
      })
    })

    it('queries orders with location filter', async () => {
      mockResolveLocation.mockResolvedValueOnce({
        naturalId: 'BEN',
        name: 'Benten',
        type: 'STATION',
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { location: 'BEN' },
      })

      await orders.execute(interaction as never)

      expect(mockResolveLocation).toHaveBeenCalledWith('BEN')
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('returns error for invalid location', async () => {
      mockResolveLocation.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { location: 'INVALID' },
      })

      await orders.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Location "INVALID" not found'),
        flags: 64,
      })
    })

    it('combines commodity and location filters', async () => {
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      mockResolveLocation.mockResolvedValueOnce({
        naturalId: 'BEN',
        name: 'Benten',
        type: 'STATION',
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { commodity: 'COF', location: 'BEN' },
      })

      await orders.execute(interaction as never)

      expect(mockResolveCommodity).toHaveBeenCalledWith('COF')
      expect(mockResolveLocation).toHaveBeenCalledWith('BEN')
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('shows all orders by default (type defaults to all)', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })

      await orders.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
      // Both sell and buy orders should be queried (default is 'all')
      expect(mockDbQuery.sellOrders.findMany).toHaveBeenCalled()
      expect(mockDbQuery.buyOrders.findMany).toHaveBeenCalled()
    })

    it('always shows current user orders (self-only command)', async () => {
      // User is linked
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        discordId: '123456789',
        userId: 42,
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          userId: 42,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'LinkedUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })

      await orders.execute(interaction as never)

      // Should show "Your Orders" with no user filter in description (always self)
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
      expect(mockBuildFilterDescription).toHaveBeenCalledWith(
        [],
        [],
        [], // No user filter - always showing own orders
        'all',
        'all',
        { visibilityEnforced: false }
      )
    })

    it('queries only sell orders when type is sell', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      // Buy orders should not be queried when type is 'sell'

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { type: 'sell' },
      })

      await orders.execute(interaction as never)

      expect(mockDbQuery.sellOrders.findMany).toHaveBeenCalled()
      expect(mockDbQuery.buyOrders.findMany).not.toHaveBeenCalled()
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('queries only buy orders when type is buy', async () => {
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          quantity: 100,
          price: 150,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      // Sell orders should not be queried when type is 'buy'

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { type: 'buy' },
      })

      await orders.execute(interaction as never)

      expect(mockDbQuery.buyOrders.findMany).toHaveBeenCalled()
      expect(mockDbQuery.sellOrders.findMany).not.toHaveBeenCalled()
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('filters by visibility when specified', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'partner',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { visibility: 'partner' },
      })

      await orders.execute(interaction as never)

      expect(mockBuildFilterDescription).toHaveBeenCalledWith([], [], [], 'all', 'partner', {
        visibilityEnforced: false,
      })
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('enriches orders with FIO usernames', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          userId: 10,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([
        {
          id: 2,
          userId: 20,
          commodityTicker: 'RAT',
          quantity: 500,
          price: 125,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'OtherUser' },
          commodity: { ticker: 'RAT', name: 'Rations' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockGetFioUsernames.mockResolvedValueOnce(
        new Map([
          [10, 'FioPlayer1'],
          [20, 'FioPlayer2'],
        ])
      )

      const { interaction } = createMockInteraction({
        stringOptions: {},
      })

      await orders.execute(interaction as never)

      // Should call getFioUsernames with all user IDs
      expect(mockGetFioUsernames).toHaveBeenCalledWith([10, 20])
    })

    it('combines multiple filters correctly', async () => {
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      mockResolveLocation.mockResolvedValueOnce({
        naturalId: 'BEN',
        name: 'Benten',
        type: 'STATION',
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'Current User' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      // Buy not queried when type is 'sell'

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {
          commodity: 'COF',
          location: 'BEN',
          type: 'sell',
          visibility: 'internal',
        },
      })

      await orders.execute(interaction as never)

      expect(mockBuildFilterDescription).toHaveBeenCalledWith(
        ['COF'],
        ['Benten (BEN)'],
        [], // No user filter - always own orders
        'sell',
        'internal',
        { visibilityEnforced: false }
      )
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('shows your orders even when filters are specified', async () => {
      // User is linked
      mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValueOnce({
        discordId: '123456789',
        userId: 42,
      })
      // Specifies a commodity filter - still shows "Your Orders" (self-only command)
      mockResolveCommodity.mockResolvedValueOnce({ ticker: 'COF', name: 'Caffeinated Beans' })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          user: { displayName: 'AnyUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { commodity: 'COF' },
      })

      await orders.execute(interaction as never)

      // Should filter by commodity but still show user's own orders
      expect(mockBuildFilterDescription).toHaveBeenCalledWith(['COF'], [], [], 'all', 'all', {
        visibilityEnforced: false,
      })
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('calls formatGroupedOrdersMulti with correct parameters', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([
        {
          id: 1,
          userId: 10,
          commodityTicker: 'COF',
          price: 100,
          currency: 'CIS',
          orderType: 'internal',
          limitMode: 'max',
          limitQuantity: 500,
          locationId: 'BEN',
          user: { displayName: 'TestUser' },
          commodity: { ticker: 'COF', name: 'Caffeinated Beans' },
          location: { naturalId: 'BEN', name: 'Benten' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])
      mockEnrichSellOrdersWithQuantities.mockResolvedValueOnce(
        new Map([[1, { available: 100, reserved: 50 }]])
      )
      mockFormatGroupedOrdersMulti.mockResolvedValueOnce({
        items: [{ name: 'Test', value: 'test value' }],
      })

      const { interaction } = createMockInteraction({
        stringOptions: {},
      })

      await orders.execute(interaction as never)

      expect(mockEnrichSellOrdersWithQuantities).toHaveBeenCalled()
      expect(mockFormatGroupedOrdersMulti).toHaveBeenCalled()
    })
  })

  describe('autocomplete', () => {
    it('returns empty when query is empty', async () => {
      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'commodity', value: '' }),
        },
        respond: mockRespond,
      }

      await orders.autocomplete?.(interaction as never)

      expect(mockRespond).toHaveBeenCalledWith([])
    })

    it('returns commodity results for commodity field', async () => {
      mockSearchCommodities.mockResolvedValueOnce([{ ticker: 'COF', name: 'Caffeinated Beans' }])

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'commodity', value: 'CO' }),
        },
        respond: mockRespond,
      }

      await orders.autocomplete?.(interaction as never)

      expect(mockSearchCommodities).toHaveBeenCalledWith('CO', 25, '123456789')
      expect(mockRespond).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'COF - Caffeinated Beans', value: 'COF' }),
      ])
    })

    it('returns location results for location field', async () => {
      mockSearchLocations.mockResolvedValueOnce([{ naturalId: 'BEN', name: 'Benten' }])

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'location', value: 'BE' }),
        },
        respond: mockRespond,
      }

      await orders.autocomplete?.(interaction as never)

      expect(mockSearchLocations).toHaveBeenCalledWith('BE', 25, '123456789')
      expect(mockRespond).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'BEN - Benten', value: 'BEN' }),
      ])
    })

    it('limits results to 25', async () => {
      mockSearchCommodities.mockResolvedValueOnce(
        Array.from({ length: 30 }, (_, i) => ({ ticker: `C${i}`, name: `Commodity ${i}` }))
      )

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'commodity', value: 'C' }),
        },
        respond: mockRespond,
      }

      await orders.autocomplete?.(interaction as never)

      expect(mockRespond).toHaveBeenCalled()
      const choices = mockRespond.mock.calls[0][0]
      expect(choices.length).toBeLessThanOrEqual(25)
    })
  })
})
