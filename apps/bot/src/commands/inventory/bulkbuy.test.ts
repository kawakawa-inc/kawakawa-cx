import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRequireLinkedUser, mockGetMarketSettings, mockAwaitModal } = vi.hoisted(() => ({
  mockRequireLinkedUser: vi.fn(),
  mockGetMarketSettings: vi.fn(),
  mockAwaitModal: vi.fn(),
}))

vi.mock('discord.js', () => ({
  SlashCommandBuilder: class {
    setName() {
      return this
    }
    setDescription() {
      return this
    }
    addStringOption(fn: (opt: unknown) => unknown) {
      fn({
        setName: () => ({
          setDescription: () => ({
            setRequired: () => ({
              addChoices: () => ({}),
            }),
          }),
        }),
      })
      return this
    }
  },
  MessageFlags: { Ephemeral: 64 },
  ModalBuilder: class {
    setCustomId() {
      return this
    }
    setTitle() {
      return this
    }
    addComponents() {
      return this
    }
  },
  ActionRowBuilder: class {
    addComponents() {
      return this
    }
  },
  TextInputBuilder: class {
    setCustomId() {
      return this
    }
    setLabel() {
      return this
    }
    setPlaceholder() {
      return this
    }
    setStyle() {
      return this
    }
    setRequired() {
      return this
    }
    setMaxLength() {
      return this
    }
  },
  TextInputStyle: { Paragraph: 2 },
}))

vi.mock('@kawakawa/db', () => ({
  db: {},
  buyOrders: {},
}))
vi.mock('../../services/display.js', () => ({
  resolveCommodity: vi.fn(),
  resolveLocation: vi.fn(),
  formatCommodity: vi.fn(),
}))
vi.mock('../../services/userSettings.js', () => ({ getMarketSettings: mockGetMarketSettings }))
vi.mock('../../utils/auth.js', () => ({ requireLinkedUser: mockRequireLinkedUser }))
vi.mock('../../utils/interactions.js', () => ({
  showModalWithPrefixSupport: mockAwaitModal,
}))
vi.mock('../../utils/validation.js', () => ({ isValidCurrency: vi.fn() }))
vi.mock('../../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { bulkbuy } from './bulkbuy.js'

function createMockInteraction() {
  return {
    user: { id: 'discord123' },
    options: {
      getString: vi.fn().mockReturnValue(null),
    },
    showModal: vi.fn(),
    reply: vi.fn(),
  } as never
}

describe('bulkbuy command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early when user is not linked', async () => {
    mockRequireLinkedUser.mockResolvedValue(null)

    const interaction = createMockInteraction()
    await bulkbuy.execute(interaction)

    expect(mockRequireLinkedUser).toHaveBeenCalledWith(interaction)
    expect(mockAwaitModal).not.toHaveBeenCalled()
  })

  it('shows modal when user is linked', async () => {
    mockRequireLinkedUser.mockResolvedValue({ userId: 1 })
    mockGetMarketSettings.mockResolvedValue({
      preferredCurrency: 'NCC',
      defaultPriceList: null,
    })
    mockAwaitModal.mockResolvedValue(null)

    const interaction = createMockInteraction()
    await bulkbuy.execute(interaction)

    expect(mockAwaitModal).toHaveBeenCalled()
  })
})
