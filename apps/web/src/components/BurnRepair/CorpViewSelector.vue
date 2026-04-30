<template>
  <div class="d-flex align-center">
    <v-menu
      v-model="menuOpen"
      location="bottom start"
      :close-on-content-click="false"
      max-width="520"
    >
      <template #activator="{ props: btnProps }">
        <v-btn
          v-bind="btnProps"
          variant="outlined"
          append-icon="mdi-menu-down"
          class="text-none justify-space-between corp-view-selector-btn"
          min-width="260"
        >
          <span class="d-flex align-center">
            <v-icon size="small" class="mr-1">{{ privacyIcon(current.privacy) }}</v-icon>
            <span class="flex-grow-1 text-left text-truncate">{{ current.name }}</span>
            <v-chip
              v-if="current.isPinned"
              size="x-small"
              class="ml-2"
              color="primary"
              variant="tonal"
            >
              <v-icon size="x-small">mdi-pin</v-icon>
            </v-chip>
            <!-- Rename pencil — only on editable views. Stops the click from
                 bubbling up to the selector activator so the menu stays
                 closed while the rename dialog opens. -->
            <v-btn
              v-if="canRenameActive"
              icon="mdi-pencil"
              size="x-small"
              variant="text"
              class="ml-1"
              :aria-label="`Rename '${current.name}'`"
              @click.stop="openRename"
            />
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
                  </template>
                </v-list-item>
              </template>
            </v-list>
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
                  :subtitle="`by ${ownersLabel(v)} · ${viewSubtitle(v)}`"
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

    <!-- Rename dialog — opened by the pencil. Two-way bound to a draft so the
         user can cancel without touching the underlying view. -->
    <v-dialog v-model="renameOpen" max-width="420">
      <v-card>
        <v-card-title>Rename view</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="renameDraft"
            label="Name"
            density="compact"
            variant="outlined"
            autofocus
            @keyup.enter="confirmRename"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="renameOpen = false">Cancel</v-btn>
          <v-btn color="primary" :disabled="!renameDraft.trim()" @click="confirmRename">
            Rename
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
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
  /** Delete a real view (with confirm). View ⋯ menu in the header handles the active view. */
  (e: 'delete', view: CorpOverviewView): void
  (e: 'toggle-pin', view: CorpOverviewView): void
  /** Rename the active view — panel pipes this into Local so it round-trips Save. */
  (e: 'rename', name: string): void
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

/**
 * Rename pencil shows on any non-built-in view the caller owns. The built-in
 * has a constant name; non-owned views can't be edited so a rename affordance
 * would be a footgun.
 */
const canRenameActive = computed<boolean>(() => {
  if (isBuiltInActive.value) return false
  if (props.currentUsername === null) return false
  return current.value.owners.some(o => o.username === props.currentUsername)
})

const renameOpen = ref(false)
const renameDraft = ref('')

function openRename(): void {
  renameDraft.value = current.value.name
  renameOpen.value = true
}

function confirmRename(): void {
  const name = renameDraft.value.trim()
  if (!name) return
  emit('rename', name)
  renameOpen.value = false
}

function isCallerOwner(v: CorpOverviewView): boolean {
  return props.currentUsername !== null && v.owners.some(o => o.username === props.currentUsername)
}

const mineAndPinned = computed(() =>
  props.views
    .filter(v => isCallerOwner(v) || v.isPinned)
    .slice()
    .sort((a, b) => {
      // Pinned first, then by name.
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return a.name.localeCompare(b.name)
    })
)

/**
 * Display label for a view's owners: just the first two names with "+N more"
 * for the rest, so longer owner lists don't blow up the selector subtitle.
 * Empty owner sets fall back to "(no owners)" for ownerless views (e.g. the
 * built-in or any future orphaned-by-user-deletion case).
 */
function ownersLabel(v: CorpOverviewView): string {
  if (v.owners.length === 0) return '(no owners)'
  const names = v.owners.map(o => o.username)
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

function privacyIcon(p: FilterPrivacy): string {
  return p === 'public' ? 'mdi-earth' : p === 'unlisted' ? 'mdi-link' : 'mdi-lock'
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
