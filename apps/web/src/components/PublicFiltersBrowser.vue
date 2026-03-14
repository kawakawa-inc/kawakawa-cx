<template>
  <v-dialog
    :model-value="modelValue"
    max-width="560"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start color="green">mdi-earth</v-icon>
        Browse Public Filters
      </v-card-title>

      <v-card-text class="pt-2">
        <v-text-field
          v-model="searchText"
          density="compact"
          prepend-inner-icon="mdi-magnify"
          placeholder="Search by name..."
          clearable
          hide-details
          class="mb-3"
        />

        <div v-if="loading" class="d-flex justify-center py-4">
          <v-progress-circular indeterminate />
        </div>

        <div v-else-if="filters.length === 0" class="text-center py-4 text-medium-emphasis">
          {{ searchText ? 'No filters match your search.' : 'No public filters available yet.' }}
        </div>

        <v-list v-else density="compact">
          <v-list-item v-for="filter in filters" :key="filter.id" class="pr-2 mb-1 rounded" rounded>
            <v-list-item-title class="text-body-2 font-weight-medium">
              {{ filter.name }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              by {{ filter.userName }} &middot; {{ describeFilter(filter) }}
            </v-list-item-subtitle>

            <template #append>
              <div class="d-flex ga-1">
                <v-btn size="x-small" variant="tonal" color="primary" @click="apply(filter)">
                  Apply
                </v-btn>
                <v-btn
                  size="x-small"
                  variant="text"
                  color="grey"
                  @click="$emit('copy-link', filter.id)"
                >
                  Link
                </v-btn>
                <v-btn size="x-small" variant="text" color="grey" @click="saveCopy(filter)">
                  Save Copy
                </v-btn>
              </div>
            </template>
          </v-list-item>
        </v-list>

        <!-- Load more -->
        <div v-if="hasMore" class="text-center mt-2">
          <v-btn variant="text" size="small" :loading="loadingMore" @click="loadMore">
            Load more
          </v-btn>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Save copy dialog -->
  <SaveFilterDialog
    v-if="copyTarget"
    v-model="showCopyDialog"
    :filter-data="copyTarget.filterData"
    @saved="onCopySaved"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SavedMarketFilter } from '@kawakawa/types'
import { api } from '../services/api'
import SaveFilterDialog from './SaveFilterDialog.vue'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'apply', filter: SavedMarketFilter): void
  (e: 'copy-link', id: number): void
}>()

const filters = ref<SavedMarketFilter[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const currentPage = ref(1)
const searchText = ref('')

const copyTarget = ref<SavedMarketFilter | null>(null)
const showCopyDialog = ref(false)

const PAGE_SIZE = 20

const describeFilter = (filter: SavedMarketFilter): string => {
  const parts: string[] = []
  const fd = filter.filterData
  if (fd.itemType) parts.push(fd.itemType === 'sell' ? 'Sell' : 'Buy')
  if (fd.commodity?.length) parts.push(`${fd.commodity.length} commodity`)
  if (fd.location?.length) parts.push(`${fd.location.length} location`)
  if (fd.category) parts.push(fd.category)
  if (fd.orderType) parts.push(fd.orderType)
  return parts.join(', ') || 'All orders'
}

const loadFilters = async (page = 1, append = false) => {
  if (page === 1) loading.value = true
  else loadingMore.value = true

  try {
    const results = await api.savedFilters.browse(searchText.value || undefined, page)
    if (append) {
      filters.value.push(...results)
    } else {
      filters.value = results
    }
    hasMore.value = results.length === PAGE_SIZE
    currentPage.value = page
  } catch {
    // Silently ignore
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const loadMore = () => {
  loadFilters(currentPage.value + 1, true)
}

// Search with debounce
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchText, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadFilters(1, false), 300)
})

// Load when dialog opens
watch(
  () => props.modelValue,
  open => {
    if (open) {
      searchText.value = ''
      loadFilters(1, false)
    }
  }
)

const apply = (filter: SavedMarketFilter) => {
  emit('apply', filter)
  emit('update:modelValue', false)
}

const saveCopy = (filter: SavedMarketFilter) => {
  copyTarget.value = filter
  showCopyDialog.value = true
}

const onCopySaved = () => {
  copyTarget.value = null
}
</script>
