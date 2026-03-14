<template>
  <div class="d-flex align-center flex-wrap ga-2">
    <span class="text-caption text-medium-emphasis mr-1">Pinned:</span>
    <v-chip
      v-for="filter in pinnedFilters"
      :key="filter.id"
      size="small"
      color="purple"
      variant="tonal"
      prepend-icon="mdi-pin"
      class="cursor-pointer"
      @click="$emit('apply', filter)"
    >
      {{ filter.name }}
    </v-chip>
  </div>
</template>

<script setup lang="ts">
import type { SavedMarketFilter } from '@kawakawa/types'

interface Props {
  pinnedFilters: SavedMarketFilter[]
}

defineProps<Props>()

defineEmits<{
  (e: 'apply', filter: SavedMarketFilter): void
}>()
</script>
