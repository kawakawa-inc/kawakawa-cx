import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockRequireLinkedUser,
  mockGetUserSettings,
  mockSetSetting,
  mockDeleteSetting,
  mockFormatLocation,
  mockResolveLocation,
  mockFormatCommodityWithMode,
  mockResolveCommodity,
  mockDbQuery,
} = vi.hoisted(() => ({
  mockRequireLinkedUser: vi.fn(),
  mockGetUserSettings: vi.fn(),
  mockSetSetting: vi.fn(),
  mockDeleteSetting: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockResolveLocation: vi.fn(),
  mockFormatCommodityWithMode: vi.fn(),
  mockResolveCommodity: vi.fn(),
  mockDbQuery: {
    priceLists: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('discord.js', () => ({
  SlashCommandBuilder: class {
    setName() { return this }
    setDescription() { return this }
  },
  MessageFlags: { Ephemeral: 64 },
  EmbedBuilder: class {
    data: Record<string, unknown> = {}
    setTitle(t: string) { this.data.title = t; return this }
    setDescription(d: string) { this.data.description = d; return this }
    setColor() { return this }
    setFooter(f: unknown) { this.data.footer = f; return this }
    addFields(f: unknown) {
      this.data.fields = (this.data.fields as unknown[] || [])
      ;(this.data.fields as unknown[]).push(f)
      return this
    }
  },
  ActionRowBuilder: class {
    components: unknown[] = []
    addComponents(...c: unknown[]) { this.components.push(...c); return this }
  },
  StringSelectMenuBuilder: class {
    data: Record<string, unknown> = {}
    setCustomId(id: string) { this.data.customId = id; return this }
    setPlaceholder(p: string) { this.data.placeholder = p; return this }
    addOptions(o: unknown) { this.data.options = o; return this }
  },
  ButtonBuilder: class {
    data: Record<string, unknown> = {}
    setCustomId(id: string) { this.data.customId = id; return this }
    setLabel(l: string) { this.data.label = l; return this }
    setStyle() { return this }
    setDisabled() { return this }
    setEmoji() { return this }
  },
  ButtonStyle: { Secondary: 2, Success: 3, Danger: 4 },
  ComponentType: { StringSelect: 3 },
  ModalBuilder: class {
    setCustomId() { return this }
    setTitle() { return this }
    addComponents() { return this }
  },
  TextInputBuilder: class {
    setCustomId() { return this }
    setLabel() { return this }
    setPlaceholder() { return this }
    setStyle() { return this }
    setRequired() { return this }
    setValue() { return this }
    setMaxLength() { return this }
  },
  TextInputStyle: { Short: 1 },
}))

vi.mock('@kawakawa/db', () => ({
  db: { query: mockDbQuery },
  priceLists: { isActive: 'isActive', code: 'code' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({})),
}))

vi.mock('../../services/userSettings.js', () => ({
  getUserSettings: mockGetUserSettings,
  setSetting: mockSetSetting,
  deleteSetting: mockDeleteSetting,
  USE_WEBSITE_SETTING: 'use-website',
  USE_CHANNEL_DEFAULT: 'use-channel-default',
}))

vi.mock('../../services/locationService.js', () => ({
  formatLocation: mockFormatLocation,
  resolveLocation: mockResolveLocation,
}))

vi.mock('../../services/commodityService.js', () => ({
  formatCommodityWithMode: mockFormatCommodityWithMode,
  resolveCommodity: mockResolveCommodity,
}))

vi.mock('../../utils/auth.js', () => ({ requireLinkedUser: mockRequireLinkedUser }))

vi.mock('../../utils/interactions.js', () => ({ COMPONENT_TIMEOUT: 60_000 }))

import { settings } from './settings.js'

function createMockInteraction() {
  const collector = { on: vi.fn() }
  return {
    user: { id: 'discord123' },
    reply: vi.fn().mockResolvedValue({
      createMessageComponentCollector: vi.fn().mockReturnValue(collector),
    }),
    editReply: vi.fn(),
    _collector: collector,
  }
}

const DEFAULT_SETTINGS: Record<string, unknown> = {
  'discord.locationDisplayMode': 'natural-ids-only',
  'discord.commodityDisplayMode': 'ticker-only',
  'discord.messageVisibility': 'use-channel-default',
  'market.preferredCurrency': 'CIS',
  'market.defaultPriceList': null,
  'market.automaticPricing': true,
  'market.favoritedLocations': [],
  'market.favoritedCommodities': [],
}

describe('settings command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early when user not linked', async () => {
    mockRequireLinkedUser.mockResolvedValue(null)
    const interaction = createMockInteraction()

    await settings.execute(interaction as never)

    expect(mockGetUserSettings).not.toHaveBeenCalled()
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('shows settings embed on initial display', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockDbQuery.priceLists.findMany.mockResolvedValue([])
    mockGetUserSettings.mockResolvedValue({ ...DEFAULT_SETTINGS })

    const interaction = createMockInteraction()
    await settings.execute(interaction as never)

    expect(interaction.reply).toHaveBeenCalledTimes(1)
    const replyArg = interaction.reply.mock.calls[0][0]

    // Should have embeds and components
    expect(replyArg.embeds).toHaveLength(1)
    expect(replyArg.components).toHaveLength(1)
    expect(replyArg.flags).toBe(64) // Ephemeral

    // Embed should have the settings title and three field groups
    const embed = replyArg.embeds[0]
    expect(embed.data.title).toContain('Settings')
    expect(embed.data.fields).toHaveLength(3)
  })

  it('sets up a component collector after replying', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockDbQuery.priceLists.findMany.mockResolvedValue([])
    mockGetUserSettings.mockResolvedValue({ ...DEFAULT_SETTINGS })

    const interaction = createMockInteraction()
    await settings.execute(interaction as never)

    // The collector should have 'collect' and 'end' handlers registered
    const onCalls = interaction._collector.on.mock.calls
    const events = onCalls.map((call: unknown[]) => call[0])
    expect(events).toContain('collect')
    expect(events).toContain('end')
  })
})
