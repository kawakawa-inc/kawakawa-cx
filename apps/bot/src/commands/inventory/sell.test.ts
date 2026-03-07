import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGetDisplaySettings,
  mockGetChannelConfig,
  mockResolveMessageVisibility,
  mockResolveEffectiveValue,
  mockRequireLinkedUser,
  mockParseTokens,
  mockHandleInvoiceCommand,
  mockExecuteQuery,
  mockSendQueryResponse,
  mockFormatCommodity,
  mockFormatLocation,
  mockGetCommandPrefix,
  mockDbQuery,
} = vi.hoisted(() => ({
  mockGetDisplaySettings: vi.fn(),
  mockGetChannelConfig: vi.fn(),
  mockResolveMessageVisibility: vi.fn(),
  mockResolveEffectiveValue: vi.fn(),
  mockRequireLinkedUser: vi.fn(),
  mockParseTokens: vi.fn(),
  mockHandleInvoiceCommand: vi.fn(),
  mockExecuteQuery: vi.fn(),
  mockSendQueryResponse: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockGetCommandPrefix: vi.fn(),
  mockDbQuery: { userDiscordProfiles: { findFirst: vi.fn() } },
}))

vi.mock('discord.js', () => ({
  SlashCommandBuilder: class {
    setName() { return this }
    setDescription() { return this }
    addStringOption() { return this }
  },
  MessageFlags: { Ephemeral: 64 },
  EmbedBuilder: class {
    setTitle() { return this }
    setDescription() { return this }
    setColor() { return this }
    setFooter() { return this }
  },
  ButtonBuilder: class {
    setCustomId() { return this }
    setLabel() { return this }
    setStyle() { return this }
  },
  ButtonStyle: { Secondary: 2 },
  ActionRowBuilder: class { addComponents() { return this } },
}))

vi.mock('@kawakawa/db', () => ({
  db: { query: mockDbQuery },
  userDiscordProfiles: { discordId: 'discordId' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))
vi.mock('../../services/userSettings.js', () => ({ getDisplaySettings: mockGetDisplaySettings }))
vi.mock('../../services/channelConfig.js', () => ({
  getChannelConfig: mockGetChannelConfig,
  resolveEffectiveValue: mockResolveEffectiveValue,
  resolveMessageVisibility: mockResolveMessageVisibility,
}))
vi.mock('../../utils/auth.js', () => ({ requireLinkedUser: mockRequireLinkedUser }))
vi.mock('@kawakawa/parser', () => ({ parseTokens: mockParseTokens }))
vi.mock('../../utils/resolvers.js', () => ({ botResolvers: {} }))
vi.mock('../../services/invoiceCommandHandler.js', () => ({ handleInvoiceCommand: mockHandleInvoiceCommand }))
vi.mock('../../services/queryHelper.js', () => ({
  executeQuery: mockExecuteQuery,
  sendQueryResponse: mockSendQueryResponse,
}))
vi.mock('../../services/display.js', () => ({
  formatCommodity: mockFormatCommodity,
  formatLocation: mockFormatLocation,
}))
vi.mock('../../adapters/messageInteraction.js', () => ({ getCommandPrefix: mockGetCommandPrefix }))
vi.mock('../../autocomplete/index.js', () => ({ searchLocations: vi.fn() }))
vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { sell } from './sell.js'

function createMockInteraction(inputValue: string | null = null) {
  return {
    user: { id: 'discord123' },
    channelId: 'channel123',
    options: {
      getString: vi.fn((name: string) => {
        if (name === 'input') return inputValue
        return null
      }),
    },
    reply: vi.fn(),
  } as never
}

describe('sell command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCommandPrefix.mockReturnValue('/')
    mockGetDisplaySettings.mockResolvedValue({
      locationDisplayMode: 'natural-ids-only',
      commodityDisplayMode: 'tickers-only',
      messageVisibility: 'ephemeral',
    })
    mockGetChannelConfig.mockResolvedValue(null)
    mockResolveMessageVisibility.mockReturnValue({ isEphemeral: true })
    mockResolveEffectiveValue.mockReturnValue('internal')
    mockFormatCommodity.mockImplementation((t: string) => t)
    mockFormatLocation.mockResolvedValue('Benten')
  })

  it('shows help when no input provided', async () => {
    const interaction = createMockInteraction(null)
    await sell.execute(interaction)
    expect((interaction as any).reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      })
    )
  })

  it('enters invoice mode when user detected in parsed input', async () => {
    mockParseTokens.mockResolvedValue({
      user: { userId: 2, username: 'alice' },
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 100 }],
      location: { naturalId: 'BEN', name: 'Benten', type: 'station' },
      unresolved: [],
      actions: new Set(),
      errors: [],
    })
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockHandleInvoiceCommand.mockResolvedValue({ success: true })

    const interaction = createMockInteraction('100 COF BEN alice')
    await sell.execute(interaction)

    expect(mockHandleInvoiceCommand).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'sell' })
    )
  })

  it('queries buy orders in query mode', async () => {
    mockParseTokens.mockResolvedValue({
      user: null,
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: null }],
      location: null,
      unresolved: [],
      actions: new Set(),
      errors: [],
    })
    mockDbQuery.userDiscordProfiles.findFirst.mockResolvedValue(null)
    mockExecuteQuery.mockResolvedValue({ hasOrders: true, items: [], embed: {} })
    mockSendQueryResponse.mockResolvedValue(undefined)

    const interaction = createMockInteraction('COF')
    await sell.execute(interaction)

    expect(mockExecuteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ orderType: 'buy' })
    )
  })

  it('returns early if requireLinkedUser fails in invoice mode', async () => {
    mockParseTokens.mockResolvedValue({
      user: { userId: 2, username: 'alice' },
      items: [],
      location: null,
      unresolved: [],
      actions: new Set(),
      errors: [],
    })
    mockRequireLinkedUser.mockResolvedValue(null)

    const interaction = createMockInteraction('COF alice')
    await sell.execute(interaction)

    expect(mockHandleInvoiceCommand).not.toHaveBeenCalled()
  })
})
