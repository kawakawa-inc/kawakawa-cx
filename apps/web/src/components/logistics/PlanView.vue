<template>
  <div class="plan-view">
    <div class="d-flex align-center pa-3 ga-3 flex-wrap">
      <div class="text-subtitle-1">Plan</div>
      <v-spacer />
      <span class="text-caption text-medium-emphasis">
        Look-ahead:
        <strong>{{ lookaheadDays }} day{{ lookaheadDays === 1 ? '' : 's' }}</strong>
        (set via Trip Lead Time at the top of this view)
      </span>
    </div>

    <v-divider />

    <div class="text-caption text-medium-emphasis pa-3">
      Everything you should act on within the lead-time window — contracts to place, trips to
      dispatch. Sorted by deadline.
    </div>

    <v-divider />

    <!-- Contracts to place -->
    <div class="section-header d-flex align-center pa-3">
      <v-icon size="small" class="mr-2">mdi-cart-outline</v-icon>
      <span class="text-subtitle-2">Contracts to place</span>
      <v-chip size="x-small" class="ml-2" variant="tonal">{{ contractActions.length }}</v-chip>
    </div>
    <v-divider />
    <!--
      Render nothing about contracts until both graph and contractCoverage have
      loaded — otherwise the table briefly shows un-netted rows that then pop
      out as coverage arrives.
    -->
    <v-card-text v-if="!loaded" class="text-medium-emphasis pa-4">
      <v-progress-circular indeterminate size="16" width="2" class="mr-2" />
      Loading…
    </v-card-text>
    <v-card-text v-else-if="contractActions.length === 0" class="text-medium-emphasis pa-4">
      Nothing in the look-ahead window. Push the window out further if you want a longer view.
    </v-card-text>

    <!--
      Per-location summary with a Send-to-Market button. Bundles every contract
      action at the chosen location into a shopping list, sets the Market
      location filter and (if the user has one) the default price-list filter,
      then navigates. Same pattern as Pricing Calculator's Send to Market.
    -->
    <div
      v-if="loaded && contractActions.length > 0"
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
        <v-chip size="x-small" class="ml-2" variant="tonal" color="primary">
          {{ loc.tickerCount }} ticker{{ loc.tickerCount === 1 ? '' : 's' }}
        </v-chip>
      </v-btn>
    </div>

    <v-table
      v-if="loaded && contractActions.length > 0"
      density="compact"
      class="action-table striped-table"
    >
      <thead>
        <tr>
          <th>Contract by</th>
          <th>Location</th>
          <th>Material</th>
          <th class="text-end">Amount</th>
          <th>Reason</th>
          <th style="width: 40px"></th>
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
            <v-chip
              v-if="a.incoming > 0"
              size="x-small"
              class="ml-2"
              color="info"
              variant="tonal"
              :title="`${Math.round(a.incoming).toLocaleString()} already incoming via buy invoice`"
            >
              {{ Math.round(a.incoming).toLocaleString() }} incoming
            </v-chip>
          </td>
          <td class="text-end" @click.stop>
            <v-btn
              size="x-small"
              icon
              variant="text"
              :loading="markingSelfSupplied === `${a.locationId}|${a.ticker}`"
              title="I handle this locally — hide from contracts"
              @click="markSelfSupplied(a.locationId, a.locationName, a.ticker)"
            >
              <v-icon size="x-small">mdi-eye-off-outline</v-icon>
            </v-btn>
          </td>
        </tr>
      </tbody>
    </v-table>

    <!-- Self-supplied: hidden materials the user handles locally -->
    <template v-if="selfSupplied.length > 0">
      <div
        class="section-header d-flex align-center pa-3 cursor-pointer"
        @click="selfSuppliedOpen = !selfSuppliedOpen"
      >
        <v-icon size="small" class="mr-2">mdi-eye-off-outline</v-icon>
        <span class="text-subtitle-2 text-medium-emphasis"
          >Self-supplied (hidden from contracts)</span
        >
        <v-chip size="x-small" class="ml-2" variant="tonal">{{ selfSupplied.length }}</v-chip>
        <v-spacer />
        <v-icon size="small">{{ selfSuppliedOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </div>
      <v-divider v-if="selfSuppliedOpen" />
      <v-table v-if="selfSuppliedOpen" density="compact" class="action-table striped-table">
        <tbody>
          <tr v-for="entry in selfSupplied" :key="entry.id" class="action-row">
            <td class="text-caption">{{ locationDisplay(entry.locationId) }}</td>
            <td class="text-caption">{{ entry.commodityTicker }}</td>
            <td class="text-end">
              <v-btn size="x-small" variant="text" @click="unmarkSelfSupplied(entry.id)">
                Unmark
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </template>

    <!-- Shipments to plan -->
    <div class="section-header d-flex align-center pa-3">
      <v-icon size="small" class="mr-2">mdi-package-variant-closed</v-icon>
      <span class="text-subtitle-2">Shipments to plan</span>
      <v-chip size="x-small" class="ml-2" variant="tonal">{{ shipmentRows.length }}</v-chip>
      <v-spacer />
      <!--
        One action for the whole table: pick rows with checkboxes, then send
        them to a trip. The menu lists planned trips (we add the selection to
        an existing trip's queue) plus a "New trip" option that opens the
        create dialog with these rows pre-assigned.
      -->
      <v-menu v-model="sendMenuOpen" :close-on-content-click="false" location="bottom end">
        <template #activator="{ props: menuProps }">
          <v-btn
            size="small"
            variant="flat"
            color="primary"
            prepend-icon="mdi-send"
            :disabled="selectedCount === 0"
            v-bind="menuProps"
          >
            Send {{ selectedCount > 0 ? selectedCount : '' }} to trip
          </v-btn>
        </template>
        <v-list density="compact" min-width="320">
          <v-list-subheader>Add to a planned trip</v-list-subheader>
          <v-list-item v-if="plannedTrips.length === 0" disabled>
            <v-list-item-title class="text-caption text-medium-emphasis">
              No planned trips
            </v-list-item-title>
          </v-list-item>
          <v-list-item v-for="t in plannedTrips" :key="t.id" @click="sendSelectedToTrip(t)">
            <v-list-item-title>#{{ t.id }} · {{ routeDisplay(t) }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              {{ t.shipments.length }} shipment{{ t.shipments.length === 1 ? '' : 's' }} ·
              {{ shipName(t.shipDbId) }}
            </v-list-item-subtitle>
          </v-list-item>
          <v-divider class="my-1" />
          <v-list-item prepend-icon="mdi-plus" @click="sendSelectedToTrip(null)">
            <v-list-item-title>Create new trip…</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>
    <v-divider />
    <v-card-text v-if="shipmentRows.length === 0" class="text-medium-emphasis pa-4">
      No shipments to plan in the look-ahead. Either flows are already covered by trips, or none are
      due — check the Inspector if that's a surprise.
    </v-card-text>
    <v-table v-else density="compact" class="action-table striped-table">
      <thead>
        <tr>
          <th style="width: 32px"></th>
          <th style="width: 40px"></th>
          <th style="width: 90px">Due</th>
          <th>Route</th>
          <th>Material</th>
          <th class="text-end" style="width: 150px">Cargo</th>
          <th style="width: 80px">Source</th>
          <th style="width: 40px"></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="group in shipmentGroups" :key="group.key">
          <!-- Group header: chevron expands multi-row groups; checkbox toggles
               every row in the group at once. -->
          <tr
            class="group-header-row"
            :class="{ clickable: group.rows.length > 1 }"
            @click="group.rows.length > 1 && toggleGroup(group.key)"
          >
            <td>
              <v-icon
                v-if="group.rows.length > 1"
                size="small"
                :class="{ 'rotate-90': expandedGroups.has(group.key) }"
              >
                mdi-chevron-right
              </v-icon>
            </td>
            <td @click.stop>
              <v-checkbox
                :model-value="isAllSelectedInGroup(group)"
                :indeterminate="isSomeSelectedInGroup(group)"
                density="compact"
                hide-details
                class="ma-0 pa-0 d-inline-flex"
                @update:model-value="toggleAllInGroup(group, !!$event)"
              />
            </td>
            <td :class="urgencyClass(group.earliestDueAt)">
              {{ formatDate(group.earliestDueAt) }}
            </td>
            <td class="text-caption">
              <strong>{{ locationDisplay(group.originLocationId) }}</strong>
              →
              <strong>{{ locationDisplay(group.destLocationId) }}</strong>
            </td>
            <td class="text-caption">
              <span v-if="group.rows.length === 1">{{ group.rows[0].tickerSummary }}</span>
              <span v-else class="text-medium-emphasis">
                {{ group.rows.length }} shipments · {{ group.tickerCount }} tickers
              </span>
            </td>
            <td class="text-end text-caption">
              {{ formatCargo(group.totalCargoWeight, group.totalCargoVolume) }}
            </td>
            <td>
              <v-chip
                v-if="group.rows.length === 1"
                size="x-small"
                :color="group.rows[0].kind === 'predicted' ? 'info' : 'primary'"
                variant="tonal"
              >
                {{ group.rows[0].kind === 'predicted' ? 'flow' : 'queued' }}
              </v-chip>
            </td>
            <td class="text-end" @click.stop>
              <v-btn
                v-if="group.rows.length === 1 && group.rows[0].kind === 'queued'"
                size="x-small"
                icon
                variant="text"
                title="Delete this queued shipment"
                :loading="deletingShipmentId === group.rows[0].shipmentId"
                @click="deleteQueuedRow(group.rows[0])"
              >
                <v-icon size="x-small">mdi-trash-can-outline</v-icon>
              </v-btn>
            </td>
          </tr>

          <!-- Expanded child rows (only for multi-row groups). -->
          <template v-if="group.rows.length > 1 && expandedGroups.has(group.key)">
            <tr v-for="row in group.rows" :key="row.key" class="group-child-row">
              <td></td>
              <td @click.stop>
                <v-checkbox
                  :model-value="isRowSelected(row)"
                  density="compact"
                  hide-details
                  class="ma-0 pa-0 d-inline-flex"
                  @update:model-value="toggleRow(row, !!$event)"
                />
              </td>
              <td :class="urgencyClass(row.dueAt)" class="text-caption">
                {{ formatDate(row.dueAt) }}
              </td>
              <td class="text-caption">
                <strong>{{ locationDisplay(row.originLocationId) }}</strong>
                →
                <strong>{{ locationDisplay(row.destLocationId) }}</strong>
              </td>
              <td class="text-caption">{{ row.tickerSummary }}</td>
              <td class="text-end text-caption">
                {{ formatCargo(row.cargoWeight, row.cargoVolume) }}
              </td>
              <td>
                <v-chip
                  size="x-small"
                  :color="row.kind === 'predicted' ? 'info' : 'primary'"
                  variant="tonal"
                >
                  {{ row.kind === 'predicted' ? 'flow' : 'queued' }}
                </v-chip>
              </td>
              <td class="text-end" @click.stop>
                <v-btn
                  v-if="row.kind === 'queued'"
                  size="x-small"
                  icon
                  variant="text"
                  title="Delete this queued shipment"
                  :loading="deletingShipmentId === row.shipmentId"
                  @click="deleteQueuedRow(row)"
                >
                  <v-icon size="x-small">mdi-trash-can-outline</v-icon>
                </v-btn>
              </td>
            </tr>
          </template>
        </template>
      </tbody>
    </v-table>

    <!-- Backhaul opportunities -->
    <div class="section-header d-flex align-center pa-3">
      <v-icon size="small" class="mr-2">mdi-swap-horizontal-bold</v-icon>
      <span class="text-subtitle-2">Backhauls (surplus to haul on the way back)</span>
      <v-chip size="x-small" class="ml-2" variant="tonal">{{ backhaulRows.length }}</v-chip>
    </div>
    <v-divider />
    <v-card-text v-if="backhaulRows.length === 0" class="text-medium-emphasis pa-4">
      No backhauls right now. Once a planned trip lands at a place with surplus that an upstream
      stop needs, it'll appear here.
    </v-card-text>
    <template v-else>
      <v-table density="compact" class="action-table striped-table">
        <thead>
          <tr>
            <th>Trip</th>
            <th>From → To</th>
            <th>Material</th>
            <th class="text-end" style="width: 110px">Amount</th>
            <th class="text-end" style="width: 130px"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in backhaulRows"
            :key="r.key"
            class="action-row clickable"
            @click="$emit('edit-trip', r.trip)"
          >
            <td class="text-caption text-medium-emphasis">
              #{{ r.trip.id }} · {{ routeDisplay(r.trip) }}
            </td>
            <td class="text-caption">
              <strong>{{ locationDisplay(r.surplusLocId) }}</strong>
              →
              <strong>{{ locationDisplay(r.needLocId) }}</strong>
            </td>
            <td>
              {{ r.ticker }}
              <v-chip
                v-if="r.matchKind !== 'demand'"
                size="x-small"
                class="ml-2"
                :color="r.matchKind === 'consumes' ? 'info' : 'secondary'"
                variant="tonal"
                :title="
                  r.matchKind === 'consumes'
                    ? `${r.needLocName} consumes ${r.ticker} — no explicit shortfall yet`
                    : `No upstream consumer found — defaulting to trip origin`
                "
              >
                {{ r.matchKind === 'consumes' ? 'consumes' : 'no destination' }}
              </v-chip>
            </td>
            <td class="text-end">{{ Math.round(r.amount).toLocaleString() }}</td>
            <td class="text-end" @click.stop>
              <v-btn
                size="x-small"
                variant="text"
                prepend-icon="mdi-pencil"
                @click="$emit('edit-trip', r.trip)"
              >
                Add return stop
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </template>

    <!-- Trips to dispatch -->
    <div class="section-header d-flex align-center pa-3">
      <v-icon size="small" class="mr-2">mdi-rocket-launch</v-icon>
      <span class="text-subtitle-2">Trips to dispatch</span>
      <v-chip size="x-small" class="ml-2" variant="tonal">{{ dispatchActions.length }}</v-chip>
    </div>
    <v-divider />
    <v-card-text v-if="dispatchActions.length === 0" class="text-medium-emphasis pa-4">
      No planned trips due in the look-ahead. Plan some on the Trips tab.
    </v-card-text>
    <v-table v-else density="compact" class="action-table striped-table">
      <thead>
        <tr>
          <th>Load by</th>
          <th>Route</th>
          <th>Ship</th>
          <th class="text-end">Shipments</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="a in dispatchActions"
          :key="a.trip.id"
          class="action-row clickable"
          @click="$emit('edit-trip', a.trip)"
        >
          <td :class="urgencyClass(a.loadAt)">
            {{ formatDate(a.loadAt) }}
          </td>
          <td class="text-caption" :title="fullRouteTitle(a.trip)">
            {{ routeDisplay(a.trip) }}
          </td>
          <td class="text-caption text-medium-emphasis">{{ shipName(a.trip.shipDbId) }}</td>
          <td class="text-end text-caption text-medium-emphasis">
            {{ a.trip.shipments.length }}
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
import { commodityService } from '../../services/commodityService'
import { useUserStore } from '../../stores/user'
import type {
  ContractCoverageEntry,
  EdgeState,
  LogisticsGraph,
  Shipment,
  ShipmentLineInput,
  SelfSuppliedEntry,
  Trip,
  UserShip,
} from '@kawakawa/types'

/**
 * What we hand the Trip dialog when the user "adds to trip" from Plan. The
 * dialog defers actually creating any drafts until the trip itself is saved —
 * cancelling out of the dialog must not leave orphan queued shipments.
 */
export type ShipmentPreset =
  | { kind: 'existing'; shipmentId: number }
  | {
      kind: 'draft'
      originLocationId: string
      destLocationId: string
      lines: ShipmentLineInput[]
    }
import { useSettingsStore } from '../../stores/settings'

const props = defineProps<{
  graph: LogisticsGraph | null
  ships: UserShip[]
}>()

const emit = defineEmits<{
  (e: 'navigate-to-node', locationId: string): void
  (e: 'edit-trip', trip: Trip): void
  (e: 'send-to-market', locationId: string, locationName: string): void
  /**
   * Open the Trip dialog with these shipments pre-assigned. `trip` picks an
   * existing planned trip to add them to; null opens a fresh-create dialog.
   * Existing rows carry an `existing` preset; predicted rows carry a `draft`
   * preset that the dialog will materialize at save time.
   */
  (e: 'add-shipments-to-trip', presets: ShipmentPreset[], trip: Trip | null): void
}>()

const userStore = useUserStore()
const settingsStore = useSettingsStore()
/** Both look-ahead and contract-by deadline read from the same setting. */
const lookaheadDays = computed(() => settingsStore.logisticsTripLeadDays.value ?? 7)
const trips = ref<Trip[]>([])
const shipments = ref<Shipment[]>([])
const selfSupplied = ref<SelfSuppliedEntry[]>([])
const selfSuppliedOpen = ref(false)
const markingSelfSupplied = ref<string | null>(null)
const contractCoverage = ref<ContractCoverageEntry[]>([])
const loaded = ref(false)

async function load() {
  try {
    const [t, s, ss, cc] = await Promise.all([
      api.logistics.listTrips(),
      api.logistics.listShipments(),
      api.logistics.listSelfSupplied(),
      api.logistics.listContractCoverage(),
    ])
    trips.value = t
    shipments.value = s
    selfSupplied.value = ss
    contractCoverage.value = cc
  } catch (e) {
    console.error('Failed to load Plan-tab data', e)
    trips.value = []
    shipments.value = []
    selfSupplied.value = []
    contractCoverage.value = []
  } finally {
    loaded.value = true
  }
}

/** O(1) check: is this (location, ticker) marked self-supplied? */
const selfSuppliedSet = computed(() => {
  const set = new Set<string>()
  for (const e of selfSupplied.value) set.add(`${e.locationId}|${e.commodityTicker}`)
  return set
})

function isSelfSupplied(locationId: string, ticker: string): boolean {
  return selfSuppliedSet.value.has(`${locationId}|${ticker}`)
}

defineExpose({
  reload: load,
  contractActionsForLocation: (id: string) => contractActionsForLocation(id),
})
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
  /** Summed across all flow + repair sources within the same group. After
   *  coverage distribution this is the amount STILL needing a contract. */
  amount: number
  /** Quantity already covered by an active buy invoice (subtracted from
   *  the original amount). 0 when no coverage applies. Surfaces as a
   *  "(N incoming)" hint in the row's reason column. */
  incoming: number
  flowCount: number
  repairCount: number
  /** True if at least one source row's original date was before today. */
  hasOverdue: boolean
}

interface DispatchAction {
  trip: Trip
  /** First stop's plannedArriveAt — "when the ship loads at the origin." */
  loadAt: string
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
        incoming: 0,
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

  const sorted = [...grouped.values()].sort((a, b) => {
    if (a.contractBy !== b.contractBy) return a.contractBy.localeCompare(b.contractBy)
    if (a.locationName !== b.locationName) return a.locationName.localeCompare(b.locationName)
    return a.ticker.localeCompare(b.ticker)
  })

  // Apply buy-invoice coverage. Drain `incomingQuantity` per (location,
  // ticker) across the bucketed rows oldest-first, so partial coverage
  // chips away at the most urgent date first. Rows fully covered drop out.
  const remaining = new Map<string, number>()
  for (const c of contractCoverage.value) {
    remaining.set(`${c.locationId}|${c.commodityTicker}`, c.incomingQuantity)
  }
  const out: ContractAction[] = []
  for (const action of sorted) {
    const key = `${action.locationId}|${action.ticker}`
    const left = remaining.get(key) ?? 0
    const covered = Math.min(left, action.amount)
    action.incoming = covered
    action.amount -= covered
    remaining.set(key, left - covered)
    if (action.amount > 0) out.push(action)
  }
  return out
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
 * Planned trips whose load date (first stop's planned arrival) falls within
 * the look-ahead window. Dispatched trips show on the Trips tab.
 */
const dispatchActions = computed<DispatchAction[]>(() => {
  const cutoff = lookaheadCutoff.value
  const out: DispatchAction[] = []
  for (const t of trips.value) {
    if (t.status !== 'planned') continue
    const loadAt = t.stops[0]?.plannedArriveAt
    if (!loadAt) continue
    if (new Date(loadAt).getTime() > cutoff) continue
    out.push({ trip: t, loadAt })
  }
  out.sort((a, b) => a.loadAt.localeCompare(b.loadAt))
  return out
})

// ==================== Shipments to plan ====================

interface ShipmentRow {
  /** Stable key for v-for. */
  key: string
  /** Predicted = flow with no real shipment yet; queued = real, no trip. */
  kind: 'predicted' | 'queued'
  originLocationId: string
  destLocationId: string
  /** Comma-joined ticker summary (single ticker for predicted). */
  tickerSummary: string
  /** Sum of line amounts (for predicted, the single line's amount). */
  amount: number
  /** Cargo weight in tonnes (sum across lines). 0 if commodity weights aren't
   *  loaded yet. */
  cargoWeight: number
  /** Cargo volume in m³ (sum across lines). */
  cargoVolume: number
  /** ISO due date — when this shipment should ARRIVE. */
  dueAt: string
  /** Used for click handlers. Set on predicted; null on queued. */
  flowId?: number
  /** Set on queued; null on predicted (no record yet). */
  shipmentId?: number
}

function lineWeight(ticker: string, amount: number): number {
  const w = commodityService.getCommodityWeight(ticker.toUpperCase()) ?? 0
  return w * amount
}

function lineVolume(ticker: string, amount: number): number {
  const v = commodityService.getCommodityVolume(ticker.toUpperCase()) ?? 0
  return v * amount
}

function formatCargo(weight: number, volume: number): string {
  const w = Math.round(weight)
  const v = Math.round(volume)
  if (w === 0 && v === 0) return '—'
  return `${w.toLocaleString()}t / ${v.toLocaleString()}m³`
}

/**
 * `true` while the parent trip (if any) is still active — we don't predict
 * a new shipment for a flow that already has a planned/dispatched parent.
 */
function isShipmentActive(s: Shipment): boolean {
  if (s.tripId === null) return true // queued
  const trip = trips.value.find(t => t.id === s.tripId)
  if (!trip) return true
  return trip.status === 'planned' || trip.status === 'dispatched'
}

/** flowId set of flows already covered by an active shipment line. */
const activeFlowIds = computed<Set<number>>(() => {
  const set = new Set<number>()
  for (const s of shipments.value) {
    if (!isShipmentActive(s)) continue
    for (const line of s.lines) {
      if (line.flowId !== null) set.add(line.flowId)
    }
  }
  return set
})

/**
 * Predicted + queued shipments inside the look-ahead window, sorted by due
 * date ascending. Predicted = a demand/fixed flow whose next-cycle shipment
 * doesn't have a real record yet. Queued = a real shipment record with no
 * trip assigned yet.
 */
const shipmentRows = computed<ShipmentRow[]>(() => {
  const cutoff = lookaheadCutoff.value
  const todayMs = localMidnightMs(Date.now())
  const out: ShipmentRow[] = []

  // Predicted from flows. Stock-aware: only surface a flow when the
  // destination's CURRENT stock won't last long enough to cover the
  // look-ahead window (plus the flow's transit time). If a base has 28d of
  // stock and the user's window is 14d, we don't bug them about it — even
  // if the cadence cycle would otherwise project a shipment.
  if (props.graph) {
    const nodeByLoc = new Map(props.graph.nodes.map(n => [n.locationId, n]))
    for (const e of props.graph.edges as EdgeState[]) {
      if (e.kind !== 'demand' && e.kind !== 'fixed') continue
      if (e.perShipmentAmount <= 0) continue
      if (activeFlowIds.value.has(e.id)) continue // already a real shipment for this flow

      // Compute the action deadline. Prefer stock-driven (runOutAt minus
      // transit) since that's the hard "must arrive by" constraint; fall
      // back to the cadence projection when stock isn't tracked (mode =
      // ignored or no consumption).
      const destNode = nodeByLoc.get(e.toLocationId)
      const runOutIso = destNode?.runOutAt[e.commodityTicker] ?? null
      const transitMs = (e.transitDays ?? 0) * MS_PER_DAY
      const stockShipByMs = runOutIso ? new Date(runOutIso).getTime() - transitMs : null
      const cadenceArrivalMs = e.nextArrivalAt ? new Date(e.nextArrivalAt).getTime() : null

      const dueMs =
        stockShipByMs !== null
          ? stockShipByMs
          : cadenceArrivalMs !== null
            ? cadenceArrivalMs
            : todayMs

      // Skip when the deadline is past the look-ahead window — current stock
      // (or future cadence) covers everything within the user's action window.
      if (dueMs > cutoff) continue

      const dueIso = new Date(dueMs).toISOString()
      const amount = Math.round(e.perShipmentAmount)
      out.push({
        key: `flow:${e.id}`,
        kind: 'predicted',
        originLocationId: e.fromLocationId,
        destLocationId: e.toLocationId,
        tickerSummary: e.commodityTicker,
        amount,
        cargoWeight: lineWeight(e.commodityTicker, amount),
        cargoVolume: lineVolume(e.commodityTicker, amount),
        dueAt: dueIso,
        flowId: e.id,
      })
    }
  }

  // Queued (real records, no trip assigned). No predicted "due date" — use
  // createdAt as a stable timestamp; user can still pull it into a trip
  // anytime.
  for (const s of shipments.value) {
    if (s.tripId !== null) continue
    const tickerSummary = s.lines
      .map(l => `${l.commodityTicker} ${Math.round(l.amount).toLocaleString()}`)
      .join(', ')
    const totalAmount = s.lines.reduce((sum, l) => sum + l.amount, 0)
    let cargoWeight = 0
    let cargoVolume = 0
    for (const l of s.lines) {
      cargoWeight += lineWeight(l.commodityTicker, l.amount)
      cargoVolume += lineVolume(l.commodityTicker, l.amount)
    }
    out.push({
      key: `ship:${s.id}`,
      kind: 'queued',
      originLocationId: s.originLocationId,
      destLocationId: s.destLocationId,
      tickerSummary,
      amount: totalAmount,
      cargoWeight,
      cargoVolume,
      dueAt: s.createdAt,
      shipmentId: s.id,
    })
  }

  out.sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  return out
})

/**
 * Group of rows with the same (origin, destination) pair — folded under
 * one expandable header so a single point-to-point bundle shows as one
 * row with a single "Add all to trip" action. Different origins to the
 * same destination stay as separate groups (each is its own coherent
 * pickup-and-drop bundle). Single-row groups render flat (no expansion).
 */
interface ShipmentGroup {
  /** Composite key for v-for + expanded-state lookup. */
  key: string
  originLocationId: string
  destLocationId: string
  rows: ShipmentRow[]
  /** Earliest due date in the group — drives sort + urgency color. */
  earliestDueAt: string
  /** Distinct ticker count for the header summary. */
  tickerCount: number
  /** Total amount (sum of row amounts). */
  totalAmount: number
  /** Cargo weight summed across rows (tonnes). */
  totalCargoWeight: number
  /** Cargo volume summed across rows (m³). */
  totalCargoVolume: number
}

function groupKey(originLocationId: string, destLocationId: string): string {
  return `${originLocationId}|${destLocationId}`
}

/** Rows grouped by (origin, destination), sorted by earliest due date. */
const shipmentGroups = computed<ShipmentGroup[]>(() => {
  const map = new Map<string, ShipmentGroup>()
  for (const row of shipmentRows.value) {
    const key = groupKey(row.originLocationId, row.destLocationId)
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        originLocationId: row.originLocationId,
        destLocationId: row.destLocationId,
        rows: [],
        earliestDueAt: row.dueAt,
        tickerCount: 0,
        totalAmount: 0,
        totalCargoWeight: 0,
        totalCargoVolume: 0,
      }
      map.set(key, g)
    }
    g.rows.push(row)
    if (row.dueAt < g.earliestDueAt) g.earliestDueAt = row.dueAt
    g.totalAmount += row.amount
    g.totalCargoWeight += row.cargoWeight
    g.totalCargoVolume += row.cargoVolume
  }
  for (const g of map.values()) {
    g.tickerCount = new Set(g.rows.flatMap(r => r.tickerSummary.split(',').map(s => s.trim()))).size
  }
  return [...map.values()].sort((a, b) => a.earliestDueAt.localeCompare(b.earliestDueAt))
})

/** Tracks which (origin, dest) groups are expanded (multi-row groups only). */
const expandedGroups = ref<Set<string>>(new Set())

function toggleGroup(key: string) {
  if (expandedGroups.value.has(key)) {
    expandedGroups.value.delete(key)
  } else {
    expandedGroups.value.add(key)
  }
  // New Set so Vue's reactivity picks up the change.
  expandedGroups.value = new Set(expandedGroups.value)
}

const deletingShipmentId = ref<number | null>(null)

// ==================== Selection + Send-to-trip ====================
//
// Each shipment row has its own checkbox; the group header has a select-all
// checkbox that toggles every row in that group at once (and shows
// indeterminate when partially selected). A single "Send N to trip" button
// at the section header dispatches selected rows to either an existing
// planned trip or a fresh-create dialog.

const selectedRowKeys = ref<Set<string>>(new Set())
const sendMenuOpen = ref(false)

function isRowSelected(row: ShipmentRow): boolean {
  return selectedRowKeys.value.has(row.key)
}

function toggleRow(row: ShipmentRow, value: boolean) {
  const next = new Set(selectedRowKeys.value)
  if (value) next.add(row.key)
  else next.delete(row.key)
  selectedRowKeys.value = next
}

function isAllSelectedInGroup(group: ShipmentGroup): boolean {
  return group.rows.length > 0 && group.rows.every(r => selectedRowKeys.value.has(r.key))
}

function isSomeSelectedInGroup(group: ShipmentGroup): boolean {
  const some = group.rows.some(r => selectedRowKeys.value.has(r.key))
  return some && !isAllSelectedInGroup(group)
}

function toggleAllInGroup(group: ShipmentGroup, value: boolean) {
  const next = new Set(selectedRowKeys.value)
  for (const r of group.rows) {
    if (value) next.add(r.key)
    else next.delete(r.key)
  }
  selectedRowKeys.value = next
}

const selectedRows = computed<ShipmentRow[]>(() => {
  const map = new Map(shipmentRows.value.map(r => [r.key, r]))
  return [...selectedRowKeys.value]
    .map(k => map.get(k))
    .filter((r): r is ShipmentRow => r !== undefined)
})

const selectedCount = computed(() => selectedRows.value.length)

const plannedTrips = computed(() => trips.value.filter(t => t.status === 'planned'))

function sendSelectedToTrip(trip: Trip | null) {
  const presets = buildPresets(selectedRows.value)
  if (presets.length === 0) return
  emit('add-shipments-to-trip', presets, trip)
  selectedRowKeys.value = new Set()
  sendMenuOpen.value = false
}

/**
 * Delete a queued shipment record. Used to clean up orphans left over from
 * the pre-fix flow where "Add to trip" materialized a shipment before the
 * trip was actually saved (so cancelling the dialog left a queued row).
 * Does NOT touch trip-assigned shipments — those still live under their
 * trip and are removed by editing the trip itself.
 */
async function deleteQueuedRow(row: ShipmentRow) {
  if (row.kind !== 'queued' || row.shipmentId === undefined) return
  const label = `${locationDisplay(row.originLocationId)} → ${locationDisplay(row.destLocationId)}: ${row.tickerSummary}`
  if (!confirm(`Delete this queued shipment?\n${label}`)) return
  deletingShipmentId.value = row.shipmentId
  try {
    await api.logistics.deleteShipment(row.shipmentId)
    shipments.value = await api.logistics.listShipments()
  } catch (e) {
    console.error('Failed to delete queued shipment', e)
    window.alert(e instanceof Error ? e.message : 'Failed to delete queued shipment')
  } finally {
    deletingShipmentId.value = null
  }
}

/**
 * Build a list of presets from rows. Pure — no API calls; the Trip dialog
 * is responsible for materializing draft presets on save so cancelling the
 * dialog never leaves queued orphans behind.
 */
function buildPresets(rows: ShipmentRow[]): ShipmentPreset[] {
  const out: ShipmentPreset[] = []
  for (const row of rows) {
    if (row.kind === 'queued' && row.shipmentId !== undefined) {
      out.push({ kind: 'existing', shipmentId: row.shipmentId })
      continue
    }
    if (row.kind === 'predicted') {
      out.push({
        kind: 'draft',
        originLocationId: row.originLocationId,
        destLocationId: row.destLocationId,
        lines: [
          {
            flowId: row.flowId ?? null,
            commodityTicker: row.tickerSummary,
            amount: row.amount,
          },
        ],
      })
    }
  }
  return out
}

/**
 * Hide a (location, ticker) from contract suggestions. The user handles it
 * locally (e.g., expert juggling) and doesn't want it in the buy list.
 */
async function markSelfSupplied(locationId: string, locationName: string, ticker: string) {
  if (
    !confirm(
      `Hide ${ticker} at ${locationName} from contracts? Use this for materials you produce locally without a flow.`
    )
  ) {
    return
  }
  markingSelfSupplied.value = `${locationId}|${ticker}`
  try {
    await api.logistics.createSelfSupplied({ locationId, commodityTicker: ticker })
    selfSupplied.value = await api.logistics.listSelfSupplied()
  } catch (e) {
    console.error('Failed to mark self-supplied', e)
    window.alert(e instanceof Error ? e.message : 'Failed to mark self-supplied')
  } finally {
    markingSelfSupplied.value = null
  }
}

async function unmarkSelfSupplied(id: number) {
  try {
    await api.logistics.deleteSelfSupplied(id)
    selfSupplied.value = await api.logistics.listSelfSupplied()
  } catch (e) {
    console.error('Failed to unmark self-supplied', e)
    window.alert(e instanceof Error ? e.message : 'Failed to unmark self-supplied')
  }
}

// ==================== Backhaul opportunities ====================

interface BackhaulRow {
  /** Stable v-for key. */
  key: string
  trip: Trip
  /** Stop the surplus is at (later in the trip). */
  surplusLocId: string
  surplusLocName: string
  /** Earlier stop selected as the drop. */
  needLocId: string
  needLocName: string
  ticker: string
  /** Amount available to haul: surplus, capped by explicit need when present. */
  amount: number
  /**
   * How the destination was chosen:
   *   demand   — earlier stop has shoppingList > 0 for this ticker
   *   consumes — earlier stop consumes natively but no explicit shortfall
   *   origin   — fell back to the trip's origin; user decides what to do
   */
  matchKind: 'demand' | 'consumes' | 'origin'
}

/**
 * "While the ship's at X, what could it haul back?" For each planned or
 * dispatched trip, walk every later stop and surface tickers in surplus at
 * that stop. We pick a destination among the earlier stops, preferring one
 * with explicit demand (shoppingList or dailyConsumption); if none exists,
 * default to the trip's origin so the user can decide what to do with it
 * back at the hub. The user clicks the row to add a return stop and load
 * the backhaul.
 *
 * Limited to existing trips on purpose — without a trip in mind the matrix
 * of (any surplus → anywhere) is too noisy. We don't gate on demand at the
 * destination because in practice users haul surplus back to a hub (BEN)
 * for reasons our graph can't always see (market sale, stockpiling, future
 * flows). Showing a surplus with no committed home is still useful.
 */
const backhaulRows = computed<BackhaulRow[]>(() => {
  if (!props.graph) return []
  const out: BackhaulRow[] = []
  const nodesById = new Map(props.graph.nodes.map(n => [n.locationId, n]))
  // 1-unit threshold drops solver round-off without ignoring real surplus.
  const SURPLUS_MIN = 1
  for (const trip of trips.value) {
    if (trip.status !== 'planned' && trip.status !== 'dispatched') continue
    const stops = trip.stops.map(s => s.locationId)
    if (stops.length < 2) continue
    const seen = new Set<string>()
    for (let j = 1; j < stops.length; j++) {
      const surplusLoc = stops[j]
      const surplusNode = nodesById.get(surplusLoc)
      if (!surplusNode) continue
      for (const [ticker, surplus] of Object.entries(surplusNode.balance)) {
        if (surplus <= SURPLUS_MIN) continue
        // Pick the best earlier-stop destination. Prefer explicit need
        // (shoppingList > 0); fall back to "consumes natively"
        // (dailyConsumption > 0); fall back to the trip's origin.
        let needLoc: string | null = null
        let matchKind: 'demand' | 'consumes' | 'origin' = 'origin'
        for (let i = 0; i < j; i++) {
          const cand = stops[i]
          if (cand === surplusLoc) continue
          const candNode = nodesById.get(cand)
          if (!candNode) continue
          if (isSelfSupplied(cand, ticker)) continue
          if ((candNode.shoppingList?.[ticker] ?? 0) > 0) {
            needLoc = cand
            matchKind = 'demand'
            break
          }
        }
        if (!needLoc) {
          for (let i = 0; i < j; i++) {
            const cand = stops[i]
            if (cand === surplusLoc) continue
            const candNode = nodesById.get(cand)
            if (!candNode) continue
            if (isSelfSupplied(cand, ticker)) continue
            if ((candNode.dailyConsumption?.[ticker] ?? 0) > 0) {
              needLoc = cand
              matchKind = 'consumes'
              break
            }
          }
        }
        if (!needLoc) {
          needLoc = stops[0]
          if (needLoc === surplusLoc || isSelfSupplied(needLoc, ticker)) continue
          matchKind = 'origin'
        }
        const needNode = nodesById.get(needLoc)
        if (!needNode) continue
        const explicitNeed = needNode.shoppingList?.[ticker] ?? 0
        const amount = matchKind === 'demand' ? Math.min(surplus, explicitNeed) : surplus
        const key = `${trip.id}|${surplusLoc}|${needLoc}|${ticker}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          key,
          trip,
          surplusLocId: surplusLoc,
          surplusLocName: surplusNode.locationName,
          needLocId: needLoc,
          needLocName: needNode.locationName,
          ticker,
          amount,
          matchKind,
        })
      }
    }
  }
  out.sort((a, b) => b.amount - a.amount)
  return out
})

/** Compact route label — same approach as TripList. */
function routeDisplay(t: Trip): string {
  if (t.stops.length === 0) return '—'
  const first = locationDisplay(t.stops[0].locationId)
  const last = locationDisplay(t.stops[t.stops.length - 1].locationId)
  if (t.stops.length === 1) return first
  if (t.stops.length === 2) return `${first} → ${last}`
  return `${first} → … → ${last} (${t.stops.length} stops)`
}

function fullRouteTitle(t: Trip): string {
  return t.stops.map(stop => locationDisplay(stop.locationId)).join(' → ')
}

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
    // Treat both real FIO production AND user-marked self-supplied as
    // "produced here" — either way, the user doesn't need a contract for it.
    if ((node.nativeProduction?.[ticker] ?? 0) > 0) return null
    if (isSelfSupplied(current, ticker)) return null
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

.group-header-row.clickable {
  cursor: pointer;
}

.group-header-row.clickable:hover :deep(td) {
  background: rgba(255, 255, 255, 0.06) !important;
}

.group-child-row :deep(td) {
  background: rgba(255, 255, 255, 0.015) !important;
  font-size: 0.85em;
}

.rotate-90 {
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}
</style>
