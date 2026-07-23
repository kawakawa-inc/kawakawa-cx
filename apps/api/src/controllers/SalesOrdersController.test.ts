import { describe, it, expect } from 'vitest'
import {
  assertClaimable,
  assertFulfillable,
  assertCancellable,
  normalizeItems,
  computeReadinessLines,
} from './SalesOrdersController.js'
import type { SalesOrderStatus } from '@kawakawa/types'

const order = (
  status: SalesOrderStatus,
  requestedByUserId: number,
  claimedByUserId: number | null = null
) => ({ status, requestedByUserId, claimedByUserId })

describe('SalesOrdersController guards', () => {
  describe('assertClaimable', () => {
    it('allows claiming an open order', () => {
      expect(() => assertClaimable(order('open', 2))).not.toThrow()
    })
    it('rejects claiming a non-open order', () => {
      expect(() => assertClaimable(order('claimed', 2, 3))).toThrow(
        'Only open orders can be claimed'
      )
      expect(() => assertClaimable(order('fulfilled', 2, 3))).toThrow()
      expect(() => assertClaimable(order('cancelled', 2))).toThrow()
    })
  })

  describe('assertFulfillable', () => {
    it('allows the claimer to fulfill a claimed order', () => {
      expect(() => assertFulfillable(order('claimed', 2, 3), 3)).not.toThrow()
    })
    it('rejects fulfilling a non-claimed order', () => {
      expect(() => assertFulfillable(order('open', 2, null), 3)).toThrow(
        'Only claimed orders can be fulfilled'
      )
    })
    it('rejects fulfilling an order claimed by someone else', () => {
      expect(() => assertFulfillable(order('claimed', 2, 3), 5)).toThrow(
        'Only the member who claimed this order can fulfill it'
      )
    })
  })

  describe('assertCancellable', () => {
    it('lets the requestor cancel an open order', () => {
      expect(() => assertCancellable(order('open', 2, null), 2)).not.toThrow()
    })
    it('lets the requestor cancel a claimed order', () => {
      expect(() => assertCancellable(order('claimed', 2, 3), 2)).not.toThrow()
    })
    it('lets the claimer cancel (release) an order they claimed', () => {
      expect(() => assertCancellable(order('claimed', 2, 3), 3)).not.toThrow()
    })
    it('rejects cancelling a fulfilled or cancelled order', () => {
      expect(() => assertCancellable(order('fulfilled', 2, 3), 2)).toThrow(
        'Cannot cancel a fulfilled order'
      )
      expect(() => assertCancellable(order('cancelled', 2, 3), 2)).toThrow(
        'Cannot cancel a cancelled order'
      )
    })
    it('rejects cancellation by an unrelated user', () => {
      expect(() => assertCancellable(order('open', 2, null), 99)).toThrow(
        'Only the requestor or claimer can cancel this order'
      )
    })
  })

  describe('normalizeItems', () => {
    it('throws when there are no items', () => {
      expect(() => normalizeItems([])).toThrow('at least one package')
      expect(() => normalizeItems(undefined)).toThrow('at least one package')
    })
    it('throws on a non-positive quantity', () => {
      expect(() => normalizeItems([{ packageId: 1, quantity: 0 }])).toThrow('quantity must be > 0')
      expect(() => normalizeItems([{ packageId: 1, quantity: -3 }])).toThrow('quantity must be > 0')
    })
    it('throws on a non-integer packageId', () => {
      expect(() => normalizeItems([{ packageId: 1.5, quantity: 1 }])).toThrow('Invalid packageId')
    })
    it('floors and merges duplicate packages, summing quantity', () => {
      const result = normalizeItems([
        { packageId: 1, quantity: 2 },
        { packageId: 1, quantity: 3.9 },
        { packageId: 2, quantity: 1 },
      ])
      expect(result.get(1)).toBe(5)
      expect(result.get(2)).toBe(1)
    })
  })

  describe('computeReadinessLines', () => {
    const names = new Map([
      ['LHP', 'Large Hull Plate'],
      ['SSC', 'Solar Cell'],
      ['FFC', 'Fuel Cell'],
    ])

    it('computes shortfall = max(0, needed - available) per ticker', () => {
      const needed = new Map([
        ['LHP', 64],
        ['SSC', 26],
        ['FFC', 1],
      ])
      const available = new Map([
        ['LHP', 40], // short 24
        ['SSC', 30], // covered
        // FFC absent -> treated as 0, short 1
      ])
      const lines = computeReadinessLines(needed, available, names)
      const byTicker = Object.fromEntries(lines.map(l => [l.commodityTicker, l]))
      expect(byTicker.LHP).toMatchObject({ needed: 64, available: 40, shortfall: 24 })
      expect(byTicker.SSC).toMatchObject({ needed: 26, available: 30, shortfall: 0 })
      expect(byTicker.FFC).toMatchObject({ needed: 1, available: 0, shortfall: 1 })
    })

    it('sorts shortfalls first (largest first), then by ticker', () => {
      const needed = new Map([
        ['SSC', 10],
        ['LHP', 10],
        ['FFC', 10],
      ])
      const available = new Map([
        ['SSC', 10], // 0
        ['LHP', 2], // 8
        ['FFC', 5], // 5
      ])
      const lines = computeReadinessLines(needed, available, names)
      expect(lines.map(l => l.commodityTicker)).toEqual(['LHP', 'FFC', 'SSC'])
    })

    it('attaches commodity display names when known', () => {
      const lines = computeReadinessLines(new Map([['LHP', 1]]), new Map(), names)
      expect(lines[0].commodityName).toBe('Large Hull Plate')
    })
  })
})
