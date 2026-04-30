<template>
  <div class="card-pager d-flex align-center px-2 py-1">
    <v-select
      :model-value="pageSize"
      :items="pageSizeOptions"
      density="compact"
      variant="outlined"
      hide-details
      class="pager-page-size"
      @update:model-value="onPageSizeChange"
    />

    <v-spacer />

    <v-btn-group density="compact" variant="tonal" divided>
      <v-btn icon="mdi-chevron-left" :disabled="page <= 1" @click="emit('update:page', page - 1)" />
      <!-- Middle "label" button shares the group's bordering so left/right
           controls visually connect through it. tabindex="-1" + pointer-events
           keep it from being focusable or clickable — it's purely a readout. -->
      <v-btn tabindex="-1" class="pager-label">{{ page }} of {{ totalPages }}</v-btn>
      <v-btn
        icon="mdi-chevron-right"
        :disabled="page >= totalPages"
        @click="emit('update:page', page + 1)"
      />
    </v-btn-group>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Compact pagination footer for dashboard cards. Vuetify's default v-data-table
 * footer is too tall (~52px); this one fits in ~32px and exposes a
 * page-size dropdown alongside the prev/next nav.
 *
 * The component is presentational — page + pageSize live in pageState higher
 * up so they survive reloads. Selecting a new pageSize snaps `page` back to
 * 1 to avoid landing on a stale page beyond the new bounds.
 */
const props = defineProps<{
  total: number
  pageSize: number
  page: number
}>()

const emit = defineEmits<{
  (e: 'update:pageSize', v: number): void
  (e: 'update:page', v: number): void
}>()

const pageSizeOptions = [5, 10, 25, 50]

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

function onPageSizeChange(v: number): void {
  emit('update:pageSize', v)
  // Reset to page 1 — picking a larger size on page 5 would otherwise land
  // the user on an empty view.
  if (props.page !== 1) emit('update:page', 1)
}
</script>

<style scoped>
.card-pager {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 32px;
}

/* Make the page-size select sit flush — Vuetify's plain variant still has
   default vertical padding that pushes the row taller than we want. */
.pager-page-size {
  max-width: 64px;
  flex: 0 0 auto;
}
.pager-page-size :deep(.v-field__input) {
  padding: 0 4px;
  min-height: 28px;
}
.pager-page-size :deep(.v-field__append-inner) {
  padding-top: 0;
}

/* The middle "X of Y" reads as part of the group but isn't a real button —
   neutralize the hover/focus affordances so it looks more like an inline
   label sandwiched between the two nav buttons. */
.pager-label {
  pointer-events: none;
  cursor: default;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}
</style>
