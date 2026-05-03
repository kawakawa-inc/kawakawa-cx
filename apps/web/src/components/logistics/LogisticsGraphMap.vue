<template>
  <div class="logistics-graph-map">
    <!-- Filter bar -->
    <div class="graph-filter-bar pa-2">
      <TokenSearchInput
        placeholder="Filter by material, location, or kind…"
        :get-commodity-display="getCommodityDisplay"
        :get-commodity-name="getCommodityName"
        :get-location-display="getLocationDisplay"
        :extra-suggestion-types="kindSuggestions"
        :help-tokens="graphHelpTokens"
        history-key="logistics-graph"
        @update:chips="onChipsUpdate"
      />
      <div class="d-flex align-center mt-2 ga-2">
        <span class="text-caption text-medium-emphasis">
          {{ visibleNodeCount }} nodes · {{ visibleEdgeCount }} edges
        </span>
        <v-spacer />
        <v-btn-toggle
          v-model="layoutName"
          mandatory
          density="compact"
          variant="outlined"
          color="primary"
        >
          <v-btn value="dagre" size="x-small">
            <v-icon size="x-small" class="mr-1">mdi-format-list-bulleted</v-icon>
            Layered
          </v-btn>
          <v-btn value="cose" size="x-small">
            <v-icon size="x-small" class="mr-1">mdi-atom</v-icon>
            Force
          </v-btn>
          <v-btn value="universe" size="x-small">
            <v-icon size="x-small" class="mr-1">mdi-star-four-points-outline</v-icon>
            Universe
          </v-btn>
        </v-btn-toggle>
        <v-btn
          v-if="focusedSystem"
          size="x-small"
          variant="text"
          prepend-icon="mdi-arrow-left"
          @click="unfocusSystem"
        >
          Back
        </v-btn>
        <v-btn size="x-small" variant="text" prepend-icon="mdi-fit-to-page" @click="fitView">
          Fit
        </v-btn>
      </div>
    </div>

    <!-- Legend -->
    <div class="graph-legend pa-2 text-caption">
      <span class="legend-item"> <span class="swatch swatch-demand"></span> Demand </span>
      <span class="legend-item"> <span class="swatch swatch-surplus"></span> Surplus </span>
      <span class="legend-item"> <span class="swatch swatch-fixed"></span> Fixed </span>
      <span class="legend-item text-medium-emphasis ml-4">
        Node color: red = shortfall · green = surplus · grey = balanced
      </span>
    </div>

    <!-- Graph container -->
    <div ref="containerRef" class="graph-container"></div>

    <!-- Empty state -->
    <div v-if="graph.nodes.length === 0" class="graph-empty">
      <div class="text-medium-emphasis">No nodes to display.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import cytoscape, {
  type Core,
  type ElementDefinition,
  type NodeSingular,
  type EdgeSingular,
} from 'cytoscape'
import dagre from 'cytoscape-dagre'
import TokenSearchInput, {
  type SearchChip,
  type SearchChipType,
  type ExtraSuggestionType,
  type HelpToken,
} from '../TokenSearchInput.vue'
import { commodityService } from '../../services/commodityService'
import { locationService } from '../../services/locationService'
import { useUserStore } from '../../stores/user'
import { localizeMaterial } from '../../utils/materials'
import type { LogisticsGraph, NodeState, EdgeState } from '@kawakawa/types'

// Register dagre layout once per module load
cytoscape.use(dagre)

interface Props {
  graph: LogisticsGraph
  selectedLocationId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'select-node', locationId: string): void
  (e: 'select-edge', edgeId: number): void
}>()

const userStore = useUserStore()

const containerRef = ref<HTMLDivElement | null>(null)
let cy: Core | null = null

const layoutName = ref<'dagre' | 'cose' | 'universe'>('dagre')
const focusedSystem = ref<string | null>(null)
const chips = ref<SearchChip[]>([])

// ==================== Filters ====================

const filters = computed(() => {
  const materials = new Set<string>()
  const locations = new Set<string>()
  const kinds = new Set<string>()
  for (const c of chips.value) {
    if (c.type === 'commodity') materials.add(c.value)
    else if (c.type === 'location' || c.type === 'source' || c.type === 'destination')
      locations.add(c.value)
    else if (c.type === 'category') kinds.add(c.value)
  }
  return { materials, locations, kinds }
})

function edgePassesFilters(e: EdgeState): boolean {
  // Always hide 0-amount edges — they exist from bulk-add but the solver
  // determined the destination doesn't need the material (e.g. it's a net
  // producer). Showing them just adds clutter.
  if (e.amount <= 0) return false
  const f = filters.value
  if (f.materials.size > 0 && !f.materials.has(e.commodityTicker)) return false
  if (f.kinds.size > 0 && !f.kinds.has(e.kind)) return false
  if (f.locations.size > 0) {
    if (!f.locations.has(e.fromLocationId) && !f.locations.has(e.toLocationId)) return false
  }
  return true
}

function nodePassesFilters(n: NodeState): boolean {
  const f = filters.value
  // Location chips restrict to the chips themselves plus any node reachable via
  // a visible edge. Other chip types filter via edges only.
  if (f.locations.size > 0) {
    if (f.locations.has(n.locationId)) return true
    // Keep nodes connected to a filtered-in edge.
    for (const e of props.graph.edges) {
      if (!edgePassesFilters(e)) continue
      if (e.fromLocationId === n.locationId || e.toLocationId === n.locationId) return true
    }
    return false
  }
  // Without a location filter, keep any node touched by a visible edge, plus
  // nodes that have standalone activity (non-zero natives or claims).
  if (f.materials.size > 0 || f.kinds.size > 0) {
    for (const e of props.graph.edges) {
      if (!edgePassesFilters(e)) continue
      if (e.fromLocationId === n.locationId || e.toLocationId === n.locationId) return true
    }
    // If no filter on materials/kinds touches this node at all, hide it.
    return false
  }
  return true
}

const visibleNodes = computed(() => props.graph.nodes.filter(nodePassesFilters))
const visibleEdges = computed(() => props.graph.edges.filter(edgePassesFilters))
const visibleNodeCount = computed(() => visibleNodes.value.length)
const visibleEdgeCount = computed(() => visibleEdges.value.length)

// ==================== Element building ====================

function nodeThroughput(n: NodeState): number {
  let total = 0
  for (const v of Object.values(n.derivedInflow)) total += v
  for (const v of Object.values(n.derivedOutflow)) total += v
  return total
}

function nodeStatus(n: NodeState): 'shortfall' | 'surplus' | 'balanced' {
  const hasShortfall = Object.keys(n.shoppingList).length > 0
  if (hasShortfall) return 'shortfall'
  const hasSurplus = Object.values(n.balance).some(v => v > 0)
  if (hasSurplus) return 'surplus'
  return 'balanced'
}

// ==================== System-level aggregation ====================

interface SystemAgg {
  systemId: string
  systemName: string
  x: number | undefined
  z: number | undefined
  nodes: NodeState[]
  totalThroughput: number
  status: 'shortfall' | 'surplus' | 'balanced'
}

function buildSystemAggregates(): Map<string, SystemAgg> {
  const systems = new Map<string, SystemAgg>()
  for (const n of visibleNodes.value) {
    const sid = n.systemNaturalId || n.locationId
    let sys = systems.get(sid)
    if (!sys) {
      sys = {
        systemId: sid,
        systemName: n.systemName || n.locationName,
        x: n.systemPositionX,
        z: n.systemPositionZ,
        nodes: [],
        totalThroughput: 0,
        status: 'balanced',
      }
      systems.set(sid, sys)
    }
    sys.nodes.push(n)
    sys.totalThroughput += nodeThroughput(n)
    const ns = nodeStatus(n)
    if (ns === 'shortfall') sys.status = 'shortfall'
    else if (ns === 'surplus' && sys.status === 'balanced') sys.status = 'surplus'
  }
  return systems
}

function systemForNode(locationId: string): string {
  const n = props.graph.nodes.find(nd => nd.locationId === locationId)
  return n?.systemNaturalId || locationId
}

interface AggEdge {
  fromSystem: string
  toSystem: string
  totalAmount: number
  materialCount: number
  dominantKind: string
  label: string
}

function buildSystemEdges(systems: Map<string, SystemAgg>): AggEdge[] {
  const edgeMap = new Map<
    string,
    { amount: number; materials: Set<string>; kinds: Map<string, number> }
  >()
  for (const e of visibleEdges.value) {
    const fromSys = systemForNode(e.fromLocationId)
    const toSys = systemForNode(e.toLocationId)
    if (fromSys === toSys) continue // intra-system edges hidden at system level
    const key = `${fromSys}|${toSys}`
    let entry = edgeMap.get(key)
    if (!entry) {
      entry = { amount: 0, materials: new Set(), kinds: new Map() }
      edgeMap.set(key, entry)
    }
    entry.amount += e.amount
    entry.materials.add(e.commodityTicker)
    entry.kinds.set(e.kind, (entry.kinds.get(e.kind) ?? 0) + e.amount)
  }
  const agg: AggEdge[] = []
  for (const [key, entry] of edgeMap) {
    const [fromSystem, toSystem] = key.split('|')
    if (!systems.has(fromSystem) || !systems.has(toSystem)) continue
    let dominantKind = 'demand'
    let maxKindAmt = 0
    for (const [k, v] of entry.kinds) {
      if (v > maxKindAmt) {
        dominantKind = k
        maxKindAmt = v
      }
    }
    agg.push({
      fromSystem,
      toSystem,
      totalAmount: entry.amount,
      materialCount: entry.materials.size,
      dominantKind,
      label: `${entry.materials.size} mat · ${Math.round(entry.amount)}`,
    })
  }
  return agg
}

// ==================== Element building ====================

function buildElements(): ElementDefinition[] {
  if (layoutName.value === 'universe') {
    if (focusedSystem.value) {
      return buildFocusedSystemElements(focusedSystem.value)
    }
    return buildUniverseElements()
  }
  return buildPlanetElements()
}

function buildFocusedSystemElements(systemId: string): ElementDefinition[] {
  // Show individual planets for the focused system + aggregated system nodes
  // for everything else, with real planet-level edges for the focused system.
  const systems = buildSystemAggregates()
  const focusedSys = systems.get(systemId)
  if (!focusedSys) return buildPlanetElements()

  const focusedNodeIds = new Set(focusedSys.nodes.map(n => n.locationId))

  const elements: ElementDefinition[] = []
  const maxThroughput = Math.max(1, ...[...systems.values()].map(s => s.totalThroughput))

  // Add system nodes for non-focused systems (no position — let dagre handle layout)
  for (const sys of systems.values()) {
    if (sys.systemId === systemId) continue
    const sizeScale = Math.sqrt(sys.totalThroughput / maxThroughput)
    const size = 40 + sizeScale * 80
    elements.push({
      group: 'nodes',
      data: {
        id: sys.systemId,
        label: sys.systemName,
        status: sys.status,
        size,
        isSystem: true,
      },
    })
  }

  // Add individual planet nodes for the focused system
  const focusedNodeThroughputs = focusedSys.nodes.map(nodeThroughput)
  const maxFocusedThroughput = Math.max(1, ...focusedNodeThroughputs)
  for (const n of focusedSys.nodes) {
    const sizeScale = Math.sqrt(nodeThroughput(n) / maxFocusedThroughput)
    const size = 30 + sizeScale * 50
    elements.push({
      group: 'nodes',
      data: {
        id: n.locationId,
        label: n.locationName,
        status: nodeStatus(n),
        size,
        isSystem: false,
      },
    })
  }

  // Add real edges where at least one end is in the focused system.
  // If the other end is in a non-focused system, target the system node.
  const edges = visibleEdges.value
  const maxAmount = Math.max(1, ...edges.map(e => e.amount))
  for (const e of edges) {
    const fromFocused = focusedNodeIds.has(e.fromLocationId)
    const toFocused = focusedNodeIds.has(e.toLocationId)
    if (!fromFocused && !toFocused) continue // not touching focused system
    const source = fromFocused ? e.fromLocationId : systemForNode(e.fromLocationId)
    const target = toFocused ? e.toLocationId : systemForNode(e.toLocationId)
    if (source === target) continue
    const widthScale = Math.max(0.1, e.amount / maxAmount)
    const width = 1 + widthScale * 6
    elements.push({
      group: 'edges',
      data: {
        id: `e${e.id}`,
        source,
        target,
        kind: e.kind,
        ticker: e.commodityTicker,
        amount: e.amount,
        width,
        edgeId: e.id,
        label: `${e.commodityTicker} ${Math.round(e.amount)}`,
      },
    })
  }

  return elements
}

function buildPlanetElements(): ElementDefinition[] {
  const nodes = visibleNodes.value
  const edges = visibleEdges.value
  const throughputs = nodes.map(nodeThroughput)
  const maxThroughput = Math.max(1, ...throughputs)
  const maxAmount = Math.max(1, ...edges.map(e => e.amount))

  const elements: ElementDefinition[] = []
  for (const n of nodes) {
    const throughput = nodeThroughput(n)
    const sizeScale = Math.sqrt(throughput / maxThroughput)
    const size = 30 + sizeScale * 60
    elements.push({
      group: 'nodes',
      data: {
        id: n.locationId,
        label: n.locationName,
        status: nodeStatus(n),
        size,
        isSystem: false,
      },
    })
  }
  for (const e of edges) {
    const widthScale = Math.max(0.1, e.amount / maxAmount)
    const width = 1 + widthScale * 6
    elements.push({
      group: 'edges',
      data: {
        id: `e${e.id}`,
        source: e.fromLocationId,
        target: e.toLocationId,
        kind: e.kind,
        ticker: e.commodityTicker,
        amount: e.amount,
        width,
        edgeId: e.id,
        label: `${e.commodityTicker} ${Math.round(e.amount)}`,
      },
    })
  }
  return elements
}

function buildUniverseElements(): ElementDefinition[] {
  const systems = buildSystemAggregates()
  const sysEdges = buildSystemEdges(systems)
  const maxThroughput = Math.max(1, ...[...systems.values()].map(s => s.totalThroughput))
  const maxAmount = Math.max(1, ...sysEdges.map(e => e.totalAmount))

  // Normalize coordinates: map the bounding box of visible systems to a
  // comfortable viewport range so nodes spread out even if they cluster
  // in a small region of the universe.
  const positioned = [...systems.values()].filter(s => s.x != null && s.z != null)
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity
  for (const s of positioned) {
    if (s.x! < minX) minX = s.x!
    if (s.x! > maxX) maxX = s.x!
    if (s.z! < minZ) minZ = s.z!
    if (s.z! > maxZ) maxZ = s.z!
  }
  const rangeX = maxX - minX || 1
  const rangeZ = maxZ - minZ || 1
  const VIEWPORT = 2000
  const normalizeX = (x: number) => ((x - minX) / rangeX) * VIEWPORT
  const normalizeZ = (z: number) => ((z - minZ) / rangeZ) * VIEWPORT

  const elements: ElementDefinition[] = []
  for (const sys of systems.values()) {
    const sizeScale = Math.sqrt(sys.totalThroughput / maxThroughput)
    const size = 40 + sizeScale * 80
    elements.push({
      group: 'nodes',
      data: {
        id: sys.systemId,
        label: `${sys.systemName}\n(${sys.nodes.length})`,
        status: sys.status,
        size,
        isSystem: true,
        planetCount: sys.nodes.length,
      },
      position:
        sys.x != null && sys.z != null ? { x: normalizeX(sys.x), y: normalizeZ(sys.z) } : undefined,
    })
  }
  for (let i = 0; i < sysEdges.length; i++) {
    const se = sysEdges[i]
    const widthScale = Math.max(0.1, se.totalAmount / maxAmount)
    const width = 1.5 + widthScale * 8
    elements.push({
      group: 'edges',
      data: {
        id: `se${i}`,
        source: se.fromSystem,
        target: se.toSystem,
        kind: se.dominantKind,
        amount: se.totalAmount,
        width,
        label: se.label,
      },
    })
  }
  return elements
}

// ==================== Cytoscape lifecycle ====================

function effectiveLayoutName(): string {
  // Universe mode with no focused system uses 'preset' (positions come from FIO coordinates).
  // Focused system uses dagre for the expanded planet nodes.
  if (layoutName.value === 'universe') {
    return focusedSystem.value ? 'dagre' : 'preset'
  }
  return layoutName.value
}

function unfocusSystem() {
  focusedSystem.value = null
  rebuildElements()
}

function initCytoscape() {
  if (!containerRef.value) return
  cy = cytoscape({
    container: containerRef.value,
    elements: buildElements(),
    style: [
      {
        selector: 'node',
        style: {
          'background-color': (ele: NodeSingular) => {
            const s = ele.data('status')
            if (s === 'shortfall') return '#d32f2f'
            if (s === 'surplus') return '#388e3c'
            return '#616161'
          },
          label: 'data(label)',
          color: '#fff',
          'text-outline-color': '#000',
          'text-outline-width': 1,
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '11px',
          width: 'data(size)',
          height: 'data(size)',
          'border-width': 2,
          'border-color': 'rgba(255,255,255,0.3)',
        },
      },
      {
        selector: 'node:selected',
        style: {
          'border-color': '#42a5f5',
          'border-width': 4,
        },
      },
      {
        selector: 'edge',
        style: {
          width: 'data(width)',
          'line-color': (ele: EdgeSingular) => {
            const k = ele.data('kind')
            if (k === 'demand') return '#42a5f5'
            if (k === 'surplus') return '#66bb6a'
            if (k === 'fixed') return '#ffa726'
            return '#999'
          },
          'target-arrow-color': (ele: EdgeSingular) => {
            const k = ele.data('kind')
            if (k === 'demand') return '#42a5f5'
            if (k === 'surplus') return '#66bb6a'
            if (k === 'fixed') return '#ffa726'
            return '#999'
          },
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'line-style': (ele: EdgeSingular) => {
            const k = ele.data('kind')
            if (k === 'surplus') return 'dashed'
            if (k === 'fixed') return 'solid'
            return 'solid'
          },
          label: 'data(label)',
          'font-size': '9px',
          color: '#bbb',
          'text-rotation': 'autorotate',
          'text-background-color': '#121212',
          'text-background-opacity': 0.8,
          'text-background-padding': '2px',
        },
      },
      {
        selector: 'edge:selected',
        style: {
          'line-color': '#42a5f5',
          'target-arrow-color': '#42a5f5',
          width: 6,
        },
      },
    ],
    layout: { name: effectiveLayoutName(), ...layoutOptions(layoutName.value) },
    wheelSensitivity: 0.8,
  })

  cy.on('tap', 'node', evt => {
    const node = evt.target as NodeSingular
    if (node.data('isSystem') && layoutName.value === 'universe') {
      // Drill down into this system — switch to planet-level view filtered
      // to planets in this system + their direct counterparties.
      focusedSystem.value = node.id()
      rebuildElements()
    } else {
      emit('select-node', node.id())
    }
  })
  cy.on('tap', 'edge', evt => {
    const edge = evt.target as EdgeSingular
    const id = edge.data('edgeId')
    if (typeof id === 'number') emit('select-edge', id)
  })

  applySelection()
}

function layoutOptions(name: 'dagre' | 'cose' | 'universe'): Record<string, unknown> {
  if (name === 'dagre') {
    return {
      rankDir: 'LR',
      nodeSep: 50,
      rankSep: 120,
      animate: false,
      fit: true,
      padding: 30,
    }
  }
  if (name === 'universe') {
    // Preset layout — nodes already have positions from FIO coordinates.
    // Nodes without coordinates (e.g., focused system's planets) get arranged
    // by the post-layout fan logic.
    return {
      animate: false,
      fit: true,
      padding: 50,
    }
  }
  return {
    animate: false,
    fit: true,
    padding: 30,
    nodeRepulsion: 8000,
    idealEdgeLength: 120,
  }
}

function relayout() {
  if (!cy) return
  const layout = cy.layout({ name: effectiveLayoutName(), ...layoutOptions(layoutName.value) })
  layout.run()
}

function rebuildElements() {
  if (!cy) return
  cy.elements().remove()
  cy.add(buildElements())
  relayout()
  applySelection()
}

function applySelection() {
  if (!cy) return
  cy.nodes().unselect()
  if (props.selectedLocationId) {
    const target = cy.getElementById(props.selectedLocationId)
    if (target.nonempty()) target.select()
  }
}

function fitView() {
  if (!cy) return
  cy.fit(undefined, 30)
}

// Chip change → rebuild
function onChipsUpdate(next: SearchChip[]) {
  chips.value = next
}

// ==================== TokenSearchInput helpers ====================

const getCommodityDisplay = (ticker: string): string => {
  const name = commodityService.getCommodityDisplay(ticker, 'name-only')
  return name !== ticker ? `${ticker} – ${localizeMaterial(name)}` : ticker
}
const getCommodityName = (ticker: string): string =>
  localizeMaterial(commodityService.getCommodityDisplay(ticker, 'name-only'))
const getLocationDisplay = (id: string): string =>
  locationService.getLocationDisplay(id, userStore.getLocationDisplayMode())

// "Kind" filter uses the category chip slot (teal), since kind is the
// conceptual descendant of lineSource from the old model.
const kindSuggestions = computed<ExtraSuggestionType[]>(() => [
  {
    type: 'category' as SearchChipType,
    typeLabel: 'Kind',
    color: 'teal',
    options: [
      { value: 'demand', display: 'Demand' },
      { value: 'surplus', display: 'Surplus' },
      { value: 'fixed', display: 'Fixed' },
    ],
  },
])

const graphHelpTokens: HelpToken[] = [
  {
    label: 'Commodity',
    color: 'primary',
    example: 'COF',
    description: 'Ticker or material name — keeps only edges for that material.',
  },
  {
    label: 'Location',
    color: 'secondary',
    example: 'Montem',
    description: 'Planet or station — keeps only nodes at that location.',
  },
  {
    label: 'Kind',
    color: 'teal',
    example: 'demand',
    description: 'One of `demand`, `surplus`, `fixed` — keeps edges of that kind.',
  },
]

// ==================== Lifecycle ====================

onMounted(async () => {
  await nextTick()
  initCytoscape()
})

onBeforeUnmount(() => {
  if (cy) {
    cy.destroy()
    cy = null
  }
})

// React to graph changes (new flows, claims, etc.)
watch(
  () => props.graph,
  () => rebuildElements(),
  { deep: false }
)
watch(
  () => chips.value,
  () => rebuildElements(),
  { deep: true }
)
watch(
  () => layoutName.value,
  newLayout => {
    if (newLayout !== 'universe') focusedSystem.value = null
    rebuildElements()
  }
)
watch(
  () => props.selectedLocationId,
  () => applySelection()
)
</script>

<style scoped>
.logistics-graph-map {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 600px;
}

.graph-filter-bar {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.graph-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  display: inline-block;
  width: 24px;
  height: 3px;
  border-radius: 2px;
}
.swatch-demand {
  background: #42a5f5;
}
.swatch-surplus {
  background: #66bb6a;
  height: 0;
  border-top: 3px dashed #66bb6a;
}
.swatch-fixed {
  background: #ffa726;
}

.graph-container {
  flex: 1;
  min-height: 600px;
  background: #0d0d0d;
}

.graph-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
