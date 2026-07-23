<template>
  <v-container fluid>
    <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-4">
      <h1 class="text-h4">Sales Order Queue</h1>
      <v-btn
        v-if="canCreate"
        color="primary"
        size="small"
        prepend-icon="mdi-plus"
        to="/sales-orders/new"
      >
        New Sales Order
      </v-btn>
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-card class="mb-4">
      <v-card-text class="d-flex align-center flex-wrap ga-2">
        <v-btn-toggle v-model="statusFilter" color="primary" density="compact" mandatory>
          <v-btn value="open" size="small">Open</v-btn>
          <v-btn value="claimed" size="small">Claimed</v-btn>
          <v-btn value="fulfilled" size="small">Fulfilled</v-btn>
          <v-btn value="cancelled" size="small">Cancelled</v-btn>
          <v-btn value="all" size="small">All</v-btn>
        </v-btn-toggle>
        <v-checkbox
          v-model="mineOnly"
          label="Only mine"
          density="compact"
          hide-details
          class="ml-2"
        />
        <v-spacer />
        <span class="text-body-2 text-medium-emphasis">{{ orders.length }} order(s)</span>
      </v-card-text>
    </v-card>

    <v-card>
      <v-data-table
        v-model:expanded="expanded"
        :headers="headers"
        :items="orders"
        :loading="loading"
        item-value="id"
        show-expand
        density="comfortable"
        class="elevation-0"
      >
        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.status)" size="small" variant="tonal" label>
            {{ item.status }}
          </v-chip>
        </template>

        <template #item.customerName="{ item }">
          <span v-if="item.customerName">{{ item.customerName }}</span>
          <span v-else class="text-medium-emphasis">—</span>
        </template>

        <template #item.itemsSummary="{ item }">
          {{ item.items.reduce((n, i) => n + i.quantity, 0) }} pkg · {{ item.items.length }} line{{
            item.items.length === 1 ? '' : 's'
          }}
        </template>

        <template #item.grandTotal="{ item }">
          {{ formatMoney(item.grandTotal) }} {{ item.currency }}
        </template>

        <template #item.requestedByName="{ item }">
          {{ item.requestedByName ?? '—' }}
        </template>

        <template #item.claimedByName="{ item }">
          <span v-if="item.claimedByName">{{ item.claimedByName }}</span>
          <span v-else class="text-medium-emphasis">—</span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex ga-1 justify-end">
            <v-btn
              v-if="item.canClaim && canClaim"
              size="small"
              color="primary"
              variant="tonal"
              :loading="actingId === item.id"
              @click="claim(item)"
            >
              Claim
            </v-btn>
            <v-btn
              v-if="item.canGenerateSlip"
              size="small"
              color="indigo"
              variant="tonal"
              :loading="actingId === item.id"
              @click="openSlip(item)"
            >
              {{ item.slipGeneratedAt ? 'View Sales Slip' : 'Create Sales Slip' }}
            </v-btn>
            <v-btn
              v-if="item.canFulfill"
              size="small"
              color="success"
              variant="tonal"
              :loading="actingId === item.id"
              @click="fulfill(item)"
            >
              Fulfill
            </v-btn>
            <v-btn
              v-if="item.canCancel"
              size="small"
              color="error"
              variant="text"
              :loading="actingId === item.id"
              @click="confirmCancel(item)"
            >
              Cancel
            </v-btn>
          </div>
        </template>

        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="pa-0">
              <div class="pa-4 bg-surface-light">
                <div class="d-flex flex-wrap ga-6 mb-3 text-body-2">
                  <div>
                    <span class="text-medium-emphasis">Priced against:</span>
                    {{ item.priceListCode ?? '—' }}
                    <span v-if="item.version !== null">v{{ item.version }}</span>
                    <span v-else>(current)</span>
                  </div>
                  <div v-if="item.pickupLocationName">
                    <span class="text-medium-emphasis">Pickup:</span>
                    {{ item.pickupLocationName }} (+{{ formatMoney(item.pickupFee) }}
                    {{ item.currency }})
                  </div>
                  <div v-if="item.notes">
                    <span class="text-medium-emphasis">Notes:</span> {{ item.notes }}
                  </div>
                </div>

                <v-table density="compact">
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th class="text-right">Qty</th>
                      <th class="text-right">Unit Price</th>
                      <th class="text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="line in item.items" :key="line.id">
                      <td>{{ line.packageName }}</td>
                      <td class="text-right">{{ line.quantity }}</td>
                      <td class="text-right">
                        <span v-if="line.unitPrice !== null">
                          {{ formatMoney(line.unitPrice) }}
                        </span>
                        <span v-else class="text-warning text-caption">not listed</span>
                      </td>
                      <td class="text-right">
                        <span v-if="line.lineTotal !== null">
                          {{ formatMoney(line.lineTotal) }}
                        </span>
                        <span v-else class="text-medium-emphasis">—</span>
                      </td>
                    </tr>
                    <tr v-if="item.pickupFee > 0">
                      <td colspan="3" class="text-right text-medium-emphasis">
                        Pickup ({{ item.pickupLocationName ?? item.pickupLocationId }})
                      </td>
                      <td class="text-right">+{{ formatMoney(item.pickupFee) }}</td>
                    </tr>
                    <tr>
                      <td colspan="3" class="text-right font-weight-bold">Order Total</td>
                      <td class="text-right font-weight-bold">
                        {{ formatMoney(item.grandTotal) }} {{ item.currency }}
                      </td>
                    </tr>
                  </tbody>
                </v-table>

                <!-- FIO readiness: only meaningful once claimed (we check the
                     claimer's holdings). Loaded on demand per order. -->
                <div v-if="item.claimedByUserId !== null" class="mt-4">
                  <div class="d-flex align-center ga-2 mb-2">
                    <span class="text-subtitle-2">Fulfillment Readiness</span>
                    <span class="text-caption text-medium-emphasis">
                      (claimer's stock{{
                        item.pickupLocationName ? ` at ${item.pickupLocationName}` : ''
                      }})
                    </span>
                    <v-btn
                      size="x-small"
                      variant="text"
                      icon="mdi-refresh"
                      :loading="readinessLoading[item.id]"
                      @click="loadReadiness(item.id, true)"
                    />
                  </div>

                  <div
                    v-if="readinessLoading[item.id] && !readiness[item.id]"
                    class="text-caption text-medium-emphasis"
                  >
                    Checking FIO inventory…
                  </div>

                  <template v-else-if="readiness[item.id]">
                    <v-alert
                      v-if="readiness[item.id].ready"
                      type="success"
                      variant="tonal"
                      density="compact"
                    >
                      All materials on hand — ready to fulfill.
                    </v-alert>
                    <template v-else>
                      <v-alert type="warning" variant="tonal" density="compact" class="mb-2">
                        {{ readiness[item.id].shortfalls.length }} material(s) short — source these
                        before fulfilling.
                      </v-alert>
                      <v-table density="compact">
                        <thead>
                          <tr>
                            <th>Material</th>
                            <th class="text-right">Needed</th>
                            <th class="text-right">On Hand</th>
                            <th class="text-right">Short</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="s in readiness[item.id].shortfalls" :key="s.commodityTicker">
                            <td>
                              <CommodityDisplay :ticker="s.commodityTicker" :icon-size="24" />
                            </td>
                            <td class="text-right">{{ s.needed.toLocaleString() }}</td>
                            <td class="text-right">{{ s.available.toLocaleString() }}</td>
                            <td class="text-right text-error font-weight-medium">
                              {{ s.shortfall.toLocaleString() }}
                            </td>
                          </tr>
                        </tbody>
                      </v-table>
                    </template>
                    <div
                      v-if="readiness[item.id].inventoryUploadedAt"
                      class="text-caption text-medium-emphasis mt-1"
                    >
                      FIO inventory as of
                      {{ new Date(readiness[item.id].inventoryUploadedAt!).toLocaleString() }}
                    </div>
                    <div v-else class="text-caption text-warning mt-1">
                      No FIO inventory data for the claimer at this location — “on hand” shown as 0.
                    </div>
                  </template>
                </div>
              </div>
            </td>
          </tr>
        </template>

        <template #no-data>
          <div class="text-center py-8">
            <v-icon size="64" color="grey-lighten-1">mdi-clipboard-text-off-outline</v-icon>
            <p class="text-h6 mt-4">No sales orders</p>
            <p class="text-body-2 text-medium-emphasis">
              <template v-if="statusFilter === 'open'">
                The queue is empty.
                <a v-if="canCreate" href="#" @click.prevent="goCreate">Create one</a>
              </template>
              <template v-else> No {{ statusFilter }} orders. </template>
            </p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <ConfirmationDialog
      v-model="cancelDialog"
      title="Cancel Sales Order"
      icon="mdi-alert"
      icon-color="error"
      confirm-text="Cancel Order"
      confirm-color="error"
      :loading="actingId !== null"
      @confirm="doCancel"
    >
      Cancel sales order <strong>#{{ cancelTarget?.id }}</strong
      >? This cannot be undone.
    </ConfirmationDialog>

    <!-- Customer-facing sales slip (not a member-to-member invoice). -->
    <v-dialog v-model="slipDialog" max-width="560">
      <v-card v-if="slipDoc">
        <v-card-title class="d-flex align-center">
          <v-icon start>mdi-receipt-text</v-icon>
          Sales Slip — Order #{{ slipDoc.salesOrderId }}
        </v-card-title>
        <v-card-text>
          <div v-if="slipDoc.customerName" class="mb-2">
            <span class="text-medium-emphasis">Customer:</span> {{ slipDoc.customerName }}
          </div>
          <v-table density="compact">
            <thead>
              <tr>
                <th>Package</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in slipDoc.lines" :key="i">
                <td>{{ line.packageName }}</td>
                <td class="text-right">{{ line.quantity }}</td>
                <td class="text-right">
                  <span v-if="line.unitPrice !== null">{{ formatMoney(line.unitPrice) }}</span>
                  <span v-else class="text-medium-emphasis">—</span>
                </td>
                <td class="text-right">
                  <span v-if="line.lineTotal !== null">{{ formatMoney(line.lineTotal) }}</span>
                  <span v-else class="text-medium-emphasis">—</span>
                </td>
              </tr>
              <tr v-if="slipDoc.pickupFee > 0">
                <td colspan="3" class="text-right text-medium-emphasis">
                  Pickup{{ slipDoc.pickupLocationName ? ` (${slipDoc.pickupLocationName})` : '' }}
                </td>
                <td class="text-right">+{{ formatMoney(slipDoc.pickupFee) }}</td>
              </tr>
              <tr>
                <td colspan="3" class="text-right font-weight-bold">Total</td>
                <td class="text-right font-weight-bold">
                  {{ formatMoney(slipDoc.total) }} {{ slipDoc.currency }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="slipDialog = false">Close</v-btn>
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-content-copy" @click="copySlip">
            Copy
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { PERMISSIONS } from '@kawakawa/types'
import {
  api,
  type SalesOrderResponse,
  type SalesOrderStatus,
  type SalesOrderReadinessResponse,
  type SalesSlipDocument,
} from '../services/api'
import { useUserStore } from '../stores/user'
import { useSnackbar, useUrlState } from '../composables'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import CommodityDisplay from '../components/CommodityDisplay.vue'

const router = useRouter()
const userStore = useUserStore()
const { snackbar, showSnackbar } = useSnackbar()

const canCreate = computed(() => userStore.hasPermission(PERMISSIONS.SALES_ORDERS_CREATE))
const canClaim = computed(() => userStore.hasPermission(PERMISSIONS.SALES_ORDERS_CLAIM))

// 'all' is a UI-only value meaning "no status filter".
const statusFilter = useUrlState<SalesOrderStatus | 'all'>({
  param: 'status',
  defaultValue: 'open',
})
const mineOnly = useUrlState<boolean>({
  param: 'mine',
  defaultValue: false,
  transform: {
    toUrl: v => (v ? '1' : null),
    fromUrl: v => v === '1',
  },
})

const orders = ref<SalesOrderResponse[]>([])
const loading = ref(false)
const expanded = ref<string[]>([])
const actingId = ref<number | null>(null)

const cancelDialog = ref(false)
const cancelTarget = ref<SalesOrderResponse | null>(null)

// Per-order FIO readiness, loaded lazily when a claimed order is expanded.
const readiness = ref<Record<number, SalesOrderReadinessResponse>>({})
const readinessLoading = ref<Record<number, boolean>>({})

// Customer sales slip dialog.
const slipDialog = ref(false)
const slipDoc = ref<SalesSlipDocument | null>(null)

const headers = [
  { title: 'Order', key: 'id', width: 80 },
  { title: 'Status', key: 'status' },
  { title: 'Customer', key: 'customerName' },
  { title: 'Contents', key: 'itemsSummary', sortable: false },
  { title: 'Total', key: 'grandTotal' },
  { title: 'Requested By', key: 'requestedByName' },
  { title: 'Claimed By', key: 'claimedByName' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

const formatMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const statusColor = (status: SalesOrderStatus) => {
  switch (status) {
    case 'open':
      return 'warning'
    case 'claimed':
      return 'info'
    case 'fulfilled':
      return 'success'
    case 'cancelled':
      return 'grey'
    default:
      return undefined
  }
}

const goCreate = () => router.push('/sales-orders/new')

const load = async () => {
  loading.value = true
  try {
    orders.value = await api.salesOrders.list({
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      mine: mineOnly.value || undefined,
    })
  } catch (error) {
    console.error('Failed to load sales orders', error)
    showSnackbar('Failed to load sales orders', 'error')
    orders.value = []
  } finally {
    loading.value = false
  }
}

const runAction = async (
  order: SalesOrderResponse,
  action: () => Promise<SalesOrderResponse>,
  successMsg: string
) => {
  actingId.value = order.id
  try {
    await action()
    showSnackbar(successMsg, 'success')
    await load()
  } catch (error) {
    console.error('Sales order action failed', error)
    showSnackbar(error instanceof Error ? error.message : 'Action failed', 'error')
  } finally {
    actingId.value = null
  }
}

const claim = (order: SalesOrderResponse) =>
  runAction(order, () => api.salesOrders.claim(order.id), `Claimed order #${order.id}`)

const fulfill = (order: SalesOrderResponse) =>
  runAction(order, () => api.salesOrders.fulfill(order.id), `Fulfilled order #${order.id}`)

const confirmCancel = (order: SalesOrderResponse) => {
  cancelTarget.value = order
  cancelDialog.value = true
}

const doCancel = async () => {
  if (!cancelTarget.value) return
  const target = cancelTarget.value
  await runAction(target, () => api.salesOrders.cancel(target.id), `Cancelled order #${target.id}`)
  cancelDialog.value = false
  cancelTarget.value = null
}

// Load FIO readiness for a claimed order (cached; force re-fetches).
const loadReadiness = async (orderId: number, force = false) => {
  if (!force && readiness.value[orderId]) return
  readinessLoading.value = { ...readinessLoading.value, [orderId]: true }
  try {
    readiness.value = { ...readiness.value, [orderId]: await api.salesOrders.readiness(orderId) }
  } catch (error) {
    console.error('Failed to load readiness', error)
    showSnackbar('Failed to load readiness', 'error')
  } finally {
    readinessLoading.value = { ...readinessLoading.value, [orderId]: false }
  }
}

// Auto-load readiness when a claimed order's row is expanded.
watch(expanded, (ids, prev) => {
  const prevSet = new Set(prev ?? [])
  for (const idStr of ids) {
    if (prevSet.has(idStr)) continue
    const id = Number(idStr)
    const order = orders.value.find(o => o.id === id)
    if (order && order.claimedByUserId !== null) loadReadiness(id)
  }
})

const openSlip = async (order: SalesOrderResponse) => {
  actingId.value = order.id
  try {
    slipDoc.value = await api.salesOrders.generateSlip(order.id)
    slipDialog.value = true
    // Refresh so the button flips to "View Sales Slip" and the timestamp shows.
    await load()
  } catch (error) {
    console.error('Failed to generate sales slip', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to generate sales slip', 'error')
  } finally {
    actingId.value = null
  }
}

const copySlip = async () => {
  const doc = slipDoc.value
  if (!doc) return
  const lines = doc.lines.map(
    l => `${l.packageName}\t${l.quantity}\t${l.unitPrice ?? ''}\t${l.lineTotal ?? ''}`
  )
  const parts = [
    doc.customerName ? `Customer: ${doc.customerName}` : null,
    `Package\tQty\tUnit Price\tLine Total`,
    ...lines,
    doc.pickupFee > 0
      ? `Pickup${doc.pickupLocationName ? ` (${doc.pickupLocationName})` : ''}\t\t\t${doc.pickupFee}`
      : null,
    `Total\t\t\t${doc.total} ${doc.currency ?? ''}`,
  ].filter((l): l is string => l !== null)
  try {
    await navigator.clipboard.writeText(parts.join('\n'))
    showSnackbar('Sales slip copied to clipboard')
  } catch (error) {
    console.error('Failed to copy sales slip', error)
    showSnackbar('Failed to copy sales slip', 'error')
  }
}

watch([statusFilter, mineOnly], load)
onMounted(load)
</script>
