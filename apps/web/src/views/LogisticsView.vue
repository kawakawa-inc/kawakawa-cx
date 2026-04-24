<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-graph-outline</v-icon>
        Logistics
        <v-chip size="small" class="ml-3" color="warning" variant="tonal">Experimental</v-chip>
        <v-spacer />
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="loadGraph"
        >
          Refresh
        </v-btn>
      </v-card-title>
      <v-card-text>
        <div class="text-caption text-medium-emphasis mb-2">
          Directed flow graph. Each node's balance is
          <code>nativeProduction + stock + inflow − nativeConsumption − outflow</code>. Shortfalls
          surface here as a shopping list.
        </div>
      </v-card-text>
    </v-card>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <v-alert
      v-if="graph && graph.warnings.length > 0"
      type="warning"
      variant="tonal"
      class="mb-4"
      density="compact"
    >
      <div v-for="(w, i) in graph.warnings" :key="i">{{ w }}</div>
    </v-alert>

    <v-row v-if="graph && !loading">
      <!-- Left: node list -->
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title class="text-subtitle-1">Nodes</v-card-title>
          <v-list density="compact" nav>
            <v-list-item
              v-for="node in graph.nodes"
              :key="node.locationId"
              :active="selectedLocationId === node.locationId"
              :title="node.locationName"
              :subtitle="nodeSubtitle(node)"
              @click="selectedLocationId = node.locationId"
            >
              <template #prepend>
                <v-icon :color="nodeIconColor(node)">{{ nodeIcon(node) }}</v-icon>
              </template>
              <template #append>
                <v-chip v-if="shoppingCount(node) > 0" size="x-small" color="error" variant="flat">
                  {{ shoppingCount(node) }}
                </v-chip>
              </template>
            </v-list-item>
            <v-list-item v-if="graph.nodes.length === 0">
              <v-list-item-title class="text-medium-emphasis">
                No nodes yet. Add a flow or claim.
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <!-- Right: tabbed main panel -->
      <v-col cols="12" md="8">
        <v-card>
          <v-tabs v-model="mainTab" density="compact">
            <v-tab value="inspector">
              <v-icon start>mdi-clipboard-list</v-icon>
              Inspector
            </v-tab>
            <v-tab value="graph">
              <v-icon start>mdi-graph-outline</v-icon>
              Graph
            </v-tab>
          </v-tabs>
          <v-divider />
          <v-tabs-window v-model="mainTab">
            <!-- ==================== Inspector tab ==================== -->
            <v-tabs-window-item value="inspector">
              <template v-if="selectedNode">
                <v-card-title class="d-flex align-center flex-wrap ga-2">
                  <v-icon start :color="nodeIconColor(selectedNode)">
                    {{ nodeIcon(selectedNode) }}
                  </v-icon>
                  <span class="mr-2">{{ selectedNode.locationName }}</span>
                  <v-chip size="x-small" variant="outlined">
                    {{ selectedNode.locationId }}
                  </v-chip>
                  <v-spacer />
                  <v-btn
                    size="small"
                    variant="outlined"
                    prepend-icon="mdi-bank"
                    @click="openCreateClaim"
                  >
                    Add Claim
                  </v-btn>
                  <v-btn
                    size="small"
                    variant="outlined"
                    prepend-icon="mdi-auto-fix"
                    @click="openBulkFlow"
                  >
                    Bulk Add
                  </v-btn>
                  <v-btn
                    size="small"
                    variant="outlined"
                    color="primary"
                    prepend-icon="mdi-plus"
                    @click="openCreateFlow"
                  >
                    Add Flow
                  </v-btn>
                  <v-btn
                    v-if="shoppingCount(selectedNode) > 0"
                    color="primary"
                    prepend-icon="mdi-cart-plus"
                    @click="handleShoppingList(selectedNode)"
                  >
                    Shopping List ({{ shoppingCount(selectedNode) }})
                  </v-btn>
                </v-card-title>

                <v-divider />

                <!-- Balance table -->
                <v-card-text>
                  <div class="text-subtitle-2 mb-2">Per-material balance</div>
                  <v-data-table
                    v-model:expanded="expandedTickers"
                    :headers="balanceHeaders"
                    :items="balanceRows(selectedNode)"
                    :items-per-page="-1"
                    density="compact"
                    hide-default-footer
                    class="elevation-0"
                    item-value="ticker"
                    show-expand
                  >
                    <template #item.ticker="{ item }">
                      <CommodityDisplay :ticker="item.ticker" />
                    </template>
                    <template #expanded-row="{ columns, item }">
                      <tr class="breakdown-row">
                        <td :colspan="columns.length">
                          <div class="pa-3">
                            <div class="text-caption text-medium-emphasis mb-2">
                              Consumption breakdown for {{ item.ticker }}
                            </div>
                            <div
                              v-if="consumptionBreakdownParts(selectedNode, item.ticker).length > 0"
                              class="d-flex flex-wrap ga-2"
                            >
                              <div
                                v-for="part in consumptionBreakdownParts(selectedNode, item.ticker)"
                                :key="part.label"
                                class="breakdown-chip"
                              >
                                <v-icon size="x-small" class="mr-1">{{ part.icon }}</v-icon>
                                <span class="text-caption">{{ part.label }}</span>
                                <span class="text-body-2 font-weight-medium ml-2">
                                  {{ fmt(part.amount) }}
                                </span>
                              </div>
                            </div>
                            <div v-else class="text-caption text-medium-emphasis">
                              No consumption at this node.
                            </div>
                          </div>
                        </td>
                      </tr>
                    </template>
                    <template #item.nativeProduction="{ item }">
                      <span v-if="item.nativeProduction > 0" class="text-success">
                        {{ fmt(item.nativeProduction) }}
                      </span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.nativeConsumption="{ item }">
                      <span v-if="item.nativeConsumption > 0" class="text-warning">
                        {{ fmt(item.nativeConsumption) }}
                      </span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.stock="{ item }">
                      <span v-if="item.stock > 0">{{ fmt(item.stock) }}</span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.inflow="{ item }">
                      <span v-if="item.inflow > 0" class="text-success">{{
                        fmt(item.inflow)
                      }}</span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.outflow="{ item }">
                      <span v-if="item.outflow > 0" class="text-warning">{{
                        fmt(item.outflow)
                      }}</span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.balance="{ item }">
                      <span
                        :class="{
                          'text-error font-weight-medium': item.balance < 0,
                          'text-success font-weight-medium': item.balance > 0,
                          'text-disabled': item.balance === 0,
                        }"
                      >
                        {{ item.balance < 0 ? item.balance : '+' + item.balance }}
                      </span>
                    </template>
                    <template #no-data>
                      <div class="text-center py-4 text-medium-emphasis">
                        No material activity at this node yet.
                      </div>
                    </template>
                  </v-data-table>
                </v-card-text>

                <v-divider />

                <!-- Manual claims at this node -->
                <v-card-text v-if="claimsByLocation.get(selectedNode.locationId)?.length">
                  <div class="text-subtitle-2 mb-2">
                    Manual claims ({{ claimsByLocation.get(selectedNode.locationId)?.length ?? 0 }})
                  </div>
                  <v-data-table
                    :headers="claimHeaders"
                    :items="claimsByLocation.get(selectedNode.locationId) ?? []"
                    :items-per-page="-1"
                    density="compact"
                    hide-default-footer
                    class="elevation-0"
                  >
                    <template #item.category="{ item }">
                      <v-chip
                        size="x-small"
                        :color="claimCategoryColor(item.category)"
                        variant="tonal"
                      >
                        <v-icon start size="x-small">{{ claimCategoryIcon(item.category) }}</v-icon>
                        {{ claimCategoryLabel(item.category) }}
                      </v-chip>
                    </template>
                    <template #item.ticker="{ item }">
                      <CommodityDisplay :ticker="item.commodityTicker" />
                    </template>
                    <template #item.quantity="{ item }">
                      {{ fmt(item.quantity) }}
                    </template>
                    <template #item.rate="{ item }">
                      <span class="text-caption text-medium-emphasis">
                        {{ item.rate === 'daily' ? '/day' : 'total' }}
                      </span>
                    </template>
                    <template #item.note="{ item }">
                      <span class="text-caption">{{ item.note ?? '—' }}</span>
                    </template>
                    <template #item.actions="{ item }">
                      <v-btn size="x-small" icon variant="text" @click="openEditClaim(item.id)">
                        <v-icon size="small">mdi-pencil</v-icon>
                      </v-btn>
                    </template>
                  </v-data-table>
                </v-card-text>

                <v-divider v-if="claimsByLocation.get(selectedNode.locationId)?.length" />

                <!-- Edges touching this node -->
                <v-card-text>
                  <div class="text-subtitle-2 mb-2">Flows touching this node</div>
                  <v-data-table
                    :headers="edgeHeaders"
                    :items="edgesForNode(selectedNode.locationId)"
                    :items-per-page="-1"
                    density="compact"
                    hide-default-footer
                    class="elevation-0"
                  >
                    <template #item.direction="{ item }">
                      <v-icon
                        :color="
                          item.fromLocationId === selectedNode.locationId ? 'warning' : 'success'
                        "
                        size="small"
                      >
                        {{
                          item.fromLocationId === selectedNode.locationId
                            ? 'mdi-arrow-right'
                            : 'mdi-arrow-left'
                        }}
                      </v-icon>
                    </template>
                    <template #item.other="{ item }">
                      {{
                        nodeNameFor(
                          item.fromLocationId === selectedNode.locationId
                            ? item.toLocationId
                            : item.fromLocationId
                        )
                      }}
                    </template>
                    <template #item.ticker="{ item }">
                      <CommodityDisplay :ticker="item.commodityTicker" />
                    </template>
                    <template #item.kind="{ item }">
                      <v-chip size="x-small" :color="kindColor(item.kind)" variant="tonal">
                        {{ item.kind }}
                      </v-chip>
                    </template>
                    <template #item.amount="{ item }">
                      <span v-if="item.amount > 0">{{ fmt(item.amount) }}</span>
                      <span
                        v-else
                        class="text-disabled"
                        title="Solver computed 0 — destination doesn't need this material"
                      >
                        0
                        <v-icon size="x-small" class="ml-1">mdi-information-outline</v-icon>
                      </span>
                    </template>
                    <template #item.actions="{ item }">
                      <v-btn
                        size="x-small"
                        icon
                        variant="text"
                        :disabled="!flowsById.get(item.id)"
                        @click="openEditFlow(item.id)"
                      >
                        <v-icon size="small">mdi-pencil</v-icon>
                      </v-btn>
                    </template>
                    <template #no-data>
                      <div class="text-center py-4 text-medium-emphasis">
                        No flows on this node yet.
                      </div>
                    </template>
                  </v-data-table>
                </v-card-text>
              </template>
              <v-card-text v-else class="text-center text-medium-emphasis py-8">
                Select a node to inspect.
              </v-card-text>
            </v-tabs-window-item>

            <!-- ==================== Graph tab ==================== -->
            <v-tabs-window-item value="graph">
              <LogisticsGraphMap
                v-if="graph"
                :graph="graph"
                :selected-location-id="selectedLocationId"
                @select-node="selectedLocationId = $event"
                @select-edge="openEditFlow"
              />
              <v-card-text v-else class="text-center text-medium-emphasis py-8">
                Loading graph…
              </v-card-text>
            </v-tabs-window-item>
          </v-tabs-window>
        </v-card>
      </v-col>
    </v-row>

    <FlowEditDialog
      v-model="flowDialog.open"
      :flow="flowDialog.flow"
      :commodity-items="commodityItems"
      :location-items="locationItems"
      :initial-from-location-id="flowDialog.initialFromLocationId"
      @saved="handleFlowSaved"
    />

    <BulkFlowDialog
      v-model="bulkDialog.open"
      :location-items="locationItems"
      :initial-hub-location-id="bulkDialog.hubLocationId"
      @saved="handleFlowSaved"
    />

    <ClaimEditDialog
      v-model="claimDialog.open"
      :claim="claimDialog.claim"
      :commodity-items="commodityItems"
      :location-items="locationItems"
      :initial-location-id="claimDialog.initialLocationId"
      @saved="handleClaimSaved"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, defineAsyncComponent, h } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { useShoppingListStore } from '../stores/shoppingList'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import { localizeMaterial } from '../utils/materials'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import FlowEditDialog from '../components/logistics/FlowEditDialog.vue'
import BulkFlowDialog from '../components/logistics/BulkFlowDialog.vue'
import ClaimEditDialog from '../components/logistics/ClaimEditDialog.vue'

// Dynamically imported: the graph map pulls in cytoscape + dagre (~550 kB
// minified). Users who only use the Inspector tab never pay that cost —
// the chunk is fetched the first time the Graph tab is rendered.
const LogisticsGraphMap = defineAsyncComponent({
  loader: () => import('../components/logistics/LogisticsGraphMap.vue'),
  loadingComponent: {
    render: () =>
      h(
        'div',
        {
          class: 'd-flex justify-center align-center text-medium-emphasis',
          style: 'min-height: 400px',
        },
        'Loading graph…'
      ),
  },
  errorComponent: {
    render: () =>
      h(
        'div',
        {
          class: 'd-flex justify-center align-center text-error',
          style: 'min-height: 400px',
        },
        'Failed to load graph component. Try refreshing.'
      ),
  },
  delay: 200,
  timeout: 15000,
})
import type {
  LogisticsGraph,
  NodeState,
  EdgeState,
  LogisticsFlow,
  LocationDemandClaim,
  ClaimCategory,
} from '@kawakawa/types'
import type { KeyValueItem } from '../components/KeyValueAutocomplete.vue'

const router = useRouter()
const shoppingList = useShoppingListStore()
const userStore = useUserStore()

const graph = ref<LogisticsGraph | null>(null)
const loading = ref(false)
const selectedLocationId = ref<string>('')
const snackbar = ref({ show: false, color: 'info', message: '' })
const expandedTickers = ref<string[]>([])
const mainTab = ref<'inspector' | 'graph'>('inspector')

// Flow CRUD state
const flows = ref<LogisticsFlow[]>([])
const flowsById = computed(() => {
  const m = new Map<number, LogisticsFlow>()
  for (const f of flows.value) m.set(f.id, f)
  return m
})

// Claim CRUD state
const claims = ref<LocationDemandClaim[]>([])
const claimsByLocation = computed(() => {
  const m = new Map<string, LocationDemandClaim[]>()
  for (const c of claims.value) {
    const list = m.get(c.locationId) ?? []
    list.push(c)
    m.set(c.locationId, list)
  }
  return m
})
const commodityItems = ref<KeyValueItem[]>([])
const locationItems = ref<KeyValueItem[]>([])
const flowDialog = reactive<{
  open: boolean
  flow: LogisticsFlow | null
  initialFromLocationId: string
}>({
  open: false,
  flow: null,
  initialFromLocationId: '',
})
const bulkDialog = reactive<{
  open: boolean
  hubLocationId: string
}>({
  open: false,
  hubLocationId: '',
})
const claimDialog = reactive<{
  open: boolean
  claim: LocationDemandClaim | null
  initialLocationId: string
}>({
  open: false,
  claim: null,
  initialLocationId: '',
})

function openCreateFlow() {
  flowDialog.flow = null
  // Prefill Source with the currently inspected node — the most common move
  // is "I'm on node X, add a flow starting here." User can swap if they want.
  flowDialog.initialFromLocationId = selectedLocationId.value
  flowDialog.open = true
}

function openBulkFlow() {
  // Pre-fill the hub with the currently-inspected node if it's a station.
  // Planets don't make sense as hubs, so leave blank in that case and let
  // the user pick.
  const sel = selectedLocationId.value
  const selType = locationItems.value.find(l => l.key === sel)?.locationType
  bulkDialog.hubLocationId = selType === 'Station' ? sel : ''
  bulkDialog.open = true
}

function openEditFlow(flowId: number) {
  const f = flowsById.value.get(flowId)
  if (!f) return
  flowDialog.flow = f
  flowDialog.initialFromLocationId = ''
  flowDialog.open = true
}

async function handleFlowSaved() {
  await Promise.all([loadFlows(), loadGraph()])
}

async function loadFlows() {
  try {
    flows.value = await api.logistics.listFlows()
  } catch (e) {
    console.error('Failed to load flows', e)
  }
}

function openCreateClaim() {
  claimDialog.claim = null
  claimDialog.initialLocationId = selectedLocationId.value
  claimDialog.open = true
}

function openEditClaim(claimId: number) {
  const c = claims.value.find(x => x.id === claimId)
  if (!c) return
  claimDialog.claim = c
  claimDialog.initialLocationId = ''
  claimDialog.open = true
}

async function handleClaimSaved() {
  await Promise.all([loadClaims(), loadGraph()])
}

async function loadClaims() {
  try {
    claims.value = await api.logistics.listClaims()
  } catch (e) {
    console.error('Failed to load claims', e)
  }
}

async function loadCommodityItems() {
  const data = commodityService.getAllCommoditiesSync()
  let source = data
  if (source.length === 0) source = await commodityService.getAllCommodities()
  const displayMode = userStore.getCommodityDisplayMode()
  commodityItems.value = source.map(c => ({
    key: c.ticker,
    display: commodityService.getCommodityDisplay(c.ticker, displayMode),
    name: localizeMaterial(c.name),
    category: c.category,
  }))
}

async function loadLocationItems() {
  try {
    const displayMode = userStore.getLocationDisplayMode()
    const [allLocs] = await Promise.all([
      locationService.getAllLocations(),
      locationService.loadUserLocations(),
    ])
    locationItems.value = allLocs.map(l => ({
      key: l.id,
      display: locationService.getLocationDisplay(l.id, displayMode),
      locationType: l.type,
      isUserLocation: locationService.isUserLocation(l.id),
      storageTypes: locationService.getStorageTypes(l.id),
    }))
  } catch (e) {
    console.error('Failed to load locations', e)
  }
}

const selectedNode = computed<NodeState | null>(() => {
  if (!graph.value || !selectedLocationId.value) return null
  return graph.value.nodes.find(n => n.locationId === selectedLocationId.value) ?? null
})

async function loadGraph() {
  loading.value = true
  try {
    const result = await api.logistics.graph()
    graph.value = result
    // Auto-select first node if none chosen
    if (!selectedLocationId.value && result.nodes.length > 0) {
      selectedLocationId.value = result.nodes[0].locationId
    }
  } catch (e) {
    console.error('Failed to load logistics graph', e)
    snackbar.value = {
      show: true,
      color: 'error',
      message: e instanceof Error ? e.message : 'Failed to load logistics graph',
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    loadCommodityItems(),
    loadLocationItems(),
    loadFlows(),
    loadClaims(),
    loadGraph(),
  ])
})

// ==================== View helpers ====================

function shoppingCount(node: NodeState): number {
  return Object.keys(node.shoppingList).length
}

function nodeSubtitle(node: NodeState): string {
  const deficit = shoppingCount(node)
  if (deficit > 0) return `${deficit} material${deficit === 1 ? '' : 's'} short`
  const balanceKeys = Object.keys(node.balance).filter(k => node.balance[k] > 0)
  if (balanceKeys.length > 0)
    return `${balanceKeys.length} material${balanceKeys.length === 1 ? '' : 's'} surplus`
  return 'balanced'
}

function nodeIcon(node: NodeState): string {
  if (shoppingCount(node) > 0) return 'mdi-alert-circle'
  const surplus = Object.keys(node.balance).some(k => node.balance[k] > 0)
  if (surplus) return 'mdi-check-circle'
  return 'mdi-circle-outline'
}

function nodeIconColor(node: NodeState): string {
  if (shoppingCount(node) > 0) return 'error'
  const surplus = Object.keys(node.balance).some(k => node.balance[k] > 0)
  if (surplus) return 'success'
  return undefined as unknown as string
}

function kindColor(kind: string): string {
  if (kind === 'demand') return 'primary'
  if (kind === 'surplus') return 'success'
  if (kind === 'fixed') return 'warning'
  return 'default'
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString()
}

function nodeNameFor(locationId: string): string {
  return graph.value?.nodes.find(n => n.locationId === locationId)?.locationName ?? locationId
}

const balanceHeaders = [
  { title: 'Material', key: 'ticker', sortable: true },
  { title: 'Production', key: 'nativeProduction', sortable: true, align: 'end' as const },
  { title: 'Consumption', key: 'nativeConsumption', sortable: true, align: 'end' as const },
  { title: 'Stock', key: 'stock', sortable: true, align: 'end' as const },
  { title: 'Inflow', key: 'inflow', sortable: true, align: 'end' as const },
  { title: 'Outflow', key: 'outflow', sortable: true, align: 'end' as const },
  { title: 'Balance', key: 'balance', sortable: true, align: 'end' as const },
]

const edgeHeaders = [
  { title: '', key: 'direction', sortable: false, width: '40px' },
  { title: 'Counterparty', key: 'other', sortable: true },
  { title: 'Material', key: 'ticker', sortable: true },
  { title: 'Kind', key: 'kind', sortable: true },
  { title: 'Amount', key: 'amount', sortable: true, align: 'end' as const },
  { title: '', key: 'actions', sortable: false, width: '48px', align: 'end' as const },
]

const claimHeaders = [
  { title: 'Category', key: 'category', sortable: true },
  { title: 'Material', key: 'ticker', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true, align: 'end' as const },
  { title: 'Rate', key: 'rate', sortable: true },
  { title: 'Note', key: 'note', sortable: false },
  { title: '', key: 'actions', sortable: false, width: '48px', align: 'end' as const },
]

const CLAIM_CATEGORY_META: Record<ClaimCategory, { label: string; icon: string; color: string }> = {
  government: { label: 'Government', icon: 'mdi-bank', color: 'primary' },
  contract: { label: 'Contract', icon: 'mdi-file-document', color: 'info' },
  reserve: { label: 'Reserve', icon: 'mdi-shield-lock', color: 'warning' },
  other: { label: 'Other', icon: 'mdi-dots-horizontal', color: 'grey' },
}

function claimCategoryLabel(c: ClaimCategory): string {
  return CLAIM_CATEGORY_META[c]?.label ?? c
}
function claimCategoryIcon(c: ClaimCategory): string {
  return CLAIM_CATEGORY_META[c]?.icon ?? 'mdi-dots-horizontal'
}
function claimCategoryColor(c: ClaimCategory): string {
  return CLAIM_CATEGORY_META[c]?.color ?? 'grey'
}

function balanceRows(node: NodeState): Array<{
  ticker: string
  nativeProduction: number
  nativeConsumption: number
  stock: number
  inflow: number
  outflow: number
  balance: number
}> {
  const tickers = new Set<string>([
    ...Object.keys(node.nativeConsumption),
    ...Object.keys(node.nativeProduction),
    ...Object.keys(node.stock),
    ...Object.keys(node.derivedInflow),
    ...Object.keys(node.derivedOutflow),
  ])
  const rows = [...tickers].map(ticker => ({
    ticker,
    nativeProduction: Math.round(node.nativeProduction[ticker] ?? 0),
    nativeConsumption: Math.round(node.nativeConsumption[ticker] ?? 0),
    stock: Math.round(node.stock[ticker] ?? 0),
    inflow: Math.round(node.derivedInflow[ticker] ?? 0),
    outflow: Math.round(node.derivedOutflow[ticker] ?? 0),
    balance: Math.round(node.balance[ticker] ?? 0),
  }))
  return rows.sort((a, b) => {
    if (a.balance !== b.balance) return a.balance - b.balance // shortfalls first
    return a.ticker.localeCompare(b.ticker)
  })
}

function edgesForNode(locationId: string): EdgeState[] {
  if (!graph.value) return []
  return graph.value.edges.filter(
    e => e.fromLocationId === locationId || e.toLocationId === locationId
  )
}

interface BreakdownPart {
  label: string
  icon: string
  amount: number
}

function consumptionBreakdownParts(node: NodeState, ticker: string): BreakdownPart[] {
  const bd = node.consumptionBreakdown?.[ticker]
  if (!bd) return []
  const parts: BreakdownPart[] = []
  if (bd.workforceBurn > 0) {
    parts.push({ label: 'Workforce burn', icon: 'mdi-fire', amount: bd.workforceBurn })
  }
  if (bd.repair > 0) {
    parts.push({ label: 'Repair', icon: 'mdi-wrench', amount: bd.repair })
  }
  if (bd.productionInputs > 0) {
    parts.push({
      label: 'Production inputs',
      icon: 'mdi-factory',
      amount: bd.productionInputs,
    })
  }
  for (const [category, amount] of Object.entries(bd.claims ?? {})) {
    if (amount > 0) {
      parts.push({
        label: claimCategoryLabel(category as ClaimCategory),
        icon: claimCategoryIcon(category as ClaimCategory),
        amount,
      })
    }
  }
  return parts
}

function handleShoppingList(node: NodeState): void {
  const materials: Record<string, number> = {}
  for (const [ticker, qty] of Object.entries(node.shoppingList)) {
    const rounded = Math.ceil(qty)
    if (rounded > 0) materials[ticker] = rounded
  }
  if (Object.keys(materials).length === 0) {
    snackbar.value = {
      show: true,
      color: 'info',
      message: `${node.locationName} has no shortfalls — nothing to buy.`,
    }
    return
  }
  shoppingList.setMaterials(materials, `Logistics – ${node.locationName}`)
  router.push('/market')
}
</script>

<style scoped>
code {
  font-family: 'Fira Code', 'SF Mono', monospace;
  font-size: 0.85em;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 4px;
  border-radius: 3px;
}

.breakdown-row {
  background: rgba(255, 255, 255, 0.02);
}

.breakdown-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
