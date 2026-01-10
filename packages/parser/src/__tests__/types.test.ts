/**
 * Basic type tests to verify the package structure works.
 */

import { describe, it, expect } from 'vitest'
import type { ResolvedCommodity, ResolvedLocation, ResolvedUser, ParseResult } from '../types.js'

describe('types', () => {
  it('should allow creating ResolvedCommodity objects', () => {
    const commodity: ResolvedCommodity = {
      ticker: 'COF',
      name: 'Coffee',
    }
    expect(commodity.ticker).toBe('COF')
    expect(commodity.name).toBe('Coffee')
  })

  it('should allow creating ResolvedLocation objects', () => {
    const location: ResolvedLocation = {
      naturalId: 'BEN',
      name: 'Benten',
      type: 'planet',
    }
    expect(location.naturalId).toBe('BEN')
    expect(location.type).toBe('planet')
  })

  it('should allow creating ResolvedUser objects', () => {
    const user: ResolvedUser = {
      userId: 1,
      username: 'testuser',
      displayName: 'Test User',
      fioUsername: 'TESTUSER',
    }
    expect(user.userId).toBe(1)
    expect(user.username).toBe('testuser')
  })

  it('should allow creating ParseResult objects', () => {
    const result: ParseResult = {
      items: [],
      location: null,
      user: null,
      xit: null,
      actions: new Set(),
      limit: null,
      unresolved: [],
      errors: [],
    }
    expect(result.items).toEqual([])
    expect(result.actions.size).toBe(0)
  })
})
