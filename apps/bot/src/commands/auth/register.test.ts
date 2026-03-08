import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMockInteraction, getDiscordMock } from '../../test/mockDiscord.js'

// Create hoisted mock functions
const { mockFindFirstProfile, mockFindFirstUser, mockTransaction, mockSettingsGetAll } = vi.hoisted(
  () => ({
    mockFindFirstProfile: vi.fn(),
    mockFindFirstUser: vi.fn(),
    mockTransaction: vi.fn(),
    mockSettingsGetAll: vi.fn(),
  })
)

// Mock discord.js
vi.mock('discord.js', () => getDiscordMock())

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    query: {
      userDiscordProfiles: {
        findFirst: mockFindFirstProfile,
      },
      users: {
        findFirst: mockFindFirstUser,
      },
    },
    transaction: mockTransaction,
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1, username: 'testuser' }]),
      }),
    }),
  },
  users: { username: 'username' },
  userDiscordProfiles: { discordId: 'discordId' },
  userRoles: {},
  discordRoleMappings: { discordRoleId: 'discordRoleId', appRoleId: 'appRoleId' },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
  inArray: vi.fn().mockImplementation((field, values) => ({ inArray: { field, values } })),
}))

// Mock settings service
vi.mock('@kawakawa/services/settings', () => ({
  settingsService: {
    getAll: mockSettingsGetAll,
  },
}))

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock message interaction adapter
const { mockIsMessageInteraction } = vi.hoisted(() => ({
  mockIsMessageInteraction: vi.fn().mockReturnValue(false),
}))

vi.mock('../../adapters/messageInteraction.js', () => ({
  getCommandPrefix: vi.fn().mockReturnValue('/'),
  isMessageInteractionAdapter: mockIsMessageInteraction,
}))

// Import after mocks
import { register } from './register.js'

describe('register command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettingsGetAll.mockResolvedValue({})
  })

  it('has correct command metadata', () => {
    expect(register.data).toBeDefined()
  })

  describe('already linked user', () => {
    it('shows error when user already has a linked account', async () => {
      mockFindFirstProfile.mockResolvedValueOnce({
        userId: 1,
        discordId: '123456789',
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { username: 'testuser', display_name: 'Test User' },
      })

      await register.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('already have a linked Kawakawa account'),
        flags: 64,
      })
    })

    it('suggests whoami and unlink commands when already linked', async () => {
      mockFindFirstProfile.mockResolvedValueOnce({
        userId: 1,
        discordId: '123456789',
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { username: 'testuser', display_name: 'Test User' },
      })

      await register.execute(interaction as never)

      const content = replyFn.mock.calls[0][0].content
      expect(content).toContain('/whoami')
      expect(content).toContain('/unlink')
    })
  })

  describe('username taken', () => {
    it('shows error when username is already taken', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)
      mockFindFirstUser.mockResolvedValueOnce({ id: 2, username: 'takenuser' })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { username: 'takenuser', display_name: 'Some Name' },
      })

      await register.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('"takenuser" is already taken'),
        flags: 64,
      })
    })
  })

  describe('username validation', () => {
    it('rejects username shorter than 3 characters', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { username: 'ab', display_name: 'Short Name' },
      })

      await register.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('between 3 and 50 characters'),
        flags: 64,
      })
    })
  })

  describe('successful registration', () => {
    it('creates a new account with transaction', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)
      mockFindFirstUser.mockResolvedValueOnce(null)
      mockSettingsGetAll.mockResolvedValueOnce({})

      // Mock transaction to execute the callback
      mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 1, username: 'newuser' }]),
            }),
          }),
        }
        await cb(tx)
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { username: 'newuser', display_name: 'New User' },
      })

      await register.execute(interaction as never)

      expect(mockTransaction).toHaveBeenCalled()
      // Should reply with an embed (success)
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      )
    })

    it('shows success embed with correct fields', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)
      mockFindFirstUser.mockResolvedValueOnce(null)
      mockSettingsGetAll.mockResolvedValueOnce({})

      mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 1, username: 'newuser' }]),
            }),
          }),
        }
        await cb(tx)
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { username: 'newuser', display_name: 'New User' },
      })

      await register.execute(interaction as never)

      const callArgs = replyFn.mock.calls[0][0]
      expect(callArgs.embeds).toHaveLength(1)

      const embed = callArgs.embeds[0]
      expect(embed.data.title).toBe('Account Created!')
      // Should have Username, Display Name, Status, Assigned Roles fields
      const fieldNames = embed.data.fields.map((f: { name: string }) => f.name)
      expect(fieldNames).toContain('Username')
      expect(fieldNames).toContain('Display Name')
      expect(fieldNames).toContain('Status')
      expect(fieldNames).toContain('Assigned Roles')
    })

    it('assigns unverified role when user has no matching Discord roles', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)
      mockFindFirstUser.mockResolvedValueOnce(null)
      mockSettingsGetAll.mockResolvedValueOnce({})

      const insertedRoles: string[] = []
      mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockImplementation((_table: unknown) => ({
            values: vi.fn().mockImplementation((values: { roleId?: string }) => {
              if (values.roleId) {
                insertedRoles.push(values.roleId)
              }
              return {
                returning: vi.fn().mockResolvedValue([{ id: 1, username: 'newuser' }]),
              }
            }),
          })),
        }
        await cb(tx)
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { username: 'newuser', display_name: 'New User' },
      })

      await register.execute(interaction as never)

      // Should show "Pending Approval" status and "unverified" role
      const embed = replyFn.mock.calls[0][0].embeds[0]
      const statusField = embed.data.fields.find((f: { name: string }) => f.name === 'Status')
      expect(statusField.value).toContain('Pending Approval')

      const rolesField = embed.data.fields.find(
        (f: { name: string }) => f.name === 'Assigned Roles'
      )
      expect(rolesField.value).toContain('unverified')
    })
  })

  describe('prefix command parsing', () => {
    beforeEach(() => {
      mockIsMessageInteraction.mockReturnValue(true)
    })

    afterEach(() => {
      mockIsMessageInteraction.mockReturnValue(false)
    })

    it('shows usage when no input provided', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { input: '' },
      })

      await register.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Usage'),
        flags: 64,
      })
    })

    it('shows usage when input is null', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: {},
      })

      await register.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('Usage'),
        flags: 64,
      })
    })

    it('parses username only (uses username as display name)', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)
      mockFindFirstUser.mockResolvedValueOnce(null)
      mockSettingsGetAll.mockResolvedValueOnce({})

      mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 1, username: 'myuser' }]),
            }),
          }),
        }
        await cb(tx)
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { input: 'myuser' },
      })

      await register.execute(interaction as never)

      expect(mockTransaction).toHaveBeenCalled()
      const embed = replyFn.mock.calls[0][0].embeds[0]
      const usernameField = embed.data.fields.find((f: { name: string }) => f.name === 'Username')
      expect(usernameField.value).toBe('myuser')
      const displayField = embed.data.fields.find(
        (f: { name: string }) => f.name === 'Display Name'
      )
      expect(displayField.value).toBe('myuser')
    })

    it('parses username and multi-word display name', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)
      mockFindFirstUser.mockResolvedValueOnce(null)
      mockSettingsGetAll.mockResolvedValueOnce({})

      mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 1, username: 'myuser' }]),
            }),
          }),
        }
        await cb(tx)
      })

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { input: 'myuser My Cool Display Name' },
      })

      await register.execute(interaction as never)

      expect(mockTransaction).toHaveBeenCalled()
      const embed = replyFn.mock.calls[0][0].embeds[0]
      const usernameField = embed.data.fields.find((f: { name: string }) => f.name === 'Username')
      expect(usernameField.value).toBe('myuser')
      const displayField = embed.data.fields.find(
        (f: { name: string }) => f.name === 'Display Name'
      )
      expect(displayField.value).toBe('My Cool Display Name')
    })
  })

  describe('error handling', () => {
    it('shows error message when transaction fails', async () => {
      mockFindFirstProfile.mockResolvedValueOnce(null)
      mockFindFirstUser.mockResolvedValueOnce(null)
      mockSettingsGetAll.mockResolvedValueOnce({})
      mockTransaction.mockRejectedValueOnce(new Error('Database error'))

      const { interaction, replyFn } = createMockInteraction({
        stringOptions: { username: 'newuser', display_name: 'New User' },
      })

      await register.execute(interaction as never)

      expect(replyFn).toHaveBeenCalledWith({
        content: expect.stringContaining('error occurred'),
        flags: 64,
      })
    })
  })
})
