// Logistics flow graph solver.
// See docs/guides/logistics-plan.md for the full design.
//
// Pure function: takes an in-memory graph and returns a LogisticsGraph. The
// controller layer is responsible for loading data from the DB, converting
// claim/edge rates against burnDays, and computing node natives from FIO data.
// The solver itself only cares about totals.

import type {
  EdgeState,
  FlowKind,
  LogisticsGraph,
  NativeConsumptionBreakdown,
  NodeState,
} from '@kawakawa/types'

export interface SolverEdge {
  id: number
  fromLocationId: string
  toLocationId: string
  commodityTicker: string
  kind: FlowKind
  /** Total amount already converted against burnDays; required when kind='fixed', ignored otherwise */
  amountOverride: number | null
  priority: number | null
  /** Days for one ship trip from source to destination. Mirrored to EdgeState. */
  transitDays: number
  /** Days between shipments on this flow. Mirrored to EdgeState. */
  cadenceDays: number
  note: string | null
}

export interface SolverNode {
  locationId: string
  locationName: string
  systemNaturalId: string
  systemName: string
  systemPositionX?: number
  systemPositionZ?: number
  /** Per-ticker current stock (honored only when solver settings.stockMode='included') */
  stock: Record<string, number>
  /** All values are totals over burnDays */
  nativeConsumption: Record<string, number>
  nativeProduction: Record<string, number>
  /** Per-ticker breakdown of what contributes to nativeConsumption */
  consumptionBreakdown: Record<string, NativeConsumptionBreakdown>
}

export interface SolverSettings {
  burnDays: number
  repairDays: number
  conditionMode: 'actual' | 'max'
  stockMode: 'included' | 'ignored'
}

export type JumpDistanceFn = (from: string, to: string) => number | null

export interface SolverInput {
  nodes: SolverNode[]
  edges: SolverEdge[]
  settings: SolverSettings
  /** Used for multi-source / multi-destination allocation tiebreaks. Lower wins. */
  getJumpDistance: JumpDistanceFn
}

export function solve(input: SolverInput): LogisticsGraph {
  const { nodes, edges, settings, getJumpDistance } = input

  const nodeMap = new Map<string, SolverNode>()
  for (const n of nodes) nodeMap.set(n.locationId, n)

  const outbound = new Map<string, SolverEdge[]>()
  const inbound = new Map<string, SolverEdge[]>()
  for (const n of nodes) {
    outbound.set(n.locationId, [])
    inbound.set(n.locationId, [])
  }
  const orphanEdges: SolverEdge[] = []
  for (const e of edges) {
    if (!nodeMap.has(e.fromLocationId) || !nodeMap.has(e.toLocationId)) {
      orphanEdges.push(e)
      continue
    }
    outbound.get(e.fromLocationId)!.push(e)
    inbound.get(e.toLocationId)!.push(e)
  }

  // Initialize per-edge amount and per-node running commitment totals.
  const edgeAmounts = new Map<number, number>()
  for (const e of edges) edgeAmounts.set(e.id, 0)

  const outDemand = newNodeTickerMap(nodes)
  const outSurplus = newNodeTickerMap(nodes)
  const inDemand = newNodeTickerMap(nodes)
  const inSurplus = newNodeTickerMap(nodes)

  // Topological sort via Kahn's algorithm, computed separately per kind-group.
  // Demand pass walks demand+fixed edges; surplus pass walks surplus edges. A
  // cycle inside one kind-group doesn't bleed into the other, so independent
  // flows in opposite directions across different kinds (e.g. BEN→planet demand
  // + planet→BEN surplus) are correctly non-cyclic.
  const demandTopoOrder = topoSort(nodes, nodeMap, edges, e => e.kind !== 'surplus')
  const surplusTopoOrder = topoSort(nodes, nodeMap, edges, e => e.kind === 'surplus')

  const warnings: string[] = []
  if (demandTopoOrder.length < nodes.length) {
    const unresolved = nodes
      .filter(n => !demandTopoOrder.includes(n.locationId))
      .map(n => n.locationId)
    warnings.push(`Demand-edge graph contains cycles; unresolved nodes: ${unresolved.join(', ')}`)
  }
  if (surplusTopoOrder.length < nodes.length) {
    const unresolved = nodes
      .filter(n => !surplusTopoOrder.includes(n.locationId))
      .map(n => n.locationId)
    warnings.push(`Surplus-edge graph contains cycles; unresolved nodes: ${unresolved.join(', ')}`)
  }
  if (orphanEdges.length > 0) {
    warnings.push(`${orphanEdges.length} edge(s) reference unknown locations and were ignored`)
  }

  // Pass 1: fixed edges — take their literal amount, count toward both sides as committed demand.
  for (const e of edges) {
    if (e.kind !== 'fixed') continue
    if (!nodeMap.has(e.fromLocationId) || !nodeMap.has(e.toLocationId)) continue
    const amt = e.amountOverride ?? 0
    edgeAmounts.set(e.id, amt)
    bump(outDemand.get(e.fromLocationId)!, e.commodityTicker, amt)
    bump(inDemand.get(e.toLocationId)!, e.commodityTicker, amt)
  }

  // Pass 2: demand edges, reverse topological order (sinks first).
  const reverseDemandTopo = [...demandTopoOrder].reverse()
  for (const loc of reverseDemandTopo) {
    const node = nodeMap.get(loc)!
    const tickers = collectTickers(node, inbound.get(loc) ?? [], outDemand.get(loc)!)
    for (const ticker of tickers) {
      const consumption = node.nativeConsumption[ticker] ?? 0
      const production = node.nativeProduction[ticker] ?? 0
      const stock = settings.stockMode === 'included' ? (node.stock[ticker] ?? 0) : 0
      const committedOut = outDemand.get(loc)![ticker] ?? 0

      const required = Math.max(0, consumption + committedOut - production - stock)
      if (required <= 0) continue

      const candidates = (inbound.get(loc) ?? []).filter(
        e => e.kind === 'demand' && e.commodityTicker === ticker
      )
      if (candidates.length === 0) continue

      sortByPriorityThenDistance(candidates, loc, getJumpDistance)

      // Waterfall: the highest-priority (closest, if tied) edge absorbs the full required inflow.
      const chosen = candidates[0]
      edgeAmounts.set(chosen.id, (edgeAmounts.get(chosen.id) ?? 0) + required)
      bump(outDemand.get(chosen.fromLocationId)!, ticker, required)
      bump(inDemand.get(loc)!, ticker, required)
    }
  }

  // Pass 3: surplus edges, topological order (sources first).
  for (const loc of surplusTopoOrder) {
    const node = nodeMap.get(loc)!
    const tickers = collectTickers(
      node,
      [...(inbound.get(loc) ?? []), ...(outbound.get(loc) ?? [])],
      outDemand.get(loc)!
    )
    for (const ticker of tickers) {
      const unallocated = computeBalance(
        node,
        ticker,
        settings,
        inDemand.get(loc)!,
        inSurplus.get(loc)!,
        outDemand.get(loc)!,
        outSurplus.get(loc)!
      )
      if (unallocated <= 0) continue

      const candidates = (outbound.get(loc) ?? []).filter(
        e => e.kind === 'surplus' && e.commodityTicker === ticker
      )
      if (candidates.length === 0) continue

      sortByPriorityThenDistance(candidates, loc, getJumpDistance)

      // Waterfall: highest-priority (closest) surplus destination absorbs the unallocated total.
      const chosen = candidates[0]
      edgeAmounts.set(chosen.id, (edgeAmounts.get(chosen.id) ?? 0) + unallocated)
      bump(outSurplus.get(loc)!, ticker, unallocated)
      bump(inSurplus.get(chosen.toLocationId)!, ticker, unallocated)
    }
  }

  // Build final node state.
  const nodeStates: NodeState[] = []
  for (const n of nodes) {
    const loc = n.locationId
    const stockForReport = settings.stockMode === 'included' ? n.stock : {}

    const derivedInflow: Record<string, number> = {}
    for (const [t, v] of Object.entries(inDemand.get(loc)!))
      derivedInflow[t] = (derivedInflow[t] ?? 0) + v
    for (const [t, v] of Object.entries(inSurplus.get(loc)!))
      derivedInflow[t] = (derivedInflow[t] ?? 0) + v

    const derivedOutflow: Record<string, number> = {}
    for (const [t, v] of Object.entries(outDemand.get(loc)!))
      derivedOutflow[t] = (derivedOutflow[t] ?? 0) + v
    for (const [t, v] of Object.entries(outSurplus.get(loc)!))
      derivedOutflow[t] = (derivedOutflow[t] ?? 0) + v

    const allTickers = new Set<string>([
      ...Object.keys(n.nativeConsumption),
      ...Object.keys(n.nativeProduction),
      ...Object.keys(stockForReport),
      ...Object.keys(derivedInflow),
      ...Object.keys(derivedOutflow),
    ])

    const balance: Record<string, number> = {}
    const shoppingList: Record<string, number> = {}
    for (const t of allTickers) {
      const b =
        (n.nativeProduction[t] ?? 0) +
        (stockForReport[t] ?? 0) +
        (derivedInflow[t] ?? 0) -
        (n.nativeConsumption[t] ?? 0) -
        (derivedOutflow[t] ?? 0)
      balance[t] = b
      if (b < 0) shoppingList[t] = -b
    }

    nodeStates.push({
      locationId: n.locationId,
      locationName: n.locationName,
      systemNaturalId: n.systemNaturalId,
      systemName: n.systemName,
      systemPositionX: n.systemPositionX,
      systemPositionZ: n.systemPositionZ,
      stock: stockForReport,
      nativeConsumption: n.nativeConsumption,
      nativeProduction: n.nativeProduction,
      consumptionBreakdown: n.consumptionBreakdown,
      derivedInflow,
      derivedOutflow,
      balance,
      shoppingList,
      // Timing fields are populated by the loader (logistics-graph-loader);
      // the solver itself only sees totals, not daily rates.
      dailyConsumption: {},
      dailyProduction: {},
      daysOfStock: {},
      runOutAt: {},
      latestContractAt: {},
      dailyOutflow: {},
      dailyInflow: {},
      chainSource: {},
      warnings: [],
    })
  }

  const edgeStates: EdgeState[] = edges.map(e => ({
    id: e.id,
    fromLocationId: e.fromLocationId,
    toLocationId: e.toLocationId,
    commodityTicker: e.commodityTicker,
    kind: e.kind,
    amount: edgeAmounts.get(e.id) ?? 0,
    isBottleneck: false,
    isOverride: e.kind === 'fixed',
    priority: e.priority,
    transitDays: e.transitDays,
    cadenceDays: e.cadenceDays,
    perShipmentAmount: 0, // populated by the loader
    nextArrivalAt: null, // populated by the loader
    loadAt: null, // populated by the loader
    shipBy: null, // populated by the loader
    contractBy: null, // populated by the loader
    note: e.note,
  }))

  return {
    settings: {
      burnDays: settings.burnDays,
      repairDays: settings.repairDays,
      conditionMode: settings.conditionMode,
      stockMode: settings.stockMode,
      // Loader overwrites this with the user's setting; default to PRUN's 3.
      contractLeadDays: 3,
    },
    nodes: nodeStates,
    edges: edgeStates,
    // Loader overwrites this with the user's actual building data; the solver
    // itself doesn't reason about repair.
    repairEvents: [],
    warnings,
  }
}

function newNodeTickerMap(nodes: SolverNode[]): Map<string, Record<string, number>> {
  const m = new Map<string, Record<string, number>>()
  for (const n of nodes) m.set(n.locationId, {})
  return m
}

/**
 * Topologically sort `nodes` using only edges that match the predicate.
 * Nodes not reachable via the predicate edges (i.e. isolated or only touched
 * by skipped edges) are still included so every node gets a slot in the order.
 * Returns a partial order when cycles exist; caller detects via length mismatch.
 */
function topoSort(
  nodes: SolverNode[],
  nodeMap: Map<string, SolverNode>,
  edges: SolverEdge[],
  include: (e: SolverEdge) => boolean
): string[] {
  const indegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of nodes) {
    indegree.set(n.locationId, 0)
    adj.set(n.locationId, [])
  }
  for (const e of edges) {
    if (!include(e)) continue
    if (!nodeMap.has(e.fromLocationId) || !nodeMap.has(e.toLocationId)) continue
    indegree.set(e.toLocationId, (indegree.get(e.toLocationId) ?? 0) + 1)
    adj.get(e.fromLocationId)!.push(e.toLocationId)
  }
  const order: string[] = []
  const queue: string[] = []
  for (const [loc, deg] of indegree) if (deg === 0) queue.push(loc)
  while (queue.length > 0) {
    const loc = queue.shift()!
    order.push(loc)
    for (const next of adj.get(loc) ?? []) {
      const deg = (indegree.get(next) ?? 0) - 1
      indegree.set(next, deg)
      if (deg === 0) queue.push(next)
    }
  }
  return order
}

function bump(map: Record<string, number>, ticker: string, amount: number): void {
  map[ticker] = (map[ticker] ?? 0) + amount
}

function collectTickers(
  node: SolverNode,
  edges: SolverEdge[],
  outboundDemand: Record<string, number>
): Set<string> {
  const tickers = new Set<string>()
  for (const t of Object.keys(node.nativeConsumption)) tickers.add(t)
  for (const t of Object.keys(node.nativeProduction)) tickers.add(t)
  for (const t of Object.keys(node.stock)) tickers.add(t)
  for (const t of Object.keys(outboundDemand)) tickers.add(t)
  for (const e of edges) tickers.add(e.commodityTicker)
  return tickers
}

function computeBalance(
  node: SolverNode,
  ticker: string,
  settings: SolverSettings,
  inD: Record<string, number>,
  inS: Record<string, number>,
  outD: Record<string, number>,
  outS: Record<string, number>
): number {
  const production = node.nativeProduction[ticker] ?? 0
  const consumption = node.nativeConsumption[ticker] ?? 0
  const stock = settings.stockMode === 'included' ? (node.stock[ticker] ?? 0) : 0
  const inflowD = inD[ticker] ?? 0
  const inflowS = inS[ticker] ?? 0
  const outflowD = outD[ticker] ?? 0
  const outflowS = outS[ticker] ?? 0
  return production + stock + inflowD + inflowS - consumption - outflowD - outflowS
}

function sortByPriorityThenDistance(
  edges: SolverEdge[],
  centerLocation: string,
  getDist: JumpDistanceFn
): void {
  edges.sort((a, b) => {
    const pa = a.priority ?? Number.POSITIVE_INFINITY
    const pb = b.priority ?? Number.POSITIVE_INFINITY
    if (pa !== pb) return pa - pb
    const otherA = a.fromLocationId === centerLocation ? a.toLocationId : a.fromLocationId
    const otherB = b.fromLocationId === centerLocation ? b.toLocationId : b.fromLocationId
    const da = getDist(centerLocation, otherA) ?? Number.POSITIVE_INFINITY
    const db = getDist(centerLocation, otherB) ?? Number.POSITIVE_INFINITY
    return da - db
  })
}
