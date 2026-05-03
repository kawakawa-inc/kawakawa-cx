<template>
  <template v-if="!corpData || corpData.includedUserCount === 0">
    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      No roles are configured for corp-wide view. An admin needs to set
      <strong>Included Roles (Corp Burn/Repair)</strong> in the Admin panel's Global Defaults.
    </v-alert>
  </template>

  <template v-else>
    <v-alert
      v-if="staleBannerVisible"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
      icon="mdi-alert-outline"
    >
      <div class="d-flex align-center ga-3 flex-wrap">
        <span class="text-body-2">
          This view was updated by someone else after you started editing.
        </span>
        <v-spacer />
        <v-btn size="small" variant="text" @click="reloadSavedFromBanner">Reload Saved</v-btn>
        <v-btn size="small" variant="tonal" color="primary" @click="keepEditingFromBanner">
          Keep editing
        </v-btn>
      </div>
    </v-alert>

    <!-- ============ ROW 1 — view identity ============ -->
    <div class="d-flex align-center ga-2 mb-2 flex-wrap">
      <CorpViewSelector
        :model-value="viewId"
        :views="views"
        :loading="viewsLoading"
        :current-username="currentUsername"
        :can-pin="canPin"
        @update:model-value="onViewChange"
        @delete="confirmDeleteView"
        @toggle-pin="togglePin"
        @rename="onNameChange"
        @snackbar="(m, c) => emit('snackbar', m, c)"
      />

      <!-- + New View — sits next to the selector so the entry point is
           obvious. The dialog asks for a name and whether to start empty or
           clone the active view; Save As is folded into the "copy current"
           branch so users only see one button. -->
      <v-btn
        size="small"
        variant="tonal"
        prepend-icon="mdi-plus"
        color="primary"
        @click="openNewView"
      >
        New View
      </v-btn>

      <!-- Scope chip — popover with TickerCategoryInput. -->
      <v-menu
        v-if="!isBuiltInActive"
        :close-on-content-click="false"
        location="bottom start"
        max-width="540"
      >
        <template #activator="{ props: menuProps }">
          <v-chip v-bind="menuProps" size="small" variant="tonal" prepend-icon="mdi-tag-multiple">
            Scope ({{ scopeChipLabel }})
          </v-chip>
        </template>
        <v-card width="540">
          <v-card-text class="pa-3">
            <div class="text-caption text-medium-emphasis mb-2">
              Tickers and categories in scope. Empty = every corp ticker.
            </div>
            <TokenSearchInput
              :chips="viewTickerChips"
              :extra-suggestion-types="tickerCategorySuggestions"
              :allowed-suggestion-types="['commodity', 'category']"
              :chip-icon-by-type="tickerChipIcons"
              :help-tokens="tickerHelpTokens"
              :get-commodity-display="tickerDisplayForChip"
              leading-icon="mdi-tag-multiple"
              paste-split-to="commodity"
              enter-creates-type="commodity"
              placeholder="Add tickers or categories…"
              history-key="burn-repair"
              @update:chips="onViewTickerChipsUpdate"
            />
          </v-card-text>
        </v-card>
      </v-menu>

      <!-- Privacy chip — small menu with the three options. -->
      <v-menu v-if="!isBuiltInActive" location="bottom start">
        <template #activator="{ props: menuProps }">
          <v-chip v-bind="menuProps" size="small" variant="tonal">
            <v-icon start size="small">{{ privacyIcon(viewPrivacy) }}</v-icon>
            {{ privacyLabel(viewPrivacy) }}
          </v-chip>
        </template>
        <v-list density="compact" min-width="240">
          <v-list-item
            v-for="opt in PRIVACY_OPTIONS"
            :key="opt.value"
            :prepend-icon="privacyIcon(opt.value)"
            :active="opt.value === viewPrivacy"
            @click="onPrivacyChange(opt.value)"
          >
            <v-list-item-title>{{ opt.title }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>

      <!-- Owners chip — opens the owners management dialog. Only meaningful
           on saved views (a draft has no owners until first save creates the
           row). -->
      <v-chip
        v-if="!isBuiltInActive && !isUnsavedActive"
        size="small"
        variant="tonal"
        prepend-icon="mdi-account-multiple"
        @click="ownersDialogOpen = true"
      >
        {{ ownersChipLabel }}
      </v-chip>

      <v-spacer />

      <!-- View ⋯ menu — Pin (admin + public) and Delete (owner). The unsaved
           draft has no menu since Discard already covers "throw away this
           draft". -->
      <v-menu
        v-if="
          !isBuiltInActive &&
          !isUnsavedActive &&
          (canEditActive || (canPin && viewPrivacy === 'public'))
        "
        location="bottom end"
      >
        <template #activator="{ props: menuProps }">
          <v-btn v-bind="menuProps" icon="mdi-dots-vertical" size="small" variant="text" />
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item
            v-if="canPin && viewPrivacy === 'public'"
            :prepend-icon="activeView.isPinned ? 'mdi-pin-off' : 'mdi-pin'"
            @click="togglePin(activeView)"
          >
            <v-list-item-title>
              {{ activeView.isPinned ? 'Unpin globally' : 'Pin globally' }}
            </v-list-item-title>
          </v-list-item>
          <v-divider v-if="canPin && viewPrivacy === 'public' && canEditActive" class="my-1" />
          <v-list-item
            v-if="canEditActive"
            prepend-icon="mdi-delete"
            base-color="error"
            @click="confirmDeleteView(activeView)"
          >
            <v-list-item-title>Delete view…</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <!-- ============ ROW 2 — planning controls + Save state ============ -->
    <div class="d-flex align-center ga-2 mb-3 flex-wrap">
      <UsersIncludedMenu
        :model-value="excludedUserIds"
        :saved-excluded-user-ids="activeView.excludedUserIds"
        :per-user="corpData.perUser"
        :excluded-members="corpData.excludedMembers"
        :included-count="corpData.includedUserCount"
        :dirty="exclusionsDirty"
        :can-save="canEditActive"
        @update:model-value="onExcludedChange"
      />
      <ExcludedMembersChip :members="corpData.excludedMembers" />

      <v-spacer />

      <v-btn
        v-if="localDirty || isUnsavedActive"
        size="small"
        variant="text"
        prepend-icon="mdi-undo"
        @click="discardLocal"
      >
        {{ isUnsavedActive ? 'Discard draft' : 'Discard' }}
      </v-btn>

      <v-btn
        v-if="canSaveLocal"
        size="small"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-content-save"
        :loading="saving"
        @click="saveLocal"
      >
        Save
      </v-btn>
    </div>

    <template v-if="cards.length > 0">
      <CorpDashboard
        :cards="cards"
        :corp-data="corpData"
        :ticker-set="tickerSet"
        :repair-days="repairDays"
        :excluded-user-ids="excludedUserIds"
        :card-state="cardState"
        @inspect="onInspectMaterial"
        @update:card-state="payload => emit('update:cardState', payload)"
        @update:cards="onCardsChange"
        @configure-graph="openGraphConfig"
      />
    </template>
    <template v-else>
      <v-alert type="info" variant="tonal" density="compact" class="mb-4">
        This view has no cards. {{ canEditActive ? 'Open it to add some.' : '' }}
      </v-alert>
    </template>

    <!-- Materials-table ticker filter — per-view, savable through Local. The
         column picker now lives inside the table card itself, next to Copy
         CSV (see MaterialsTable). -->
    <div class="mb-3">
      <TokenSearchInput
        :chips="materialsTickerChips"
        :extra-suggestion-types="tickerCategorySuggestions"
        :allowed-suggestion-types="['commodity', 'category']"
        :chip-icon-by-type="tickerChipIcons"
        :help-tokens="tickerHelpTokens"
        :get-commodity-display="tickerDisplayForChip"
        leading-icon="mdi-tag-multiple"
        paste-split-to="commodity"
        enter-creates-type="commodity"
        placeholder="Filter materials by ticker or category…"
        history-key="burn-repair"
        @update:chips="onMaterialsTickerChipsUpdate"
      />
    </div>

    <MaterialsTable
      title="Materials"
      :corp-data="corpData"
      :ticker-set="materialsTableTickerSet"
      :repair-days="repairDays"
      :columns="materialsTableColumns"
      :column-options="materialsColumnOptions"
      :default-columns-label="defaultMaterialsColumnsLabel"
      @copy-csv="onCopyCsv"
      @inspect="onInspectMaterial"
      @update:columns="onMaterialsColumnsChange"
    />

    <MaterialBreakdownModal
      v-model="breakdownOpen"
      :ticker="breakdownTicker"
      :excluded-user-ids="excludedUserIds"
      :stock-aggregate="breakdownStockAggregate"
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

    <ViewOwnersDialog
      v-if="!isBuiltInActive && !isUnsavedActive"
      v-model="ownersDialogOpen"
      :view="activeView"
      :corp-users="corpData.perUser"
      :can-edit="canEditActive"
      @add="onAddOwner"
      @remove="onRemoveOwner"
      @snackbar="(m, c) => emit('snackbar', m, c)"
    />

    <!--
      Graph-card configuration dialog. Opened via the per-card "Configure"
      button on graph cards (table cards configure inline). The card it
      operates on is captured at open time so its 10+ fields keep the dialog
      focused on one card at a time.
    -->
    <GraphCardConfigDialog
      v-model="graphConfigOpen"
      :card="graphConfigCard"
      @save="onGraphConfigSave"
      @convert-to-table="onGraphConvertToTable"
    />

    <ConfirmationDialog
      v-model="deleteDialogOpen"
      title="Delete view?"
      :message="deletingView ? `'${deletingView.name}' will be removed permanently.` : ''"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="onDeleteConfirmed"
    />

    <!-- New View dialog — single entry point that asks for a name, whether
         to start from scratch or clone the active view, and the privacy. The
         "copy" branch absorbs the legacy Save As flow. Disabled cloning the
         built-in template is kept available since users routinely reach for
         it as a starting point. -->
    <v-dialog v-model="newViewOpen" max-width="460" persistent>
      <v-card>
        <v-card-title>New view</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newViewDraft.name"
            label="Name"
            density="compact"
            variant="outlined"
            autofocus
            :rules="[v => !!v?.trim() || 'Name is required']"
          />
          <v-radio-group v-model="newViewDraft.mode" density="compact" hide-details class="mb-3">
            <v-radio label="New empty view" value="empty" />
            <v-radio :label="`Copy current view (${activeView.name})`" value="copy" />
          </v-radio-group>
          <v-select
            v-model="newViewDraft.privacy"
            :items="privacyOptions"
            item-title="title"
            item-value="value"
            label="Privacy"
            density="compact"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="newViewOpen = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :disabled="!newViewDraft.name.trim()"
            :loading="saving"
            @click="confirmNewView"
          >
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
  BurnRepairCorpResponse,
  BurnRepairCorpBuildingsResponse,
  BurnRepairCorpWorkforceResponse,
  CorpOverviewView,
  CreateCorpOverviewViewRequest,
  FilterPrivacy,
  MetricKey,
  ViewCard,
} from '@kawakawa/types'
import type { TickerRow } from '../../utils/corpMetrics'
import { api } from '../../services/api'
import { useUserStore } from '../../stores/user'
import CorpViewSelector from './CorpViewSelector.vue'
import CorpDashboard from './CorpDashboard.vue'
import MaterialsTable from './MaterialsTable.vue'
import MaterialBreakdownModal from './MaterialBreakdownModal.vue'
import GraphCardConfigDialog from './GraphCardConfigDialog.vue'
import ViewOwnersDialog from './ViewOwnersDialog.vue'
import ConfirmationDialog from '../ConfirmationDialog.vue'
import {
  BUILT_IN_ALL_VIEW,
  BUILT_IN_VIEW_ID,
  generateCardClientId,
  isBuiltInViewId,
  normalizeView,
} from './viewTemplates'
import UsersIncludedMenu from './UsersIncludedMenu.vue'
import ExcludedMembersChip from './ExcludedMembersChip.vue'
import TokenSearchInput, {
  type SearchChip,
  type ExtraSuggestionType,
} from '../TokenSearchInput.vue'
import { commodityService } from '../../services/commodityService'
import { useSettingsStore } from '../../stores/settings'
import {
  resolveTickerScope,
  scopeEntriesToChips,
  chipsToScopeEntries,
} from '../../utils/tickerScope'
import type { Commodity } from '../../types'
import {
  DEFAULT_MATERIALS_TABLE_COLUMNS,
  isMetricValidFor,
  CORP_METRIC_DEFS,
} from '@kawakawa/types'
import {
  UNSAVED_VIEW_ID,
  initLocal,
  initUnsavedLocal,
  isLocalDirty,
  isLocalStale,
  isUnsavedViewId,
  resetLocalToSaved,
  type CardLocalState,
  type LocalViewState,
} from '../../utils/corpOverviewLocal'

const props = defineProps<{
  corpData: BurnRepairCorpResponse | null
  corpBuildings: BurnRepairCorpBuildingsResponse | null
  corpWorkforce: BurnRepairCorpWorkforceResponse | null
  repairDays: number
  modelValue: number
  /**
   * Per-view Local working copies (page-state-backed by the parent). The
   * panel reads the active view's entry to source exclusions, materials-table
   * filter, and per-card UI state — and emits granular updates back when the
   * user touches any of those. First-time init and stale-snap go through
   * `update:local`.
   */
  localByView: Record<number, LocalViewState>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
  (e: 'update:excludedUserIds', value: number[]): void
  (e: 'update:materialsTableTickers', value: string[]): void
  (e: 'update:cardState', payload: { clientId: string; next: CardLocalState }): void
  (e: 'update:cards', cards: ViewCard[]): void
  (e: 'update:viewName', value: string): void
  (e: 'update:viewPrivacy', value: FilterPrivacy): void
  (e: 'update:viewTickers', value: string[]): void
  (e: 'update:materialsTableColumns', value: MetricKey[]): void
  /** Replace the entire LocalViewState for a viewId (init + stale-snap path). */
  (e: 'update:local', payload: { viewId: number; local: LocalViewState | null }): void
  (e: 'copy-csv', payload: { viewName: string; rows: TickerRow[]; columns: MetricKey[] }): void
  (e: 'snackbar', message: string, color?: string): void
}>()

/**
 * The active view's Local entry, or null when the panel hasn't yet seeded
 * one (e.g. first paint, before the views list resolves and the init watcher
 * fires). Downstream readers use the empty fallbacks below in that case.
 */
const activeLocal = computed<LocalViewState | null>(
  () => props.localByView[props.modelValue] ?? null
)

const excludedUserIds = computed<number[]>(() => activeLocal.value?.excludedUserIds ?? [])
function onExcludedChange(next: number[]): void {
  emit('update:excludedUserIds', next)
}

const materialsTickerFilter = computed<string[]>({
  get: () => activeLocal.value?.materialsTableTickers ?? [],
  set: v => emit('update:materialsTableTickers', v),
})

/** Per-card UI state forwarded straight to the dashboard. Empty when Local hasn't been seeded yet. */
const cardState = computed<Record<string, CardLocalState>>(() => activeLocal.value?.cardState ?? {})

/**
 * Cards source. Reads from Local once it exists (so card-level edits are
 * picked up by the Save button), falling back to Saved on the first paint
 * before init. The fallback also covers the built-in view, which is rendered
 * read-only via Saved by design.
 */
const cards = computed<ViewCard[]>(() => activeLocal.value?.cards ?? activeView.value.cards)

function onCardsChange(next: ViewCard[]): void {
  emit('update:cards', next)
}

// -------- View-level inline edits (PR 7) --------

const viewPrivacy = computed<FilterPrivacy>(
  () => activeLocal.value?.privacy ?? activeView.value.privacy
)
const viewTickers = computed<string[]>(() => activeLocal.value?.tickers ?? activeView.value.tickers)
const materialsTableColumns = computed<MetricKey[]>(
  () => activeLocal.value?.materialsTableColumns ?? activeView.value.materialsTableColumns
)

function onNameChange(value: string): void {
  emit('update:viewName', value)
}

function onPrivacyChange(value: FilterPrivacy): void {
  emit('update:viewPrivacy', value)
}

function onTickersChange(value: string[]): void {
  emit('update:viewTickers', value)
}

function onMaterialsColumnsChange(value: MetricKey[]): void {
  emit('update:materialsTableColumns', value)
}

const PRIVACY_OPTIONS: Array<{ title: string; value: FilterPrivacy }> = [
  { title: 'Private', value: 'private' },
  { title: 'Unlisted', value: 'unlisted' },
  { title: 'Public', value: 'public' },
]

function privacyIcon(p: FilterPrivacy): string {
  return p === 'public' ? 'mdi-earth' : p === 'unlisted' ? 'mdi-link' : 'mdi-lock'
}

function privacyLabel(p: FilterPrivacy): string {
  return p === 'public' ? 'Public' : p === 'unlisted' ? 'Unlisted' : 'Private'
}

const scopeChipLabel = computed(() =>
  viewTickers.value.length === 0
    ? 'all tickers'
    : `${viewTickers.value.length} entr${viewTickers.value.length === 1 ? 'y' : 'ies'}`
)

const ownersChipLabel = computed(() => {
  const count = activeView.value.owners.length
  if (count === 0) return 'No owners'
  if (count === 1) return activeView.value.owners[0].username
  return `${activeView.value.owners[0].username} +${count - 1}`
})

/**
 * Materials-table column metric options. Filtered to ticker-grouping metrics
 * since the panel-level table is per-ticker.
 */
const materialsColumnOptions = computed<Array<{ title: string; value: MetricKey }>>(() =>
  Object.values(CORP_METRIC_DEFS)
    .filter(d => isMetricValidFor(d.key, 'ticker'))
    .map(d => ({ title: d.label, value: d.key }))
)

const defaultMaterialsColumnsLabel = computed(() =>
  DEFAULT_MATERIALS_TABLE_COLUMNS.map(k => CORP_METRIC_DEFS[k]?.label ?? k).join(', ')
)

const ownersDialogOpen = ref(false)

const isUnsavedActive = computed(() => isUnsavedViewId(props.modelValue))

// -------- Graph-card configuration dialog --------

const graphConfigOpen = ref(false)
const graphConfigCard = ref<ViewCard | null>(null)

function openGraphConfig(card: ViewCard): void {
  graphConfigCard.value = card
  graphConfigOpen.value = true
}

/**
 * Apply a graph-card save back to Local. Replaces the card by clientId so
 * per-card pagination stays attached and any reorder mid-edit is harmless.
 */
function onGraphConfigSave(updated: ViewCard): void {
  emit(
    'update:cards',
    cards.value.map(c => (c.clientId === updated.clientId ? updated : c))
  )
  graphConfigCard.value = null
  graphConfigOpen.value = false
}

/**
 * Convert the graph card under the dialog into a table card. We close the
 * dialog (graph-only fields no longer apply) and let the user fine-tune the
 * resulting table inline through `CardConfigPopover`.
 */
function onGraphConvertToTable(): void {
  const src = graphConfigCard.value
  if (!src) return
  const next: ViewCard = {
    ...src,
    type: 'table',
    columns: src.columns.length > 0 ? src.columns : ['gap', 'stock'],
    graph: undefined,
  }
  emit(
    'update:cards',
    cards.value.map(c => (c.clientId === next.clientId ? next : c))
  )
  graphConfigCard.value = null
  graphConfigOpen.value = false
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
 * fetch for unlisted views shared by URL. Strips the query param on success
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
    let cameFromDeepLink = false
    if (!view) {
      // Not in the default list (likely an unlisted share). Fetch directly.
      view = normalizeView(await api.corpOverviewViews.get(parsed))
      views.value = [view, ...views.value]
      cameFromDeepLink = true
    }
    viewId.value = view.id
    // Record a visit on unlisted shares so the view shows up in the selector
    // on subsequent sessions (across devices, even). Fire-and-forget — a
    // failure here doesn't block the user from seeing the view they just
    // landed on.
    if (cameFromDeepLink && view.privacy === 'unlisted') {
      void api.corpOverviewViews.visit(view.id).catch(err => {
        console.warn('Failed to record view visit', err)
      })
    }
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

/**
 * Resolve the active view. For the built-in or a real saved view, this comes
 * from server-loaded state (the `views` array or the BUILT_IN constant). For
 * an unsaved draft, there is no server state — synthesize a CorpOverviewView
 * from Local so downstream consumers (CorpDashboard, ViewOwnersDialog, etc.)
 * stay oblivious to the "is this saved yet?" distinction.
 */
const activeView = computed<CorpOverviewView>(() => {
  if (isUnsavedViewId(viewId.value)) {
    const local = props.localByView[UNSAVED_VIEW_ID] ?? initUnsavedLocal()
    return {
      id: UNSAVED_VIEW_ID,
      owners: [],
      name: local.name,
      tickers: [...local.tickers],
      cards: local.cards.map(c => ({ ...c })),
      excludedUserIds: [...local.excludedUserIds],
      materialsTableColumns: [...local.materialsTableColumns],
      materialsTableTickers: [...local.materialsTableTickers],
      privacy: local.privacy,
      isPinned: false,
      createdAt: '',
      updatedAt: '',
    }
  }
  if (isBuiltInViewId(viewId.value)) return BUILT_IN_ALL_VIEW
  const found = views.value.find(v => v.id === viewId.value)
  return found ?? BUILT_IN_ALL_VIEW
})

const canEditActive = computed(
  () =>
    !isBuiltInViewId(activeView.value.id) &&
    currentUsername.value !== null &&
    activeView.value.owners.some(o => o.username === currentUsername.value)
)

/** Sorted-tuple equality so [1,2] and [2,1] count as the same set. */
function sameUserSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y)
  const sb = [...b].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}

/**
 * Local has any savable field that differs from Saved — exclusions or the
 * materials-table filter. Drives the global Save / Discard button visibility
 * plus the field-level dirty hints (the chip on UsersIncludedMenu).
 */
const localDirty = computed(() =>
  activeLocal.value ? isLocalDirty(activeLocal.value, activeView.value) : false
)

/** Field-scoped dirty for the exclusions chip on UsersIncludedMenu. */
const exclusionsDirty = computed(
  () => !sameUserSet(excludedUserIds.value, activeView.value.excludedUserIds)
)

const isBuiltInActive = computed(() => isBuiltInViewId(activeView.value.id))

/**
 * Save button visibility:
 *  - Unsaved drafts: always saveable (the caller becomes the owner on POST).
 *  - Real views: requires owner + dirty.
 *  - Built-in: never (it's a constant client-side fixture).
 */
const canSaveLocal = computed(() => {
  if (isBuiltInActive.value) return false
  if (isUnsavedActive.value) return true
  return canEditActive.value && localDirty.value
})

const saving = ref(false)
const newViewOpen = ref(false)
const privacyOptions = [
  { title: 'Private — only you and other owners', value: 'private' as FilterPrivacy },
  { title: 'Unlisted — anyone with the link', value: 'unlisted' as FilterPrivacy },
  { title: 'Public — visible in Browse', value: 'public' as FilterPrivacy },
]
/**
 * `mode: 'empty'` seeds an unsaved draft with default cards/scope and switches
 * to it (the user fills in via the inline editor and Save creates the view).
 * `mode: 'copy'` clones the active view's *current Local state* and POSTs
 * directly — same flow that used to power the Save As button.
 */
const newViewDraft = ref<{ name: string; mode: 'empty' | 'copy'; privacy: FilterPrivacy }>({
  name: '',
  mode: 'empty',
  privacy: 'private',
})

/**
 * Initialize Local on first view-open, and handle stale Local when Saved has
 * been bumped underneath us:
 *  - clean Local + newer Saved → silently snap Local forward
 *  - dirty Local + newer Saved → show banner ("Reload Saved" / "Keep editing")
 * Skips for the built-in view (no server state) and for unsaved drafts (no
 * Saved counterpart — Local IS the truth there).
 */
watch(
  () => [activeView.value.id, activeView.value.updatedAt] as const,
  ([id]) => {
    if (isUnsavedViewId(id)) return
    const local = props.localByView[id]
    const saved = activeView.value
    if (!local) {
      emit('update:local', { viewId: id, local: initLocal(saved) })
      return
    }
    if (isLocalStale(local, saved)) {
      if (!isLocalDirty(local, saved)) {
        // Clean Local can silently snap forward — preserves the user's
        // pagination / ad-hoc card filters while resyncing savable fields.
        emit('update:local', { viewId: id, local: resetLocalToSaved(local, saved) })
      } else {
        staleBannerVisible.value = true
      }
    }
  },
  { immediate: true }
)

const staleBannerVisible = ref(false)

function reloadSavedFromBanner(): void {
  const local = props.localByView[activeView.value.id]
  emit('update:local', {
    viewId: activeView.value.id,
    local: local ? resetLocalToSaved(local, activeView.value) : initLocal(activeView.value),
  })
  staleBannerVisible.value = false
}

function keepEditingFromBanner(): void {
  // Mark Local as in sync with the new Saved snapshot so the banner doesn't
  // re-fire on the next watcher tick. Local content stays as-is — the user
  // has signalled their edits should win on the next Save.
  const currentLocal = props.localByView[activeView.value.id]
  if (!currentLocal) {
    staleBannerVisible.value = false
    return
  }
  emit('update:local', {
    viewId: activeView.value.id,
    local: { ...currentLocal, baseUpdatedAt: activeView.value.updatedAt },
  })
  staleBannerVisible.value = false
}

/**
 * Snap Local's savable subset back to the current Saved baseline while
 * preserving Local-only ephemerals (per-card pagination, etc.). For unsaved
 * drafts, "discard" means dropping the entire draft — there's no Saved to
 * snap back to, and the user has signalled they don't want to keep editing.
 */
function discardLocal(): void {
  if (isUnsavedActive.value) {
    emit('update:local', { viewId: UNSAVED_VIEW_ID, local: null })
    viewId.value = BUILT_IN_VIEW_ID
    return
  }
  const local = props.localByView[activeView.value.id]
  emit('update:local', {
    viewId: activeView.value.id,
    local: local ? resetLocalToSaved(local, activeView.value) : initLocal(activeView.value),
  })
}

/**
 * Persist Local. For unsaved drafts this POSTs a new view and promotes the
 * Local entry from the sentinel id to the real one; for real views it PUTs
 * the savable subset and bumps `baseUpdatedAt` so the dirty diff returns
 * to clean.
 */
async function saveLocal(): Promise<void> {
  if (!canSaveLocal.value) return
  saving.value = true
  try {
    if (isUnsavedActive.value) {
      const local = props.localByView[UNSAVED_VIEW_ID]
      if (!local) return
      const body: CreateCorpOverviewViewRequest = {
        name: local.name.trim() || 'Untitled view',
        privacy: local.privacy,
        tickers: [...local.tickers],
        cards: local.cards.map(c => ({
          ...c,
          // Refresh clientIds at create time so any "builtin:*" sentinels from
          // a cloned built-in template get persisted as real UUIDs and don't
          // collide with another view's per-card state.
          clientId: generateCardClientId(),
          columns: [...c.columns],
          filters: c.filters.map(f => ({ ...f })),
          sortBy: c.sortBy.map(s => ({ ...s })),
          graph: c.graph ? { ...c.graph } : undefined,
        })),
        excludedUserIds: [...local.excludedUserIds],
        materialsTableColumns: [...local.materialsTableColumns],
        materialsTableTickers: [...local.materialsTableTickers],
      }
      const created = normalizeView(await api.corpOverviewViews.create(body))
      views.value = [created, ...views.value]
      // Promote Local: drop the unsaved entry and seed the new id from the
      // server's response so `baseUpdatedAt` reflects the actual creation.
      emit('update:local', { viewId: UNSAVED_VIEW_ID, local: null })
      emit('update:local', { viewId: created.id, local: initLocal(created) })
      viewId.value = created.id
      emit('snackbar', `Created '${created.name}'`, 'success')
      return
    }

    const local = props.localByView[activeView.value.id]
    if (!local) return
    const updated = normalizeView(
      await api.corpOverviewViews.update(activeView.value.id, {
        name: local.name.trim() || activeView.value.name,
        privacy: local.privacy,
        tickers: [...local.tickers],
        cards: local.cards,
        excludedUserIds: [...local.excludedUserIds],
        materialsTableColumns: [...local.materialsTableColumns],
        materialsTableTickers: [...local.materialsTableTickers],
      })
    )
    views.value = views.value.map(v => (v.id === updated.id ? updated : v))
    emit('update:local', {
      viewId: updated.id,
      local: { ...local, baseUpdatedAt: updated.updatedAt },
    })
    emit('snackbar', `Saved '${updated.name}'`, 'success')
  } catch (e) {
    console.error('Failed to save view', e)
    emit('snackbar', (e as Error).message || 'Failed to save view', 'error')
  } finally {
    saving.value = false
  }
}

// -------- New View dialog (empty draft OR clone current) --------

/**
 * Open the New View dialog. The default mode is "empty" since that's the
 * common case; the name pre-fills with `(copy)` only when the user flips to
 * copy mode (no point pre-filling for empty).
 */
function openNewView(): void {
  newViewDraft.value = {
    name: '',
    mode: 'empty',
    privacy: viewPrivacy.value,
  }
  newViewOpen.value = true
}

/**
 * Dispatch on the chosen mode:
 *  - empty → seed an unsaved Local draft with the chosen name/privacy and
 *    switch to it; first Save promotes via POST.
 *  - copy  → clone the active view's current Local state (cards, scope,
 *    exclusions, materials picks) under a fresh name/privacy and POST
 *    immediately. Cards get new `clientId`s so per-card pagination doesn't
 *    bleed across copies.
 */
async function confirmNewView(): Promise<void> {
  const name = newViewDraft.value.name.trim()
  if (!name) return

  if (newViewDraft.value.mode === 'empty') {
    const draft = initUnsavedLocal()
    draft.name = name
    draft.privacy = newViewDraft.value.privacy
    emit('update:local', { viewId: UNSAVED_VIEW_ID, local: draft })
    viewId.value = UNSAVED_VIEW_ID
    newViewOpen.value = false
    return
  }

  saving.value = true
  try {
    const src = activeView.value
    const body: CreateCorpOverviewViewRequest = {
      name,
      privacy: newViewDraft.value.privacy,
      tickers: [...src.tickers],
      cards: src.cards.map(c => ({
        ...c,
        clientId: generateCardClientId(),
        columns: [...c.columns],
        filters: c.filters.map(f => ({ ...f })),
        sortBy: c.sortBy.map(s => ({ ...s })),
        graph: c.graph ? { ...c.graph } : undefined,
      })),
      excludedUserIds: [...excludedUserIds.value],
      materialsTableColumns: [...materialsTableColumns.value],
      materialsTableTickers: [...materialsTickerFilter.value],
    }
    const created = normalizeView(await api.corpOverviewViews.create(body))
    views.value = [created, ...views.value]
    viewId.value = created.id
    newViewOpen.value = false
    emit('snackbar', `Created '${created.name}'`, 'success')
  } catch (e) {
    console.error('Failed to create view', e)
    emit('snackbar', (e as Error).message || 'Failed to create view', 'error')
  } finally {
    saving.value = false
  }
}

// -------- Owners management --------

async function onAddOwner(userId: number): Promise<void> {
  try {
    const updated = normalizeView(await api.corpOverviewViews.addOwner(activeView.value.id, userId))
    views.value = views.value.map(v => (v.id === updated.id ? updated : v))
    emit('snackbar', 'Owner added', 'success')
  } catch (e) {
    emit('snackbar', (e as Error).message || 'Failed to add owner', 'error')
  }
}

async function onRemoveOwner(userId: number): Promise<void> {
  try {
    const updated = normalizeView(
      await api.corpOverviewViews.removeOwner(activeView.value.id, userId)
    )
    views.value = views.value.map(v => (v.id === updated.id ? updated : v))
    emit('snackbar', 'Owner removed', 'success')
  } catch (e) {
    emit('snackbar', (e as Error).message || 'Failed to remove owner', 'error')
  }
}

// Resolve any `category:Name` entries in the view's scope against the live
// commodity catalog so newly-added commodities flow into category-based views
// without anyone re-saving the view.
const commodityCatalog = ref<Commodity[]>([])
async function loadCommodityCatalog(): Promise<void> {
  const cached = commodityService.getAllCommoditiesSync()
  commodityCatalog.value = cached.length > 0 ? cached : await commodityService.getAllCommodities()
}
void loadCommodityCatalog()

// ==================== TokenSearchInput wiring ====================
// BR's data model is `string[]` of bare tickers + `category:Name` entries.
// TokenSearchInput speaks SearchChip[]. The helpers in tickerScope.ts plus a
// few derived bits below let us round-trip cleanly without disturbing the
// downstream resolveTickerScope / view persistence code paths.

const settingsStore = useSettingsStore()
const tickerDisplayForChip = (ticker: string): string =>
  commodityService.getCommodityDisplay(ticker, settingsStore.commodityDisplayMode.value)

// Extra suggestion type for categories — derived live from the loaded
// commodity catalog so newly-added categories surface immediately. Each option
// stores the bare category name; chip conversion adds the `category:` prefix
// when we serialize back to the BR string[] model.
const tickerCategorySuggestions = computed<ExtraSuggestionType[]>(() => {
  const counts = new Map<string, number>()
  for (const c of commodityCatalog.value) {
    if (!c.category) continue
    counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
  }
  const options = [...counts.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map(cat => ({ value: cat, display: cat }))
  return [
    {
      type: 'category',
      typeLabel: 'Category',
      color: 'teal',
      options,
    },
  ]
})

// Visual: keep the same prepend icons the old TickerCategoryInput had — folder
// for category, package for tickers — so users don't lose familiarity.
const tickerChipIcons = {
  category: 'mdi-folder-outline',
  commodity: 'mdi-package-variant',
} as const

// Cheat-sheet rows shown in the empty-state dropdown (mirrors the previous
// component's help section).
const tickerHelpTokens = [
  {
    label: 'Ticker',
    color: 'primary',
    example: 'RAT',
    description: 'A single commodity ticker.',
    icon: 'mdi-package-variant',
  },
  {
    label: 'Category',
    color: 'teal',
    example: 'category:Consumables (basic)',
    description: 'Live reference — expands to every ticker in this category right now.',
    icon: 'mdi-folder-outline',
  },
]

// Two adapter pairs — one for the per-view scope and one for the materials
// table's local ad-hoc filter. Each pair turns the underlying string[] state
// into SearchChip[] for the input, and converts the input's chip emit back to
// string[] for the existing handlers.
const viewTickerChips = computed<SearchChip[]>(() =>
  scopeEntriesToChips(viewTickers.value, tickerDisplayForChip)
)
function onViewTickerChipsUpdate(chips: SearchChip[]): void {
  onTickersChange(chipsToScopeEntries(chips))
}

const materialsTickerChips = computed<SearchChip[]>(() =>
  scopeEntriesToChips(materialsTickerFilter.value, tickerDisplayForChip)
)
function onMaterialsTickerChipsUpdate(chips: SearchChip[]): void {
  materialsTickerFilter.value = chipsToScopeEntries(chips)
}

const tickerSet = computed<Set<string> | null>(() =>
  resolveTickerScope(activeView.value.tickers, commodityCatalog.value)
)

/**
 * Combined ticker set for the materials table: starts with the view's scope
 * (computed `tickerSet`) and intersects with the local ad-hoc filter when
 * one is active. The local filter accepts the same `category:Foo` entries
 * as the view scope, resolved against the live commodity catalog so newly-
 * added commodities flow into category-based filters automatically. Returning
 * null means "no filtering".
 */
const materialsTableTickerSet = computed<Set<string> | null>(() => {
  const localSet = resolveTickerScope(materialsTickerFilter.value, commodityCatalog.value)
  if (!localSet) return tickerSet.value
  if (!tickerSet.value) return localSet
  // Intersection: local entries that survive the view scope.
  const out = new Set<string>()
  for (const t of localSet) {
    if (tickerSet.value.has(t)) out.add(t)
  }
  return out
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
// -------- Material breakdown modal --------
const breakdownOpen = ref(false)
const breakdownTicker = ref('')

const breakdownStockAggregate = computed<number>(() => {
  if (!props.corpData || !breakdownTicker.value) return 0
  return props.corpData.availableSurplus[breakdownTicker.value] ?? 0
})

function onInspectMaterial(ticker: string): void {
  breakdownTicker.value = ticker
  breakdownOpen.value = true
}

function onCopyCsv(payload: { rows: TickerRow[]; columns: MetricKey[] }): void {
  // MaterialsTable already applies the local ticker filter and the view's
  // configured column order to its rendered rows, so we just forward them
  // verbatim. Adding `viewName` lets the success toast name the source view.
  emit('copy-csv', {
    viewName: activeView.value.name,
    rows: payload.rows,
    columns: payload.columns,
  })
}
</script>
