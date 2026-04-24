<template>
  <template v-if="!corpData || corpData.includedUserCount === 0">
    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      No roles are configured for corp-wide view. An admin needs to set
      <strong>Included Roles (Corp Burn/Repair)</strong> in the Admin panel's Global Defaults.
    </v-alert>
  </template>

  <template v-else>
    <div class="d-flex align-center ga-2 mb-3 flex-wrap">
      <CorpViewSelector
        :model-value="viewId"
        :views="views"
        :loading="viewsLoading"
        :current-username="currentUsername"
        :can-pin="canPin"
        @update:model-value="onViewChange"
        @new="openNewViewDialog"
        @edit="openEditViewDialog"
        @delete="confirmDeleteView"
        @toggle-pin="togglePin"
        @snackbar="(m, c) => emit('snackbar', m, c)"
      />

      <UsersIncludedMenu
        :model-value="excludedUserIds"
        :per-user="corpData.perUser"
        :excluded-members="corpData.excludedMembers"
        :included-count="corpData.includedUserCount"
        @update:model-value="onExcludedChange"
      />
      <ExcludedMembersChip :members="corpData.excludedMembers" />

      <v-spacer />

      <v-btn
        variant="tonal"
        size="small"
        prepend-icon="mdi-content-duplicate"
        @click="cloneCurrentView"
      >
        Clone view
      </v-btn>
    </div>

    <template v-if="activeView.cards.length > 0">
      <CorpDashboard
        :cards="activeView.cards"
        :corp-data="corpData"
        :ticker-set="tickerSet"
        :repair-days="repairDays"
        :excluded-user-ids="excludedUserIds"
      />
    </template>
    <template v-else>
      <v-alert type="info" variant="tonal" density="compact" class="mb-4">
        This view has no cards. {{ canEditActive ? 'Open it to add some.' : '' }}
      </v-alert>
    </template>

    <MaterialsTable
      title="Materials"
      :materials="filteredMaterials"
      :available-surplus="corpData.availableSurplus"
      @copy-csv="onCopyCsv"
    />

    <v-card v-if="corpBuildings && corpBuildings.totalBuildings > 0" class="mb-4 mt-4">
      <v-card-title class="text-subtitle-1">
        Buildings
        <v-chip size="x-small" class="ml-2" variant="tonal">
          {{ corpBuildings.totalBuildings }} total
        </v-chip>
      </v-card-title>
      <v-card-text>
        <v-chip
          v-for="(count, ticker) in corpBuildings.buildings"
          :key="ticker"
          size="small"
          variant="tonal"
          class="mr-1 mb-1"
        >
          {{ ticker }}: {{ count }}
        </v-chip>
      </v-card-text>
    </v-card>

    <v-card v-if="corpWorkforce && corpWorkforce.workforce.length > 0">
      <v-card-title class="text-subtitle-1">Workforce</v-card-title>
      <v-data-table
        :items="corpWorkforce.workforce"
        :headers="workforceHeaders"
        density="compact"
        :items-per-page="-1"
        hide-default-footer
      >
        <template #item.totalPopulation="{ item }">
          {{ item.totalPopulation.toLocaleString() }}
        </template>
        <template #item.totalRequired="{ item }">
          {{ item.totalRequired.toLocaleString() }}
        </template>
      </v-data-table>
    </v-card>

    <SaveCorpViewDialog
      v-model="saveDialogOpen"
      :view="editingView"
      :corp-data="corpData"
      :repair-days="repairDays"
      :user-views="views"
      :current-username="currentUsername"
      @create="onCreateView"
      @update="onUpdateView"
    />

    <ConfirmationDialog
      v-model="deleteDialogOpen"
      title="Delete view?"
      :message="deletingView ? `'${deletingView.name}' will be removed permanently.` : ''"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="onDeleteConfirmed"
    />
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
  BurnRepairCorpResponse,
  BurnRepairCorpBuildingsResponse,
  BurnRepairCorpMaterial,
  BurnRepairCorpWorkforceResponse,
  CorpOverviewView,
  CreateCorpOverviewViewRequest,
  UpdateCorpOverviewViewRequest,
} from '@kawakawa/types'
import { api } from '../../services/api'
import { useUserStore } from '../../stores/user'
import CorpViewSelector from './CorpViewSelector.vue'
import CorpDashboard from './CorpDashboard.vue'
import MaterialsTable from './MaterialsTable.vue'
import SaveCorpViewDialog from './SaveCorpViewDialog.vue'
import ConfirmationDialog from '../ConfirmationDialog.vue'
import {
  BUILT_IN_ALL_VIEW,
  BUILT_IN_VIEW_ID,
  isBuiltInViewId,
  normalizeView,
} from './viewTemplates'
import UsersIncludedMenu from './UsersIncludedMenu.vue'
import ExcludedMembersChip from './ExcludedMembersChip.vue'
import { commodityService } from '../../services/commodityService'
import { resolveTickerScope } from '../../utils/tickerScope'
import type { Commodity } from '../../types'

const props = defineProps<{
  corpData: BurnRepairCorpResponse | null
  corpBuildings: BurnRepairCorpBuildingsResponse | null
  corpWorkforce: BurnRepairCorpWorkforceResponse | null
  repairDays: number
  modelValue: number
  excludedUserIds: number[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'update:excludedUserIds', value: number[]): void
  (
    e: 'copy-csv',
    payload: { viewName: string; materials: BurnRepairCorpMaterial[] }
  ): void
  (e: 'snackbar', message: string, color?: string): void
}>()

const excludedUserIds = computed(() => props.excludedUserIds)
function onExcludedChange(next: number[]): void {
  emit('update:excludedUserIds', next)
}

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const currentUsername = computed<string | null>(() => userStore.getUser()?.username ?? null)
const canPin = computed(
  () => userStore.getUser()?.roles?.some(r => r.id === 'administrator') ?? false
)

const viewId = computed<number>({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const views = ref<CorpOverviewView[]>([])
const viewsLoading = ref(false)

async function loadViews(): Promise<void> {
  viewsLoading.value = true
  try {
    const raw = await api.corpOverviewViews.list()
    views.value = raw.map(normalizeView)
  } catch (e) {
    console.error('Failed to load views', e)
    emit('snackbar', 'Failed to load views', 'error')
  } finally {
    viewsLoading.value = false
  }
}

/**
 * Handle a `?view=<id>` deep link. Runs after the initial list fetch so we can
 * prefer matching a view the user already owns/sees, and fall back to a direct
 * fetch for link-privacy views shared by URL. Strips the query param on success
 * so the persisted `usePageState` value becomes the source of truth.
 */
async function consumeViewQueryParam(): Promise<void> {
  const raw = route.query.view
  const idStr = Array.isArray(raw) ? raw[0] : raw
  if (!idStr) return
  const parsed = Number(idStr)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return

  try {
    let view = views.value.find(v => v.id === parsed)
    if (!view) {
      // Not in the default list (likely a link-privacy share). Fetch directly.
      view = normalizeView(await api.corpOverviewViews.get(parsed))
      views.value = [view, ...views.value]
    }
    viewId.value = view.id
  } catch (e) {
    const msg = (e as Error).message || 'View not found'
    emit('snackbar', `Shared view unavailable: ${msg}`, 'error')
  } finally {
    // Always strip the param — either we loaded the view or we're staying on
    // whatever was previously selected; keeping the query around would re-fire
    // the lookup on every refresh.
    const { view: _drop, ...rest } = route.query
    void router.replace({ query: rest })
  }
}

onMounted(async () => {
  await loadViews()
  await consumeViewQueryParam()
})

const activeView = computed<CorpOverviewView>(() => {
  if (isBuiltInViewId(viewId.value)) return BUILT_IN_ALL_VIEW
  const found = views.value.find(v => v.id === viewId.value)
  return found ?? BUILT_IN_ALL_VIEW
})

const canEditActive = computed(
  () =>
    !isBuiltInViewId(activeView.value.id) &&
    activeView.value.userName === currentUsername.value
)

// Resolve any `category:Name` entries in the view's scope against the live
// commodity catalog so newly-added commodities flow into category-based views
// without anyone re-saving the view.
const commodityCatalog = ref<Commodity[]>([])
async function loadCommodityCatalog(): Promise<void> {
  const cached = commodityService.getAllCommoditiesSync()
  commodityCatalog.value =
    cached.length > 0 ? cached : await commodityService.getAllCommodities()
}
void loadCommodityCatalog()

const tickerSet = computed<Set<string> | null>(() =>
  resolveTickerScope(activeView.value.tickers, commodityCatalog.value)
)

const filteredMaterials = computed<BurnRepairCorpMaterial[]>(() => {
  if (!props.corpData) return []
  if (!tickerSet.value) return props.corpData.materials
  const set = tickerSet.value
  return props.corpData.materials.filter(m => set.has(m.commodityTicker))
})

const workforceHeaders = [
  { title: 'Type', key: 'type', sortable: false },
  { title: 'Total Population', key: 'totalPopulation', sortable: false },
  { title: 'Total Required', key: 'totalRequired', sortable: false },
]

function onViewChange(id: number): void {
  // Falling back to built-in is always safe.
  if (isBuiltInViewId(id) || views.value.some(v => v.id === id)) {
    viewId.value = id
  } else {
    viewId.value = BUILT_IN_VIEW_ID
  }
}

// -------- Save dialog (create + edit) --------
const saveDialogOpen = ref(false)
const editingView = ref<CorpOverviewView | null>(null)

function openNewViewDialog(): void {
  editingView.value = null
  saveDialogOpen.value = true
}

function openEditViewDialog(v: CorpOverviewView): void {
  editingView.value = v
  saveDialogOpen.value = true
}

async function onCreateView(body: CreateCorpOverviewViewRequest): Promise<void> {
  try {
    const created = normalizeView(await api.corpOverviewViews.create(body))
    views.value = [created, ...views.value]
    viewId.value = created.id
    emit('snackbar', `View '${created.name}' created`, 'success')
  } catch (e) {
    console.error('Failed to create view', e)
    emit('snackbar', (e as Error).message || 'Failed to create view', 'error')
  }
}

async function onUpdateView(id: number, body: UpdateCorpOverviewViewRequest): Promise<void> {
  try {
    const updated = normalizeView(await api.corpOverviewViews.update(id, body))
    views.value = views.value.map(v => (v.id === id ? updated : v))
    emit('snackbar', `View '${updated.name}' updated`, 'success')
  } catch (e) {
    console.error('Failed to update view', e)
    emit('snackbar', (e as Error).message || 'Failed to update view', 'error')
  }
}

// -------- Delete --------
const deleteDialogOpen = ref(false)
const deletingView = ref<CorpOverviewView | null>(null)

function confirmDeleteView(v: CorpOverviewView): void {
  deletingView.value = v
  deleteDialogOpen.value = true
}

async function onDeleteConfirmed(): Promise<void> {
  const v = deletingView.value
  if (!v) return
  try {
    await api.corpOverviewViews.delete(v.id)
    views.value = views.value.filter(x => x.id !== v.id)
    if (viewId.value === v.id) viewId.value = BUILT_IN_VIEW_ID
    emit('snackbar', `View '${v.name}' deleted`, 'success')
  } catch (e) {
    console.error('Failed to delete view', e)
    emit('snackbar', (e as Error).message || 'Failed to delete view', 'error')
  } finally {
    deleteDialogOpen.value = false
    deletingView.value = null
  }
}

// -------- Pin --------
async function togglePin(v: CorpOverviewView): Promise<void> {
  try {
    const updated = normalizeView(await api.corpOverviewViews.togglePin(v.id))
    views.value = views.value.map(x => (x.id === v.id ? updated : x))
  } catch (e) {
    console.error('Failed to toggle pin', e)
    emit('snackbar', (e as Error).message || 'Failed to toggle pin', 'error')
  }
}

// -------- CSV --------
function onCopyCsv(): void {
  emit('copy-csv', { viewName: activeView.value.name, materials: filteredMaterials.value })
}

// -------- Clone --------
async function cloneCurrentView(): Promise<void> {
  const src = activeView.value
  const body: CreateCorpOverviewViewRequest = {
    name: `${src.name} (copy)`,
    privacy: 'private',
    tickers: [...src.tickers],
    cards: src.cards.map(c => ({
      ...c,
      columns: [...c.columns],
      filters: c.filters.map(f => ({ ...f })),
      sortBy: c.sortBy.map(s => ({ ...s })),
      graph: c.graph ? { ...c.graph } : undefined,
    })),
  }
  try {
    const created = normalizeView(await api.corpOverviewViews.create(body))
    views.value = [created, ...views.value]
    viewId.value = created.id
    emit('snackbar', `Cloned '${src.name}' as '${created.name}'`, 'success')
  } catch (e) {
    console.error('Failed to clone view', e)
    emit('snackbar', (e as Error).message || 'Failed to clone view', 'error')
  }
}
</script>
