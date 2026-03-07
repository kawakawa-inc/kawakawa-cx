import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockRequireLinkedUser,
  mockResolveLocation,
  mockGetMarketSettings,
  mockGetDisplaySettings,
  mockGetChannelConfig,
  mockResolveEffectiveValue,
  mockParseTokens,
  mockCalculateEffectivePriceWithFallback,
  mockSearchLocations,
  mockDbQuery,
  mockBuildOrderConfirmationEmbed,
  mockBuildOrderConfirmationButtons,
  mockBuildIncompleteInputEmbed,
  mockBuildUseDialogButtons,
} = vi.hoisted(() => ({
  mockRequireLinkedUser: vi.fn(),
  mockResolveLocation: vi.fn(),
  mockGetMarketSettings: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockGetChannelConfig: vi.fn(),
  mockResolveEffectiveValue: vi.fn(),
  mockParseTokens: vi.fn(),
  mockCalculateEffectivePriceWithFallback: vi.fn(),
  mockSearchLocations: vi.fn(),
  mockDbQuery: {
    buyOrders: { findMany: vi.fn() },
    sellOrders: { findMany: vi.fn() },
    priceLists: { findFirst: vi.fn() },
  },
  mockBuildOrderConfirmationEmbed: vi.fn(),
  mockBuildOrderConfirmationButtons: vi.fn(),
  mockBuildIncompleteInputEmbed: vi.fn(),
  mockBuildUseDialogButtons: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock auth
vi.mock('../../utils/auth.js', () => ({
  requireLinkedUser: mockRequireLinkedUser,
}))

// Mock display service
vi.mock('../../services/display.js', () => ({
  resolveLocation: mockResolveLocation,
}))

// Mock user settings
vi.mock('../../services/userSettings.js', () => ({
  getMarketSettings: mockGetMarketSettings,
  getDisplaySettings: mockGetDisplaySettings,
}))

// Mock channel config
vi.mock('../../services/channelConfig.js', () => ({
  getChannelConfig: mockGetChannelConfig,
  resolveEffectiveValue: mockResolveEffectiveValue,
}))

// Mock parser
vi.mock('@kawakawa/parser', () => ({
  parseTokens: mockParseTokens,
}))

// Mock resolvers
vi.mock('../../utils/resolvers.js', () => ({
  botResolvers: {},
}))

// Mock market service
vi.mock('@kawakawa/services/market', () => ({
  calculateEffectivePriceWithFallback: mockCalculateEffectivePriceWithFallback,
}))

// Mock autocomplete
vi.mock('../../autocomplete/index.js', () => ({
  searchLocations: mockSearchLocations,
}))

// Mock validation
vi.mock('../../utils/validation.js', () => ({
  isValidCurrency: vi.fn().mockReturnValue(true),
  VALID_CURRENCIES: ['CIS', 'ICA', 'AIC', 'NCC'],
}))

// Mock order confirmation utilities
vi.mock('../../utils/orderConfirmation.js', () => ({
  buildOrderConfirmationEmbed: mockBuildOrderConfirmationEmbed,
  buildOrderConfirmationButtons: mockBuildOrderConfirmationButtons,
  buildOrderCreatedTips: vi.fn().mockReturnValue('Tips'),
  buildIncompleteInputEmbed: mockBuildIncompleteInputEmbed,
  buildUseDialogButtons: mockBuildUseDialogButtons,
}))

// Mock interactions constants
vi.mock('../../utils/interactions.js', () => ({
  COMPONENT_TIMEOUT: 300000,
  MODAL_TIMEOUT: 300000,
}))

// Mock modals
vi.mock('../../utils/modals.js', () => ({
  createOrderEditModal: vi.fn(),
  createNewOrderModal: vi.fn(),
}))

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock message interaction adapter
vi.mock('../../adapters/messageInteraction.js', () => ({
  getCommandPrefix: vi.fn().mockReturnValue('/'),
  isMessageInteractionAdapter: vi.fn().mockReturnValue(false),
}))

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: mockDbQuery,
  },
  buyOrders: {
    userId: 'userId',
    locationId: 'locationId',
    commodityTicker: 'commodityTicker',
    orderType: 'orderType',
    currency: 'currency',
  },
  sellOrders: {
    userId: 'userId',
    locationId: 'locationId',
    commodityTicker: 'commodityTicker',
    orderType: 'orderType',
    currency: 'currency',
  },
  priceLists: { code: 'code' },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
  and: vi.fn().mockImplementation((...args) => ({ and: args })),
}))

// Import after mocks
import { order } from './order.js'

/**
 * Create a mock interaction with subcommand support and integer/number options.
 */
function createOrderInteraction(opts: {
  subcommand: 'buy' | 'sell'
  stringOptions?: Record<string, string | null>
  integerOptions?: Record<string, number | null>
  numberOptions?: Record<string, number | null>
}) {
  const { subcommand, stringOptions = {}, integerOptions = {}, numberOptions = {} } = opts
  const { interaction, replyFn, editReplyFn } = createMockInteraction({ stringOptions })

  // Add subcommand support
  ;(interaction.options as Record<string, unknown>).getSubcommand = vi.fn().mockReturnValue(subcommand)
  // Add getInteger support
  ;(interaction.options as Record<string, unknown>).getInteger = vi
    .fn()
    .mockImplementation((name: string) => integerOptions[name] ?? null)
  // Add getNumber support
  ;(interaction.options as Record<string, unknown>).getNumber = vi
    .fn()
    .mockImplementation((name: string) => numberOptions[name] ?? null)
  // Add channelId
  ;(interaction as Record<string, unknown>).channelId = 'test-channel-id'

  return { interaction, replyFn, editReplyFn }
}

describe('order command', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock setups
    mockGetMarketSettings.mockResolvedValue({
      preferredCurrency: 'CIS',
      defaultPriceList: null,
    })
    mockGetDisplaySettings.mockResolvedValue({
      locationDisplayMode: 'both',
      commodityDisplayMode: 'ticker-only',
      messageVisibility: 'ephemeral',
      preferredCurrency: 'CIS',
      favoritedLocations: [],
      favoritedCommodities: [],
    })
    mockGetChannelConfig.mockResolvedValue(null)
    mockResolveEffectiveValue.mockImplementation(
      (commandOption: unknown, _channelDefault: unknown, _enforced: boolean, userDefault: unknown, systemDefault: unknown) =>
        commandOption ?? userDefault ?? systemDefault
    )
    mockBuildOrderConfirmationEmbed.mockResolvedValue({ data: { title: 'Confirm' } })
    mockBuildOrderConfirmationButtons.mockReturnValue({})
    mockBuildIncompleteInputEmbed.mockReturnValue({ data: { title: 'Incomplete' } })
    mockBuildUseDialogButtons.mockReturnValue({})
  })

  it('has correct command metadata', () => {
    expect(order.data).toBeDefined()
  })

  describe('execute', () => {
    it('returns early when user is not linked', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: { input: 'COF BEN 500' },
      })

      await order.execute(interaction as never)

      expect(mockRequireLinkedUser).toHaveBeenCalled()
      // Should not proceed to parsing
      expect(mockParseTokens).not.toHaveBeenCalled()
    })

    it('shows incomplete input when input is empty', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: {},
      })

      await order.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.anything(),
          flags: 64,
        })
      )
      expect(mockBuildIncompleteInputEmbed).toHaveBeenCalled()
    })

    it('validates location override and shows error for invalid location', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: 500 }],
        location: null,
        errors: [],
      })
      mockResolveLocation.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: { input: 'COF 500', location: 'INVALID' },
      })

      await order.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Location "INVALID" not found'),
        flags: 64,
      })
    })

    it('shows incomplete input when commodity is missing from parsed input', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [],
        location: { naturalId: 'BEN', name: 'Benten' },
        errors: [],
      })

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: { input: 'BEN' },
      })

      await order.execute(interaction as never)

      // Should show incomplete input embed because no commodity was parsed
      expect(mockBuildIncompleteInputEmbed).toHaveBeenCalled()
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          flags: 64,
        })
      )
    })

    it('shows incomplete input when location is missing', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: 500 }],
        location: null,
        errors: [],
      })

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'buy',
        stringOptions: { input: 'COF 500' },
      })

      await order.execute(interaction as never)

      expect(mockBuildIncompleteInputEmbed).toHaveBeenCalled()
      const call = mockBuildIncompleteInputEmbed.mock.calls[0][0]
      expect(call.missingFields).toEqual(expect.arrayContaining([expect.stringContaining('Location')]))
    })

    it('shows incomplete input when quantity is missing for buy orders', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: null }],
        location: { naturalId: 'BEN', name: 'Benten' },
        errors: [],
      })

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'buy',
        stringOptions: { input: 'COF BEN' },
      })

      await order.execute(interaction as never)

      expect(mockBuildIncompleteInputEmbed).toHaveBeenCalled()
      const call = mockBuildIncompleteInputEmbed.mock.calls[0][0]
      expect(call.missingFields).toEqual(expect.arrayContaining([expect.stringContaining('Quantity')]))
    })

    it('creates sell order with confirmation flow when all inputs provided', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: 500 }],
        location: { naturalId: 'BEN', name: 'Benten' },
        errors: [],
      })
      mockResolveEffectiveValue
        .mockReturnValueOnce('CIS') // currency
        .mockReturnValueOnce('internal') // visibility
        .mockReturnValueOnce('KAWA') // price list
      mockDbQuery.priceLists.findFirst = vi.fn().mockResolvedValueOnce({ code: 'KAWA', name: 'KAWA Prices' })
      mockCalculateEffectivePriceWithFallback.mockResolvedValueOnce({
        finalPrice: 150,
        currency: 'CIS',
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])
      mockResolveLocation.mockResolvedValueOnce({ naturalId: 'BEN', name: 'Benten' })

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: { input: 'COF BEN 500' },
      })

      await order.execute(interaction as never)

      // Should show confirmation embed
      expect(mockBuildOrderConfirmationEmbed).toHaveBeenCalled()
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.anything(),
          flags: 64,
        })
      )
    })

    it('creates buy order with confirmation flow when all inputs provided', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'RAT', name: 'Rations' }, quantity: 1000 }],
        location: { naturalId: 'BEN', name: 'Benten' },
        errors: [],
      })
      mockResolveEffectiveValue
        .mockReturnValueOnce('CIS') // currency
        .mockReturnValueOnce('internal') // visibility
        .mockReturnValueOnce('KAWA') // price list
      mockDbQuery.priceLists.findFirst = vi.fn().mockResolvedValueOnce({ code: 'KAWA', name: 'KAWA Prices' })
      mockCalculateEffectivePriceWithFallback.mockResolvedValueOnce({
        finalPrice: 125,
        currency: 'CIS',
      })
      mockDbQuery.buyOrders.findMany.mockResolvedValueOnce([])
      mockResolveLocation.mockResolvedValueOnce({ naturalId: 'BEN', name: 'Benten' })

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'buy',
        stringOptions: { input: 'RAT BEN 1000' },
      })

      await order.execute(interaction as never)

      expect(mockBuildOrderConfirmationEmbed).toHaveBeenCalled()
      const confirmationCall = mockBuildOrderConfirmationEmbed.mock.calls[0][0]
      expect(confirmationCall.direction).toBe('buy')
      expect(confirmationCall.locationId).toBe('BEN')
      expect(confirmationCall.items[0].ticker).toBe('RAT')
    })

    it('uses fixed price when priceOverride is provided', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: 500 }],
        location: { naturalId: 'BEN', name: 'Benten' },
        errors: [],
      })
      mockResolveEffectiveValue
        .mockReturnValueOnce('CIS') // currency
        .mockReturnValueOnce('internal') // visibility
        .mockReturnValueOnce(null) // price list (not needed, price override provided)
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])
      mockResolveLocation.mockResolvedValueOnce({ naturalId: 'BEN', name: 'Benten' })

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: { input: 'COF BEN 500' },
        numberOptions: { price: 200 },
      })

      await order.execute(interaction as never)

      // Should NOT call calculateEffectivePriceWithFallback since price is overridden
      expect(mockCalculateEffectivePriceWithFallback).not.toHaveBeenCalled()
      expect(mockBuildOrderConfirmationEmbed).toHaveBeenCalled()
      const confirmationCall = mockBuildOrderConfirmationEmbed.mock.calls[0][0]
      expect(confirmationCall.items[0].price).toBe('200.00')
    })

    it('shows error when no price and no price list configured', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: 500 }],
        location: { naturalId: 'BEN', name: 'Benten' },
        errors: [],
      })
      mockResolveEffectiveValue
        .mockReturnValueOnce('CIS') // currency
        .mockReturnValueOnce('internal') // visibility
        .mockReturnValueOnce(null) // no price list

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: { input: 'COF BEN 500' },
      })

      await order.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Please provide a price or configure auto-pricing'),
        flags: 64,
      })
    })

    it('shows error when price list does not exist', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: 500 }],
        location: { naturalId: 'BEN', name: 'Benten' },
        errors: [],
      })
      mockResolveEffectiveValue
        .mockReturnValueOnce('CIS') // currency
        .mockReturnValueOnce('internal') // visibility
        .mockReturnValueOnce('NONEXISTENT') // price list
      mockDbQuery.priceLists.findFirst = vi.fn().mockResolvedValueOnce(null)

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: { input: 'COF BEN 500' },
      })

      await order.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('price list "NONEXISTENT" was not found'),
        flags: 64,
      })
    })

    it('sell orders do not require quantity in unlimited mode', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: null }],
        location: { naturalId: 'BEN', name: 'Benten' },
        errors: [],
      })
      mockResolveEffectiveValue
        .mockReturnValueOnce('CIS') // currency
        .mockReturnValueOnce('internal') // visibility
        .mockReturnValueOnce('KAWA') // price list
      mockDbQuery.priceLists.findFirst = vi.fn().mockResolvedValueOnce({ code: 'KAWA' })
      mockCalculateEffectivePriceWithFallback.mockResolvedValueOnce({
        finalPrice: 150,
        currency: 'CIS',
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])
      mockResolveLocation.mockResolvedValueOnce({ naturalId: 'BEN', name: 'Benten' })

      const { interaction, replyFn } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: { input: 'COF BEN' },
      })

      await order.execute(interaction as never)

      // Should NOT show incomplete input, because sell unlimited mode doesn't require quantity
      expect(mockBuildIncompleteInputEmbed).not.toHaveBeenCalled()
      expect(mockBuildOrderConfirmationEmbed).toHaveBeenCalled()
    })

    it('resolves location from override option', async () => {
      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1, profile: {} })
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: 500 }],
        location: null,
        errors: [],
      })
      // resolveLocation called for override validation
      mockResolveLocation
        .mockResolvedValueOnce({ naturalId: 'MOR', name: 'Moria' }) // override validation
        .mockResolvedValueOnce({ naturalId: 'MOR', name: 'Moria' }) // display lookup
      mockResolveEffectiveValue
        .mockReturnValueOnce('CIS')
        .mockReturnValueOnce('internal')
        .mockReturnValueOnce('KAWA')
      mockDbQuery.priceLists.findFirst = vi.fn().mockResolvedValueOnce({ code: 'KAWA' })
      mockCalculateEffectivePriceWithFallback.mockResolvedValueOnce({
        finalPrice: 100,
        currency: 'CIS',
      })
      mockDbQuery.sellOrders.findMany.mockResolvedValueOnce([])

      const { interaction } = createOrderInteraction({
        subcommand: 'sell',
        stringOptions: { input: 'COF 500', location: 'MOR' },
      })

      await order.execute(interaction as never)

      expect(mockResolveLocation).toHaveBeenCalledWith('MOR')
      expect(mockBuildOrderConfirmationEmbed).toHaveBeenCalled()
      const confirmationCall = mockBuildOrderConfirmationEmbed.mock.calls[0][0]
      expect(confirmationCall.locationId).toBe('MOR')
    })
  })

  describe('autocomplete', () => {
    it('returns location results for location field', async () => {
      mockSearchLocations.mockResolvedValueOnce([
        { naturalId: 'BEN', name: 'Benten' },
        { naturalId: 'MOR', name: 'Moria' },
      ])

      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'location', value: 'B' }),
        },
        respond: mockRespond,
      }

      await order.autocomplete?.(interaction as never)

      expect(mockSearchLocations).toHaveBeenCalledWith('B', 25, '123456789')
      expect(mockRespond).toHaveBeenCalledWith([
        { name: 'BEN - Benten', value: 'BEN' },
        { name: 'MOR - Moria', value: 'MOR' },
      ])
    })

    it('does not respond for non-location fields', async () => {
      const mockRespond = vi.fn()
      const interaction = {
        user: { id: '123456789' },
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'commodity', value: 'C' }),
        },
        respond: mockRespond,
      }

      await order.autocomplete?.(interaction as never)

      expect(mockSearchLocations).not.toHaveBeenCalled()
      expect(mockRespond).not.toHaveBeenCalled()
    })
  })
})
