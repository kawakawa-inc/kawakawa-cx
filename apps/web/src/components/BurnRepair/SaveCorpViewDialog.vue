<template>
  <v-dialog v-model="open" max-width="820" persistent scrollable>
    <v-card>
      <v-card-title>{{ isNew ? 'New view' : 'Edit view' }}</v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="7">
            <v-text-field
              v-model="draft.name"
              label="Name"
              :rules="[v => !!v?.trim() || 'Name is required']"
              required
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" md="5">
            <v-select
              v-model="draft.privacy"
              :items="privacyOptions"
              item-title="title"
              item-value="value"
              label="Privacy"
              density="compact"
              variant="outlined"
            >
              <template #selection="{ item }">
                <v-icon size="small" class="mr-2">{{ privacyIcon(item.value as FilterPrivacy) }}</v-icon>
                {{ item.title }}
              </template>
              <template #item="{ item, props: itemProps }">
                <v-list-item v-bind="itemProps">
                  <template #prepend>
                    <v-icon>{{ privacyIcon(item.value as FilterPrivacy) }}</v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-select>
          </v-col>
        </v-row>

        <v-row v-if="isNew" dense class="mb-2">
          <v-col cols="12">
            <v-autocomplete
              :model-value="null"
              :items="copyFromOptions"
              :loading="copyFromLoading"
              item-title="title"
              item-value="id"
              label="Copy from existing (optional) — leave empty for a blank view"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              @update:model-value="copyFromExisting"
            >
              <template #item="{ item, props: itemProps }">
                <v-list-item v-bind="itemProps" :subtitle="item.raw.subtitle">
                  <template #prepend>
                    <v-icon size="small">{{ item.raw.icon }}</v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-autocomplete>
          </v-col>
        </v-row>

        <div class="d-flex align-center mt-3 mb-1 ga-2">
          <v-icon size="small">mdi-tag-multiple</v-icon>
          <span class="text-subtitle-2">Tickers</span>
          <v-tooltip location="top" max-width="360" open-delay="150">
            <template #activator="{ props: tipProps }">
              <v-icon v-bind="tipProps" size="x-small" color="grey">mdi-information-outline</v-icon>
            </template>
            Type a ticker (e.g. <code>RAT</code>) or pick a category (e.g.
            <code>Consumables</code>) — categories stay live, so new commodities flow in
            automatically. Leave empty to include every corp ticker.
          </v-tooltip>
        </div>
        <TickerCategoryInput
          :model-value="draft.tickers"
          @update:model-value="v => (draft.tickers = v)"
        />

        <div class="d-flex align-center mt-4 mb-2">
          <span class="text-subtitle-2">Cards</span>
          <v-chip size="x-small" class="ml-2" variant="tonal">{{ draft.cards.length }}</v-chip>
          <v-spacer />
          <v-btn variant="tonal" size="small" prepend-icon="mdi-plus" @click="addCard">
            Add card
          </v-btn>
        </div>

        <v-list density="compact" class="border rounded">
          <template v-if="draft.cards.length === 0">
            <v-list-item>
              <v-list-item-title class="text-caption text-medium-emphasis">
                No cards yet — add one or copy from an existing view.
              </v-list-item-title>
            </v-list-item>
          </template>
          <template v-else>
            <v-list-item
              v-for="(card, idx) in draft.cards"
              :key="idx"
              :title="card.name"
              :subtitle="cardSubtitle(card)"
            >
              <template #prepend>
                <v-icon>{{ card.groupBy === 'ticker' ? 'mdi-tag' : 'mdi-account-group' }}</v-icon>
              </template>
              <template #append>
                <v-btn icon variant="text" size="small" :disabled="idx === 0" @click="moveUp(idx)">
                  <v-icon>mdi-arrow-up</v-icon>
                </v-btn>
                <v-btn
                  icon
                  variant="text"
                  size="small"
                  :disabled="idx === draft.cards.length - 1"
                  @click="moveDown(idx)"
                >
                  <v-icon>mdi-arrow-down</v-icon>
                </v-btn>
                <v-btn icon variant="text" size="small" @click="editCard(idx)">
                  <v-icon>mdi-pencil</v-icon>
                </v-btn>
                <v-btn icon variant="text" size="small" color="error" @click="removeCard(idx)">
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="cancel">Cancel</v-btn>
        <v-btn color="primary" :disabled="!isValid" @click="save">
          {{ isNew ? 'Create' : 'Save' }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <EditCorpCardDialog
      v-model="cardDialogOpen"
      :card="editingCard"
      :corp-data="corpData"
      :ticker-set="tickerSet"
      :repair-days="repairDays"
      @save="onCardSave"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  BurnRepairCorpResponse,
  CorpOverviewView,
  CreateCorpOverviewViewRequest,
  FilterPrivacy,
  UpdateCorpOverviewViewRequest,
  ViewCard,
} from '@kawakawa/types'
import { CORP_METRIC_DEFS } from '@kawakawa/types'
import TickerCategoryInput from './TickerCategoryInput.vue'
import EditCorpCardDialog from './EditCorpCardDialog.vue'
import { BUILT_IN_ALL_VIEW, normalizeView } from './viewTemplates'
import { api } from '../../services/api'
import { commodityService } from '../../services/commodityService'
import { resolveTickerScope } from '../../utils/tickerScope'
import type { Commodity } from '../../types'
import { onMounted } from 'vue'

const props = defineProps<{
  modelValue: boolean
  /** Existing view to edit, or null to create a new one. */
  view: CorpOverviewView | null
  corpData: BurnRepairCorpResponse | null
  repairDays: number
  /** User's own + pinned views — source for the "Copy from existing" picker. */
  userViews: CorpOverviewView[]
  /** Current username — used to label views as "yours" vs "public" in the picker. */
  currentUsername: string | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'create', body: CreateCorpOverviewViewRequest): void
  (e: 'update', id: number, body: UpdateCorpOverviewViewRequest): void
}>()

const open = computed<boolean>({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const isNew = computed(() => props.view === null)

interface Draft {
  name: string
  privacy: FilterPrivacy
  tickers: string[]
  cards: ViewCard[]
}

function makeDraft(source: CorpOverviewView | null): Draft {
  if (source) {
    return {
      name: source.name,
      privacy: source.privacy,
      tickers: [...source.tickers],
      cards: source.cards.map(c => ({ ...c, columns: [...c.columns] })),
    }
  }
  return { name: '', privacy: 'private', tickers: [], cards: [] }
}

const draft = ref<Draft>(makeDraft(props.view))

watch(
  () => [props.modelValue, props.view] as const,
  ([modelValue, view]) => {
    if (modelValue) draft.value = makeDraft(view ?? null)
  },
  { immediate: true }
)

// Resolve `category:Name` entries against the live commodity catalog so the
// card-edit preview filters real materials, not the raw `category:...` strings.
const commodityCatalog = ref<Commodity[]>([])
onMounted(async () => {
  const cached = commodityService.getAllCommoditiesSync()
  commodityCatalog.value =
    cached.length > 0 ? cached : await commodityService.getAllCommodities()
})

const tickerSet = computed(() =>
  resolveTickerScope(draft.value.tickers, commodityCatalog.value)
)

const isValid = computed(() => draft.value.name.trim().length > 0)

const privacyOptions = [
  { title: 'Private — only you can see it', value: 'private' },
  { title: 'Link — anyone with the link', value: 'link' },
  { title: 'Public — visible in Browse', value: 'public' },
]

function privacyIcon(p: FilterPrivacy): string {
  return p === 'public' ? 'mdi-earth' : p === 'link' ? 'mdi-link' : 'mdi-lock'
}

// -------- Copy from existing --------
interface CopyFromOption {
  id: string
  title: string
  subtitle: string
  icon: string
  view: CorpOverviewView
}

const publicViews = ref<CorpOverviewView[]>([])
const copyFromLoading = ref(false)

async function loadPublicViews(): Promise<void> {
  if (publicViews.value.length > 0) return
  copyFromLoading.value = true
  try {
    const raw = await api.corpOverviewViews.browse()
    publicViews.value = raw.map(normalizeView)
  } catch (e) {
    console.error('Failed to load public views', e)
  } finally {
    copyFromLoading.value = false
  }
}

// Reload public views when the dialog opens for a new view — other corp
// members may have published views since last time.
watch(
  () => [props.modelValue, isNew.value] as const,
  ([modelValue, isNewView]) => {
    if (modelValue && isNewView) void loadPublicViews()
  }
)

const copyFromOptions = computed<CopyFromOption[]>(() => {
  const out: CopyFromOption[] = [
    {
      id: 'built-in',
      title: BUILT_IN_ALL_VIEW.name,
      subtitle: 'All tickers, default cards',
      icon: 'mdi-view-grid',
      view: BUILT_IN_ALL_VIEW,
    },
  ]
  const seen = new Set<number>([BUILT_IN_ALL_VIEW.id])
  for (const v of props.userViews) {
    if (seen.has(v.id)) continue
    seen.add(v.id)
    const mine = v.userName === props.currentUsername
    out.push({
      id: String(v.id),
      title: v.name,
      subtitle: mine ? 'Your view' : `From ${v.userName}`,
      icon: mine ? 'mdi-account' : 'mdi-pin',
      view: v,
    })
  }
  for (const v of publicViews.value) {
    if (seen.has(v.id)) continue
    seen.add(v.id)
    out.push({
      id: String(v.id),
      title: v.name,
      subtitle: `Public · ${v.userName}`,
      icon: 'mdi-earth',
      view: v,
    })
  }
  return out
})

function copyFromExisting(id: string | null): void {
  if (!id) return
  const opt = copyFromOptions.value.find(o => o.id === id)
  if (!opt) return
  // Preserve whatever the user typed for name/privacy; only seed tickers+cards.
  draft.value = {
    name: draft.value.name,
    privacy: draft.value.privacy,
    tickers: [...opt.view.tickers],
    cards: opt.view.cards.map(c => ({
      ...c,
      columns: [...c.columns],
      filters: c.filters.map(f => ({ ...f })),
      sortBy: c.sortBy.map(s => ({ ...s })),
      graph: c.graph ? { ...c.graph } : undefined,
    })),
  }
}

function cardSubtitle(card: ViewCard): string {
  if (card.type === 'graph' && card.graph) {
    const metrics = card.graph.yMetrics
    const metricLabel =
      metrics.length === 0
        ? '(no metric)'
        : metrics.length === 1
          ? (CORP_METRIC_DEFS[metrics[0]]?.label ?? metrics[0])
          : `${metrics.length} metrics`
    const seriesBy = card.graph.seriesBy === 'user' ? 'per user' : 'corp-aggregate'
    const range =
      card.graph.rangeFrom && card.graph.rangeTo
        ? `${card.graph.rangeFrom} → ${card.graph.rangeTo}`
        : card.graph.rangePreset
    const tickerScope =
      card.graph.tickers && card.graph.tickers.length > 0
        ? ` · ${card.graph.tickers.length} ticker${card.graph.tickers.length === 1 ? '' : 's'}`
        : ''
    return `Graph · ${metricLabel} over ${range}${tickerScope} · ${seriesBy}`
  }

  const groupLabel = card.groupBy === 'ticker' ? 'by ticker' : 'by user × ticker'
  const sortDesc =
    card.sortBy.length === 0
      ? 'ticker asc'
      : card.sortBy
          .map(s => `${CORP_METRIC_DEFS[s.metric]?.label ?? s.metric} ${s.direction}`)
          .join(', ')
  const filterCount = card.filters.length
  const filterLabel =
    filterCount === 0 ? 'no filter' : `${filterCount} filter${filterCount === 1 ? '' : 's'}`
  const tickerScope =
    card.tickers && card.tickers.length > 0
      ? ` · ${card.tickers.length} ticker${card.tickers.length === 1 ? '' : 's'}`
      : ''
  return `Top ${card.limit} ${groupLabel} · ${sortDesc} · ${filterLabel}${tickerScope}`
}

// -------- Card editor orchestration --------
const cardDialogOpen = ref(false)
const editingCardIndex = ref<number | null>(null)
const editingCard = ref<ViewCard | null>(null)

function addCard(): void {
  editingCardIndex.value = null
  editingCard.value = null
  cardDialogOpen.value = true
}

function editCard(idx: number): void {
  editingCardIndex.value = idx
  editingCard.value = draft.value.cards[idx]
  cardDialogOpen.value = true
}

function onCardSave(card: ViewCard): void {
  if (editingCardIndex.value === null) {
    draft.value.cards.push(card)
  } else {
    draft.value.cards[editingCardIndex.value] = card
  }
  editingCardIndex.value = null
  editingCard.value = null
}

function removeCard(idx: number): void {
  draft.value.cards.splice(idx, 1)
}

function moveUp(idx: number): void {
  if (idx <= 0) return
  const [item] = draft.value.cards.splice(idx, 1)
  draft.value.cards.splice(idx - 1, 0, item)
}

function moveDown(idx: number): void {
  if (idx >= draft.value.cards.length - 1) return
  const [item] = draft.value.cards.splice(idx, 1)
  draft.value.cards.splice(idx + 1, 0, item)
}

// -------- Save --------
function save(): void {
  if (!isValid.value) return
  const body = {
    name: draft.value.name.trim(),
    tickers: draft.value.tickers,
    cards: draft.value.cards,
    privacy: draft.value.privacy,
  }
  if (props.view) {
    emit('update', props.view.id, body)
  } else {
    emit('create', body)
  }
  open.value = false
}

function cancel(): void {
  open.value = false
}
</script>
