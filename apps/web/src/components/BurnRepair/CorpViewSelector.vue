<template>
  <v-menu v-model="menuOpen" location="bottom start" :close-on-content-click="false" max-width="520">
    <template #activator="{ props: btnProps }">
      <v-btn
        v-bind="btnProps"
        variant="outlined"
        append-icon="mdi-menu-down"
        class="text-none justify-space-between"
        min-width="260"
      >
        <span class="d-flex align-center">
          <v-icon size="small" class="mr-1">{{ privacyIcon(current.privacy) }}</v-icon>
          <span class="flex-grow-1 text-left text-truncate">{{ current.name }}</span>
          <v-chip v-if="current.isPinned" size="x-small" class="ml-2" color="primary" variant="tonal">
            <v-icon size="x-small">mdi-pin</v-icon>
          </v-chip>
        </span>
      </v-btn>
    </template>

    <v-card min-width="460">
      <v-tabs v-model="tab" density="compact">
        <v-tab value="mine">Mine &amp; Pinned</v-tab>
        <v-tab value="browse">Browse public</v-tab>
      </v-tabs>

      <v-divider />

      <v-window v-model="tab">
        <v-window-item value="mine">
          <v-list density="compact" max-height="420" class="py-1">
            <v-list-item
              :active="isBuiltInActive"
              prepend-icon="mdi-view-grid"
              :title="builtInView.name"
              subtitle="Always available · no filter"
              @click="pickView(builtInView.id)"
            />
            <v-divider class="my-1" />
            <template v-if="loading">
              <v-list-item>
                <v-progress-circular indeterminate size="20" width="2" />
              </v-list-item>
            </template>
            <template v-else-if="mineAndPinned.length === 0">
              <v-list-item>
                <v-list-item-title class="text-caption text-medium-emphasis">
                  No saved views yet.
                </v-list-item-title>
              </v-list-item>
            </template>
            <template v-else>
              <v-list-item
                v-for="v in mineAndPinned"
                :key="v.id"
                :active="v.id === modelValue"
                :title="v.name"
                :subtitle="viewSubtitle(v)"
                @click="pickView(v.id)"
              >
                <template #prepend>
                  <v-icon>{{ privacyIcon(v.privacy) }}</v-icon>
                </template>
                <template #append>
                  <v-btn
                    v-if="canEdit(v)"
                    icon
                    variant="text"
                    size="small"
                    @click.stop="emit('edit', v)"
                  >
                    <v-icon>mdi-pencil</v-icon>
                  </v-btn>
                  <v-btn
                    v-if="v.privacy !== 'private'"
                    icon
                    variant="text"
                    size="small"
                    @click.stop="copyLink(v.id)"
                  >
                    <v-icon>mdi-link</v-icon>
                  </v-btn>
                  <v-btn
                    v-if="canPin && v.privacy === 'public'"
                    icon
                    variant="text"
                    size="small"
                    :color="v.isPinned ? 'primary' : undefined"
                    @click.stop="emit('toggle-pin', v)"
                  >
                    <v-icon>mdi-pin</v-icon>
                  </v-btn>
                  <v-btn
                    v-if="canEdit(v)"
                    icon
                    variant="text"
                    size="small"
                    color="error"
                    @click.stop="emit('delete', v)"
                  >
                    <v-icon>mdi-delete</v-icon>
                  </v-btn>
                </template>
              </v-list-item>
            </template>
          </v-list>
          <v-divider />
          <div class="pa-2 d-flex">
            <v-btn
              block
              prepend-icon="mdi-plus"
              variant="tonal"
              size="small"
              @click="onNewView"
            >
              New view
            </v-btn>
          </div>
        </v-window-item>

        <v-window-item value="browse">
          <div class="pa-2">
            <v-text-field
              v-model="searchText"
              prepend-inner-icon="mdi-magnify"
              label="Search public views"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              @update:model-value="onSearchChange"
            />
          </div>
          <v-list density="compact" max-height="380">
            <template v-if="browseLoading">
              <v-list-item>
                <v-progress-circular indeterminate size="20" width="2" />
              </v-list-item>
            </template>
            <template v-else-if="browseResults.length === 0">
              <v-list-item>
                <v-list-item-title class="text-caption text-medium-emphasis">
                  No public views match.
                </v-list-item-title>
              </v-list-item>
            </template>
            <template v-else>
              <v-list-item
                v-for="v in browseResults"
                :key="v.id"
                :active="v.id === modelValue"
                :title="v.name"
                :subtitle="`by ${v.userName} · ${viewSubtitle(v)}`"
                @click="pickView(v.id)"
              >
                <template #prepend>
                  <v-icon>{{ privacyIcon(v.privacy) }}</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-list>
        </v-window-item>
      </v-window>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CorpOverviewView, FilterPrivacy } from '@kawakawa/types'
import { api } from '../../services/api'
import { BUILT_IN_ALL_VIEW, isBuiltInViewId, normalizeView } from './viewTemplates'

const props = defineProps<{
  modelValue: number
  views: CorpOverviewView[]
  loading: boolean
  currentUsername: string | null
  canPin: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', id: number): void
  (e: 'new'): void
  (e: 'edit', view: CorpOverviewView): void
  (e: 'delete', view: CorpOverviewView): void
  (e: 'toggle-pin', view: CorpOverviewView): void
  (e: 'snackbar', message: string, color?: string): void
}>()

const menuOpen = ref(false)
const tab = ref<'mine' | 'browse'>('mine')

const builtInView = BUILT_IN_ALL_VIEW

const current = computed<CorpOverviewView>(() => {
  if (isBuiltInViewId(props.modelValue)) return builtInView
  const found = props.views.find(v => v.id === props.modelValue)
  return found ?? builtInView
})

const isBuiltInActive = computed(() => isBuiltInViewId(props.modelValue))

const mineAndPinned = computed(() =>
  props.views
    .filter(v => v.userName === props.currentUsername || v.isPinned)
    .slice()
    .sort((a, b) => {
      // Pinned first, then by name.
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return a.name.localeCompare(b.name)
    })
)

function canEdit(v: CorpOverviewView): boolean {
  return props.currentUsername !== null && v.userName === props.currentUsername
}

function privacyIcon(p: FilterPrivacy): string {
  return p === 'public' ? 'mdi-earth' : p === 'link' ? 'mdi-link' : 'mdi-lock'
}

function viewSubtitle(v: CorpOverviewView): string {
  const cardCount = v.cards.length
  const tickerLabel = v.tickers.length === 0 ? 'all tickers' : `${v.tickers.length} tickers`
  return `${cardCount} card${cardCount === 1 ? '' : 's'} · ${tickerLabel}`
}

function pickView(id: number): void {
  emit('update:modelValue', id)
  menuOpen.value = false
}

function onNewView(): void {
  menuOpen.value = false
  emit('new')
}

async function copyLink(id: number): Promise<void> {
  try {
    const url = `${window.location.origin}${window.location.pathname}?view=${id}`
    await navigator.clipboard.writeText(url)
    emit('snackbar', 'Link copied to clipboard', 'success')
  } catch {
    emit('snackbar', 'Failed to copy link', 'error')
  }
}

// -------- Browse tab --------
const searchText = ref('')
const browseLoading = ref(false)
const browseResults = ref<CorpOverviewView[]>([])
let searchTimer: ReturnType<typeof setTimeout> | undefined

async function loadBrowse(): Promise<void> {
  browseLoading.value = true
  try {
    const raw = await api.corpOverviewViews.browse(searchText.value || undefined)
    browseResults.value = raw.map(normalizeView)
  } catch (e) {
    console.error('Failed to browse views', e)
    browseResults.value = []
  } finally {
    browseLoading.value = false
  }
}

function onSearchChange(): void {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadBrowse()
  }, 300)
}

// Lazy-load browse the first time that tab is opened.
watch(
  () => tab.value,
  async t => {
    if (t === 'browse' && browseResults.value.length === 0) await loadBrowse()
  }
)
</script>
