<template>
  <v-menu
    v-model="menuOpen"
    location="bottom start"
    :close-on-content-click="false"
    max-width="420"
  >
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        variant="text"
        size="small"
        prepend-icon="mdi-bookmark-multiple-outline"
      >
        Saved
      </v-btn>
    </template>

    <v-card min-width="360">
      <v-card-title class="d-flex align-center justify-space-between py-2 px-4">
        <span class="text-subtitle-1">Saved Filters</span>
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-bookmark-plus"
          @click="openSaveDialog"
        >
          Save Current
        </v-btn>
      </v-card-title>

      <v-divider />

      <div class="filter-list">
        <!-- Loading state -->
        <div v-if="loading" class="d-flex justify-center pa-4">
          <v-progress-circular indeterminate size="24" />
        </div>

        <!-- Empty state -->
        <div
          v-else-if="filters.length === 0"
          class="text-center pa-4 text-medium-emphasis text-body-2"
        >
          No saved filters yet. Save your current filter setup to get started.
        </div>

        <!-- Filter list -->
        <v-list v-else density="compact" class="py-0">
          <v-list-item v-for="filter in filters" :key="filter.id" class="pr-2">
            <template #prepend>
              <v-icon size="small" class="mr-1" :color="getPrivacyColor(filter.privacy)">
                {{ getPrivacyIcon(filter.privacy) }}
              </v-icon>
            </template>

            <v-list-item-title class="text-body-2">{{ filter.name }}</v-list-item-title>
            <v-list-item-subtitle v-if="filter.userName !== currentUsername" class="text-caption">
              by {{ filter.userName }}
            </v-list-item-subtitle>

            <template #append>
              <div class="d-flex ga-1 align-center">
                <v-chip v-if="filter.isPinned" size="x-small" color="purple" variant="tonal">
                  pinned
                </v-chip>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="primary"
                  title="Apply filter"
                  @click="applyFilter(filter)"
                >
                  Apply
                </v-btn>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="grey"
                  icon="mdi-link-variant"
                  title="Copy shareable link"
                  @click="$emit('copy-link', filter.id)"
                />
                <!-- Owner-only actions -->
                <template v-if="filter.userName === currentUsername">
                  <v-btn
                    size="x-small"
                    variant="text"
                    color="grey"
                    icon="mdi-pencil"
                    title="Edit"
                    @click="editFilter(filter)"
                  />
                  <v-btn
                    size="x-small"
                    variant="text"
                    color="error"
                    icon="mdi-delete"
                    title="Delete"
                    @click="deleteFilter(filter)"
                  />
                </template>
                <!-- Admin pin toggle -->
                <v-btn
                  v-if="canPin && filter.privacy === 'public'"
                  size="x-small"
                  variant="text"
                  :color="filter.isPinned ? 'purple' : 'grey'"
                  :icon="filter.isPinned ? 'mdi-pin' : 'mdi-pin-outline'"
                  :title="filter.isPinned ? 'Unpin' : 'Pin globally'"
                  @click="togglePin(filter)"
                />
              </div>
            </template>
          </v-list-item>
        </v-list>
      </div>
    </v-card>
  </v-menu>

  <!-- Edit dialog (reuses SaveFilterDialog) -->
  <SaveFilterDialog
    v-model="showEditDialog"
    :filter-data="currentFilterData"
    :existing-filter="editingFilter"
    @saved="onSaved"
  />

  <!-- Delete confirmation -->
  <ConfirmationDialog
    v-model="showDeleteDialog"
    title="Delete Saved Filter"
    :loading="deleting"
    confirm-text="Delete"
    confirm-color="error"
    @confirm="confirmDelete"
  >
    Delete <strong>{{ deletingFilter?.name }}</strong
    >? This cannot be undone.
  </ConfirmationDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { SavedMarketFilter, SavedFilterData } from '@kawakawa/types'
import { api } from '../services/api'
import { useUserStore } from '../stores/user'
import SaveFilterDialog from './SaveFilterDialog.vue'
import ConfirmationDialog from './ConfirmationDialog.vue'

interface Props {
  currentFilterData: SavedFilterData
  canPin?: boolean
}

withDefaults(defineProps<Props>(), {
  canPin: false,
})

const emit = defineEmits<{
  (e: 'apply', filter: SavedMarketFilter): void
  (e: 'copy-link', id: number): void
  (e: 'saved', filter: SavedMarketFilter): void
}>()

const userStore = useUserStore()
const currentUsername = computed(() => userStore.getUser()?.username ?? '')

const menuOpen = ref(false)
const loading = ref(false)
const filters = ref<SavedMarketFilter[]>([])

const showEditDialog = ref(false)
const editingFilter = ref<SavedMarketFilter | null>(null)

const showDeleteDialog = ref(false)
const deletingFilter = ref<SavedMarketFilter | null>(null)
const deleting = ref(false)

const getPrivacyIcon = (privacy: string) => {
  if (privacy === 'private') return 'mdi-lock'
  if (privacy === 'link') return 'mdi-link-variant'
  return 'mdi-earth'
}

const getPrivacyColor = (privacy: string) => {
  if (privacy === 'private') return 'grey'
  if (privacy === 'link') return 'blue'
  return 'green'
}

const loadFilters = async () => {
  loading.value = true
  try {
    filters.value = await api.savedFilters.list()
  } catch {
    // Silently ignore load errors
  } finally {
    loading.value = false
  }
}

// Load when menu opens
watch(menuOpen, open => {
  if (open) loadFilters()
})

const applyFilter = (filter: SavedMarketFilter) => {
  emit('apply', filter)
  menuOpen.value = false
}

const openSaveDialog = () => {
  editingFilter.value = null
  showEditDialog.value = true
}

const editFilter = (filter: SavedMarketFilter) => {
  editingFilter.value = filter
  showEditDialog.value = true
}

const deleteFilter = (filter: SavedMarketFilter) => {
  deletingFilter.value = filter
  showDeleteDialog.value = true
}

const confirmDelete = async () => {
  if (!deletingFilter.value) return
  deleting.value = true
  try {
    await api.savedFilters.delete(deletingFilter.value.id)
    filters.value = filters.value.filter(f => f.id !== deletingFilter.value!.id)
    showDeleteDialog.value = false
  } catch {
    // Silently ignore
  } finally {
    deleting.value = false
  }
}

const togglePin = async (filter: SavedMarketFilter) => {
  try {
    const updated = await api.savedFilters.togglePin(filter.id)
    const idx = filters.value.findIndex(f => f.id === filter.id)
    if (idx !== -1) filters.value[idx] = updated
    emit('saved', updated) // Notify parent to refresh pinned bar
  } catch {
    // Silently ignore
  }
}

const onSaved = (saved: SavedMarketFilter) => {
  const idx = filters.value.findIndex(f => f.id === saved.id)
  if (idx !== -1) {
    filters.value[idx] = saved
  } else {
    filters.value.unshift(saved)
  }
  emit('saved', saved)
}
</script>

<style scoped>
.filter-list {
  max-height: 320px;
  overflow-y: auto;
}
</style>
