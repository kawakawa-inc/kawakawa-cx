/**
 * Validator Tests
 */

import { describe, it, expect } from 'vitest'
import {
  validateForOrder,
  validateForInvoice,
  validateForQuery,
  hasContent,
  summarizeParsed,
} from '../validators.js'
import type { ParseResult } from '../types.js'

// Helper to create a minimal ParseResult
function createResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    items: [],
    location: null,
    user: null,
    xit: null,
    actions: new Set(),
    limit: null,
    unresolved: [],
    errors: [],
    ...overrides,
  }
}

describe('validateForOrder', () => {
  it('should pass with valid order data', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 100 }],
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
    })

    const validation = validateForOrder(result)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
  })

  it('should fail without commodities', () => {
    const result = createResult({
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
    })

    const validation = validateForOrder(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('At least one commodity is required')
  })

  it('should fail without location', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 100 }],
    })

    const validation = validateForOrder(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('Location is required')
  })

  it('should fail when commodity has no quantity', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: null }],
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
    })

    const validation = validateForOrder(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors[0]).toContain('Quantity required for')
  })

  it('should fail when commodity has zero quantity', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 0 }],
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
    })

    const validation = validateForOrder(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors[0]).toContain('Invalid quantity for')
  })

  it('should include parse errors', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 100 }],
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
      errors: ['Multiple locations found'],
    })

    const validation = validateForOrder(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('Multiple locations found')
  })
})

describe('validateForInvoice', () => {
  it('should pass with valid invoice data', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 100 }],
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
      user: { userId: 1, username: 'bob', displayName: null, fioUsername: null },
    })

    const validation = validateForInvoice(result)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
  })

  it('should fail without commodities', () => {
    const result = createResult({
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
      user: { userId: 1, username: 'bob', displayName: null, fioUsername: null },
    })

    const validation = validateForInvoice(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('At least one commodity is required')
  })

  it('should fail without location', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 100 }],
      user: { userId: 1, username: 'bob', displayName: null, fioUsername: null },
    })

    const validation = validateForInvoice(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('Location is required')
  })

  it('should fail without user', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 100 }],
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
    })

    const validation = validateForInvoice(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('Counterparty user is required')
  })

  it('should fail when commodity has no quantity', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: null }],
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
      user: { userId: 1, username: 'bob', displayName: null, fioUsername: null },
    })

    const validation = validateForInvoice(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors[0]).toContain('Quantity required for')
  })
})

describe('validateForQuery', () => {
  it('should always pass (queries are lenient)', () => {
    const result = createResult()
    const validation = validateForQuery(result)
    expect(validation.valid).toBe(true)
  })

  it('should pass with partial data', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: null }],
    })

    const validation = validateForQuery(result)
    expect(validation.valid).toBe(true)
  })

  it('should pass even with parse errors', () => {
    const result = createResult({
      errors: ['Some error'],
    })

    const validation = validateForQuery(result)
    expect(validation.valid).toBe(true)
  })
})

describe('hasContent', () => {
  it('should return false for empty result', () => {
    const result = createResult()
    expect(hasContent(result)).toBe(false)
  })

  it('should return true when items present', () => {
    const result = createResult({
      items: [{ commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 100 }],
    })
    expect(hasContent(result)).toBe(true)
  })

  it('should return true when location present', () => {
    const result = createResult({
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
    })
    expect(hasContent(result)).toBe(true)
  })

  it('should return true when user present', () => {
    const result = createResult({
      user: { userId: 1, username: 'bob', displayName: null, fioUsername: null },
    })
    expect(hasContent(result)).toBe(true)
  })
})

describe('summarizeParsed', () => {
  it('should return "nothing parsed" for empty result', () => {
    const result = createResult()
    expect(summarizeParsed(result)).toBe('nothing parsed')
  })

  it('should summarize commodities', () => {
    const result = createResult({
      items: [
        { commodity: { ticker: 'COF', name: 'Coffee' }, quantity: 100 },
        { commodity: { ticker: 'RAT', name: 'Rations' }, quantity: 200 },
      ],
    })
    expect(summarizeParsed(result)).toContain('commodities: COF, RAT')
  })

  it('should summarize location', () => {
    const result = createResult({
      location: { naturalId: 'BEN', name: 'Benten', type: 'planet' },
    })
    expect(summarizeParsed(result)).toContain('location: Benten')
  })

  it('should summarize user', () => {
    const result = createResult({
      user: { userId: 1, username: 'bob', displayName: null, fioUsername: null },
    })
    expect(summarizeParsed(result)).toContain('user: bob')
  })

  it('should summarize limit', () => {
    const result = createResult({
      limit: { mode: 'reserve', quantity: 1000 },
    })
    expect(summarizeParsed(result)).toContain('limit: reserve 1000')
  })

  it('should summarize actions', () => {
    const result = createResult({
      actions: new Set(['send', 'close'] as const),
    })
    expect(summarizeParsed(result)).toContain('actions: send, close')
  })
})
