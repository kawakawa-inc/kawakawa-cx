<template>
  <div class="plan-view">
    <div class="d-flex align-center pa-3 ga-3 flex-wrap">
      <div class="text-subtitle-1">Plan</div>
      <v-spacer />
      <v-text-field
        v-model.number="lookaheadDays"
        type="number"
        min="1"
        label="Look-ahead (days)"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 220px"
      />
    </div>

    <v-divider />

    <div class="text-caption text-medium-emphasis pa-3">
      Everything you should act on within
      <strong>{{ lookaheadDays }} day{{ lookaheadDays === 1 ? '' : 's' }}</strong>
      — contracts to place, shipments to dispatch. Sorted by deadline. Bump the look-ahead if you'll
      be away.
    </div>

    <v-divider />

    <!-- Contracts to place -->
    <div class="section-header d-flex align-center pa-3">
      <v-icon size="small" class="mr-2">mdi-cart-outline</v-icon>
      <span class="text-subtitle-2">Contracts to place</span>
      <v-chip size="x-small" class="ml-2" variant="tonal">{{ contractActions.length }}</v-chip>
    </div>
    <v-divider />
    <v-card-text v-if="contractActions.length === 0" class="text-medium-emphasis pa-4">
      Nothing in the look-ahead window. Push the window out further if you want a longer view.
    </v-card-text>

    <!--
      Per-location summary with a Send-to-Market button. Bundles every contract
      action at the chosen location into a shopping list, sets the Market
      location filter and (if the user has one) the default price-list filter,
      then navigates. Same pattern as Pricing Calculator's Send to Market.
    -->
    <div
      v-if="contractActions.length > 0"
      class="d-flex flex-wrap ga-2 pa-3"
      style="background: rgba(255, 255, 255, 0.02)"
    >
      <span class="text-caption text-medium-emphasis align-self-center mr-2">
        Send a location's full bundle to Market:
      </span>
      <v-btn
        v-for="loc in contractLocations"
        :key="loc.locationId"
        size="small"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-cart-arrow-right"
        @click="$emit('send-to-market', loc.locationId, loc.locationName)"
      >
        {{ loc.locationName }}
        <v-chip size="x-small" class="ml-2" variant="flat">
          {{ loc.tickerCount }} ticker{{ loc.tickerCount === 1 ? '' : 's' }}
        </v-chip>
      </v-btn>
    </div>

    <v-table v-if="contractActions.length > 0" density="compact" class="action-table striped-table">
      <thead>
        <tr>
          <th>Contract by</th>
          <th>Location</th>
          <th>Material</th>
          <th class="text-end">Amount</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="a in contractActions"
          :key="a.id"
          class="action-row clickable"
          @click="$emit('navigate-to-node', a.locationId)"
        >
          <td :class="urgencyClass(a.contractBy)">
            {{ formatDate(a.contractBy) }}
            <v-icon
              v-if="a.hasOverdue"
              size="x-small"
              color="error"
              class="ml-1"
              title="Includes overdue items rolled into today"
            >
              mdi-alert-circle
            </v-icon>
          </td>
          <td>{{ a.locationName }}</td>
          <td>{{ a.ticker }}</td>
          <td class="text-end">{{ Math.round(a.amount).toLocaleString() }}</td>
          <td class="text-caption text-medium-emphasis">
            <v-icon
              v-if="a.flowCount > 0"
              size="x-small"
              class="mr-1"
              :title="`${a.flowCount} flow shipment${a.flowCount === 1 ? '' : 's'}`"
            >
              mdi-truck-fast
            </v-icon>
            <v-icon
              v-if="a.repairCount > 0"
              size="x-small"
              class="mr-1"
              :title="`${a.repairCount} repair${a.repairCount === 1 ? '' : 's'}`"
            >
              mdi-wrench
            </v-icon>
            {{ reasonLabel(a) }}
          </td>
        </tr>
      </tbody>
    </v-table>

    <!-- Shipments to dispatch -->
    <div class="section-header d-flex align-center pa-3">
      <v-icon size="small" class="mr-2">mdi-rocket-launch</v-icon>
      <span class="text-subtitle-2">Shipments to dispatch</span>
      <v-chip size="x-small" class="ml-2" variant="tonal">{{ dispatchActions.length }}</v-chip>
    </div>
    <v-divider />
    <v-card-text v-if="dispatchActions.length === 0" class="text-medium-emphasis pa-4">
      No planned shipments due in the look-ahead. Plan some on the Shipments tab.
    </v-card-text>
    <v-table v-else density="compact" class="action-table striped-table">
      <thead>
        <tr>
          <th>Load by</th>
          <th>Route</th>
          <th>Ship</th>
          <th class="text-end">Lines</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="a in dispatchActions"
          :key="a.shipment.id"
          class="action-row clickable"
          @click="$emit('edit-shipment', a.shipment)"
        >
          <td :class="urgencyClass(a.shipment.plannedLoadAt)">
            {{ formatDate(a.shipment.plannedLoadAt) }}
          </td>
          <td class="text-caption">
            <strong>{{ locationDisplay(a.shipment.fromLocationId) }}</strong>
            →
            <strong>{{ locationDisplay(a.shipment.toLocationId) }}</strong>
          </td>
          <td class="text-caption text-medium-emphasis">{{ shipName(a.shipment.shipDbId) }}</td>
          <td class="text-end text-caption text-medium-emphasis">
            {{ a.shipment.lines.length }}
          </td>
        </tr>
      </tbody>
    </v-table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { api } from '../../services/api'
import { locationService } from '../../services/locationService'
import { useUserStore } from '../../stores/user'
import type { LogisticsGraph, Shipment, UserShip } from '@kawakawa/types'

const props = defineProps<{
  graph: LogisticsGraph | null
  ships: UserShip[]
}>()

defineEmits<{
  (e: 'navigate-to-node', locationId: string): void
  (e: 'edit-shipment', shipment: Shipment): void
  (e: 'send-to-market', locationId: string, locationName: string): void
}>()

const userStore = useUserStore()
const lookaheadDays = ref(7)
const shipments = ref<Shipment[]>([])

async function load() {
  try {
    shipments.value = await api.logistics.listShipments()
  } catch (e) {
    console.error('Failed to load shipments for Plan tab', e)
    shipments.value = []
  }
}

defineExpose({ reload: load, contractActionsForLocation: (id: string) => contractActionsForLocation(id) })
onMounted(load)

const MS_PER_DAY = 86_400_000

const lookaheadCutoff = computed(() => Date.now() + lookaheadDays.value * MS_PER_DAY)

interface ContractAction {
  id: string
  /** ISO of the day bucket (local midnight). Overdue rows roll into today. */
  contractBy: string
  locationId: string
  locationName: string
  ticker: string
  /** Summed across all flow + repair sources within the same group. */
  amount: number
  flowCount: number
  repairCount: number
  /** True if at least one source row's original date was before today. */
  hasOverdue: boolean
}

interface DispatchAction {
  shipment: Shipment
}

/** Round a millisecond timestamp to the start of the local day. */
function localMidnightMs(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Contract actions are rolled up by (location, ticker, day) so the user
 * sees one purchase order per supplier-of-record, not one row per flow ×
 * material × deadline. Overdue dates collapse into today — the user can't
 * un-overdue, they just need to order now.
 *
 * Sources merged:
 *   1. Per-edge contractBy from demand/fixed flows, anchored at the FROM
 *      (hub) location — goods need to land at the hub before the ship loads.
 *   2. Per-repair-event contractBy = nextRepairAt − contractLeadDays,
 *      anchored at the building's base (no hub transit assumed).
 */
const contractActions = computed<ContractAction[]>(() => {
  if (!props.graph) return []
  const cutoff = lookaheadCutoff.value
  const todayMs = localMidnightMs(Date.now())
  const grouped = new Map<string, ContractAction>()

  function add(
    rawDateMs: number,
    locationId: string,
    locationName: string,
    ticker: string,
    amount: number,
    kind: 'flow' | 'repair'
  ): void {
    if (amount <= 0) return
    if (rawDateMs > cutoff) return
    const isOverdue = rawDateMs < todayMs
    const bucketMs = Math.max(rawDateMs, todayMs)
    const bucketIso = new Date(bucketMs).toISOString()
    const key = `${locationId}|${ticker}|${bucketIso}`
    let existing = grouped.get(key)
    if (!existing) {
      existing = {
        id: key,
        contractBy: bucketIso,
        locationId,
        locationName,
        ticker,
        amount: 0,
        flowCount: 0,
        repairCount: 0,
        hasOverdue: false,
      }
      grouped.set(key, existing)
    }
    existing.amount += amount
    if (kind === 'flow') existing.flowCount++
    else existing.repairCount++
    if (isOverdue) existing.hasOverdue = true
  }

  // Source 1: demand/fixed flow edges — contract anchors at the deepest
  // non-producer in the source's chain. We walk `chainSource` upstream from
  // the flow's `fromLocationId`; if any node produces the ticker locally
  // we skip the contract entirely (internal supply, no buy needed).
  // Otherwise we anchor at the chain's terminal hub — that's where the user
  // actually places the order.
  for (const e of props.graph.edges) {
    if (e.kind !== 'demand' && e.kind !== 'fixed') continue
    if (!e.contractBy) continue
    const anchor = findContractAnchor(e.fromLocationId, e.commodityTicker)
    if (!anchor) continue // chain ends at a producer — no buy needed
    add(
      new Date(e.contractBy).getTime(),
      anchor.locationId,
      anchor.locationName,
      e.commodityTicker,
      e.perShipmentAmount,
      'flow'
    )
  }

  // Repair contribution flows through Source 1 because the per-edge cadence
  // math (server-side) folds the burst repair amount into perShipmentAmount
  // when a flow exists for the repair material. So flow contracts at the hub
  // already include repair material in their totals.
  //
  // We deliberately do NOT add per-base repair rows for materials without a
  // flow — the user's framing: this is a logistics tool (with flows). If
  // there's no flow for a repair material, it's not a logistics concern;
  // the Burn & Repair page handles that view.

  return [...grouped.values()].sort((a, b) => {
    if (a.contractBy !== b.contractBy) return a.contractBy.localeCompare(b.contractBy)
    if (a.locationName !== b.locationName) return a.locationName.localeCompare(b.locationName)
    return a.ticker.localeCompare(b.ticker)
  })
})

/** Render the rolled-up reason column: "3 shipments", "2 repairs", etc. */
function reasonLabel(a: ContractAction): string {
  const parts: string[] = []
  if (a.flowCount > 0) {
    parts.push(`${a.flowCount} shipment${a.flowCount === 1 ? '' : 's'}`)
  }
  if (a.repairCount > 0) {
    parts.push(`${a.repairCount} repair${a.repairCount === 1 ? '' : 's'}`)
  }
  return parts.join(' + ')
}

/**
 * Distinct locations that have at least one contract action in the current
 * window, with row + ticker counts for the Send-to-Market summary chips.
 */
const contractLocations = computed<
  Array<{ locationId: string; locationName: string; rowCount: number; tickerCount: number }>
>(() => {
  const groups = new Map<
    string,
    { locationId: string; locationName: string; rowCount: number; tickers: Set<string> }
  >()
  for (const a of contractActions.value) {
    let g = groups.get(a.locationId)
    if (!g) {
      g = {
        locationId: a.locationId,
        locationName: a.locationName,
        rowCount: 0,
        tickers: new Set(),
      }
      groups.set(a.locationId, g)
    }
    g.rowCount++
    g.tickers.add(a.ticker)
  }
  return [...groups.values()]
    .map(g => ({
      locationId: g.locationId,
      locationName: g.locationName,
      rowCount: g.rowCount,
      tickerCount: g.tickers.size,
    }))
    .sort((a, b) => a.locationName.localeCompare(b.locationName))
})

/**
 * Helper exposed so the parent can bundle a single location's contracts into
 * a shopping list when "Send to Market" is clicked. Returns the
 * already-rolled-up actions for that location across the look-ahead window.
 */
function contractActionsForLocation(locationId: string): ContractAction[] {
  return contractActions.value.filter(a => a.locationId === locationId)
}

/**
 * Planned shipments whose load date falls within the look-ahead window.
 * Already-dispatched shipments aren't here — they show on the Shipments tab.
 */
const dispatchActions = computed<DispatchAction[]>(() => {
  const cutoff = lookaheadCutoff.value
  const out: DispatchAction[] = []
  for (const s of shipments.value) {
    if (s.status !== 'planned') continue
    if (new Date(s.plannedLoadAt).getTime() > cutoff) continue
    out.push({ shipment: s })
  }
  out.sort((a, b) => a.shipment.plannedLoadAt.localeCompare(b.shipment.plannedLoadAt))
  return out
})

/**
 * Walk the chainSource for `(startLocId, ticker)` upstream until we hit a
 * producer or a terminal non-producer node:
 *   - If any node along the chain has `nativeProduction[ticker] > 0`, return
 *     null — supply is internal, no buy needed.
 *   - Otherwise return the deepest non-producer node as the contract anchor.
 *     That's where the user actually places the order with a partner / on
 *     the market, since intermediate hubs just relay supply they don't have.
 *
 * Defensive against cycles via `visited`. Multi-source aggregating hubs walk
 * the first source only — adequate for the common case; refine later if a
 * user has a meaningful multi-source split.
 */
function findContractAnchor(
  startLocId: string,
  ticker: string
): { locationId: string; locationName: string } | null {
  if (!props.graph) return null
  const nodesById = new Map(props.graph.nodes.map(n => [n.locationId, n]))
  let current = startLocId
  const visited = new Set<string>()
  while (current && !visited.has(current)) {
    visited.add(current)
    const node = nodesById.get(current)
    if (!node) return { locationId: current, locationName: current }
    if ((node.nativeProduction?.[ticker] ?? 0) > 0) return null // internal supply
    const sources = node.chainSource?.[ticker] ?? []
    if (sources.length === 0) {
      return { locationId: current, locationName: node.locationName }
    }
    current = sources[0]
  }
  // Cycle fallback — anchor at where we landed.
  const node = nodesById.get(current)
  return { locationId: current, locationName: node?.locationName ?? current }
}

function locationDisplay(naturalId: string): string {
  return locationService.getLocationDisplay(naturalId, userStore.getLocationDisplayMode())
}

function shipName(id: number | null): string {
  if (id == null) return '—'
  const ship = props.ships.find(s => s.id === id)
  return ship ? (ship.name ?? ship.registration) : `#${id}`
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

/**
 * Color the deadline cell red if overdue or within ~3 days, amber for the
 * next ~7-day window, default otherwise. Same pattern the Inspector uses.
 */
function urgencyClass(iso: string): string {
  const days = (new Date(iso).getTime() - Date.now()) / MS_PER_DAY
  if (days < 3) return 'text-error font-weight-medium'
  if (days < 7) return 'text-warning'
  return ''
}
</script>

<style scoped>
.section-header {
  background: rgba(255, 255, 255, 0.03);
}

.action-table {
  background: transparent;
}

.action-table :deep(td),
.action-table :deep(th) {
  padding: 6px 12px !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.action-row.clickable {
  cursor: pointer;
}

:deep(.striped-table tbody tr:nth-child(odd) td) {
  background: rgba(255, 255, 255, 0.025) !important;
}

.action-row.clickable:hover :deep(td) {
  background: rgba(255, 255, 255, 0.06) !important;
}
</style>
