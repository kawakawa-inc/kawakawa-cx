import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockDbQuery,
  mockEnrichSellOrders,
  mockFormatGroupedOrdersMulti,
  mockBuildFilterDescription,
  mockFormatCommodity,
  mockFormatCommodityWithMode,
  mockFormatLocation,
  mockSendPaginatedResponse,
} = vi.hoisted(() => ({
  mockDbQuery: {
    sellOrders: { findMany: vi.fn() },
    buyOrders: { findMany: vi.fn() },
  },
  mockEnrichSellOrders: vi.fn(),
  mockFormatGroupedOrdersMulti: vi.fn(),
  mockBuildFilterDescription: vi.fn(),
  mockFormatCommodity: vi.fn(),
  mockFormatCommodityWithMode: vi.fn(),
  mockFormatLocation: vi.fn(),
  mockSendPaginatedResponse: vi.fn(),
}))

vi.mock('@kawakawa/db', () => ({
  db: { query: mockDbQuery },
  sellOrders: {
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    userId: 'userId',
    orderType: 'orderType',
    priceListCode: 'priceListCode',
    updatedAt: 'updatedAt',
  },
  buyOrders: {
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    userId: 'userId',
    orderType: 'orderType',
    priceListCode: 'priceListCode',
    updatedAt: 'updatedAt',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, b) => ({ eq: b })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
  inArray: vi.fn((_col, vals: unknown) => ({ inArray: vals })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
}))

vi.mock('@kawakawa/services/market', () => ({
  enrichSellOrdersWithQuantities: mockEnrichSellOrders,
}))

vi.mock('./orderFormatter.js', () => ({
  formatGroupedOrdersMulti: mockFormatGroupedOrdersMulti,
  buildFilterDescription: mockBuildFilterDescription,
}))

vi.mock('./display.js', () => ({
  formatCommodity: mockFormatCommodity,
  formatCommodityWithMode: mockFormatCommodityWithMode,
  formatLocation: mockFormatLocation,
}))

vi.mock('../components/pagination.js', () => ({
  sendPaginatedResponseWithExtraButtons: mockSendPaginatedResponse,
}))

vi.mock('discord.js', () => ({
  EmbedBuilder: class {
    data: Record<string, unknown> = {}
    setTitle(t: string) {
      this.data.title = t
      return this
    }
    setDescription(d: string) {
      this.data.description = d
      return this
    }
    setColor(c: number) {
      this.data.color = c
      return this
    }
    setTimestamp() {
      return this
    }
  },
  MessageFlags: { Ephemeral: 64 },
}))

import {
  getAvailabilityEmoji,
  executeQuery,
  sendQueryResponse,
  type QueryOptions,
} from './queryHelper.js'

describe('queryHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFormatCommodity.mockImplementation((t: string) => t)
    mockFormatLocation.mockResolvedValue('Benten')
    mockBuildFilterDescription.mockReturnValue('All orders')
  })

  describe('getAvailabilityEmoji', () => {
    it('returns check for sufficient quantity', () => {
      expect(getAvailabilityEmoji(100, 100)).toBe('✅')
      expect(getAvailabilityEmoji(50, 200)).toBe('✅')
    })

    it('returns warning for partial availability', () => {
      expect(getAvailabilityEmoji(100, 50)).toBe('⚠️')
      expect(getAvailabilityEmoji(100, 1)).toBe('⚠️')
    })

    it('returns X for zero availability', () => {
      expect(getAvailabilityEmoji(100, 0)).toBe('❌')
    })
  })

  describe('executeQuery', () => {
    const baseOptions: QueryOptions = {
      commodities: [{ ticker: 'COF', name: 'Coffee' }],
      locations: [{ naturalId: 'BEN', name: 'Benten', type: 'station' }],
      userIds: [],
      displayNames: [],
      orderType: 'all',
      visibility: 'all',
      channelSettings: null,
      locationDisplayMode: 'natural-ids-only',
      commodityDisplayMode: 'ticker-only',
      isEphemeral: true,
    }

    it('returns empty result when no orders found', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValue([])
      mockDbQuery.buyOrders.findMany.mockResolvedValue([])

      const result = await executeQuery(baseOptions)

      expect(result.hasOrders).toBe(false)
      expect(result.items).toEqual([])
    })

    it('skips sell orders when orderType is buy', async () => {
      mockDbQuery.buyOrders.findMany.mockResolvedValue([])

      const result = await executeQuery({ ...baseOptions, orderType: 'buy' })

      expect(mockDbQuery.sellOrders.findMany).not.toHaveBeenCalled()
      expect(result.hasOrders).toBe(false)
    })

    it('skips buy orders when orderType is sell', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValue([])
      mockEnrichSellOrders.mockResolvedValue(new Map())
      mockFormatGroupedOrdersMulti.mockResolvedValue({ items: [], missingXitMaterials: [] })

      // Need at least one sell order to get past hasOrders check
      // Actually if sell returns empty, hasOrders is false
      await executeQuery({ ...baseOptions, orderType: 'sell' })

      expect(mockDbQuery.buyOrders.findMany).not.toHaveBeenCalled()
    })

    it('returns enriched sell orders when found', async () => {
      const sellOrder = {
        id: 1,
        userId: 10,
        commodityTicker: 'COF',
        locationId: 'BEN',
        price: '50.00',
        currency: 'CIS',
        priceListCode: null,
        limitMode: 'none',
        limitQuantity: null,
        user: { displayName: 'Alice', username: 'alice' },
        location: { naturalId: 'BEN', name: 'Benten' },
        commodity: { ticker: 'COF', name: 'Coffee' },
      }

      mockDbQuery.sellOrders.findMany.mockResolvedValue([sellOrder])
      mockDbQuery.buyOrders.findMany.mockResolvedValue([])
      mockEnrichSellOrders.mockResolvedValue(new Map([[1, { availableQuantity: 100 }]]))
      mockFormatGroupedOrdersMulti.mockResolvedValue({
        items: [{ content: 'line', sortKey: 'a' }],
        missingXitMaterials: [],
      })

      const result = await executeQuery(baseOptions)

      expect(result.hasOrders).toBe(true)
      expect(result.items).toHaveLength(1)
      expect(result.sellOrdersData).toHaveLength(1)
      expect(result.sellOrdersData![0].commodityTicker).toBe('COF')
    })

    it('includes missing XIT materials in result', async () => {
      mockDbQuery.sellOrders.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 10,
          commodityTicker: 'COF',
          locationId: 'BEN',
          price: '50',
          currency: 'CIS',
          priceListCode: null,
          limitMode: 'none',
          limitQuantity: null,
          user: { displayName: null, username: 'alice' },
          location: { naturalId: 'BEN', name: 'Benten' },
          commodity: { ticker: 'COF', name: 'Coffee' },
        },
      ])
      mockDbQuery.buyOrders.findMany.mockResolvedValue([])
      mockEnrichSellOrders.mockResolvedValue(new Map())
      mockFormatGroupedOrdersMulti.mockResolvedValue({
        items: [{ content: 'line', sortKey: 'a' }],
        missingXitMaterials: ['RAT', 'DW'],
      })
      mockFormatCommodityWithMode.mockImplementation(async (t: string) => t)

      const result = await executeQuery({
        ...baseOptions,
        requestedQuantities: { COF: 100, RAT: 50, DW: 200 },
      })

      expect(result.missingCommodities).toEqual(['RAT', 'DW'])
    })
  })

  describe('sendQueryResponse', () => {
    it('sends empty state message when no orders', async () => {
      const mockReply = vi.fn()
      const interaction = { reply: mockReply } as never

      await sendQueryResponse(
        interaction,
        {
          hasOrders: false,
          items: [],
          embed: {} as never,
          filterDescription: 'All orders',
        },
        { isEphemeral: true }
      )

      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('No orders found'),
        })
      )
    })

    it('sends paginated response when orders exist', async () => {
      const interaction = {} as never
      mockSendPaginatedResponse.mockResolvedValue(undefined)

      await sendQueryResponse(
        interaction,
        {
          hasOrders: true,
          items: [{ name: '', value: 'line' }],
          embed: {} as never,
          filterDescription: 'All orders',
        },
        { isEphemeral: false }
      )

      expect(mockSendPaginatedResponse).toHaveBeenCalled()
    })
  })
})
