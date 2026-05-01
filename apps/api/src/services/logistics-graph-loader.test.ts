// Unit tests for the timing helper that augments solver output with
// time-aware fields (daysOfStock, runOutAt, latestContractAt, per-edge cadence).
import { describe, it, expect } from 'vitest'
import type { LogisticsGraph, NodeState, EdgeState } from '@kawakawa/types'
import { applyTimingFields } from './logistics-graph-loader.js'

const NOW = new Date('2026-04-30T00:00:00Z')
const MS_PER_DAY = 86_400_000

function makeNode(
  locationId: string,
  stock: Record<string, number> = {},
  extra: Partial<NodeState> = {}
): NodeState {
  return {
    locationId,
    locationName: locationId,
    systemNaturalId: '',
    systemName: '',
    stock,
    nativeConsumption: {},
    nativeProduction: {},
    consumptionBreakdown: {},
    derivedInflow: {},
    derivedOutflow: {},
    balance: {},
    shoppingList: {},
    dailyConsumption: {},
    dailyProduction: {},
    daysOfStock: {},
    runOutAt: {},
    latestContractAt: {},
    dailyOutflow: {},
    chainSource: {},
    warnings: [],
    ...extra,
  }
}

function makeEdge(
  id: number,
  from: string,
  to: string,
  ticker: string,
  transitDays: number,
  extra: Partial<EdgeState> = {}
): EdgeState {
  return {
    id,
    fromLocationId: from,
    toLocationId: to,
    commodityTicker: ticker,
    kind: 'demand',
    amount: 0,
    isBottleneck: false,
    isOverride: false,
    priority: null,
    transitDays,
    cadenceDays: 7,
    perShipmentAmount: 0,
    nextArrivalAt: null,
    loadAt: null,
    shipBy: null,
    contractBy: null,
    note: null,
    ...extra,
  }
}

function makeGraph(nodes: NodeState[], edges: EdgeState[] = []): LogisticsGraph {
  return {
    settings: {
      burnDays: 7,
      repairDays: 0,
      conditionMode: 'max',
      stockMode: 'included',
      contractLeadDays: 3,
    },
    nodes,
    edges,
    warnings: [],
  }
}

describe('applyTimingFields', () => {
  it('computes daysOfStock and runOutAt for a base with consumption and finite stock', () => {
    const graph = makeGraph([makeNode('Pyrgos', { CAF: 100 })])
    const dailyC = new Map([['Pyrgos', { CAF: 10 }]])
    const dailyP = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    const node = graph.nodes[0]
    expect(node.dailyConsumption.CAF).toBe(10)
    expect(node.daysOfStock.CAF).toBe(10)
    const runOutMs = NOW.getTime() + 10 * MS_PER_DAY
    expect(node.runOutAt.CAF).toBe(new Date(runOutMs).toISOString())
    expect(node.latestContractAt.CAF).toBe(new Date(runOutMs - 3 * MS_PER_DAY).toISOString())
  })

  it('returns null timing when net consumption is zero (production covers it)', () => {
    const graph = makeGraph([makeNode('Pyrgos', { CAF: 100 })])
    const dailyC = new Map([['Pyrgos', { CAF: 5 }]])
    const dailyP = new Map([['Pyrgos', { CAF: 5 }]]) // exactly offsets
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    const node = graph.nodes[0]
    expect(node.daysOfStock.CAF).toBeNull()
    expect(node.runOutAt.CAF).toBeNull()
    expect(node.latestContractAt.CAF).toBeNull()
  })

  it('reports zero stock as days=0 with run-out at now', () => {
    const graph = makeGraph([makeNode('Pyrgos', { CAF: 0 })])
    const dailyC = new Map([['Pyrgos', { CAF: 10 }]])
    const dailyP = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    const node = graph.nodes[0]
    expect(node.daysOfStock.CAF).toBe(0)
    expect(node.runOutAt.CAF).toBe(NOW.toISOString())
    expect(node.latestContractAt.CAF).toBe(new Date(NOW.getTime() - 3 * MS_PER_DAY).toISOString())
  })

  it('uses contractLeadDays=15 when the user has a higher lead-time setting', () => {
    const graph = makeGraph([makeNode('Pyrgos', { CAF: 100 })])
    const dailyC = new Map([['Pyrgos', { CAF: 10 }]])
    const dailyP = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    applyTimingFields(graph, dailyC, dailyP, 15, NOW, 7)

    const runOutMs = NOW.getTime() + 10 * MS_PER_DAY
    expect(graph.nodes[0].latestContractAt.CAF).toBe(
      new Date(runOutMs - 15 * MS_PER_DAY).toISOString()
    )
  })

  it('computes per-flow cadence timing on a demand edge', () => {
    // Cadence 14, transit 5, lead 3.
    // arrivalAt = now + 14, loadAt = now + 9, contractBy = now + 6.
    // perShipmentAmount = dailyConsumption(at dest) × cadenceDays = 10 × 14 = 140.
    const graph = makeGraph(
      [makeNode('BEN'), makeNode('Pyrgos', { CAF: 100 })],
      [makeEdge(1, 'BEN', 'Pyrgos', 'CAF', 5, { cadenceDays: 14 })]
    )
    const dailyC = new Map([['Pyrgos', { CAF: 10 }]])
    const dailyP = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    const e = graph.edges[0]
    expect(e.perShipmentAmount).toBe(140)
    expect(e.nextArrivalAt).toBe(new Date(NOW.getTime() + 14 * MS_PER_DAY).toISOString())
    expect(e.loadAt).toBe(new Date(NOW.getTime() + 9 * MS_PER_DAY).toISOString())
    expect(e.shipBy).toBe(e.loadAt)
    expect(e.contractBy).toBe(new Date(NOW.getTime() + 6 * MS_PER_DAY).toISOString())
  })

  it('per-flow timing is independent: two edges with different cadences', () => {
    const graph = makeGraph(
      [makeNode('BEN'), makeNode('A'), makeNode('B')],
      [
        makeEdge(1, 'BEN', 'A', 'CAF', 0, { cadenceDays: 7 }),
        makeEdge(2, 'BEN', 'B', 'CAF', 0, { cadenceDays: 21 }),
      ]
    )
    const dailyC = new Map<string, Record<string, number>>([
      ['A', { CAF: 5 }],
      ['B', { CAF: 5 }],
    ])
    const dailyP = new Map<string, Record<string, number>>([
      ['A', {}],
      ['B', {}],
    ])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.edges[0].perShipmentAmount).toBe(35) // 5 × 7
    expect(graph.edges[1].perShipmentAmount).toBe(105) // 5 × 21
    expect(graph.edges[0].nextArrivalAt).toBe(
      new Date(NOW.getTime() + 7 * MS_PER_DAY).toISOString()
    )
    expect(graph.edges[1].nextArrivalAt).toBe(
      new Date(NOW.getTime() + 21 * MS_PER_DAY).toISOString()
    )
  })

  it('zero destination consumption: timing dates still set, perShipmentAmount = 0', () => {
    const graph = makeGraph(
      [makeNode('BEN'), makeNode('Pyrgos', { CAF: 100 })],
      [makeEdge(1, 'BEN', 'Pyrgos', 'CAF', 5, { cadenceDays: 7 })]
    )
    const dailyC = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    const dailyP = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.edges[0].perShipmentAmount).toBe(0)
    expect(graph.edges[0].nextArrivalAt).toBe(
      new Date(NOW.getTime() + 7 * MS_PER_DAY).toISOString()
    )
    expect(graph.edges[0].contractBy).not.toBeNull()
  })

  it('fixed edges get cadence timing same as demand', () => {
    const graph = makeGraph(
      [makeNode('BEN'), makeNode('Pyrgos', { CAF: 100 })],
      [makeEdge(1, 'BEN', 'Pyrgos', 'CAF', 5, { kind: 'fixed', cadenceDays: 14 })]
    )
    const dailyC = new Map([['Pyrgos', { CAF: 10 }]])
    const dailyP = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.edges[0].perShipmentAmount).toBe(140)
    expect(graph.edges[0].nextArrivalAt).toBe(
      new Date(NOW.getTime() + 14 * MS_PER_DAY).toISOString()
    )
  })

  it('surplus edges have null timing fields and zero per-shipment amount', () => {
    const graph = makeGraph(
      [makeNode('BEN'), makeNode('Pyrgos', { CAF: 100 })],
      [makeEdge(1, 'Pyrgos', 'BEN', 'CAF', 5, { kind: 'surplus', cadenceDays: 7 })]
    )
    const dailyC = new Map([['Pyrgos', { CAF: 10 }]])
    const dailyP = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    const e = graph.edges[0]
    expect(e.perShipmentAmount).toBe(0)
    expect(e.nextArrivalAt).toBeNull()
    expect(e.loadAt).toBeNull()
    expect(e.shipBy).toBeNull()
    expect(e.contractBy).toBeNull()
  })

  it('handles multiple tickers per node independently', () => {
    const graph = makeGraph([makeNode('Pyrgos', { CAF: 50, RAT: 100 })])
    const dailyC = new Map([['Pyrgos', { CAF: 5, RAT: 25 }]])
    const dailyP = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.nodes[0].daysOfStock.CAF).toBe(10) // 50/5
    expect(graph.nodes[0].daysOfStock.RAT).toBe(4) // 100/25
  })

  it('treats stock as 0 when stockMode="ignored" by reading from node.stock (caller already empties it)', () => {
    // The solver clears node.stock when stockMode='ignored'; we just respect what's there.
    const graph = makeGraph([makeNode('Pyrgos', {})])
    const dailyC = new Map([['Pyrgos', { CAF: 10 }]])
    const dailyP = new Map<string, Record<string, number>>([['Pyrgos', {}]])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.nodes[0].daysOfStock.CAF).toBe(0)
    expect(graph.nodes[0].runOutAt.CAF).toBe(NOW.toISOString())
  })
})

describe('applyTimingFields — bubble-up & outflow-aware drain', () => {
  it("hub's daysOfStock includes committed outflow (no native consumption)", () => {
    // BEN has 1000 COF in stock and is shipping 70 total over the 7-day plan
    // (= 10/day) downstream. Old math: drain=0 → never runs out. New math:
    // 1000 / 10 = 100 days.
    const ben = makeNode('BEN', { COF: 1000 }, { derivedOutflow: { COF: 70 } })
    const pyrgos = makeNode('Pyrgos')
    const graph = makeGraph([ben, pyrgos], [makeEdge(1, 'BEN', 'Pyrgos', 'COF', 5, { amount: 70 })])
    const dailyC = new Map<string, Record<string, number>>([
      ['BEN', {}],
      ['Pyrgos', { COF: 10 }],
    ])
    const dailyP = new Map<string, Record<string, number>>([
      ['BEN', {}],
      ['Pyrgos', {}],
    ])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.nodes[0].dailyOutflow.COF).toBe(10)
    expect(graph.nodes[0].daysOfStock.COF).toBe(100)
  })

  it('immediate source: leaf points at its hub one hop up', () => {
    const ben = makeNode('BEN', { COF: 1000 }, { derivedOutflow: { COF: 70 } })
    const pyrgos = makeNode('Pyrgos')
    const graph = makeGraph([ben, pyrgos], [makeEdge(1, 'BEN', 'Pyrgos', 'COF', 5, { amount: 70 })])
    const dailyC = new Map<string, Record<string, number>>([
      ['BEN', {}],
      ['Pyrgos', { COF: 10 }],
    ])
    const dailyP = new Map<string, Record<string, number>>([
      ['BEN', {}],
      ['Pyrgos', {}],
    ])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.nodes[1].chainSource.COF).toEqual(['BEN'])
    // BEN has outflow but no inbound — self-sourced
    expect(graph.nodes[0].chainSource.COF).toEqual([])
  })

  it('surplus inbound surfaces the producer (single source)', () => {
    // Pyrgos produces CAF, surplus-flows it to CH-771b. CH-771b consumes CAF.
    const pyrgos = makeNode(
      'Pyrgos',
      {},
      { nativeProduction: { CAF: 100 }, derivedOutflow: { CAF: 70 } }
    )
    const ch771b = makeNode('CH-771b')
    const graph = makeGraph(
      [pyrgos, ch771b],
      [makeEdge(1, 'Pyrgos', 'CH-771b', 'CAF', 1, { kind: 'surplus', amount: 70 })]
    )
    const dailyC = new Map<string, Record<string, number>>([
      ['Pyrgos', {}],
      ['CH-771b', { CAF: 10 }],
    ])
    const dailyP = new Map<string, Record<string, number>>([
      ['Pyrgos', { CAF: 100 / 7 }],
      ['CH-771b', {}],
    ])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.nodes[1].chainSource.CAF).toEqual(['Pyrgos'])
    expect(graph.nodes[0].chainSource.CAF).toEqual([]) // produces it itself
  })

  it('aggregating hub: surplus from multiple producers surfaces all of them', () => {
    // BEN gets DW from two producer planets via surplus. The hub itself
    // shows BOTH sources so the user can pick which to investigate / dispatch.
    const sonos = makeNode(
      'Sonos',
      {},
      { nativeProduction: { DW: 50 }, derivedOutflow: { DW: 35 } }
    )
    const kw689d = makeNode(
      'KW-689d',
      {},
      { nativeProduction: { DW: 50 }, derivedOutflow: { DW: 35 } }
    )
    const ben = makeNode('BEN', { DW: 500 }, { derivedInflow: { DW: 70 } })
    const graph = makeGraph(
      [sonos, kw689d, ben],
      [
        makeEdge(1, 'Sonos', 'BEN', 'DW', 2, { kind: 'surplus', amount: 35 }),
        makeEdge(2, 'KW-689d', 'BEN', 'DW', 4, { kind: 'surplus', amount: 35 }),
      ]
    )
    const dailyC = new Map<string, Record<string, number>>([
      ['Sonos', {}],
      ['KW-689d', {}],
      ['BEN', {}],
    ])
    const dailyP = new Map<string, Record<string, number>>([
      ['Sonos', { DW: 50 / 7 }],
      ['KW-689d', { DW: 50 / 7 }],
      ['BEN', {}],
    ])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect([...graph.nodes[2].chainSource.DW].sort()).toEqual(['KW-689d', 'Sonos'])
  })

  it('self-source: node with stock and no inbound has empty chainSource', () => {
    const graph = makeGraph([makeNode('BEN', { COF: 100 })])
    const dailyC = new Map([['BEN', { COF: 10 }]])
    const dailyP = new Map<string, Record<string, number>>([['BEN', {}]])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.nodes[0].chainSource.COF).toEqual([])
  })

  it('multi-hop demand chain shows immediate hop at each level', () => {
    // hubA -> hubB -> leaf, all demand. Each level shows its IMMEDIATE source.
    const hubA = makeNode('hubA', { COF: 1000 }, { derivedOutflow: { COF: 70 } })
    const hubB = makeNode('hubB', {}, { derivedInflow: { COF: 70 }, derivedOutflow: { COF: 70 } })
    const leaf = makeNode('leaf', {}, { derivedInflow: { COF: 70 } })
    const graph = makeGraph(
      [hubA, hubB, leaf],
      [
        makeEdge(1, 'hubA', 'hubB', 'COF', 1, { amount: 70 }),
        makeEdge(2, 'hubB', 'leaf', 'COF', 1, { amount: 70 }),
      ]
    )
    const dailyC = new Map<string, Record<string, number>>([
      ['hubA', {}],
      ['hubB', {}],
      ['leaf', { COF: 10 }],
    ])
    const dailyP = new Map<string, Record<string, number>>([
      ['hubA', {}],
      ['hubB', {}],
      ['leaf', {}],
    ])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.nodes[2].chainSource.COF).toEqual(['hubB']) // leaf -> hubB
    expect(graph.nodes[1].chainSource.COF).toEqual(['hubA']) // hubB -> hubA
    expect(graph.nodes[0].chainSource.COF).toEqual([]) // hubA: self
  })

  it('ignores edges with amount=0 (solver did not allocate)', () => {
    // Two demand edges feeding leaf, only one chosen. We surface only the chosen.
    const hubA = makeNode('hubA', { COF: 1000 }, { derivedOutflow: { COF: 70 } })
    const hubB = makeNode('hubB', { COF: 0 })
    const leaf = makeNode('leaf', {}, { derivedInflow: { COF: 70 } })
    const graph = makeGraph(
      [hubA, hubB, leaf],
      [
        makeEdge(1, 'hubA', 'leaf', 'COF', 1, { amount: 70 }),
        makeEdge(2, 'hubB', 'leaf', 'COF', 1, { amount: 0 }), // not chosen
      ]
    )
    const dailyC = new Map<string, Record<string, number>>([
      ['hubA', {}],
      ['hubB', {}],
      ['leaf', { COF: 10 }],
    ])
    const dailyP = new Map<string, Record<string, number>>([
      ['hubA', {}],
      ['hubB', {}],
      ['leaf', {}],
    ])
    applyTimingFields(graph, dailyC, dailyP, 3, NOW, 7)

    expect(graph.nodes[2].chainSource.COF).toEqual(['hubA'])
  })
})
