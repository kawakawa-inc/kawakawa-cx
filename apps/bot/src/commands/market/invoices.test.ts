/**
 * Tests for /invoices command - Invoice dashboard
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockRequireLinkedUser,
  mockGetDraftInvoices,
  mockGetInboxInvoices,
  mockGetSentInvoices,
  mockGetInvoiceStatusEmoji,
  mockGetCommandPrefix,
} = vi.hoisted(() => ({
  mockRequireLinkedUser: vi.fn(),
  mockGetDraftInvoices: vi.fn(),
  mockGetInboxInvoices: vi.fn(),
  mockGetSentInvoices: vi.fn(),
  mockGetInvoiceStatusEmoji: vi.fn(),
  mockGetCommandPrefix: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock auth
vi.mock('../../utils/auth.js', () => ({ requireLinkedUser: mockRequireLinkedUser }))

// Mock invoice service
vi.mock('../../services/invoiceService.js', () => ({
  getDraftInvoices: mockGetDraftInvoices,
  getInboxInvoices: mockGetInboxInvoices,
  getSentInvoices: mockGetSentInvoices,
  getInvoiceStatusEmoji: mockGetInvoiceStatusEmoji,
}))

// Mock message interaction adapter
vi.mock('../../adapters/messageInteraction.js', () => ({
  getCommandPrefix: mockGetCommandPrefix,
}))

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Mock database
vi.mock('@kawakawa/db', () => ({
  db: { query: {} },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}))

import { invoicesCommand } from './invoices.js'

// Helper to create an invoice summary for dashboard listings
function makeInvoiceSummary(
  overrides: Partial<{
    id: number
    counterpartyUserId: number
    counterpartyName: string
    status: string
    direction: string
    itemCount: number
    totalsByCurrency: { currency: string; total: number }[]
  }> = {}
) {
  return {
    id: overrides.id ?? 1,
    counterpartyUserId: overrides.counterpartyUserId ?? 100,
    counterpartyName: overrides.counterpartyName ?? 'bob',
    status: overrides.status ?? 'draft',
    direction: overrides.direction ?? 'sent',
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

describe('/invoices command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCommandPrefix.mockReturnValue('/')
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockGetDraftInvoices.mockResolvedValue([])
    mockGetInboxInvoices.mockResolvedValue([])
    mockGetSentInvoices.mockResolvedValue([])
    mockGetInvoiceStatusEmoji.mockImplementation((status: string) => {
      const map: Record<string, string> = {
        draft: '📝',
        pending: '📤',
        confirmed: '✅',
        fulfilled: '🎉',
        partially_fulfilled: '⏳',
        cancelled: '❌',
      }
      return map[status] ?? '❓'
    })
  })

  it('has correct command metadata', () => {
    expect(invoicesCommand.data).toBeDefined()
  })

  it('returns early when user is not linked', async () => {
    mockRequireLinkedUser.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    expect(replyFn).not.toHaveBeenCalled()
    expect(mockGetDraftInvoices).not.toHaveBeenCalled()
  })

  it('shows help message when user has no invoices at all', async () => {
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce([])
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('no invoices'),
      flags: 64,
    })
    const content = replyFn.mock.calls[0][0].content as string
    expect(content).toContain('/buy')
    expect(content).toContain('/sell')
  })

  it('shows inbox section when user has inbox invoices only', async () => {
    const inbox = [
      makeInvoiceSummary({
        id: 10,
        counterpartyName: 'alice',
        status: 'pending',
        direction: 'received',
        itemCount: 3,
      }),
    ]
    mockGetInboxInvoices.mockResolvedValueOnce(inbox)
    mockGetDraftInvoices.mockResolvedValueOnce([])
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([expect.any(Object)]),
        flags: 64,
      })
    )

    const embed = replyFn.mock.calls[0][0].embeds[0]
    expect(embed.data.title).toBe('Invoice Dashboard')

    // Should have inbox field
    const fieldsFlat = embed.data.fields?.flat() ?? []
    const inboxField = fieldsFlat.find((f: { name: string }) => f.name.includes('Inbox'))
    expect(inboxField).toBeDefined()
    expect(inboxField.value).toContain('#10')
    expect(inboxField.value).toContain('alice')

    // Should have description mentioning "awaiting your response"
    expect(embed.data.description).toContain('awaiting your response')
  })

  it('shows all three sections when user has inbox, drafts, and sent', async () => {
    const inbox = [makeInvoiceSummary({ id: 10, counterpartyName: 'alice', status: 'pending' })]
    const drafts = [makeInvoiceSummary({ id: 20, counterpartyName: 'charlie', status: 'draft' })]
    const sent = [makeInvoiceSummary({ id: 30, counterpartyName: 'dave', status: 'pending' })]
    mockGetInboxInvoices.mockResolvedValueOnce(inbox)
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetSentInvoices.mockResolvedValueOnce(sent)

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    const fieldsFlat = embed.data.fields?.flat() ?? []

    const inboxField = fieldsFlat.find((f: { name: string }) => f.name.includes('Inbox'))
    const draftsField = fieldsFlat.find((f: { name: string }) => f.name.includes('Drafts'))
    const sentField = fieldsFlat.find((f: { name: string }) => f.name.includes('Sent'))

    expect(inboxField).toBeDefined()
    expect(draftsField).toBeDefined()
    expect(sentField).toBeDefined()

    expect(inboxField.value).toContain('alice')
    expect(draftsField.value).toContain('charlie')
    expect(sentField.value).toContain('dave')

    // Description should contain all three parts
    expect(embed.data.description).toContain('awaiting your response')
    expect(embed.data.description).toContain('in progress')
    expect(embed.data.description).toContain('sent')
  })

  it('shows drafts section only when user has only drafts', async () => {
    const drafts = [makeInvoiceSummary({ id: 1, counterpartyName: 'bob', status: 'draft' })]
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    const fieldsFlat = embed.data.fields?.flat() ?? []

    const inboxField = fieldsFlat.find((f: { name: string }) => f.name.includes('Inbox'))
    const draftsField = fieldsFlat.find((f: { name: string }) => f.name.includes('Drafts'))
    const sentField = fieldsFlat.find((f: { name: string }) => f.name.includes('Sent'))

    expect(inboxField).toBeUndefined()
    expect(draftsField).toBeDefined()
    expect(sentField).toBeUndefined()
  })

  it('truncates invoice list at 10 items and shows overflow message', async () => {
    const manyDrafts = Array.from({ length: 12 }, (_, i) =>
      makeInvoiceSummary({
        id: i + 1,
        counterpartyName: `user${i + 1}`,
        status: 'draft',
      })
    )
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce(manyDrafts)
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    const fieldsFlat = embed.data.fields?.flat() ?? []
    const draftsField = fieldsFlat.find((f: { name: string }) => f.name.includes('Drafts'))

    expect(draftsField).toBeDefined()
    // Should show only 10 entries plus overflow message
    expect(draftsField.value).toContain('...and 2 more')
    // First 10 should be present
    expect(draftsField.value).toContain('#1')
    expect(draftsField.value).toContain('#10')
    // Items beyond 10 should not appear as direct listings
    expect(draftsField.value).not.toMatch(/#11\b.*user11/)
  })

  it('shows footer with /invoice hint', async () => {
    const drafts = [makeInvoiceSummary({ id: 1, counterpartyName: 'bob', status: 'draft' })]
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    expect(embed.data.footer).toBeDefined()
    expect(embed.data.footer.text).toContain('/invoice <id>')
  })

  it('fetches all three sections in parallel', async () => {
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce([])
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    // All three should be called
    expect(mockGetInboxInvoices).toHaveBeenCalledWith(1)
    expect(mockGetDraftInvoices).toHaveBeenCalledWith(1)
    expect(mockGetSentInvoices).toHaveBeenCalledWith(1)
  })

  it('correctly formats totals with multiple currencies', async () => {
    const drafts = [
      makeInvoiceSummary({
        id: 1,
        counterpartyName: 'bob',
        status: 'draft',
        itemCount: 1,
        totalsByCurrency: [
          { currency: 'CIS', total: 1234.56 },
          { currency: 'NCC', total: 789.01 },
        ],
      }),
    ]
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    const fieldsFlat = embed.data.fields?.flat() ?? []
    const draftsField = fieldsFlat.find((f: { name: string }) => f.name.includes('Drafts'))

    expect(draftsField.value).toContain('1234.56 CIS')
    expect(draftsField.value).toContain('789.01 NCC')
  })

  it('shows "No items" when invoice has empty totalsByCurrency', async () => {
    const drafts = [
      makeInvoiceSummary({
        id: 1,
        counterpartyName: 'bob',
        status: 'draft',
        totalsByCurrency: [],
      }),
    ]
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    const fieldsFlat = embed.data.fields?.flat() ?? []
    const draftsField = fieldsFlat.find((f: { name: string }) => f.name.includes('Drafts'))

    expect(draftsField.value).toContain('No items')
  })

  it('uses singular "item" label for single-item invoice', async () => {
    const drafts = [
      makeInvoiceSummary({
        id: 1,
        counterpartyName: 'bob',
        status: 'draft',
        itemCount: 1,
      }),
    ]
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    const fieldsFlat = embed.data.fields?.flat() ?? []
    const draftsField = fieldsFlat.find((f: { name: string }) => f.name.includes('Drafts'))

    expect(draftsField.value).toContain('1 item')
    expect(draftsField.value).not.toContain('1 items')
  })

  it('uses plural "items" label for multi-item invoice', async () => {
    const drafts = [
      makeInvoiceSummary({
        id: 1,
        counterpartyName: 'bob',
        status: 'draft',
        itemCount: 5,
      }),
    ]
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce(drafts)
    mockGetSentInvoices.mockResolvedValueOnce([])

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    const fieldsFlat = embed.data.fields?.flat() ?? []
    const draftsField = fieldsFlat.find((f: { name: string }) => f.name.includes('Drafts'))

    expect(draftsField.value).toContain('5 items')
  })

  it('shows sent section only when user has only sent invoices', async () => {
    const sent = [makeInvoiceSummary({ id: 1, counterpartyName: 'bob', status: 'pending' })]
    mockGetInboxInvoices.mockResolvedValueOnce([])
    mockGetDraftInvoices.mockResolvedValueOnce([])
    mockGetSentInvoices.mockResolvedValueOnce(sent)

    const { interaction, replyFn } = createMockInteraction()
    await invoicesCommand.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    const fieldsFlat = embed.data.fields?.flat() ?? []

    const inboxField = fieldsFlat.find((f: { name: string }) => f.name.includes('Inbox'))
    const draftsField = fieldsFlat.find((f: { name: string }) => f.name.includes('Drafts'))
    const sentField = fieldsFlat.find((f: { name: string }) => f.name.includes('Sent'))

    expect(inboxField).toBeUndefined()
    expect(draftsField).toBeUndefined()
    expect(sentField).toBeDefined()
  })
})
