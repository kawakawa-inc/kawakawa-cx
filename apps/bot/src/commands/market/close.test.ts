/**
 * Tests for /close command - Submit a draft invoice
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockRequireLinkedUser,
  mockGetDraftInvoices,
  mockGetInvoiceWithDetails,
  mockSubmitInvoice,
  mockFindUserByName,
  mockFormatLineItemsForEmbed,
  mockGetDisplaySettings,
  mockGetCommandPrefix,
} = vi.hoisted(() => ({
  mockRequireLinkedUser: vi.fn(),
  mockGetDraftInvoices: vi.fn(),
  mockGetInvoiceWithDetails: vi.fn(),
  mockSubmitInvoice: vi.fn(),
  mockFindUserByName: vi.fn(),
  mockFormatLineItemsForEmbed: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockGetCommandPrefix: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock auth
vi.mock('../../utils/auth.js', () => ({ requireLinkedUser: mockRequireLinkedUser }))

// Mock invoice service
vi.mock('../../services/invoiceService.js', () => ({
  getDraftInvoices: mockGetDraftInvoices,
  getInvoiceWithDetails: mockGetInvoiceWithDetails,
  submitInvoice: mockSubmitInvoice,
  findUserByName: mockFindUserByName,
  formatLineItemsForEmbed: mockFormatLineItemsForEmbed,
}))

// Mock user settings
vi.mock('../../services/userSettings.js', () => ({
  getDisplaySettings: mockGetDisplaySettings,
}))

// Mock message interaction adapter
vi.mock('../../adapters/messageInteraction.js', () => ({
  getCommandPrefix: mockGetCommandPrefix,
}))

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock database (may be imported transitively)
vi.mock('@kawakawa/db', () => ({
  db: { query: {} },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}))

import { close } from './close.js'

// Helper to create a draft invoice summary
function makeDraftSummary(
  overrides: Partial<{
    id: number
    counterpartyUserId: number
    counterpartyName: string
    itemCount: number
    totalsByCurrency: { currency: string; total: number }[]
  }> = {}
) {
  return {
    id: overrides.id ?? 1,
    counterpartyUserId: overrides.counterpartyUserId ?? 100,
    counterpartyName: overrides.counterpartyName ?? 'bob',
    status: 'draft' as const,
    direction: 'sent' as const,
    name: null,
    itemCount: overrides.itemCount ?? 2,
    buyItemCount: 0,
    sellItemCount: 0,
    totalsByCurrency: overrides.totalsByCurrency ?? [{ currency: 'CIS', total: 500 }],
    buyTotalsByCurrency: [],
    sellTotalsByCurrency: [],
    commodityTickers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('/close command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCommandPrefix.mockReturnValue('/')
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockGetDisplaySettings.mockResolvedValue({ locationDisplayMode: 'natural-ids-only' })
    mockGetDraftInvoices.mockResolvedValue([])
  })

  it('has correct command metadata', () => {
    expect(close.data).toBeDefined()
  })

  it('returns early when user is not linked', async () => {
    mockRequireLinkedUser.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction()
    await close.execute(interaction as never)

    // requireLinkedUser handles the reply internally when returning null
    expect(replyFn).not.toHaveBeenCalled()
    expect(mockGetDraftInvoices).not.toHaveBeenCalled()
  })

  it('shows error when no drafts and no target specified', async () => {
    mockGetDraftInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: {},
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('no draft invoices'),
      flags: 64,
    })
  })

  it('lists drafts when no target specified and has drafts', async () => {
    const drafts = [
      makeDraftSummary({ id: 1, counterpartyName: 'bob', itemCount: 2 }),
      makeDraftSummary({ id: 2, counterpartyName: 'alice', itemCount: 1 }),
    ]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: {},
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('What do you wish to close'),
      flags: 64,
    })
    const content = replyFn.mock.calls[0][0].content as string
    expect(content).toContain('#1')
    expect(content).toContain('bob')
    expect(content).toContain('#2')
    expect(content).toContain('alice')
  })

  it('finds invoice by numeric ID in drafts and submits', async () => {
    const drafts = [makeDraftSummary({ id: 5, counterpartyName: 'bob' })]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetInvoiceWithDetails.mockResolvedValueOnce({
      id: 5,
      counterpartyName: 'bob',
      lineItems: [
        {
          id: 1,
          commodityTicker: 'COF',
          quantity: 100,
          unitPrice: 5,
          currency: 'CIS',
          totalValue: 500,
          orderType: 'sell',
        },
      ],
      totalsByCurrency: [{ currency: 'CIS', total: 500 }],
    })
    mockSubmitInvoice.mockResolvedValueOnce({ success: true, reservationCount: 1 })
    mockFormatLineItemsForEmbed.mockResolvedValueOnce([
      '📤 100x **COF** @ BEN - 5.00 CIS/u = 500.00 CIS',
    ])

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: '5' },
    })

    await close.execute(interaction as never)

    expect(mockGetInvoiceWithDetails).toHaveBeenCalledWith(5, 1)
    expect(mockSubmitInvoice).toHaveBeenCalledWith(5, 1)
    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Invoice #5 submitted'),
      flags: 64,
    })
  })

  it('shows error when numeric ID is not found in drafts', async () => {
    const drafts = [makeDraftSummary({ id: 1 })]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: '99' },
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Invoice #99 not found in your drafts'),
      flags: 64,
    })
  })

  it('finds invoice by username when user is found and has one draft', async () => {
    const drafts = [
      makeDraftSummary({ id: 3, counterpartyUserId: 100, counterpartyName: 'bob' }),
    ]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockFindUserByName.mockResolvedValueOnce({
      userId: 100,
      username: 'bob',
      displayName: 'Bob',
      fioUsername: 'BobFIO',
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce({
      id: 3,
      counterpartyName: 'bob',
      lineItems: [
        {
          id: 1,
          commodityTicker: 'COF',
          quantity: 50,
          unitPrice: 10,
          currency: 'CIS',
          totalValue: 500,
          orderType: 'buy',
        },
      ],
      totalsByCurrency: [{ currency: 'CIS', total: 500 }],
    })
    mockSubmitInvoice.mockResolvedValueOnce({ success: true, reservationCount: 1 })
    mockFormatLineItemsForEmbed.mockResolvedValueOnce([
      '📥 50x **COF** @ BEN - 10.00 CIS/u = 500.00 CIS',
    ])

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: 'bob' },
    })

    await close.execute(interaction as never)

    expect(mockFindUserByName).toHaveBeenCalledWith('bob')
    expect(mockSubmitInvoice).toHaveBeenCalledWith(3, 1)
    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Invoice #3 submitted'),
      flags: 64,
    })
  })

  it('shows error when user is found but no drafts with that counterparty', async () => {
    const drafts = [
      makeDraftSummary({ id: 1, counterpartyUserId: 200, counterpartyName: 'alice' }),
    ]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockFindUserByName.mockResolvedValueOnce({
      userId: 100,
      username: 'bob',
      displayName: 'Bob',
      fioUsername: 'BobFIO',
    })

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: 'bob' },
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('No draft invoice found with'),
      flags: 64,
    })
  })

  it('asks to specify when multiple invoices with same user', async () => {
    const drafts = [
      makeDraftSummary({
        id: 1,
        counterpartyUserId: 100,
        counterpartyName: 'bob',
        itemCount: 2,
      }),
      makeDraftSummary({
        id: 2,
        counterpartyUserId: 100,
        counterpartyName: 'bob',
        itemCount: 3,
      }),
    ]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockFindUserByName.mockResolvedValueOnce({
      userId: 100,
      username: 'bob',
      displayName: 'Bob',
      fioUsername: 'BobFIO',
    })

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: 'bob' },
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('multiple invoices'),
      flags: 64,
    })
    const content = replyFn.mock.calls[0][0].content as string
    expect(content).toContain('#1')
    expect(content).toContain('#2')
    expect(content).toContain('/close <id>')
  })

  it('falls back to name matching when findUserByName returns null', async () => {
    const drafts = [makeDraftSummary({ id: 7, counterpartyName: 'charlie' })]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockFindUserByName.mockResolvedValueOnce(null)
    mockGetInvoiceWithDetails.mockResolvedValueOnce({
      id: 7,
      counterpartyName: 'charlie',
      lineItems: [
        {
          id: 1,
          commodityTicker: 'RAT',
          quantity: 10,
          unitPrice: 20,
          currency: 'CIS',
          totalValue: 200,
          orderType: 'sell',
        },
      ],
      totalsByCurrency: [{ currency: 'CIS', total: 200 }],
    })
    mockSubmitInvoice.mockResolvedValueOnce({ success: true, reservationCount: 1 })
    mockFormatLineItemsForEmbed.mockResolvedValueOnce(['📤 10x **RAT**'])

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: 'charlie' },
    })

    await close.execute(interaction as never)

    expect(mockSubmitInvoice).toHaveBeenCalledWith(7, 1)
    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Invoice #7 submitted'),
      flags: 64,
    })
  })

  it('shows error when name fallback finds no match', async () => {
    const drafts = [makeDraftSummary({ id: 1, counterpartyName: 'bob' })]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockFindUserByName.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: 'nobody' },
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Could not find user or invoice matching'),
      flags: 64,
    })
  })

  it('asks to specify when name fallback matches multiple invoices', async () => {
    const drafts = [
      makeDraftSummary({ id: 1, counterpartyName: 'bob' }),
      makeDraftSummary({ id: 2, counterpartyName: 'bob' }),
    ]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockFindUserByName.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: 'bob' },
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('multiple invoices'),
      flags: 64,
    })
  })

  it('shows error when invoice details cannot be loaded', async () => {
    const drafts = [makeDraftSummary({ id: 5 })]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetInvoiceWithDetails.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: '5' },
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Could not load invoice #5'),
      flags: 64,
    })
  })

  it('shows error when invoice has no line items', async () => {
    const drafts = [makeDraftSummary({ id: 5 })]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetInvoiceWithDetails.mockResolvedValueOnce({
      id: 5,
      counterpartyName: 'bob',
      lineItems: [],
      totalsByCurrency: [],
    })

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: '5' },
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('has no items'),
      flags: 64,
    })
  })

  it('shows error when submitInvoice fails', async () => {
    const drafts = [makeDraftSummary({ id: 5 })]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetInvoiceWithDetails.mockResolvedValueOnce({
      id: 5,
      counterpartyName: 'bob',
      lineItems: [{ id: 1 }],
      totalsByCurrency: [{ currency: 'CIS', total: 100 }],
    })
    mockSubmitInvoice.mockResolvedValueOnce({
      success: false,
      reservationCount: 0,
      error: 'Already submitted',
    })

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: '5' },
    })

    await close.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Failed to submit invoice'),
      flags: 64,
    })
  })

  it('shows success with line items on successful submission', async () => {
    const drafts = [makeDraftSummary({ id: 5, counterpartyName: 'bob' })]
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetInvoiceWithDetails.mockResolvedValueOnce({
      id: 5,
      counterpartyName: 'bob',
      lineItems: [
        {
          id: 1,
          commodityTicker: 'COF',
          quantity: 100,
          unitPrice: 5,
          currency: 'CIS',
          totalValue: 500,
          orderType: 'sell',
        },
        {
          id: 2,
          commodityTicker: 'RAT',
          quantity: 200,
          unitPrice: 2,
          currency: 'CIS',
          totalValue: 400,
          orderType: 'buy',
        },
      ],
      totalsByCurrency: [{ currency: 'CIS', total: 900 }],
    })
    mockSubmitInvoice.mockResolvedValueOnce({ success: true, reservationCount: 2 })
    mockFormatLineItemsForEmbed.mockResolvedValueOnce([
      '📤 100x **COF** @ BEN - 5.00 CIS/u = 500.00 CIS',
      '📥 200x **RAT** @ BEN - 2.00 CIS/u = 400.00 CIS',
    ])

    const { interaction, replyFn } = createMockInteraction({
      stringOptions: { target: '5' },
    })

    await close.execute(interaction as never)

    const content = replyFn.mock.calls[0][0].content as string
    expect(content).toContain('Invoice #5 submitted')
    expect(content).toContain('**2** reservation')
    expect(content).toContain('bob')
    expect(content).toContain('COF')
    expect(content).toContain('RAT')
    expect(content).toContain('900.00 CIS')
  })
})
