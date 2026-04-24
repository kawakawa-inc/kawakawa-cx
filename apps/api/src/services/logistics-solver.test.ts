import { describe, it, expect } from 'vitest'
import { solve, type SolverEdge, type SolverInput, type SolverNode } from './logistics-solver.js'
import type { NativeConsumptionBreakdown } from '@kawakawa/types'

// ==================== Test helpers ====================

const emptyBreakdown = (): NativeConsumptionBreakdown => ({
  workforceBurn: 0,
  repair: 0,
  productionInputs: 0,
  claims: { government: 0, contract: 0, reserve: 0, other: 0 },
  total: 0,
})

function makeNode(
  locationId: string,
  opts: {
    nativeConsumption?: Record<string, number>
    nativeProduction?: Record<string, number>
    stock?: Record<string, number>
    name?: string
  } = {}
): SolverNode {
  const nativeConsumption = opts.nativeConsumption ?? {}
  const breakdown: Record<string, NativeConsumptionBreakdown> = {}
  for (const [t, v] of Object.entries(nativeConsumption)) {
    breakdown[t] = { ...emptyBreakdown(), workforceBurn: v, total: v }
  }
  return {
    locationId,
    locationName: opts.name ?? locationId,
    systemNaturalId: '',
    systemName: '',
    stock: opts.stock ?? {},
    nativeConsumption,
    nativeProduction: opts.nativeProduction ?? {},
    consumptionBreakdown: breakdown,
  }
}

function makeEdge(
  id: number,
  from: string,
  to: string,
  ticker: string,
  kind: 'demand' | 'surplus' | 'fixed',
  opts: { amountOverride?: number; priority?: number } = {}
): SolverEdge {
  return {
    id,
    fromLocationId: from,
    toLocationId: to,
    commodityTicker: ticker,
    kind,
    amountOverride: opts.amountOverride ?? null,
    priority: opts.priority ?? null,
    note: null,
  }
}

const defaultSettings = {
  burnDays: 7,
  repairDays: 0,
  conditionMode: 'max' as const,
  stockMode: 'included' as const,
}

// Fake jump distance — returns a fixed table or 1 if not listed.
function makeDistanceFn(table: Record<string, number> = {}) {
  return (from: string, to: string): number | null => {
    const key = [from, to].sort().join('|')
    return table[key] ?? 1
  }
}

function runSolver(nodes: SolverNode[], edges: SolverEdge[], overrides: Partial<SolverInput> = {}) {
  return solve({
    nodes,
    edges,
    settings: defaultSettings,
    getJumpDistance: makeDistanceFn(),
    ...overrides,
  })
}

// ==================== Tests ====================

describe('logistics-solver: CAF scenario (plan §3.4)', () => {
  // Pyrgos produces 500 CAF; CH-771b consumes 100; BEN is a pass-through hub.
  // Edges: Pyrgos → CH-771b (demand), Pyrgos → BEN (surplus).
  const nodes = [
    makeNode('Pyrgos', { nativeProduction: { CAF: 500 } }),
    makeNode('CH-771b', { nativeConsumption: { CAF: 100 } }),
    makeNode('BEN'),
  ]
  const edges = [
    makeEdge(1, 'Pyrgos', 'CH-771b', 'CAF', 'demand'),
    makeEdge(2, 'Pyrgos', 'BEN', 'CAF', 'surplus'),
  ]

  it('routes 100 via demand edge to CH-771b', () => {
    const g = runSolver(nodes, edges)
    const demandEdge = g.edges.find(e => e.id === 1)!
    expect(demandEdge.amount).toBe(100)
  })

  it('routes 400 via surplus edge to BEN', () => {
    const g = runSolver(nodes, edges)
    const surplusEdge = g.edges.find(e => e.id === 2)!
    expect(surplusEdge.amount).toBe(400)
  })

  it('leaves Pyrgos balanced', () => {
    const g = runSolver(nodes, edges)
    const pyrgos = g.nodes.find(n => n.locationId === 'Pyrgos')!
    expect(pyrgos.balance.CAF).toBe(0)
    expect(pyrgos.shoppingList.CAF).toBeUndefined()
  })

  it('leaves CH-771b balanced', () => {
    const g = runSolver(nodes, edges)
    const ch = g.nodes.find(n => n.locationId === 'CH-771b')!
    expect(ch.balance.CAF).toBe(0)
    expect(ch.shoppingList.CAF).toBeUndefined()
  })

  it('leaves BEN holding 400 surplus with nothing on its shopping list', () => {
    const g = runSolver(nodes, edges)
    const ben = g.nodes.find(n => n.locationId === 'BEN')!
    expect(ben.balance.CAF).toBe(400)
    expect(ben.shoppingList.CAF).toBeUndefined()
    expect(ben.derivedInflow.CAF).toBe(400)
    expect(ben.derivedOutflow.CAF ?? 0).toBe(0)
  })
})

describe('logistics-solver: surplus carves naturally when BEN gets a downstream consumer', () => {
  // Same as CAF scenario but BEN also feeds CH-772a 50 CAF.
  // Expected: Pyrgos still ships 500 total; 100 direct to CH-771b; 400 surplus to BEN;
  // BEN holds 350 after shipping 50 to CH-772a.
  const nodes = [
    makeNode('Pyrgos', { nativeProduction: { CAF: 500 } }),
    makeNode('CH-771b', { nativeConsumption: { CAF: 100 } }),
    makeNode('BEN'),
    makeNode('CH-772a', { nativeConsumption: { CAF: 50 } }),
  ]
  const edges = [
    makeEdge(1, 'Pyrgos', 'CH-771b', 'CAF', 'demand'),
    makeEdge(2, 'Pyrgos', 'BEN', 'CAF', 'surplus'),
    makeEdge(3, 'BEN', 'CH-772a', 'CAF', 'demand'),
  ]

  it('BEN holds 350 surplus', () => {
    const g = runSolver(nodes, edges)
    const ben = g.nodes.find(n => n.locationId === 'BEN')!
    expect(ben.balance.CAF).toBe(350)
    expect(ben.shoppingList.CAF).toBeUndefined()
  })

  it('BEN→CH-772a edge carries 50', () => {
    const g = runSolver(nodes, edges)
    const edge = g.edges.find(e => e.id === 3)!
    expect(edge.amount).toBe(50)
  })

  it('Pyrgos→BEN surplus edge is unchanged at 400 (no magical promotion)', () => {
    const g = runSolver(nodes, edges)
    const edge = g.edges.find(e => e.id === 2)!
    expect(edge.amount).toBe(400)
  })
})

describe('logistics-solver: shortfall surfaces at BEN when Pyrgos production drops', () => {
  // Pyrgos produces only 120 CAF. CH-771b still needs 100 direct. BEN still needs to feed 50 to CH-772a.
  // Pyrgos: 120 - 100 = 20 surplus to BEN.
  // BEN: 20 inflow - 50 outflow = -30 → shopping list of 30 at BEN.
  const nodes = [
    makeNode('Pyrgos', { nativeProduction: { CAF: 120 } }),
    makeNode('CH-771b', { nativeConsumption: { CAF: 100 } }),
    makeNode('BEN'),
    makeNode('CH-772a', { nativeConsumption: { CAF: 50 } }),
  ]
  const edges = [
    makeEdge(1, 'Pyrgos', 'CH-771b', 'CAF', 'demand'),
    makeEdge(2, 'Pyrgos', 'BEN', 'CAF', 'surplus'),
    makeEdge(3, 'BEN', 'CH-772a', 'CAF', 'demand'),
  ]

  it('BEN shopping list shows 30 CAF', () => {
    const g = runSolver(nodes, edges)
    const ben = g.nodes.find(n => n.locationId === 'BEN')!
    expect(ben.balance.CAF).toBe(-30)
    expect(ben.shoppingList.CAF).toBe(30)
  })

  it('CH-771b still receives its full 100 via the direct demand edge', () => {
    const g = runSolver(nodes, edges)
    const edge = g.edges.find(e => e.id === 1)!
    expect(edge.amount).toBe(100)
  })

  it('surplus edge carries only 20', () => {
    const g = runSolver(nodes, edges)
    const edge = g.edges.find(e => e.id === 2)!
    expect(edge.amount).toBe(20)
  })
})

describe('logistics-solver: stock is included by default and covers consumption', () => {
  it('CH-771b consumes 100 but has 100 in stock → no inflow required', () => {
    const nodes = [
      makeNode('Pyrgos', { nativeProduction: { CAF: 500 } }),
      makeNode('CH-771b', { nativeConsumption: { CAF: 100 }, stock: { CAF: 100 } }),
    ]
    const edges = [makeEdge(1, 'Pyrgos', 'CH-771b', 'CAF', 'demand')]
    const g = runSolver(nodes, edges)
    const demandEdge = g.edges.find(e => e.id === 1)!
    expect(demandEdge.amount).toBe(0)
  })
})

describe('logistics-solver: stockMode=ignored strips stock from balance', () => {
  it('raw projection shows the full demand even if stock would cover it', () => {
    const nodes = [
      makeNode('Pyrgos', { nativeProduction: { CAF: 500 } }),
      makeNode('CH-771b', { nativeConsumption: { CAF: 100 }, stock: { CAF: 100 } }),
    ]
    const edges = [makeEdge(1, 'Pyrgos', 'CH-771b', 'CAF', 'demand')]
    const g = solve({
      nodes,
      edges,
      settings: { ...defaultSettings, stockMode: 'ignored' },
      getJumpDistance: makeDistanceFn(),
    })
    const demandEdge = g.edges.find(e => e.id === 1)!
    expect(demandEdge.amount).toBe(100)
  })
})

describe('logistics-solver: claims as nativeConsumption', () => {
  // Simulate a 500 CAF reserve at BEN by baking it into nativeConsumption.
  // The controller is responsible for this conversion — here we verify the math cascades right.
  it('a 500 CAF reserve on BEN shows up as a shopping list item if no upstream supply', () => {
    const nodes = [makeNode('BEN', { nativeConsumption: { CAF: 500 } })]
    const g = runSolver(nodes, [])
    const ben = g.nodes[0]
    expect(ben.balance.CAF).toBe(-500)
    expect(ben.shoppingList.CAF).toBe(500)
  })

  it('a 500 CAF reserve on BEN with 600 stock leaves 100 surplus', () => {
    const nodes = [makeNode('BEN', { nativeConsumption: { CAF: 500 }, stock: { CAF: 600 } })]
    const g = runSolver(nodes, [])
    const ben = g.nodes[0]
    expect(ben.balance.CAF).toBe(100)
    expect(ben.shoppingList.CAF).toBeUndefined()
  })
})

describe('logistics-solver: fixed edges', () => {
  it('fixed edges take their literal amount regardless of downstream need', () => {
    const nodes = [makeNode('Pyrgos', { nativeProduction: { CAF: 500 } }), makeNode('BEN')]
    const edges = [makeEdge(1, 'Pyrgos', 'BEN', 'CAF', 'fixed', { amountOverride: 200 })]
    const g = runSolver(nodes, edges)
    expect(g.edges[0].amount).toBe(200)
    expect(g.edges[0].isOverride).toBe(true)
    const ben = g.nodes.find(n => n.locationId === 'BEN')!
    expect(ben.derivedInflow.CAF).toBe(200)
  })
})

describe('logistics-solver: priority waterfall allocation', () => {
  // CH-772a needs 50 CAF. Two demand edges into it — one from Pyrgos (priority 1), one from BEN (priority 2).
  // Pyrgos should take the full 50; BEN should get 0.
  it('lower priority wins first', () => {
    const nodes = [
      makeNode('Pyrgos', { nativeProduction: { CAF: 500 } }),
      makeNode('BEN'),
      makeNode('CH-772a', { nativeConsumption: { CAF: 50 } }),
    ]
    const edges = [
      makeEdge(1, 'Pyrgos', 'CH-772a', 'CAF', 'demand', { priority: 1 }),
      makeEdge(2, 'BEN', 'CH-772a', 'CAF', 'demand', { priority: 2 }),
    ]
    const g = runSolver(nodes, edges)
    expect(g.edges.find(e => e.id === 1)!.amount).toBe(50)
    expect(g.edges.find(e => e.id === 2)!.amount).toBe(0)
  })

  it('jump distance tiebreaks when priorities are equal (or absent)', () => {
    const nodes = [
      makeNode('Pyrgos', { nativeProduction: { CAF: 500 } }),
      makeNode('BEN'),
      makeNode('CH-772a', { nativeConsumption: { CAF: 50 } }),
    ]
    const edges = [
      makeEdge(1, 'Pyrgos', 'CH-772a', 'CAF', 'demand'),
      makeEdge(2, 'BEN', 'CH-772a', 'CAF', 'demand'),
    ]
    // Pyrgos is 1 jump, BEN is 5 jumps — Pyrgos should win.
    const dist = makeDistanceFn({
      ['CH-772a|Pyrgos']: 1,
      ['BEN|CH-772a']: 5,
    })
    const g = solve({
      nodes,
      edges,
      settings: defaultSettings,
      getJumpDistance: dist,
    })
    expect(g.edges.find(e => e.id === 1)!.amount).toBe(50)
    expect(g.edges.find(e => e.id === 2)!.amount).toBe(0)
  })
})

describe('logistics-solver: cycle detection', () => {
  it('emits a warning when nodes form a cycle within the demand graph', () => {
    const nodes = [makeNode('A'), makeNode('B')]
    const edges = [makeEdge(1, 'A', 'B', 'CAF', 'demand'), makeEdge(2, 'B', 'A', 'CAF', 'demand')]
    const g = runSolver(nodes, edges)
    expect(g.warnings.some(w => w.toLowerCase().includes('cycle'))).toBe(true)
  })

  it('does NOT warn when opposite-direction edges are in different kind groups', () => {
    // BEN → planet (demand DW) coexisting with planet → BEN (surplus H) is not
    // a cycle — the two passes walk separate DAGs. Regression test for the bug
    // where a shared topo sort flagged this as cyclic.
    const nodes = [
      makeNode('BEN'),
      makeNode('CB-282d', {
        nativeConsumption: { DW: 50 },
        nativeProduction: { H: 100 },
      }),
    ]
    const edges = [
      makeEdge(1, 'BEN', 'CB-282d', 'DW', 'demand'),
      makeEdge(2, 'CB-282d', 'BEN', 'H', 'surplus'),
    ]
    const g = runSolver(nodes, edges)
    expect(g.warnings).toEqual([])
    // DW demand edge carries 50 (CB-282d's full need)
    expect(g.edges.find(e => e.id === 1)!.amount).toBe(50)
    // H surplus edge carries 100 (all of CB-282d's production)
    expect(g.edges.find(e => e.id === 2)!.amount).toBe(100)
    // BEN ends up holding 100 H and owing 50 DW
    const ben = g.nodes.find(n => n.locationId === 'BEN')!
    expect(ben.balance.H).toBe(100)
    expect(ben.shoppingList.DW).toBe(50)
  })
})

describe('logistics-solver: chained demand propagation', () => {
  // All-demand chain: Pyrgos → BEN → CH-771b, all with demand edges.
  // CH-771b needs 100. That should cascade: BEN's outbound-demand = 100, so BEN's requiredInflow = 100,
  // which pulls 100 via the Pyrgos→BEN demand edge. Pyrgos ends with an outbound-demand commitment of 100.
  it('cascades 100 all the way back to Pyrgos', () => {
    const nodes = [
      makeNode('Pyrgos', { nativeProduction: { CAF: 500 } }),
      makeNode('BEN'),
      makeNode('CH-771b', { nativeConsumption: { CAF: 100 } }),
    ]
    const edges = [
      makeEdge(1, 'Pyrgos', 'BEN', 'CAF', 'demand'),
      makeEdge(2, 'BEN', 'CH-771b', 'CAF', 'demand'),
    ]
    const g = runSolver(nodes, edges)
    expect(g.edges.find(e => e.id === 1)!.amount).toBe(100)
    expect(g.edges.find(e => e.id === 2)!.amount).toBe(100)
    const pyrgos = g.nodes.find(n => n.locationId === 'Pyrgos')!
    expect(pyrgos.balance.CAF).toBe(400)
    const ben = g.nodes.find(n => n.locationId === 'BEN')!
    expect(ben.balance.CAF).toBe(0)
  })
})

describe('logistics-solver: orphan edges', () => {
  it('ignores edges referencing unknown nodes and warns', () => {
    const nodes = [makeNode('A')]
    const edges = [makeEdge(1, 'A', 'Nowhere', 'CAF', 'demand')]
    const g = runSolver(nodes, edges)
    expect(g.warnings.some(w => w.includes('unknown locations'))).toBe(true)
  })
})
