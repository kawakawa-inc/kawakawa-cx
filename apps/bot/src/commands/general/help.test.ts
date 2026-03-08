import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Mock discord.js
vi.mock('discord.js', () => {
  const mock = getDiscordMock()
  return {
    ...mock,
    Collection: class extends Map {},
  }
})

// Mock the message interaction adapter
vi.mock('../../adapters/messageInteraction.js', () => ({
  getCommandPrefix: vi.fn().mockReturnValue('/'),
  isMessageInteractionAdapter: vi.fn().mockReturnValue(false),
}))

// Import after mocks
import { help } from './help.js'
import type { HelpCategory } from '../../client.js'

/**
 * Build a mock command with helpInfo
 */
function mockCommand(
  name: string,
  description: string,
  category: HelpCategory,
  details?: string,
  examples?: string[],
  prefixEnabled?: boolean
) {
  return {
    data: { name, description },
    helpInfo: { category, details: details ?? description, examples: examples ?? [name] },
    prefixEnabled,
    execute: vi.fn(),
  }
}

/**
 * Build a mock BotClient with commands that have helpInfo.
 */
function buildMockClient() {
  const commands = new Map()
  commands.set(
    'register',
    mockCommand('register', 'Create a new Kawakawa account', 'getting_started', undefined, [
      'register myuser',
    ])
  )
  commands.set('link', mockCommand('link', 'Link an existing account', 'getting_started'))
  commands.set('whoami', mockCommand('whoami', 'Show your account details', 'getting_started'))
  commands.set(
    'unlink',
    mockCommand(
      'unlink',
      'Unlink your Discord account',
      'getting_started',
      'Discord-only accounts will be warned.',
      ['unlink', 'unlink confirm']
    )
  )
  commands.set(
    'password',
    mockCommand('password', 'Generate a password reset link', 'getting_started')
  )
  commands.set(
    'inventory',
    mockCommand(
      'inventory',
      'View your inventory',
      'inventory',
      'Filter by commodity or location.',
      ['inventory', 'inv COF']
    )
  )
  commands.set(
    'sync',
    mockCommand('sync', 'Sync your FIO data', 'inventory', undefined, undefined, false)
  )
  commands.set(
    'buy',
    mockCommand(
      'buy',
      'Browse supply or buy from someone',
      'trading',
      'Without a counterparty: browse sell orders.',
      ['buy RAT', 'buy 20 RAT BEN']
    )
  )
  commands.set('sell', mockCommand('sell', 'Browse demand or sell to someone', 'trading'))
  commands.set('query', mockCommand('query', 'Query the market', 'trading'))
  commands.set('order', mockCommand('order', 'Create or update an order', 'orders'))
  commands.set(
    'orders',
    mockCommand('orders', 'View your orders', 'orders', 'Use the Manage button to edit.')
  )
  commands.set('delete', mockCommand('delete', 'Delete orders', 'orders'))
  commands.set(
    'bulksell',
    mockCommand(
      'bulksell',
      'Bulk create sell orders',
      'orders',
      'Format: `TICKER LOCATION PRICE`',
      undefined,
      false
    )
  )
  commands.set(
    'bulkbuy',
    mockCommand('bulkbuy', 'Bulk create buy orders', 'orders', undefined, undefined, false)
  )
  commands.set('invoices', mockCommand('invoices', 'List draft invoices', 'invoices'))
  commands.set(
    'invoice',
    mockCommand('invoice', 'View invoice details', 'invoices', 'Submit, confirm, reject, cancel.', [
      'invoice 5',
    ])
  )
  commands.set('close', mockCommand('close', 'Submit a draft invoice', 'invoices'))
  commands.set('reservations', mockCommand('reservations', 'View your reservations', 'invoices'))
  commands.set('list', mockCommand('list', 'Create a shopping list', 'lists'))
  commands.set('lists', mockCommand('lists', 'View your lists', 'lists'))
  commands.set(
    'settings',
    mockCommand('settings', 'Manage your settings', 'settings', undefined, undefined, false)
  )
  commands.set('help', {
    data: { name: 'help', description: 'Learn how to use the bot' },
    execute: vi.fn(),
  })

  return {
    guilds: { cache: new Map() },
    commands,
  }
}

describe('help command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct command metadata', () => {
    expect(help.data).toBeDefined()
  })

  describe('no topic (overview)', () => {
    it('shows overview embed with all category sections', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        flags: 64,
      })

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toBe('Kawakawa Exchange Bot')
      expect(embed.data.description).toContain(
        'Welcome to the Kawakawa internal commodity exchange'
      )
      // Should have fields for each populated category + Quick Start
      expect(embed.data.fields.length).toBeGreaterThanOrEqual(7)
      expect(embed.data.footer.text).toContain('Tip')
    })

    it('includes command names in section overview fields', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]

      const gettingStartedField = embed.data.fields.find((f: { name: string }) =>
        f.name.includes('Getting Started')
      )
      expect(gettingStartedField).toBeDefined()
      expect(gettingStartedField.value).toContain('register')
      expect(gettingStartedField.value).toContain('link')

      const quickStart = embed.data.fields.find((f: { name: string }) =>
        f.name.includes('Quick Start')
      )
      expect(quickStart).toBeDefined()
      expect(quickStart.value).toContain('register')
    })
  })

  describe('category topic', () => {
    it('shows getting_started category commands', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'getting_started' },
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Getting Started')
      expect(embed.data.fields).toHaveLength(5)
      const fieldNames = embed.data.fields.map((f: { name: string }) => f.name)
      expect(fieldNames).toContain('/register')
      expect(fieldNames).toContain('/link')
      expect(fieldNames).toContain('/whoami')
      expect(fieldNames).toContain('/unlink')
      expect(fieldNames).toContain('/password')
    })

    it('shows inventory category commands', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'inventory' },
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Inventory')
      expect(embed.data.fields).toHaveLength(2)
    })

    it('shows orders category with details', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'orders' },
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Managing Orders')

      const bulksellField = embed.data.fields.find((f: { name: string }) => f.name === '/bulksell')
      expect(bulksellField).toBeDefined()
      expect(bulksellField.value).toContain('Format:')
    })

    it('shows settings category', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'settings' },
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Settings')
      expect(embed.data.fields).toHaveLength(1)
    })

    it('resolves category by title (case-insensitive)', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'Trading' },
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Trading')
    })
  })

  describe('command-specific help', () => {
    it('shows help for a specific command', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'buy' },
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toBe('/buy')
      expect(embed.data.description).toBe('Browse supply or buy from someone')

      const detailsField = embed.data.fields.find((f: { name: string }) => f.name === 'Details')
      expect(detailsField).toBeDefined()
      expect(detailsField.value).toContain('browse sell orders')

      const examplesField = embed.data.fields.find((f: { name: string }) => f.name === 'Examples')
      expect(examplesField).toBeDefined()
      expect(examplesField.value).toContain('/buy RAT')
    })

    it('shows slash-only footer for commands with prefixEnabled=false', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'bulksell' },
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.footer.text).toContain('slash-only')
    })
  })

  describe('unknown topic', () => {
    it('shows error for unknown topic', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'nonexistent' },
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Unknown topic or command'),
        flags: 64,
      })
    })
  })

  describe('category details from helpInfo', () => {
    it('appends details below the command description', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'inventory' },
      })
      ;(interaction as unknown as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      const inventoryField = embed.data.fields.find(
        (f: { name: string }) => f.name === '/inventory'
      )
      expect(inventoryField).toBeDefined()
      expect(inventoryField.value).toContain('View your inventory')
      expect(inventoryField.value).toContain('Filter by commodity or location')
    })
  })
})
