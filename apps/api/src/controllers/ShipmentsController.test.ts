import { describe, it, expect } from 'vitest'
import {
  SHIPMENT_STATUS_TRANSITIONS,
  isValidShipmentStatusTransition,
  computeSegmentLoads,
  estimateLegDays,
} from './ShipmentsController.js'
import type { ShipmentStatus } from '@kawakawa/types'

describe('shipment status state machine', () => {
  it('allows planned → dispatched and planned → cancelled', () => {
    expect(isValidShipmentStatusTransition('planned', 'dispatched')).toBe(true)
    expect(isValidShipmentStatusTransition('planned', 'cancelled')).toBe(true)
  })

  it('allows dispatched → delivered and dispatched → cancelled', () => {
    expect(isValidShipmentStatusTransition('dispatched', 'delivered')).toBe(true)
    expect(isValidShipmentStatusTransition('dispatched', 'cancelled')).toBe(true)
  })

  it('rejects planned → delivered (must dispatch first)', () => {
    expect(isValidShipmentStatusTransition('planned', 'delivered')).toBe(false)
  })

  it('rejects backward transitions (delivered → dispatched, dispatched → planned)', () => {
    expect(isValidShipmentStatusTransition('delivered', 'dispatched')).toBe(false)
    expect(isValidShipmentStatusTransition('dispatched', 'planned')).toBe(false)
  })

  it('treats delivered and cancelled as terminal — no outgoing transitions', () => {
    expect(SHIPMENT_STATUS_TRANSITIONS.delivered).toEqual([])
    expect(SHIPMENT_STATUS_TRANSITIONS.cancelled).toEqual([])
  })

  it('rejects same-status no-ops (planned → planned, etc.)', () => {
    const statuses: ShipmentStatus[] = ['planned', 'dispatched', 'delivered', 'cancelled']
    for (const s of statuses) {
      expect(isValidShipmentStatusTransition(s, s)).toBe(false)
    }
  })
})

describe('computeSegmentLoads', () => {
  it('two-stop trip: single segment carries the whole manifest', () => {
    // 0 → 1 with 25,000t H2O
    const segs = computeSegmentLoads(2, [
      { originStopIndex: 0, destinationStopIndex: 1, weightTotal: 25_000, volumeTotal: 25_000 },
    ])
    expect(segs).toEqual([{ segmentIndex: 0, weight: 25_000, volume: 25_000 }])
  })

  it('multi-drop run: load at 0, drop progressively, segment loads decrease', () => {
    // Etherwind → KW-689a → KW-689b → KW-689c, 25k H2O split 3 ways
    const segs = computeSegmentLoads(4, [
      { originStopIndex: 0, destinationStopIndex: 1, weightTotal: 8000, volumeTotal: 8000 },
      { originStopIndex: 0, destinationStopIndex: 2, weightTotal: 9000, volumeTotal: 9000 },
      { originStopIndex: 0, destinationStopIndex: 3, weightTotal: 8000, volumeTotal: 8000 },
    ])
    // Segment 0→1: all three lines onboard; 1→2: the 0→2 + 0→3 lines; 2→3: only 0→3.
    expect(segs[0].weight).toBe(25_000)
    expect(segs[1].weight).toBe(17_000)
    expect(segs[2].weight).toBe(8000)
  })

  it('pickup-and-deliver: cargo loaded mid-trip only counts in later segments', () => {
    // KW-689c → Kaffee (drop H2O), pickup CAF at KW-689c, deliver CAF to Kaffee
    // 3 stops total: 0=Etherwind, 1=KW-689c (drop H2O, pickup CAF), 2=Kaffee (drop CAF)
    const segs = computeSegmentLoads(3, [
      { originStopIndex: 0, destinationStopIndex: 1, weightTotal: 25_000, volumeTotal: 25_000 }, // H2O
      { originStopIndex: 1, destinationStopIndex: 2, weightTotal: 1500, volumeTotal: 1500 }, // CAF
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
    // Below 0: no penalty
    expect(estimateLegDays({ jumpCount: 1, sameSystem: false, loadFraction: -0.5 })).toBe(1.5)
    // Above 1: caps at 1.5×
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
