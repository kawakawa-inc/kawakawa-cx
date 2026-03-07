/**
 * Tests for /lists command - View and manage shopping lists
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockRequireLinkedUser,
  mockResolveCommodity,
  mockFormatCommodity,
  mockGetDisplaySettings,
  mockCreateSingleInputModal,
  mockEnrichSellOrdersWithQuantities,
  mockFormatGroupedOrdersMulti,
  mockBuildFilterDescription,
  mockStartInvoiceCreationFlow,
  mockGetCommandPrefix,
  mockDbSelect,
  mockDbFrom,
  mockDbWhere,
  mockDbOrderBy,
} = vi.hoisted(() => ({
  mockRequireLinkedUser: vi.fn(),
  mockResolveCommodity: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockCreateSingleInputModal: vi.fn(),
  mockEnrichSellOrdersWithQuantities: vi.fn(),
  mockFormatGroupedOrdersMulti: vi.fn(),
  mockBuildFilterDescription: vi.fn(),
  mockStartInvoiceCreationFlow: vi.fn(),
  mockGetCommandPrefix: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbWhere: vi.fn(),
  mockDbOrderBy: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock auth
vi.mock('../../utils/auth.js', () => ({ requireLinkedUser: mockRequireLinkedUser }))

// Mock display service
vi.mock('../../services/display.js', () => ({
  resolveCommodity: mockResolveCommodity,
  formatCommodity: mockFormatCommodity,
}))

// Mock user settings
vi.mock('../../services/userSettings.js', () => ({
  getDisplaySettings: mockGetDisplaySettings,
}))

// Mock modals
vi.mock('../../utils/modals.js', () => ({
  createSingleInputModal: mockCreateSingleInputModal,
}))

// Mock market services
vi.mock('@kawakawa/services/market', () => ({
  enrichSellOrdersWithQuantities: mockEnrichSellOrdersWithQuantities,
}))

// Mock order formatter
vi.mock('../../services/orderFormatter.js', () => ({
  formatGroupedOrdersMulti: mockFormatGroupedOrdersMulti,
  buildFilterDescription: mockBuildFilterDescription,
}))

// Mock invoice builder
vi.mock('../../services/invoiceBuilder.js', () => ({
  startInvoiceCreationFlow: mockStartInvoiceCreationFlow,
}))

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock message interaction adapter
vi.mock('../../adapters/messageInteraction.js', () => ({
  getCommandPrefix: mockGetCommandPrefix,
}))

// Mock database
vi.mock('@kawakawa/db', () => ({
  db: {
    select: mockDbSelect,
    query: {},
  },
  shoppingLists: {
    userId: 'userId',
    updatedAt: 'updatedAt',
    id: 'id',
  },
  sellOrders: {
    commodityTicker: 'commodityTicker',
    updatedAt: 'updatedAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  inArray: vi.fn((...args: unknown[]) => args),
}))

import { lists } from './lists.js'

/**
 * Set up the DB chain: db.select().from().where().orderBy()
 * Returns the final result array.
 */
function setupDbChain(result: unknown[]) {
  mockDbOrderBy.mockResolvedValue(result)
  mockDbWhere.mockReturnValue({ orderBy: mockDbOrderBy })
  mockDbFrom.mockReturnValue({ where: mockDbWhere })
  mockDbSelect.mockReturnValue({ from: mockDbFrom })
}

describe('/lists command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCommandPrefix.mockReturnValue('/')
    mockFormatCommodity.mockImplementation((ticker: string) => `**${ticker}**`)
  })

  it('has correct command metadata', () => {
    expect(lists.data).toBeDefined()
  })

  it('returns early when user is not linked', async () => {
    mockRequireLinkedUser.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction()
    await lists.execute(interaction as never)

    // requireLinkedUser handles the reply internally when returning null
    expect(replyFn).not.toHaveBeenCalled()
    expect(mockDbSelect).not.toHaveBeenCalled()
  })

  it('shows no-lists message when DB returns empty array', async () => {
    mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1 })
    setupDbChain([])

    const { interaction, replyFn } = createMockInteraction()
    await lists.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('No shopping lists found'),
        flags: 64,
      })
    )
    // Should mention how to create a list
    const content = replyFn.mock.calls[0][0].content as string
    expect(content).toContain('/list')
    expect(content).toContain('/query')
  })

  it('shows embed with lists when DB returns lists', async () => {
    mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1 })

    const mockLists = [
      {
        id: 1,
        name: 'Build Materials',
        materials: { RAT: 100, DW: 200, OVE: 50 },
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-03-01'),
      },
      {
        id: 2,
        name: 'Consumables',
        materials: { COF: 10 },
        createdAt: new Date('2026-02-01'),
        updatedAt: new Date('2026-03-05'),
      },
    ]
    setupDbChain(mockLists)

    const { interaction, replyFn } = createMockInteraction()
    await lists.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array),
        flags: 64,
      })
    )
  })

  it('uses correct prefix in no-lists message', async () => {
    mockRequireLinkedUser.mockResolvedValueOnce({ userId: 1 })
    mockGetCommandPrefix.mockReturnValue('kx!')
    setupDbChain([])

    const { interaction, replyFn } = createMockInteraction()
    await lists.execute(interaction as never)

    const content = replyFn.mock.calls[0][0].content as string
    expect(content).toContain('kx!list')
    expect(content).toContain('kx!query')
  })
})
