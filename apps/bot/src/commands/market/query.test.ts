import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockResolveCommodity,
  mockFormatCommodity,
  mockFormatCommodityWithMode,
  mockFormatLocation,
  mockGetDisplaySettings,
  mockDbQuery,
  mockSendPaginatedResponseWithExtraButtons,
  mockEnrichSellOrdersWithQuantities,
  mockFormatGroupedOrdersMulti,
  mockBuildFilterDescription,
  mockParseTokens,
} = vi.hoisted(() => ({
  mockResolveCommodity: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockFormatCommodityWithMode: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockDbQuery: {
    sellOrders: { findMany: vi.fn() },
    buyOrders: { findMany: vi.fn() },
    fioLocations: { findMany: vi.fn() },
  },
  mockSendPaginatedResponseWithExtraButtons: vi.fn(),
  mockEnrichSellOrdersWithQuantities: vi.fn(),
  mockFormatGroupedOrdersMulti: vi.fn(),
  mockBuildFilterDescription: vi.fn(),
  mockParseTokens: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock the display service
vi.mock('../../services/display.js', () => ({
  resolveCommodity: mockResolveCommodity,
  formatCommodity: mockFormatCommodity,
  formatCommodityWithMode: mockFormatCommodityWithMode,
  formatLocation: mockFormatLocation,
}))

// Mock user settings service
vi.mock('../../services/userSettings.js', () => ({
  getDisplaySettings: mockGetDisplaySettings,
}))

// Mock pagination component
vi.mock('../../components/pagination.js', () => ({
  sendPaginatedResponseWithExtraButtons: mockSendPaginatedResponseWithExtraButtons,
}))

// Mock the parser package
vi.mock('@kawakawa/parser', () => ({
  parseTokens: mockParseTokens,
}))

// Mock the XIT parser
vi.mock('@kawakawa/parser/xit', () => ({
  parseXitJson: vi.fn().mockReturnValue({ valid: false }),
}))

// Mock the bot resolvers
vi.mock('../../utils/resolvers.js', () => ({
  botResolvers: {},
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
  },
  sellOrders: {
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    userId: 'userId',
    orderType: 'orderType',
    priceListCode: 'priceListCode',
  },
  buyOrders: {
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    userId: 'userId',
    orderType: 'orderType',
    priceListCode: 'priceListCode',
  },
  shoppingLists: {},
  userDiscordProfiles: { discordId: 'discordId' },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
  and: vi.fn().mockImplementation((...args) => ({ and: args })),
  desc: vi.fn().mockImplementation(field => ({ desc: field })),
  inArray: vi.fn().mockImplementation((field, values) => ({ field, values, op: 'inArray' })),
  or: vi.fn().mockImplementation((...args) => ({ or: args })),
  isNull: vi.fn().mockImplementation(field => ({ isNull: field })),
}))

// Mock auth utils
vi.mock('../../utils/auth.js', () => ({
  UNLINKED_ACCOUNT_MESSAGE: 'You need to link your account.',
}))

// Mock modals
vi.mock('../../utils/modals.js', () => ({
  createSingleInputModal: vi.fn(),
}))

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// Import after mocks
import { query } from './query.js'

describe('query command', () => {
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
    mockFormatCommodityWithMode.mockImplementation(ticker => ticker)
    mockFormatLocation.mockResolvedValue('Benten (BEN)')
    // Default mock for enrichSellOrdersWithQuantities - returns empty map
    mockEnrichSellOrdersWithQuantities.mockResolvedValue(new Map())
    // Default mock for formatGroupedOrdersMulti - returns empty items and no missing materials
    mockFormatGroupedOrdersMulti.mockResolvedValue({ items: [], missingXitMaterials: [] })
    // Default mock for buildFilterDescription - returns a simple description
    mockBuildFilterDescription.mockReturnValue('📤Sell | 👤 Internal')
    // Default mock for parseTokens - returns empty result
    mockParseTokens.mockResolvedValue({
      items: [],
      location: null,
      user: null,
      xit: null,
      actions: new Set(),
      limit: null,
      unresolved: [],
      errors: [],
    })
    // Default mock for fioLocations (used by parseXitOrigin)
    mockDbQuery.fioLocations.findMany.mockResolvedValue([])
  })

  it('has correct command metadata', () => {
    expect(query.data).toBeDefined()
  })

  describe('execute', () => {
    it('returns no orders message when no orders found', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])

      const { interaction, replyFn } = createMockInteraction()

      await query.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('No orders found'),
        flags: 64, // Ephemeral
      })
    })

    it('queries sell orders with commodity filter', async () => {
      // Mock parseTokens to return a parsed commodity
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: null }],
        location: null,
        user: null,
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: [],
        errors: [],
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

      const { interaction } = createMockInteraction({
        stringOptions: { query: 'COF' },
      })

      await query.execute(interaction as never)

      expect(mockParseTokens).toHaveBeenCalledWith('COF', expect.anything())
      expect(mockSendPaginatedResponseWithExtraButtons).toHaveBeenCalled()
    })

    it('parses multiple tokens with commodity and location', async () => {
      // Mock parseTokens to return a commodity and location
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: null }],
        location: { naturalId: 'BEN', name: 'Benten', type: 'station' as const },
        user: null,
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: [],
        errors: [],
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

      const { interaction } = createMockInteraction({
        stringOptions: { query: 'COF BEN' },
      })

      await query.execute(interaction as never)

      expect(mockParseTokens).toHaveBeenCalledWith('COF BEN', expect.anything())
      expect(mockSendPaginatedResponseWithExtraButtons).toHaveBeenCalled()
    })

    it('returns error when query matches nothing', async () => {
      // Mock parseTokens to return unresolved tokens
      mockParseTokens.mockResolvedValueOnce({
        items: [],
        location: null,
        user: null,
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: ['unknownquery'],
        errors: [],
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { query: 'unknownquery' },
      })

      await query.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Could not resolve'),
        flags: 64, // Ephemeral
      })
    })

    it('shows sell orders by default (type defaults to sell)', async () => {
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: null }],
        location: null,
        user: null,
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: [],
        errors: [],
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

      // Mock formatGroupedOrdersMulti to return a single grouped item
      mockFormatGroupedOrdersMulti.mockResolvedValueOnce({
        items: [
          { name: 'Benten (BEN)', value: '📤 0x COF from TestUser @ **100** CIS', inline: false },
        ],
        missingXitMaterials: [],
      })

      const { interaction } = createMockInteraction({
        stringOptions: { query: 'COF' },
      })

      await query.execute(interaction as never)

      expect(mockSendPaginatedResponseWithExtraButtons).toHaveBeenCalled()
      // Verify formatGroupedOrdersMulti was called with sell orders only
      expect(mockFormatGroupedOrdersMulti).toHaveBeenCalledWith(
        expect.any(Array), // sellOrders
        [], // buyOrders should be empty since type defaults to 'sell'
        expect.any(Map),
        expect.any(Object),
        expect.any(String),
        'sell', // orderType defaults to 'sell'
        'internal', // visibility defaults to 'internal'
        undefined // xitQuantities - not used in this test
      )
      // buyOrders should not have been queried
      expect(mockDbQuery.buyOrders.findMany).not.toHaveBeenCalled()
    })

    it('parses quantities and stores them for list creation', async () => {
      mockParseTokens.mockResolvedValueOnce({
        items: [
          { commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: 100 },
          { commodity: { ticker: 'RAT', name: 'Rations' }, quantity: 200 },
        ],
        location: null,
        user: null,
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: [],
        errors: [],
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

      mockFormatGroupedOrdersMulti.mockResolvedValueOnce({
        items: [{ name: 'Benten (BEN)', value: 'Orders...', inline: false }],
        missingXitMaterials: [],
      })

      const { interaction } = createMockInteraction({
        stringOptions: { query: '100 COF 200 RAT' },
      })

      await query.execute(interaction as never)

      // Verify formatGroupedOrdersMulti was called with xitQuantities
      expect(mockFormatGroupedOrdersMulti).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        expect.any(Map),
        expect.any(Object),
        expect.any(String),
        'sell',
        'internal',
        { COF: 100, RAT: 200 } // xitQuantities should be set
      )

      // Verify extra buttons are passed (for "Save as List")
      expect(mockSendPaginatedResponseWithExtraButtons).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          extraButtons: expect.arrayContaining([
            expect.objectContaining({
              id: 'create-list',
              label: 'Save as List',
            }),
          ]),
        })
      )
    })
  })
})
