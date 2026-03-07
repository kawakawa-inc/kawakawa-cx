/**
 * Tests for /invoice command - View invoice details with actions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const {
  mockRequireLinkedUser,
  mockGetInvoiceWithDetails,
  mockSubmitInvoice,
  mockConfirmInvoice,
  mockRejectInvoice,
  mockCancelInvoice,
  mockFormatLineItemsForEmbed,
  mockGetInvoiceStatusEmoji,
  mockGetInvoiceStatusLabel,
  mockGetDisplaySettings,
  mockGetCommandPrefix,
} = vi.hoisted(() => ({
  mockRequireLinkedUser: vi.fn(),
  mockGetInvoiceWithDetails: vi.fn(),
  mockSubmitInvoice: vi.fn(),
  mockConfirmInvoice: vi.fn(),
  mockRejectInvoice: vi.fn(),
  mockCancelInvoice: vi.fn(),
  mockFormatLineItemsForEmbed: vi.fn(),
  mockGetInvoiceStatusEmoji: vi.fn(),
  mockGetInvoiceStatusLabel: vi.fn(),
  mockGetDisplaySettings: vi.fn(),
  mockGetCommandPrefix: vi.fn(),
}))

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock auth
vi.mock('../../utils/auth.js', () => ({ requireLinkedUser: mockRequireLinkedUser }))

// Mock invoice service
vi.mock('../../services/invoiceService.js', () => ({
  getInvoiceWithDetails: mockGetInvoiceWithDetails,
  submitInvoice: mockSubmitInvoice,
  confirmInvoice: mockConfirmInvoice,
  rejectInvoice: mockRejectInvoice,
  cancelInvoice: mockCancelInvoice,
  formatLineItemsForEmbed: mockFormatLineItemsForEmbed,
  getInvoiceStatusEmoji: mockGetInvoiceStatusEmoji,
  getInvoiceStatusLabel: mockGetInvoiceStatusLabel,
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

// Mock database
vi.mock('@kawakawa/db', () => ({
  db: { query: {} },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}))

import { invoice } from './invoice.js'

// Helper to create an invoice with details
function makeInvoiceWithDetails(
  overrides: Partial<{
    id: number
    userId: number
    counterpartyUserId: number
    counterpartyName: string
    counterpartyFioUsername: string | null
    status: string
    submittedAt: Date | null
    lineItems: unknown[]
    totalsByCurrency: { currency: string; total: number }[]
    itemCount: number
  }> = {}
) {
  return {
    id: overrides.id ?? 1,
    userId: overrides.userId ?? 10,
    counterpartyUserId: overrides.counterpartyUserId ?? 20,
    counterpartyName: overrides.counterpartyName ?? 'bob',
    counterpartyFioUsername: overrides.counterpartyFioUsername ?? null,
    status: overrides.status ?? 'draft',
    name: null,
    notes: null,
    submittedAt: overrides.submittedAt ?? null,
    itemCount: overrides.itemCount ?? 1,
    totalsByCurrency: overrides.totalsByCurrency ?? [{ currency: 'CIS', total: 500 }],
    lineItems: overrides.lineItems ?? [
      {
        id: 1,
        commodityTicker: 'COF',
        locationId: 'BEN',
        quantity: 100,
        unitPrice: 5,
        currency: 'CIS',
        priceListCode: null,
        orderType: 'sell',
        totalValue: 500,
        notes: null,
      },
    ],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

/**
 * Creates a mock interaction with getInteger support for the invoice command.
 */
function createInvoiceInteraction(invoiceId: number, userId?: string) {
  const result = createMockInteraction({ userId })
  // Add getInteger to the options mock
  ;(result.interaction.options as Record<string, unknown>).getInteger = vi
    .fn()
    .mockReturnValue(invoiceId)
  return result
}

describe('/invoice command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCommandPrefix.mockReturnValue('/')
    mockRequireLinkedUser.mockResolvedValue({ userId: 10 })
    mockGetDisplaySettings.mockResolvedValue({ locationDisplayMode: 'natural-ids-only' })
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
    mockGetInvoiceStatusLabel.mockImplementation((status: string) => {
      const map: Record<string, string> = {
        draft: 'Draft',
        pending: 'Pending',
        confirmed: 'Confirmed',
        fulfilled: 'Fulfilled',
        partially_fulfilled: 'Partially Fulfilled',
        cancelled: 'Cancelled',
      }
      return map[status] ?? status
    })
    mockFormatLineItemsForEmbed.mockResolvedValue([
      '📤 100x **COF** @ BEN - 5.00 CIS/u = 500.00 CIS',
    ])
  })

  it('has correct command metadata', () => {
    expect(invoice.data).toBeDefined()
  })

  it('returns early when user is not linked', async () => {
    mockRequireLinkedUser.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createInvoiceInteraction(1)
    await invoice.execute(interaction as never)

    expect(replyFn).not.toHaveBeenCalled()
    expect(mockGetInvoiceWithDetails).not.toHaveBeenCalled()
  })

  it('shows error when invoice is not found', async () => {
    mockGetInvoiceWithDetails.mockResolvedValueOnce(null)

    const { interaction, replyFn } = createInvoiceInteraction(999)
    await invoice.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith({
      content: expect.stringContaining('Could not find invoice #999'),
      flags: 64,
    })
  })

  it('shows detail embed for creator role with draft status', async () => {
    const inv = makeInvoiceWithDetails({ id: 5, userId: 10, status: 'draft' })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([expect.any(Object)]),
        components: expect.arrayContaining([expect.any(Object)]),
        flags: 64,
      })
    )

    // The embed should contain the invoice title and counterparty info
    const embed = replyFn.mock.calls[0][0].embeds[0]
    expect(embed.data.title).toContain('Invoice #5')
    expect(embed.data.description).toContain('To:')
    expect(embed.data.description).toContain('bob')
  })

  it('shows detail embed for counterparty role with pending status', async () => {
    // userId 10 is the caller, but invoice creator is 20 - so caller is counterparty
    const inv = makeInvoiceWithDetails({
      id: 7,
      userId: 20,
      counterpartyUserId: 10,
      counterpartyName: 'alice',
      status: 'pending',
      submittedAt: new Date('2026-01-15'),
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(7)
    await invoice.execute(interaction as never)

    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([expect.any(Object)]),
        components: expect.arrayContaining([expect.any(Object)]),
        flags: 64,
      })
    )

    // Counterparty should see "From:" label
    const embed = replyFn.mock.calls[0][0].embeds[0]
    expect(embed.data.description).toContain('From:')
  })

  it('shows Submit and Cancel buttons for creator with draft status', async () => {
    const inv = makeInvoiceWithDetails({ id: 5, userId: 10, status: 'draft' })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    // Should have components (action buttons)
    const reply = replyFn.mock.calls[0][0]
    expect(reply.components).toBeDefined()
    expect(reply.components.length).toBeGreaterThan(0)
  })

  it('shows Confirm and Reject buttons for counterparty with pending status', async () => {
    const inv = makeInvoiceWithDetails({
      id: 7,
      userId: 20,
      counterpartyUserId: 10,
      status: 'pending',
      submittedAt: new Date('2026-01-15'),
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(7)
    await invoice.execute(interaction as never)

    const reply = replyFn.mock.calls[0][0]
    expect(reply.components).toBeDefined()
    expect(reply.components.length).toBeGreaterThan(0)
  })

  it('shows Cancel button for creator with pending status', async () => {
    const inv = makeInvoiceWithDetails({
      id: 5,
      userId: 10,
      status: 'pending',
      submittedAt: new Date('2026-01-15'),
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const reply = replyFn.mock.calls[0][0]
    expect(reply.components).toBeDefined()
    expect(reply.components.length).toBeGreaterThan(0)
  })

  it('shows Cancel button for creator with confirmed status', async () => {
    const inv = makeInvoiceWithDetails({
      id: 5,
      userId: 10,
      status: 'confirmed',
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const reply = replyFn.mock.calls[0][0]
    expect(reply.components).toBeDefined()
    expect(reply.components.length).toBeGreaterThan(0)
  })

  it('shows no buttons for terminal status (cancelled)', async () => {
    const inv = makeInvoiceWithDetails({ id: 5, userId: 10, status: 'cancelled' })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const reply = replyFn.mock.calls[0][0]
    // No components key when no buttons
    expect(reply.components).toBeUndefined()
  })

  it('shows no buttons for terminal status (fulfilled)', async () => {
    const inv = makeInvoiceWithDetails({ id: 5, userId: 10, status: 'fulfilled' })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const reply = replyFn.mock.calls[0][0]
    expect(reply.components).toBeUndefined()
  })

  it('shows no buttons for counterparty with non-pending status', async () => {
    // Counterparty viewing a confirmed invoice - no actions available for counterparty
    const inv = makeInvoiceWithDetails({
      id: 5,
      userId: 20,
      counterpartyUserId: 10,
      status: 'confirmed',
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const reply = replyFn.mock.calls[0][0]
    expect(reply.components).toBeUndefined()
  })

  it('shows "No items yet" when invoice has zero line items', async () => {
    const inv = makeInvoiceWithDetails({
      id: 5,
      userId: 10,
      status: 'draft',
      lineItems: [],
      itemCount: 0,
      totalsByCurrency: [],
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    // Should have a field indicating no items
    const fieldsFlat = embed.data.fields?.flat() ?? []
    const itemsField = fieldsFlat.find((f: { name: string; value: string }) => f.name === 'Items')
    expect(itemsField).toBeDefined()
    expect(itemsField.value).toContain('No items yet')
  })

  it('includes totals field when invoice has items', async () => {
    const inv = makeInvoiceWithDetails({
      id: 5,
      userId: 10,
      status: 'draft',
      totalsByCurrency: [{ currency: 'CIS', total: 500 }],
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    const fieldsFlat = embed.data.fields?.flat() ?? []
    const totalField = fieldsFlat.find((f: { name: string; value: string }) => f.name === 'Total')
    expect(totalField).toBeDefined()
    expect(totalField.value).toContain('500.00 CIS')
  })

  it('includes footer tip for creator with draft status', async () => {
    const inv = makeInvoiceWithDetails({ id: 5, userId: 10, status: 'draft' })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    expect(embed.data.footer).toBeDefined()
    expect(embed.data.footer.text).toContain('Add items')
  })

  it('includes footer tip for counterparty with pending status', async () => {
    const inv = makeInvoiceWithDetails({
      id: 7,
      userId: 20,
      counterpartyUserId: 10,
      status: 'pending',
      submittedAt: new Date('2026-01-15'),
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(7)
    await invoice.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    expect(embed.data.footer).toBeDefined()
    expect(embed.data.footer.text).toContain('Confirm or Reject')
  })

  it('includes footer tip for confirmed status referencing reservations', async () => {
    const inv = makeInvoiceWithDetails({
      id: 5,
      userId: 10,
      status: 'confirmed',
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    expect(embed.data.footer).toBeDefined()
    expect(embed.data.footer.text).toContain('reservations')
  })

  it('shows submitted date when present', async () => {
    const inv = makeInvoiceWithDetails({
      id: 5,
      userId: 10,
      status: 'pending',
      submittedAt: new Date('2026-01-15T12:00:00Z'),
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    // Submitted date should appear as a Discord timestamp
    expect(embed.data.description).toContain('Submitted')
    expect(embed.data.description).toContain('<t:')
  })

  it('shows created date in description', async () => {
    const inv = makeInvoiceWithDetails({
      id: 5,
      userId: 10,
      status: 'draft',
    })
    mockGetInvoiceWithDetails.mockResolvedValueOnce(inv)

    const { interaction, replyFn } = createInvoiceInteraction(5)
    await invoice.execute(interaction as never)

    const embed = replyFn.mock.calls[0][0].embeds[0]
    expect(embed.data.description).toContain('Created')
    expect(embed.data.description).toContain('<t:')
  })
})
