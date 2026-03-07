import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'
import { Collection } from 'discord.js'

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

/**
 * Build a mock BotClient with a commands Collection containing test commands.
 */
function buildMockClient() {
  const commands = new Map<string, { data: { description: string } }>()
  commands.set('register', { data: { description: 'Create a new Kawakawa account' } })
  commands.set('link', { data: { description: 'Link an existing account' } })
  commands.set('whoami', { data: { description: 'Show your account details' } })
  commands.set('unlink', { data: { description: 'Unlink your Discord account' } })
  commands.set('inventory', { data: { description: 'View your inventory' } })
  commands.set('sync', { data: { description: 'Sync your FIO data' } })
  commands.set('sell', { data: { description: 'Create a sell order' } })
  commands.set('buy', { data: { description: 'Create a buy order' } })
  commands.set('bulksell', { data: { description: 'Bulk create sell orders' } })
  commands.set('bulkbuy', { data: { description: 'Bulk create buy orders' } })
  commands.set('orders', { data: { description: 'View your orders' } })
  commands.set('query', { data: { description: 'Query the market' } })
  commands.set('reserve', { data: { description: 'Reserve a sell order' } })
  commands.set('fill', { data: { description: 'Fill a buy order' } })
  commands.set('reservations', { data: { description: 'View your reservations' } })
  commands.set('settings', { data: { description: 'Manage your settings' } })
  commands.set('help', { data: { description: 'Learn how to use the bot' } })

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
    it('shows overview embed with all sections', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })
      // Attach mock client with commands
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        flags: 64,
      })

      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.embeds).toHaveLength(1)

      const embed = callArgs.embeds[0]
      // Title should be "Kawakawa Exchange Bot"
      expect(embed.data.title).toBe('Kawakawa Exchange Bot')
      // Description should contain welcome text
      expect(embed.data.description).toContain('Welcome to the Kawakawa internal commodity exchange')
      // Should have fields for each section + Quick Start
      expect(embed.data.fields.length).toBeGreaterThanOrEqual(7)
      // Footer should contain a tip
      expect(embed.data.footer.text).toContain('Tip')
    })

    it('includes command names in section overview fields', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      const fieldValues = embed.data.fields.map((f: { value: string }) => f.value)

      // Getting Started section should contain register, link, whoami, unlink
      const gettingStartedField = embed.data.fields.find(
        (f: { name: string }) => f.name.includes('Getting Started')
      )
      expect(gettingStartedField).toBeDefined()
      expect(gettingStartedField.value).toContain('register')
      expect(gettingStartedField.value).toContain('link')

      // Quick Start should reference key commands
      const quickStart = embed.data.fields.find(
        (f: { name: string }) => f.name.includes('Quick Start')
      )
      expect(quickStart).toBeDefined()
      expect(quickStart.value).toContain('register')
      expect(quickStart.value).toContain('settings')
    })
  })

  describe('specific topic matching a section', () => {
    it('shows getting_started section commands', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'getting_started' },
      })
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        flags: 64,
      })

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Getting Started')
      // Should have fields for register, link, whoami, unlink
      expect(embed.data.fields).toHaveLength(4)
      const fieldNames = embed.data.fields.map((f: { name: string }) => f.name)
      expect(fieldNames).toContain('/register')
      expect(fieldNames).toContain('/link')
      expect(fieldNames).toContain('/whoami')
      expect(fieldNames).toContain('/unlink')
    })

    it('shows inventory section commands', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'inventory' },
      })
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Inventory')
      expect(embed.data.fields).toHaveLength(2)
    })

    it('shows orders section with extended details', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'orders' },
      })
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Creating Orders')

      // The bulksell command should have extended details
      const bulksellField = embed.data.fields.find(
        (f: { name: string }) => f.name === '/bulksell'
      )
      expect(bulksellField).toBeDefined()
      expect(bulksellField.value).toContain('Format:')
    })

    it('shows market section', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'market' },
      })
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Market')
      expect(embed.data.fields).toHaveLength(2)
    })

    it('shows reservations section', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'reservations' },
      })
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Reservations')
      expect(embed.data.fields).toHaveLength(3)
    })

    it('shows settings section', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'settings' },
      })
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      expect(embed.data.title).toContain('Settings')
      expect(embed.data.fields).toHaveLength(1)
    })
  })

  describe('command description lookup', () => {
    it('shows "No description available" for unregistered commands', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'getting_started' },
      })
      // Build client with missing commands
      const client = buildMockClient()
      client.commands.delete('register')
      ;(interaction as Record<string, unknown>).client = client

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      const registerField = embed.data.fields.find(
        (f: { name: string }) => f.name === '/register'
      )
      expect(registerField).toBeDefined()
      expect(registerField.value).toBe('No description available')
    })

    it('pulls descriptions from registered commands', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'getting_started' },
      })
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      const registerField = embed.data.fields.find(
        (f: { name: string }) => f.name === '/register'
      )
      expect(registerField.value).toBe('Create a new Kawakawa account')
    })
  })

  describe('topic with extended details', () => {
    it('appends details below the command description', async () => {
      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { topic: 'inventory' },
      })
      ;(interaction as Record<string, unknown>).client = buildMockClient()

      await help.execute(interaction as never)

      const embed = replyFn.mock.calls[0][0].embeds[0]
      const inventoryField = embed.data.fields.find(
        (f: { name: string }) => f.name === '/inventory'
      )
      expect(inventoryField).toBeDefined()
      // Should contain description + details
      expect(inventoryField.value).toContain('View your inventory')
      expect(inventoryField.value).toContain('Filter by commodity or location')
    })
  })
})
