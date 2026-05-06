<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-card class="mb-4">
      <v-card-title class="d-flex align-center flex-wrap ga-3">
        <v-icon start>mdi-graph-outline</v-icon>
        Logistics
        <v-chip size="small" color="warning" variant="tonal">Experimental</v-chip>
        <v-spacer />
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="refreshAll"
        >
          Refresh
        </v-btn>
      </v-card-title>
      <v-card-text>
        <div class="text-caption text-medium-emphasis mb-3">
          Each flow has its own <strong>cadence</strong> — how often a shipment runs. Per-shipment
          quantity is <code>dailyConsumption × cadence</code> plus any repair material burst when a
          building's next repair falls within the cadence window. The Plan tab is your action
          surface; the Inspector is for diagnosing per-base state.
        </div>
        <div class="d-flex flex-wrap ga-3 align-center">
          <span class="text-caption text-medium-emphasis">Settings:</span>
          <v-text-field
            v-model.number="contractLeadDaysInput"
            type="number"
            min="0"
            label="Contract lead time (days)"
            hint="Days a KAWA contract takes to fulfill"
            persistent-hint
            density="compact"
            variant="outlined"
            style="max-width: 240px"
            @update:model-value="onContractLeadDaysChanged"
          />
          <v-text-field
            v-model.number="targetRepairAgeInput"
            type="number"
            min="1"
            label="Target repair age (days)"
            hint="Building age you target for repair (was repairDays)"
            persistent-hint
            density="compact"
            variant="outlined"
            style="max-width: 260px"
            @update:model-value="onTargetRepairAgeChanged"
          />
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
      <!-- Left: node list + ship roster -->
      <v-col cols="12" md="3">
        <v-card class="mb-4">
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

        <ShipRosterPanel />
      </v-col>

      <!-- Right: tabbed main panel -->
      <v-col cols="12" md="9">
        <v-card>
          <v-tabs v-model="mainTab" density="compact">
            <v-tab value="plan">
              <v-icon start>mdi-calendar-check</v-icon>
              Plan
            </v-tab>
            <v-tab value="inspector">
              <v-icon start>mdi-clipboard-list</v-icon>
              Inspector
            </v-tab>
            <v-tab value="shipments">
              <v-icon start>mdi-package-variant-closed</v-icon>
              Shipments
            </v-tab>
            <v-tab value="graph">
              <v-icon start>mdi-graph-outline</v-icon>
              Graph
            </v-tab>
          </v-tabs>
          <v-divider />
          <v-tabs-window v-model="mainTab">
            <!-- ==================== Plan tab ==================== -->
            <v-tabs-window-item value="plan">
              <PlanView
                ref="planViewRef"
                :graph="graph"
                :ships="ships"
                @navigate-to-node="onNavigateToNode"
                @edit-shipment="openEditShipment"
                @send-to-market="handleSendToMarket"
              />
            </v-tabs-window-item>

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
                </v-card-title>

                <v-divider />

                <!-- Balance table -->
                <v-card-text>
                  <div class="text-subtitle-2 mb-2">Per-material balance</div>
                  <v-data-table
                    :headers="balanceHeaders"
                    :items="balanceRows(selectedNode)"
                    :items-per-page="-1"
                    density="compact"
                    hide-default-footer
                    class="elevation-0 striped-table"
                    item-value="ticker"
                  >
                    <template #item.ticker="{ item }">
                      <CommodityDisplay :ticker="item.ticker" />
                    </template>
                    <template #item.dailyProduction="{ item }">
                      <span v-if="item.dailyProduction > 0" class="text-success">{{
                        fmtRate(item.dailyProduction)
                      }}</span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.dailyConsumption="{ item }">
                      <span v-if="item.dailyConsumption > 0" class="text-warning">{{
                        fmtRate(item.dailyConsumption)
                      }}</span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.stock="{ item }">
                      <span v-if="item.stock > 0">{{ fmt(item.stock) }}</span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.dailyInflow="{ item }">
                      <span v-if="item.dailyInflow > 0" class="text-success">{{
                        fmtRate(item.dailyInflow)
                      }}</span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.dailyOutflow="{ item }">
                      <span v-if="item.dailyOutflow > 0" class="text-warning">{{
                        fmtRate(item.dailyOutflow)
                      }}</span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.netDaily="{ item }">
                      <span
                        v-if="item.netDaily !== 0"
                        :class="{
                          'text-error font-weight-medium': item.netDaily < 0,
                          'text-success font-weight-medium': item.netDaily > 0,
                        }"
                        :title="
                          item.netDaily > 0
                            ? 'Local surplus per day (production − consumption); ignores planned in/outflow'
                            : 'Local deficit per day — this much needed from outside (production − consumption); ignores planned in/outflow'
                        "
                      >
                        {{ item.netDaily > 0 ? '+' : '' }}{{ fmtRate(item.netDaily) }}
                      </span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.daysOfStock="{ item }">
                      <v-chip
                        v-if="item.daysOfStock !== null"
                        size="x-small"
                        :color="daysOfStockColor(item.daysOfStock)"
                        variant="tonal"
                      >
                        {{ formatDaysOfStock(item.daysOfStock) }}
                      </v-chip>
                      <span v-else class="text-disabled">∞</span>
                    </template>
                    <template #item.runOutAt="{ item }">
                      <span
                        v-if="item.runOutAt"
                        :class="urgencyClass(item.runOutAt)"
                        :title="item.runOutAt"
                      >
                        {{ formatDate(item.runOutAt) }}
                      </span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.chainSource="{ item }">
                      <template v-if="item.chainSource.length === 0">
                        <span class="text-disabled">–</span>
                      </template>
                      <template v-else-if="item.chainSource.length === 1">
                        <v-chip
                          size="x-small"
                          variant="tonal"
                          color="info"
                          class="cursor-pointer"
                          :title="`Supplied from ${
                            item.chainSourceNames[0] ?? item.chainSource[0]
                          } — click to jump`"
                          @click="selectedLocationId = item.chainSource[0]"
                        >
                          <v-icon start size="x-small">mdi-arrow-up</v-icon>
                          {{ item.chainSourceNames[0] ?? item.chainSource[0] }}
                        </v-chip>
                      </template>
                      <template v-else>
                        <v-menu offset="4" location="bottom end">
                          <template #activator="{ props }">
                            <v-chip
                              v-bind="props"
                              size="x-small"
                              variant="tonal"
                              color="info"
                              class="cursor-pointer"
                              :title="`Supplied from ${item.chainSource.length} sources`"
                            >
                              <v-icon start size="x-small">mdi-arrow-up</v-icon>
                              {{ item.chainSourceNames[0] ?? item.chainSource[0] }}
                              <span class="ml-1 text-medium-emphasis">
                                +{{ item.chainSource.length - 1 }}
                              </span>
                              <v-icon end size="x-small">mdi-menu-down</v-icon>
                            </v-chip>
                          </template>
                          <v-list density="compact">
                            <v-list-item
                              v-for="(srcId, i) in item.chainSource"
                              :key="srcId"
                              :title="item.chainSourceNames[i] ?? srcId"
                              @click="selectedLocationId = srcId"
                            >
                              <template #prepend>
                                <v-icon size="small">mdi-arrow-up</v-icon>
                              </template>
                            </v-list-item>
                          </v-list>
                        </v-menu>
                      </template>
                    </template>
                    <template #no-data>
                      <div class="text-center py-4 text-medium-emphasis">
                        No material activity at this node yet.
                      </div>
                    </template>
                  </v-data-table>
                </v-card-text>

                <v-divider />

                <!-- Upcoming repair events at this node -->
                <v-card-text v-if="repairsForNode(selectedNode.locationId).length > 0">
                  <div class="text-subtitle-2 mb-2 d-flex align-center">
                    <v-icon size="small" class="mr-1">mdi-wrench</v-icon>
                    Upcoming repairs ({{ repairsForNode(selectedNode.locationId).length }})
                  </div>
                  <v-data-table
                    :headers="repairHeaders"
                    :items="repairsForNode(selectedNode.locationId)"
                    :items-per-page="-1"
                    density="compact"
                    hide-default-footer
                    class="elevation-0 striped-table"
                  >
                    <template #item.buildingTicker="{ item }">
                      <strong>{{ item.buildingTicker }}</strong>
                      <span
                        v-if="item.count > 1"
                        class="text-caption text-medium-emphasis ml-1"
                        :title="`${item.count} buildings at this condition`"
                      >
                        ×{{ item.count }}
                      </span>
                    </template>
                    <template #item.condition="{ item }">
                      <v-chip
                        size="x-small"
                        :color="
                          item.condition < 0.7
                            ? 'error'
                            : item.condition < 0.85
                              ? 'warning'
                              : 'success'
                        "
                        variant="tonal"
                      >
                        {{ Math.round(item.condition * 100) }}%
                      </v-chip>
                    </template>
                    <template #item.nextRepairAt="{ item }">
                      <span :class="urgencyClass(item.nextRepairAt)" :title="item.nextRepairAt">
                        {{ formatDate(item.nextRepairAt) }}
                      </span>
                    </template>
                    <template #item.materials="{ item }">
                      <span class="text-caption">
                        <span
                          v-for="(m, i) in item.materials"
                          :key="m.ticker"
                          :class="{ 'mr-2': i < item.materials.length - 1 }"
                        >
                          {{ m.amount }}× <strong>{{ m.ticker }}</strong></span
                        >
                      </span>
                    </template>
                  </v-data-table>
                </v-card-text>

                <v-divider v-if="repairsForNode(selectedNode.locationId).length > 0" />

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
                    class="elevation-0 striped-table"
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
                    class="elevation-0 striped-table"
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
                    <template #item.transitDays="{ item }">
                      <span v-if="item.transitDays > 0">{{ item.transitDays }}d</span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.cadenceDays="{ item }">
                      <span>{{ item.cadenceDays }}d</span>
                    </template>
                    <template #item.perShipmentAmount="{ item }">
                      <span v-if="item.perShipmentAmount > 0">
                        {{ Math.round(item.perShipmentAmount).toLocaleString() }}
                      </span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.nextArrivalAt="{ item }">
                      <span
                        v-if="item.nextArrivalAt && item.toLocationId === selectedNode?.locationId"
                        :title="item.nextArrivalAt"
                      >
                        {{ formatDate(item.nextArrivalAt) }}
                      </span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.shipBy="{ item }">
                      <span
                        v-if="item.shipBy && item.toLocationId === selectedNode?.locationId"
                        :class="urgencyClass(item.shipBy)"
                        :title="item.shipBy"
                      >
                        {{ formatDate(item.shipBy) }}
                      </span>
                      <span v-else class="text-disabled">–</span>
                    </template>
                    <template #item.contractBy="{ item }">
                      <span
                        v-if="item.contractBy && item.fromLocationId === selectedNode?.locationId"
                        :class="urgencyClass(item.contractBy)"
                        :title="item.contractBy"
                      >
                        {{ formatDate(item.contractBy) }}
                      </span>
                      <span v-else class="text-disabled">–</span>
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

            <!-- ==================== Shipments tab ==================== -->
            <v-tabs-window-item value="shipments">
              <ShipmentList
                ref="shipmentListRef"
                :ships="ships"
                @new="openCreateShipment"
                @edit="openEditShipment"
                @changed="loadGraph"
              />
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

    <ShipmentEditDialog
      v-model="shipmentDialog.open"
      :shipment="shipmentDialog.shipment"
      :location-items="locationItems"
      :graph="graph"
      :ships="ships"
      @saved="handleShipmentSaved"
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
import { useSettingsStore } from '../stores/settings'
import { localizeMaterial } from '../utils/materials'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import FlowEditDialog from '../components/logistics/FlowEditDialog.vue'
import BulkFlowDialog from '../components/logistics/BulkFlowDialog.vue'
import ClaimEditDialog from '../components/logistics/ClaimEditDialog.vue'
import ShipRosterPanel from '../components/logistics/ShipRosterPanel.vue'
import ShipmentList from '../components/logistics/ShipmentList.vue'
import ShipmentEditDialog from '../components/logistics/ShipmentEditDialog.vue'
import PlanView from '../components/logistics/PlanView.vue'

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
  Shipment,
  UserShip,
} from '@kawakawa/types'
import type { KeyValueItem } from '../components/KeyValueAutocomplete.vue'

const router = useRouter()
const shoppingList = useShoppingListStore()
const userStore = useUserStore()
const settingsStore = useSettingsStore()

// Local mirror of the user setting so we can debounce-on-blur without re-rendering
// every keystroke through the API.
const contractLeadDaysInput = ref<number>(settingsStore.logisticsContractLeadDays.value ?? 3)
const targetRepairAgeInput = ref<number>(settingsStore.logisticsTargetRepairAge.value ?? 45)

let contractLeadDaysSaveTimer: ReturnType<typeof setTimeout> | null = null
function onContractLeadDaysChanged() {
  if (contractLeadDaysSaveTimer) clearTimeout(contractLeadDaysSaveTimer)
  contractLeadDaysSaveTimer = setTimeout(async () => {
    const n = Math.max(0, Math.floor(Number(contractLeadDaysInput.value) || 0))
    if (n !== settingsStore.logisticsContractLeadDays.value) {
      settingsStore.logisticsContractLeadDays.value = n
      // Reload the graph so timing fields recompute server-side with the new value.
      await loadGraph()
    }
  }, 600)
}

let targetRepairAgeSaveTimer: ReturnType<typeof setTimeout> | null = null
function onTargetRepairAgeChanged() {
  if (targetRepairAgeSaveTimer) clearTimeout(targetRepairAgeSaveTimer)
  targetRepairAgeSaveTimer = setTimeout(async () => {
    const n = Math.max(1, Math.floor(Number(targetRepairAgeInput.value) || 45))
    if (n !== settingsStore.logisticsTargetRepairAge.value) {
      settingsStore.logisticsTargetRepairAge.value = n
      await loadGraph()
    }
  }, 600)
}

const graph = ref<LogisticsGraph | null>(null)
const loading = ref(false)
const selectedLocationId = ref<string>('')
const snackbar = ref({ show: false, color: 'info', message: '' })
const mainTab = ref<'plan' | 'inspector' | 'shipments' | 'graph'>('plan')
const planViewRef = ref<InstanceType<typeof PlanView> | null>(null)

function onNavigateToNode(locationId: string) {
  selectedLocationId.value = locationId
  mainTab.value = 'inspector'
}

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
const shipmentDialog = reactive<{
  open: boolean
  shipment: Shipment | null
}>({
  open: false,
  shipment: null,
})
const shipmentListRef = ref<InstanceType<typeof ShipmentList> | null>(null)
const ships = ref<UserShip[]>([])

async function loadShipsForDialog() {
  try {
    ships.value = await api.logistics.listShips()
  } catch (e) {
    console.error('Failed to load ships for shipment dialog', e)
    ships.value = []
  }
}

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

function openCreateShipment() {
  shipmentDialog.shipment = null
  shipmentDialog.open = true
  // Refresh ships in case the roster changed since the last load.
  void loadShipsForDialog()
}

function openEditShipment(shipment: Shipment) {
  shipmentDialog.shipment = shipment
  shipmentDialog.open = true
  void loadShipsForDialog()
}

async function handleShipmentSaved() {
  await Promise.all([shipmentListRef.value?.reload(), planViewRef.value?.reload(), loadGraph()])
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
    // Sync the input controls with whatever the server actually used.
    if (typeof result.settings?.contractLeadDays === 'number') {
      contractLeadDaysInput.value = result.settings.contractLeadDays
    }
    if (typeof result.settings?.repairDays === 'number' && result.settings.repairDays > 0) {
      targetRepairAgeInput.value = result.settings.repairDays
    }
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
    loadShipsForDialog(),
  ])
})

/**
 * Refresh everything visible on the Logistics page. Clears the in-memory
 * location/commodity caches first so newly-synced or newly-un-excluded
 * locations show up — `getAllLocations()` returns memoized data otherwise,
 * which is fine for stable universe data but stale when the user changes
 * their FIO exclusion list and expects affected planets to reappear.
 */
async function refreshAll() {
  locationService.clearCache()
  await Promise.all([
    loadCommodityItems(),
    loadLocationItems(),
    loadFlows(),
    loadClaims(),
    loadGraph(),
    loadShipsForDialog(),
    shipmentListRef.value?.reload(),
    planViewRef.value?.reload(),
  ])
}

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

/**
 * Format a daily rate. Below 10 we show one decimal so 0.4/d doesn't read as
 * "0/d" and round to nothing useful; at and above 10 we round to whole units.
 */
function fmtRate(n: number): string {
  if (n === 0) return '0/d'
  const abs = Math.abs(n)
  const formatted = abs < 10 ? n.toFixed(1) : Math.round(n).toLocaleString()
  return `${formatted}/d`
}

function nodeNameFor(locationId: string): string {
  return graph.value?.nodes.find(n => n.locationId === locationId)?.locationName ?? locationId
}

// Inspector is a diagnostic view — daily rates for everything flowing through
// the node, plus stock and a chain-source pointer. Contract-by belongs in the
// Plan tab (the action surface); the Inspector answers "what does this base
// look like" not "what should I do." Production + Consumption are useful here
// for understanding the node's intrinsic behavior even though Burn & Repair
// also has them — context matters more than non-duplication.
const balanceHeaders = [
  { title: 'Material', key: 'ticker', sortable: true },
  { title: 'Production/d', key: 'dailyProduction', sortable: true, align: 'end' as const },
  { title: 'Consumption/d', key: 'dailyConsumption', sortable: true, align: 'end' as const },
  { title: 'Stock', key: 'stock', sortable: true, align: 'end' as const },
  { title: 'Inflow/d', key: 'dailyInflow', sortable: true, align: 'end' as const },
  { title: 'Outflow/d', key: 'dailyOutflow', sortable: true, align: 'end' as const },
  { title: 'Net/d', key: 'netDaily', sortable: true, align: 'end' as const },
  { title: 'Days', key: 'daysOfStock', sortable: true, align: 'end' as const },
  { title: 'Run-out', key: 'runOutAt', sortable: true, align: 'end' as const },
  { title: 'Source', key: 'chainSource', sortable: true, align: 'end' as const },
]

// "Amount" (legacy: solver burnDays-allocated total) deliberately omitted —
// "Per ship" carries the right cadence-aware number including repair burst,
// and showing both invited confusion ("why is amount 0 but per-ship 16?").
const edgeHeaders = [
  { title: '', key: 'direction', sortable: false, width: '40px' },
  { title: 'Counterparty', key: 'other', sortable: true },
  { title: 'Material', key: 'ticker', sortable: true },
  { title: 'Kind', key: 'kind', sortable: true },
  { title: 'Transit', key: 'transitDays', sortable: true, align: 'end' as const },
  { title: 'Cadence', key: 'cadenceDays', sortable: true, align: 'end' as const },
  {
    title: 'Per ship',
    key: 'perShipmentAmount',
    sortable: true,
    align: 'end' as const,
  },
  { title: 'Next arrival', key: 'nextArrivalAt', sortable: true, align: 'end' as const },
  { title: 'Ship by', key: 'shipBy', sortable: true, align: 'end' as const },
  { title: 'Contract by', key: 'contractBy', sortable: true, align: 'end' as const },
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
  dailyProduction: number
  dailyConsumption: number
  stock: number
  dailyInflow: number
  dailyOutflow: number
  netDaily: number
  daysOfStock: number | null
  runOutAt: string | null
  chainSource: string[]
  chainSourceNames: string[]
}> {
  const tickers = new Set<string>([
    ...Object.keys(node.dailyConsumption),
    ...Object.keys(node.dailyProduction),
    ...Object.keys(node.stock),
    ...Object.keys(node.dailyInflow),
    ...Object.keys(node.dailyOutflow),
  ])
  const rows = [...tickers].map(ticker => {
    const sources = node.chainSource?.[ticker] ?? []
    const dC = node.dailyConsumption?.[ticker] ?? 0
    const dP = node.dailyProduction?.[ticker] ?? 0
    const dIn = node.dailyInflow?.[ticker] ?? 0
    const dOut = node.dailyOutflow?.[ticker] ?? 0
    // Local net only — does NOT include planned inflow/outflow. Those are
    // visible in their own columns; Net/d is the base's intrinsic deficit
    // or surplus per day. Negative Net/d at a leaf = "I need this much
    // shipped in per day"; positive = "I have this much extra locally."
    const netDaily = dP - dC
    return {
      ticker,
      dailyProduction: dP,
      dailyConsumption: dC,
      stock: Math.round(node.stock[ticker] ?? 0),
      dailyInflow: dIn,
      dailyOutflow: dOut,
      netDaily,
      daysOfStock: node.daysOfStock?.[ticker] ?? null,
      runOutAt: node.runOutAt?.[ticker] ?? null,
      chainSource: sources,
      chainSourceNames: sources.map(id => nodeNameFor(id)),
    }
  })
  return rows.sort((a, b) => {
    // Most-depleting first (most negative netDaily); ties → ticker name.
    if (a.netDaily !== b.netDaily) return a.netDaily - b.netDaily
    return a.ticker.localeCompare(b.ticker)
  })
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

function formatDaysOfStock(days: number | null): string {
  if (days == null) return '∞'
  if (days <= 0) return '0d'
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24))
    return `${hours}h`
  }
  return `${Math.round(days)}d`
}

function daysOfStockColor(days: number | null): string {
  if (days == null) return 'grey'
  if (days <= 3) return 'error'
  if (days < 14) return 'warning'
  return 'success'
}

function urgencyClass(iso: string | null): Record<string, boolean> {
  if (!iso) return {}
  const ms = new Date(iso).getTime() - Date.now()
  const days = ms / 86_400_000
  return {
    'text-error font-weight-medium': days <= 0,
    'text-warning': days > 0 && days <= 3,
  }
}

function edgesForNode(locationId: string): EdgeState[] {
  if (!graph.value) return []
  return graph.value.edges.filter(
    e => e.fromLocationId === locationId || e.toLocationId === locationId
  )
}

const repairHeaders = [
  { title: 'Building', key: 'buildingTicker', sortable: true },
  { title: 'Condition', key: 'condition', sortable: true, align: 'end' as const },
  { title: 'Next repair', key: 'nextRepairAt', sortable: true, align: 'end' as const },
  { title: 'Materials (summed)', key: 'materials', sortable: false },
]

interface GroupedRepair {
  buildingTicker: string
  count: number
  /** Hull condition 0..1 of any building in the group (all share rounded %). */
  condition: number
  /** Earliest next-repair date across the group. */
  nextRepairAt: string
  materials: Array<{ ticker: string; amount: number }>
}

/**
 * Group repair events at a base by `(building ticker, rounded condition %)`
 * so e.g. eight WPLs all at 99% collapse into a single row with summed
 * materials. Different condition tiers stay separate so the user can see
 * which buildings are oldest. Within a group, materials are summed across
 * all buildings; nextRepairAt is the earliest in the group.
 */
function repairsForNode(locationId: string): GroupedRepair[] {
  if (!graph.value) return []
  const groups = new Map<
    string,
    {
      ticker: string
      count: number
      condition: number
      nextRepairAt: string
      mats: Map<string, number>
    }
  >()
  for (const r of graph.value.repairEvents) {
    if (r.locationNaturalId !== locationId) continue
    const pct = Math.round(r.condition * 100)
    const key = `${r.buildingTicker}|${pct}`
    let g = groups.get(key)
    if (!g) {
      g = {
        ticker: r.buildingTicker,
        count: 0,
        condition: r.condition,
        nextRepairAt: r.nextRepairAt,
        mats: new Map(),
      }
      groups.set(key, g)
    }
    g.count++
    if (r.nextRepairAt < g.nextRepairAt) g.nextRepairAt = r.nextRepairAt
    for (const m of r.materials) {
      g.mats.set(m.ticker, (g.mats.get(m.ticker) ?? 0) + m.amount)
    }
  }
  return [...groups.values()]
    .map(g => ({
      buildingTicker: g.ticker,
      count: g.count,
      condition: g.condition,
      nextRepairAt: g.nextRepairAt,
      materials: [...g.mats.entries()]
        .map(([ticker, amount]) => ({ ticker, amount }))
        .sort((a, b) => a.ticker.localeCompare(b.ticker)),
    }))
    .sort((a, b) => a.nextRepairAt.localeCompare(b.nextRepairAt))
}

/**
 * Send-to-Market for a single location: bundle every contract action at that
 * location across the current look-ahead window into a shopping list, then
 * route to /market with the location filter and the user's default price
 * list filter pre-applied. Mirrors the Pricing Calculator's send-to-market
 * pattern but keyed off Plan's already-grouped contractActions.
 */
function handleSendToMarket(locationId: string, locationName: string): void {
  const actions = planViewRef.value?.contractActionsForLocation?.(locationId) ?? []
  if (actions.length === 0) {
    snackbar.value = {
      show: true,
      color: 'info',
      message: `No contracts at ${locationName} in the look-ahead window.`,
    }
    return
  }
  const materials: Record<string, number> = {}
  for (const a of actions) {
    materials[a.ticker] = (materials[a.ticker] ?? 0) + Math.ceil(a.amount)
  }
  shoppingList.setMaterials(materials, `Logistics – ${locationName}`)
  const query: Record<string, string> = { location: locationId }
  const defaultPriceList = settingsStore.defaultPriceList.value
  if (defaultPriceList) query.pricing = defaultPriceList
  router.push({ path: '/market', query })
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

/*
 * Stripe alternating rows on Inspector tables. The :deep() pierces Vuetify's
 * internal DOM (the striped-table class is on the v-data-table wrapper, the
 * actual <table> is several layers deep). Important is needed because Vuetify
 * applies its own per-row hover/striped styles at higher specificity.
 */
:deep(.striped-table tbody tr:nth-child(odd) td) {
  background: rgba(255, 255, 255, 0.025) !important;
}
</style>
