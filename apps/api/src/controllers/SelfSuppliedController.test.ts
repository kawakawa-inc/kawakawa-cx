import { describe, it, expect } from 'vitest'
import { toEntry, validateCreateRequest } from './SelfSuppliedController.js'

describe('toEntry', () => {
  it('converts a database row to API response format', () => {
    const row = {
      id: 42,
      userId: 1,
      locationId: 'UV-351a',
      commodityTicker: 'H2O',
      note: 'Self-producing at hub',
      createdAt: new Date('2026-05-01T10:30:00Z'),
    }
    const entry = toEntry(row)
    expect(entry).toEqual({
      id: 42,
      locationId: 'UV-351a',
      commodityTicker: 'H2O',
      note: 'Self-producing at hub',
      createdAt: '2026-05-01T10:30:00.000Z',
    })
  })

  it('handles null note', () => {
    const row = {
      id: 1,
      userId: 1,
      locationId: 'Etherwind',
      commodityTicker: 'DW',
      note: null,
      createdAt: new Date('2026-01-15T00:00:00Z'),
    }
    const entry = toEntry(row)
    expect(entry.note).toBeNull()
  })

  it('excludes userId from response (internal field)', () => {
    const row = {
      id: 1,
      userId: 999,
      locationId: 'Etherwind',
      commodityTicker: 'DW',
      note: null,
      createdAt: new Date('2026-01-15T00:00:00Z'),
    }
    const entry = toEntry(row)
    expect(entry).not.toHaveProperty('userId')
  })
})

describe('validateCreateRequest', () => {
  it('normalizes valid input', () => {
    const result = validateCreateRequest({
      locationId: 'UV-351a',
      commodityTicker: 'h2o',
      note: 'Test note',
    })
    expect(result).toEqual({
      locationId: 'UV-351a',
      ticker: 'H2O',
      note: 'Test note',
    })
  })

  it('uppercases commodity ticker', () => {
    const result = validateCreateRequest({
      locationId: 'Etherwind',
      commodityTicker: 'raf',
    })
    expect(result.ticker).toBe('RAF')
  })

  it('defaults note to null when not provided', () => {
    const result = validateCreateRequest({
      locationId: 'Etherwind',
      commodityTicker: 'H2O',
    })
    expect(result.note).toBeNull()
  })

  it('throws for missing locationId', () => {
    expect(() =>
      validateCreateRequest({
        locationId: '',
        commodityTicker: 'H2O',
      })
    ).toThrow('locationId is required')
  })

  it('throws for missing commodityTicker', () => {
    expect(() =>
      validateCreateRequest({
        locationId: 'Etherwind',
        commodityTicker: '',
      })
    ).toThrow('commodityTicker is required')
  })

  it('throws for undefined locationId', () => {
    expect(() =>
      validateCreateRequest({
        commodityTicker: 'H2O',
      } as { locationId: string; commodityTicker: string })
    ).toThrow('locationId is required')
  })

  it('throws for undefined commodityTicker', () => {
    expect(() =>
      validateCreateRequest({
        locationId: 'Etherwind',
      } as { locationId: string; commodityTicker: string })
    ).toThrow('commodityTicker is required')
  })
})
