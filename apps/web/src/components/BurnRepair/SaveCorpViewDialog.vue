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
            <v-select
              :model-value="null"
              :items="templateOptions"
              label="Start from template (optional)"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              @update:model-value="applyTemplate"
            />
          </v-col>
        </v-row>

        <div class="text-subtitle-2 mt-3 mb-2">Tickers</div>
        <p class="text-caption text-medium-emphasis mb-2">
          Leave empty to include every corp ticker in this view.
        </p>
        <TickerListManager
          label="view"
          :model-value="draft.tickers"
          :read-only="false"
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
                No cards yet — add one or pick a template.
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
import TickerListManager from './TickerListManager.vue'
import EditCorpCardDialog from './EditCorpCardDialog.vue'
import { VIEW_TEMPLATES } from './viewTemplates'

const props = defineProps<{
  modelValue: boolean
  /** Existing view to edit, or null to create a new one. */
  view: CorpOverviewView | null
  corpData: BurnRepairCorpResponse | null
  repairDays: number
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

const tickerSet = computed(() =>
  draft.value.tickers.length > 0 ? new Set(draft.value.tickers) : null
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

const templateOptions = VIEW_TEMPLATES.map(t => ({ title: t.label, value: t.label }))

function applyTemplate(label: string | null): void {
  if (!label) return
  const tpl = VIEW_TEMPLATES.find(t => t.label === label)
  if (!tpl) return
  // Preserve name + privacy if the user already set them — the template only
  // seeds ticker/card defaults.
  draft.value = {
    name: draft.value.name.trim() ? draft.value.name : tpl.view.name,
    privacy: draft.value.privacy,
    tickers: [...tpl.view.tickers],
    cards: tpl.view.cards.map(c => ({ ...c, columns: [...c.columns] })),
  }
}

function cardSubtitle(card: ViewCard): string {
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
  return `Top ${card.limit} ${groupLabel} · ${sortDesc} · ${filterLabel}`
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
