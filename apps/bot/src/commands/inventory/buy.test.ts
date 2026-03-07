import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockParseTokens,
  mockHandleInvoiceCommand,
  mockExecuteQuery,
  mockSendQueryResponse,
  mockFormatCommodity,
  mockFormatLocation,
  mockGetDisplaySettings,
  mockGetChannelConfig,
  mockResolveEffectiveValue,
  mockResolveMessageVisibility,
  mockRequireLinkedUser,
  mockGetCommandPrefix,
  mockDbQuery,
} = vi.hoisted(() => ({
  mockParseTokens: vi.fn(),
  mockHandleInvoiceCommand: vi.fn(),
  mockExecuteQuery: vi.fn(),
  mockSendQueryResponse: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockGetChannelConfig: vi.fn(),
  mockResolveEffectiveValue: vi.fn(),
  mockResolveMessageVisibility: vi.fn(),
  mockRequireLinkedUser: vi.fn(),
  mockGetCommandPrefix: vi.fn(),
  mockDbQuery: {
    userDiscordProfiles: { findFirst: vi.fn() },
  },
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock parser
vi.mock('@kawakawa/parser', () => ({
  parseTokens: mockParseTokens,
}))

// Mock bot resolvers
vi.mock('../../utils/resolvers.js', () => ({
  botResolvers: {},
}))

// Mock invoice command handler
vi.mock('../../services/invoiceCommandHandler.js', () => ({
  handleInvoiceCommand: mockHandleInvoiceCommand,
}))

// Mock query helper
vi.mock('../../services/queryHelper.js', () => ({
  executeQuery: mockExecuteQuery,
  sendQueryResponse: mockSendQueryResponse,
}))

// Mock display service
vi.mock('../../services/display.js', () => ({
  formatCommodity: mockFormatCommodity,
  formatLocation: mockFormatLocation,
}))

// Mock user settings
vi.mock('../../services/userSettings.js', () => ({
  getDisplaySettings: mockGetDisplaySettings,
}))

// Mock channel config
vi.mock('../../services/channelConfig.js', () => ({
  getChannelConfig: mockGetChannelConfig,
  resolveEffectiveValue: mockResolveEffectiveValue,
  resolveMessageVisibility: mockResolveMessageVisibility,
}))

// Mock auth
vi.mock('../../utils/auth.js', () => ({
  requireLinkedUser: mockRequireLinkedUser,
}))

// Mock message interaction adapter
vi.mock('../../adapters/messageInteraction.js', () => ({
  getCommandPrefix: mockGetCommandPrefix,
}))

// Mock autocomplete
vi.mock('../../autocomplete/index.js', () => ({
  searchLocations: vi.fn(),
}))

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// Mock database
vi.mock('@kawakawa/db', () => ({
  db: { query: mockDbQuery },
  userDiscordProfiles: { discordId: 'discordId' },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
}))

// Import after mocks
import { buy } from './buy.js'

describe('buy command', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetCommandPrefix.mockReturnValue('/')
    mockGetDisplaySettings.mockResolvedValue({
      locationDisplayMode: 'both',
      commodityDisplayMode: 'ticker-only',
      messageVisibility: 'ephemeral',
      preferredCurrency: 'CIS',
      favoritedLocations: [],
      favoritedCommodities: [],
    })
    mockGetChannelConfig.mockResolvedValue(null)
    mockResolveMessageVisibility.mockReturnValue({ visibility: 'ephemeral', isEphemeral: true })
    mockResolveEffectiveValue.mockImplementation(
      (
        commandOption: unknown,
        _channelDefault: unknown,
        _channelEnforced: boolean,
        _userDefault: unknown,
        systemDefault: unknown
      ) => commandOption ?? systemDefault
    )
    mockFormatCommodity.mockImplementation((ticker: string) => ticker)
    mockFormatLocation.mockResolvedValue('Benten (BEN)')
    mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue(null)

    // Default parseTokens: empty result
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
  })

  it('has correct command metadata', () => {
    expect(buy.data).toBeDefined()
  })

  describe('execute', () => {
    it('shows help when no input provided', async () => {
      const { interaction, replyFn } = createMockInteraction()

      await buy.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
          flags: 64,
        })
      )
      // Should not call parseTokens when input is null
      expect(mockParseTokens).not.toHaveBeenCalled()
    })

    it('shows help when input is empty string', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { input: '' },
      })

      await buy.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
          flags: 64,
        })
      )
      expect(mockParseTokens).not.toHaveBeenCalled()
    })

    it('shows help when parsed items and location are empty', async () => {
      mockParseTokens.mockResolvedValueOnce({
        items: [],
        location: null,
        user: null,
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: ['gibberish'],
        errors: [],
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { input: 'gibberish' },
      })

      await buy.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        })
      )
      // Should not enter query or invoice mode
      expect(mockExecuteQuery).not.toHaveBeenCalled()
      expect(mockHandleInvoiceCommand).not.toHaveBeenCalled()
    })

    it('enters invoice mode when parsed.user is present', async () => {
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'RAT', name: 'Rations' }, quantity: 20 }],
        location: { naturalId: 'BEN', name: 'Benten', type: 'station' },
        user: { username: 'alice', userId: 'user-alice-id' },
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: [],
        errors: [],
      })

      mockRequireLinkedUser.mockResolvedValueOnce({ userId: 'current-user-id' })
      mockHandleInvoiceCommand.mockResolvedValueOnce({ success: true })

      const { interaction } = createMockInteraction({
        stringOptions: { input: '20 RAT BEN @alice' },
      })

      await buy.execute(interaction as never)

      expect(mockRequireLinkedUser).toHaveBeenCalledWith(interaction)
      expect(mockHandleInvoiceCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          interaction,
          userId: 'current-user-id',
          input: '20 RAT BEN @alice',
          direction: 'buy',
        })
      )
      // Should not enter query mode
      expect(mockExecuteQuery).not.toHaveBeenCalled()
    })

    it('returns early if requireLinkedUser fails in invoice mode', async () => {
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'RAT', name: 'Rations' }, quantity: null }],
        location: null,
        user: { username: 'alice', userId: 'user-alice-id' },
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: [],
        errors: [],
      })

      // requireLinkedUser returns null (user not linked)
      mockRequireLinkedUser.mockResolvedValueOnce(null)

      const { interaction } = createMockInteraction({
        stringOptions: { input: 'RAT @alice' },
      })

      await buy.execute(interaction as never)

      expect(mockRequireLinkedUser).toHaveBeenCalledWith(interaction)
      // Should not proceed to handleInvoiceCommand
      expect(mockHandleInvoiceCommand).not.toHaveBeenCalled()
      expect(mockExecuteQuery).not.toHaveBeenCalled()
    })

    it('enters query mode when no user in parsed result', async () => {
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'RAT', name: 'Rations' }, quantity: null }],
        location: null,
        user: null,
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: [],
        errors: [],
      })

      mockExecuteQuery.mockResolvedValueOnce({
        hasOrders: true,
        pages: [{ embed: {}, orders: [] }],
      })
      mockSendQueryResponse.mockResolvedValueOnce(undefined)

      const { interaction } = createMockInteraction({
        stringOptions: { input: 'RAT' },
      })

      await buy.execute(interaction as never)

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          commodities: [{ ticker: 'RAT', name: 'Rations' }],
          orderType: 'sell',
          visibility: 'internal',
        })
      )
      expect(mockSendQueryResponse).toHaveBeenCalled()
      // Should not enter invoice mode
      expect(mockHandleInvoiceCommand).not.toHaveBeenCalled()
    })

    it('shows no-results message when query returns no orders', async () => {
      mockParseTokens.mockResolvedValueOnce({
        items: [{ commodity: { ticker: 'RAT', name: 'Rations' }, quantity: null }],
        location: { naturalId: 'BEN', name: 'Benten', type: 'station' as const },
        user: null,
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: [],
        errors: [],
      })

      mockExecuteQuery.mockResolvedValueOnce({ hasOrders: false })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { input: 'RAT BEN' },
      })

      await buy.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No sell orders found'),
          flags: 64,
        })
      )
      expect(mockSendQueryResponse).not.toHaveBeenCalled()
    })

    it('calls sendQueryResponse with sell orderType in query mode', async () => {
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

      const mockResult = {
        hasOrders: true,
        pages: [{ embed: {}, orders: [] }],
      }
      mockExecuteQuery.mockResolvedValueOnce(mockResult)
      mockSendQueryResponse.mockResolvedValueOnce(undefined)

      const { interaction } = createMockInteraction({
        stringOptions: { input: 'COF' },
      })

      await buy.execute(interaction as never)

      // Verify executeQuery was called with orderType 'sell'
      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          orderType: 'sell',
        })
      )

      // Verify sendQueryResponse was called with the result
      expect(mockSendQueryResponse).toHaveBeenCalledWith(interaction, mockResult, {
        isEphemeral: true,
        extraButtons: [],
      })
    })

    it('passes requestedQuantities when quantities are present', async () => {
      mockParseTokens.mockResolvedValueOnce({
        items: [
          { commodity: { ticker: 'RAT', name: 'Rations' }, quantity: 50 },
          { commodity: { ticker: 'COF', name: 'Caffeinated Beans' }, quantity: 100 },
        ],
        location: null,
        user: null,
        xit: null,
        actions: new Set(),
        limit: null,
        unresolved: [],
        errors: [],
      })

      mockExecuteQuery.mockResolvedValueOnce({
        hasOrders: true,
        pages: [{ embed: {}, orders: [] }],
      })
      mockSendQueryResponse.mockResolvedValueOnce(undefined)

      const { interaction } = createMockInteraction({
        stringOptions: { input: '50 RAT 100 COF' },
      })

      await buy.execute(interaction as never)

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          requestedQuantities: { RAT: 50, COF: 100 },
        })
      )
    })
  })
})
