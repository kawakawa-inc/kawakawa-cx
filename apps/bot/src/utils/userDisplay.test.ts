import { describe, it, expect } from 'vitest'
import { getDisplayName, getOwnerDisplayName, getCounterpartyDisplayName } from './userDisplay.js'

describe('userDisplay', () => {
  describe('getDisplayName', () => {
    it('prefers fioUsername', () => {
      expect(getDisplayName({ username: 'john', displayName: 'John', fioUsername: 'JohnFIO' })).toBe('JohnFIO')
    })

    it('falls back to displayName when no fioUsername', () => {
      expect(getDisplayName({ username: 'john', displayName: 'John Doe', fioUsername: null })).toBe('John Doe')
    })

    it('falls back to username when no displayName or fioUsername', () => {
      expect(getDisplayName({ username: 'john', displayName: null })).toBe('john')
    })

    it('falls back to username when fioUsername is undefined', () => {
      expect(getDisplayName({ username: 'john', displayName: null, fioUsername: undefined })).toBe('john')
    })
  })

  describe('getOwnerDisplayName', () => {
    it('prefers fioUsername', () => {
      expect(getOwnerDisplayName({
        ownerUsername: 'bob', ownerDisplayName: 'Bob', ownerFioUsername: 'BobFIO',
        counterpartyUsername: 'x', counterpartyDisplayName: null, counterpartyFioUsername: null,
      })).toBe('BobFIO')
    })

    it('falls back to displayName', () => {
      expect(getOwnerDisplayName({
        ownerUsername: 'bob', ownerDisplayName: 'Bob D', ownerFioUsername: null,
        counterpartyUsername: 'x', counterpartyDisplayName: null, counterpartyFioUsername: null,
      })).toBe('Bob D')
    })

    it('falls back to username', () => {
      expect(getOwnerDisplayName({
        ownerUsername: 'bob', ownerDisplayName: null, ownerFioUsername: null,
        counterpartyUsername: 'x', counterpartyDisplayName: null, counterpartyFioUsername: null,
      })).toBe('bob')
    })
  })

  describe('getCounterpartyDisplayName', () => {
    it('prefers fioUsername', () => {
      expect(getCounterpartyDisplayName({
        ownerUsername: 'x', ownerDisplayName: null, ownerFioUsername: null,
        counterpartyUsername: 'alice', counterpartyDisplayName: 'Alice', counterpartyFioUsername: 'AliceFIO',
      })).toBe('AliceFIO')
    })

    it('falls back to displayName', () => {
      expect(getCounterpartyDisplayName({
        ownerUsername: 'x', ownerDisplayName: null, ownerFioUsername: null,
        counterpartyUsername: 'alice', counterpartyDisplayName: 'Alice D', counterpartyFioUsername: null,
      })).toBe('Alice D')
    })

    it('falls back to username', () => {
      expect(getCounterpartyDisplayName({
        ownerUsername: 'x', ownerDisplayName: null, ownerFioUsername: null,
        counterpartyUsername: 'alice', counterpartyDisplayName: null, counterpartyFioUsername: null,
      })).toBe('alice')
    })
  })
})
