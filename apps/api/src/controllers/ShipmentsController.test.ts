import { describe, it, expect } from 'vitest'
import {
  SHIPMENT_STATUS_TRANSITIONS,
  isValidShipmentStatusTransition,
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
