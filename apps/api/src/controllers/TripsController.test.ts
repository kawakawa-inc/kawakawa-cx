import { describe, it, expect } from 'vitest'
import {
  TRIP_STATUS_TRANSITIONS,
  isValidTripStatusTransition,
  computeSegmentLoads,
  estimateLegDays,
} from './TripsController.js'
import type { TripStatus } from '@kawakawa/types'

describe('trip status state machine', () => {
  it('allows planned → dispatched and planned → cancelled', () => {
    expect(isValidTripStatusTransition('planned', 'dispatched')).toBe(true)
    expect(isValidTripStatusTransition('planned', 'cancelled')).toBe(true)
  })

  it('allows dispatched → delivered and dispatched → cancelled', () => {
    expect(isValidTripStatusTransition('dispatched', 'delivered')).toBe(true)
    expect(isValidTripStatusTransition('dispatched', 'cancelled')).toBe(true)
  })

  it('rejects planned → delivered (must dispatch first)', () => {
    expect(isValidTripStatusTransition('planned', 'delivered')).toBe(false)
  })

  it('rejects backward transitions (delivered → dispatched, dispatched → planned)', () => {
    expect(isValidTripStatusTransition('delivered', 'dispatched')).toBe(false)
    expect(isValidTripStatusTransition('dispatched', 'planned')).toBe(false)
  })

  it('treats delivered and cancelled as terminal — no outgoing transitions', () => {
    expect(TRIP_STATUS_TRANSITIONS.delivered).toEqual([])
    expect(TRIP_STATUS_TRANSITIONS.cancelled).toEqual([])
  })

  it('rejects same-status no-ops (planned → planned, etc.)', () => {
    const statuses: TripStatus[] = ['planned', 'dispatched', 'delivered', 'cancelled']
    for (const s of statuses) {
      expect(isValidTripStatusTransition(s, s)).toBe(false)
    }
  })
})

describe('computeSegmentLoads', () => {
  it('two-stop trip: single segment carries the whole manifest', () => {
    // 0 → 1 with 25,000t H2O — one shipment carrying everything.
    const segs = computeSegmentLoads(2, [
      { originStopIndex: 0, destStopIndex: 1, weightTotal: 25_000, volumeTotal: 25_000 },
    ])
    expect(segs).toEqual([{ segmentIndex: 0, weight: 25_000, volume: 25_000 }])
  })

  it('multi-drop run: three shipments from 0 to different stops, segment loads decrease', () => {
    // Etherwind → KW-689a → KW-689b → KW-689c, three H2O shipments off the same origin.
    const segs = computeSegmentLoads(4, [
      { originStopIndex: 0, destStopIndex: 1, weightTotal: 8000, volumeTotal: 8000 },
      { originStopIndex: 0, destStopIndex: 2, weightTotal: 9000, volumeTotal: 9000 },
      { originStopIndex: 0, destStopIndex: 3, weightTotal: 8000, volumeTotal: 8000 },
    ])
    // Segment 0→1: all three onboard; 1→2: the 0→2 + 0→3 ones; 2→3: only 0→3.
    expect(segs[0].weight).toBe(25_000)
    expect(segs[1].weight).toBe(17_000)
    expect(segs[2].weight).toBe(8000)
  })

  it('pickup-and-deliver: cargo loaded mid-trip only counts in later segments', () => {
    // 3 stops: 0=Etherwind, 1=KW-689c (drop H2O, pickup CAF), 2=Kaffee (drop CAF)
    const segs = computeSegmentLoads(3, [
      { originStopIndex: 0, destStopIndex: 1, weightTotal: 25_000, volumeTotal: 25_000 }, // H2O
      { originStopIndex: 1, destStopIndex: 2, weightTotal: 1500, volumeTotal: 1500 }, // CAF
    ])
    expect(segs[0]).toEqual({ segmentIndex: 0, weight: 25_000, volume: 25_000 })
    expect(segs[1]).toEqual({ segmentIndex: 1, weight: 1500, volume: 1500 })
  })

  it('empty manifest: all segments report zero', () => {
    const segs = computeSegmentLoads(3, [])
    expect(segs).toEqual([
      { segmentIndex: 0, weight: 0, volume: 0 },
      { segmentIndex: 1, weight: 0, volume: 0 },
    ])
  })

  it('single-stop trip: no segments (degenerate case)', () => {
    expect(computeSegmentLoads(1, [])).toEqual([])
    expect(computeSegmentLoads(0, [])).toEqual([])
  })
})

describe('estimateLegDays (Tier-1 trip-time heuristic)', () => {
  it('same-system, empty ship: ~half a day STL', () => {
    expect(estimateLegDays({ jumpCount: null, sameSystem: true, loadFraction: 0 })).toBe(0.5)
  })

  it('same-system, full ship: 1.5× the empty time', () => {
    expect(estimateLegDays({ jumpCount: null, sameSystem: true, loadFraction: 1 })).toBeCloseTo(
      0.75,
      6
    )
  })

  it('one jump, empty ship: jump day + STL ramp', () => {
    expect(estimateLegDays({ jumpCount: 1, sameSystem: false, loadFraction: 0 })).toBe(1.5)
  })

  it('three jumps, empty ship: scales with jumps', () => {
    expect(estimateLegDays({ jumpCount: 3, sameSystem: false, loadFraction: 0 })).toBe(3.5)
  })

  it('unknown jump count: treats as 1', () => {
    expect(estimateLegDays({ jumpCount: null, sameSystem: false, loadFraction: 0 })).toBe(1.5)
  })

  it('clamps load fraction below 0 and above 1', () => {
    expect(estimateLegDays({ jumpCount: 1, sameSystem: false, loadFraction: -0.5 })).toBe(1.5)
    expect(estimateLegDays({ jumpCount: 1, sameSystem: false, loadFraction: 5 })).toBeCloseTo(
      2.25,
      6
    )
  })

  it('half-loaded ship: 1.25× empty-ship time', () => {
    expect(estimateLegDays({ jumpCount: 1, sameSystem: false, loadFraction: 0.5 })).toBeCloseTo(
      1.875,
      6
    )
  })
})
