import { describe, it, expect } from 'vitest'
import {
  isUserBuying,
  isReservationDead,
  isFulfilledAndSynced,
} from './logistics-contract-coverage.js'

describe('isUserBuying', () => {
  const userId = 1
  const otherUserId = 2

  it('returns true when user owns invoice and is filling a sell order', () => {
    // User owns the invoice (they initiated) and the line has a sellOrderId
    // (they're buying from someone else's sell order)
    expect(isUserBuying(userId, userId, otherUserId, 100, null)).toBe(true)
  })

  it('returns true when user is counterparty on an invoice with a buy order', () => {
    // User is counterparty, and the line has a buyOrderId
    // (the owner filled the user's buy order)
    expect(isUserBuying(userId, otherUserId, userId, null, 200)).toBe(true)
  })

  it('returns false when user owns invoice but no sell order (they are selling)', () => {
    // User owns invoice with buyOrderId = they are selling to someone's buy order
    expect(isUserBuying(userId, userId, otherUserId, null, 100)).toBe(false)
  })

  it('returns false when user is counterparty with sell order (they are selling)', () => {
    // User is counterparty with sellOrderId = someone else filled their sell order
    expect(isUserBuying(userId, otherUserId, userId, 100, null)).toBe(false)
  })

  it('returns false when user is neither owner nor counterparty', () => {
    expect(isUserBuying(userId, otherUserId, 3, 100, null)).toBe(false)
  })

  it('returns false when no order IDs are present', () => {
    expect(isUserBuying(userId, userId, otherUserId, null, null)).toBe(false)
    expect(isUserBuying(userId, otherUserId, userId, null, null)).toBe(false)
  })
})

describe('isReservationDead', () => {
  it('returns true for cancelled', () => {
    expect(isReservationDead('cancelled')).toBe(true)
  })

  it('returns true for rejected', () => {
    expect(isReservationDead('rejected')).toBe(true)
  })

  it('returns true for expired', () => {
    expect(isReservationDead('expired')).toBe(true)
  })

  it('returns false for pending', () => {
    expect(isReservationDead('pending')).toBe(false)
  })

  it('returns false for confirmed', () => {
    expect(isReservationDead('confirmed')).toBe(false)
  })

  it('returns false for fulfilled', () => {
    expect(isReservationDead('fulfilled')).toBe(false)
  })

  it('returns false for null (no reservation)', () => {
    expect(isReservationDead(null)).toBe(false)
  })
})

describe('isFulfilledAndSynced', () => {
  const now = new Date('2026-05-07T12:00:00Z')
  const earlier = new Date('2026-05-07T10:00:00Z')
  const later = new Date('2026-05-07T14:00:00Z')

  it('returns true when fulfilled and FIO uploaded after reservation update', () => {
    // Reservation was fulfilled at "earlier", FIO synced at "later"
    // → FIO has already seen these goods
    expect(isFulfilledAndSynced('fulfilled', earlier, later)).toBe(true)
  })

  it('returns false when fulfilled but FIO uploaded before reservation update', () => {
    // Reservation was fulfilled at "later", FIO last synced at "earlier"
    // → FIO hasn't seen these goods yet
    expect(isFulfilledAndSynced('fulfilled', later, earlier)).toBe(false)
  })

  it('returns false when fulfilled at same time as FIO upload', () => {
    // Edge case: exactly equal timestamps
    // uploadedAt > updatedAt is false when equal
    expect(isFulfilledAndSynced('fulfilled', now, now)).toBe(false)
  })

  it('returns false when fulfilled but no FIO upload', () => {
    expect(isFulfilledAndSynced('fulfilled', earlier, null)).toBe(false)
  })

  it('returns false when not fulfilled (pending)', () => {
    expect(isFulfilledAndSynced('pending', earlier, later)).toBe(false)
  })

  it('returns false when not fulfilled (confirmed)', () => {
    expect(isFulfilledAndSynced('confirmed', earlier, later)).toBe(false)
  })

  it('returns false when reservation has no updatedAt', () => {
    expect(isFulfilledAndSynced('fulfilled', null, later)).toBe(false)
  })

  it('returns false when status is null', () => {
    expect(isFulfilledAndSynced(null, earlier, later)).toBe(false)
  })
})
