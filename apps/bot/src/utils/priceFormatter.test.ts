import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetOrderDisplayPrice } = vi.hoisted(() => ({
  mockGetOrderDisplayPrice: vi.fn(),
}))

vi.mock('@kawakawa/services/market', () => ({
  getOrderDisplayPrice: mockGetOrderDisplayPrice,
}))

import { formatOrderPrice, calculateTotal, formatPrice, type FormattedPrice } from './priceFormatter.js'

describe('priceFormatter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('formatOrderPrice', () => {
    it('returns resolved price when available', async () => {
      mockGetOrderDisplayPrice.mockResolvedValue({ price: 50.5, currency: 'CIS' })

      const result = await formatOrderPrice({
        price: '0',
        currency: 'CIS',
        priceListCode: 'KAWA',
        commodityTicker: 'COF',
        locationId: 'BEN',
      })

      expect(result.displayPrice).toBe('50.50')
      expect(result.displayCurrency).toBe('CIS')
      expect(result.numericPrice).toBe(50.5)
    })

    it('falls back to raw price when no resolved price', async () => {
      mockGetOrderDisplayPrice.mockResolvedValue(null)

      const result = await formatOrderPrice({
        price: '42.50',
        currency: 'ICA',
        priceListCode: null,
        commodityTicker: 'COF',
        locationId: 'BEN',
      })

      expect(result.displayPrice).toBe('42.50')
      expect(result.displayCurrency).toBe('ICA')
      expect(result.numericPrice).toBe(42.5)
    })
  })

  describe('calculateTotal', () => {
    it('multiplies price by quantity', () => {
      const price: FormattedPrice = { displayPrice: '50.00', displayCurrency: 'CIS', numericPrice: 50 }
      expect(calculateTotal(price, 100)).toBe('5000.00')
    })

    it('handles decimal prices', () => {
      const price: FormattedPrice = { displayPrice: '12.75', displayCurrency: 'CIS', numericPrice: 12.75 }
      expect(calculateTotal(price, 4)).toBe('51.00')
    })

    it('handles zero quantity', () => {
      const price: FormattedPrice = { displayPrice: '50.00', displayCurrency: 'CIS', numericPrice: 50 }
      expect(calculateTotal(price, 0)).toBe('0.00')
    })
  })

  describe('formatPrice', () => {
    it('formats number to 2 decimal places', () => {
      expect(formatPrice(42)).toBe('42.00')
      expect(formatPrice(42.5)).toBe('42.50')
      expect(formatPrice(42.123)).toBe('42.12')
    })

    it('formats string to 2 decimal places', () => {
      expect(formatPrice('42')).toBe('42.00')
      expect(formatPrice('42.5')).toBe('42.50')
    })
  })
})
