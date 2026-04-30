<template>
  <div class="d-flex flex-wrap align-center ga-1 mt-2">
    <VueDraggable
      v-if="modelValue.length > 0"
      v-model="orderedKeys"
      :animation="180"
      handle=".drag-handle"
      class="d-flex flex-wrap ga-1"
    >
      <v-chip
        v-for="key in orderedKeys"
        :key="key"
        size="small"
        variant="tonal"
        closable
        @click:close="remove(key)"
      >
        <v-icon start size="x-small" class="drag-handle" aria-label="Drag to reorder">
          mdi-drag-vertical
        </v-icon>
        {{ labelFor(key) }}
      </v-chip>
    </VueDraggable>

    <span v-else class="text-caption text-medium-emphasis ml-1">
      {{ emptyHint ?? 'No columns selected.' }}
    </span>

    <v-menu :close-on-content-click="false" location="bottom start">
      <template #activator="{ props: btnProps }">
        <v-btn
          v-bind="btnProps"
          size="small"
          variant="tonal"
          prepend-icon="mdi-plus"
          :disabled="addableOptions.length === 0"
        >
          {{ addLabel ?? 'Add column' }}
        </v-btn>
      </template>
      <v-list density="compact" max-height="360" min-width="220">
        <template v-if="addableOptions.length === 0">
          <v-list-item>
            <v-list-item-title class="text-caption text-medium-emphasis">
              All available columns are already in the list.
            </v-list-item-title>
          </v-list-item>
        </template>
        <template v-else>
          <v-list-item v-for="opt in addableOptions" :key="opt.value" @click="add(opt.value)">
            <v-list-item-title>{{ opt.title }}</v-list-item-title>
          </v-list-item>
        </template>
      </v-list>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { MetricKey } from '@kawakawa/types'
import { CORP_METRIC_DEFS } from '@kawakawa/types'

/**
 * Self-contained column picker: a draggable chip strip plus an "Add" button
 * that opens a flyout listing available metrics. Used by the card editor and
 * the view-edit dialog so users can pick, drop, and reorder columns without
 * the dropdown autocomplete sprawling across the dialog.
 *
 * The parent owns the order array — drag and add both write back through
 * `update:modelValue`.
 */
interface Option {
  /** Display label for the chip + flyout entry. Matches Vuetify's `title` convention. */
  title: string
  value: MetricKey
}

const props = defineProps<{
  modelValue: MetricKey[]
  /** Every column the picker is allowed to offer, in dropdown order. */
  available: Option[]
  /** Optional placeholder text when nothing is selected. */
  emptyHint?: string
  /** Optional label for the add button (e.g. "Add metric"). */
  addLabel?: string
}>()

const emit = defineEmits<(e: 'update:modelValue', v: MetricKey[]) => void>()

const orderedKeys = computed<MetricKey[]>({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

/**
 * Options the user hasn't picked yet. The flyout filters down to these so we
 * don't offer duplicates; once everything is added, the menu collapses to an
 * informational row and the button itself is disabled.
 */
const addableOptions = computed<Option[]>(() => {
  const picked = new Set<MetricKey>(props.modelValue)
  return props.available.filter(o => !picked.has(o.value))
})

function labelFor(key: MetricKey): string {
  // Prefer the caller-supplied label so a renamed view metric still reads
  // right; fall back to the registry, then the raw key.
  const fromAvailable = props.available.find(o => o.value === key)?.title
  return fromAvailable ?? CORP_METRIC_DEFS[key]?.label ?? key
}

function remove(key: MetricKey): void {
  emit(
    'update:modelValue',
    props.modelValue.filter(k => k !== key)
  )
}

function add(key: MetricKey): void {
  if (props.modelValue.includes(key)) return
  emit('update:modelValue', [...props.modelValue, key])
}
</script>

<style scoped>
.drag-handle {
  cursor: grab;
}
.drag-handle:active {
  cursor: grabbing;
}
</style>
