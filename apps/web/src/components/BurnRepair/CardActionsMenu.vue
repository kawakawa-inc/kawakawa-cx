<template>
  <!-- Table cards: ⋯ opens a popover with the structural config form (groupBy /
       columns / limit) followed by Rename / Duplicate / Delete actions. Folds
       the legacy Configure button + ⋯ menu into a single trigger. -->
  <v-menu v-if="card.type === 'table'" :close-on-content-click="false" location="bottom end">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        icon="mdi-dots-vertical"
        size="small"
        variant="text"
        :aria-label="`Card menu for ${card.name}`"
      />
    </template>
    <v-card width="540">
      <v-card-text class="pa-3">
        <!-- Group by -->
        <div class="text-caption text-medium-emphasis mb-1">
          Group by — controls which metrics are available and how rows are aggregated.
        </div>
        <v-select
          :model-value="card.groupBy"
          :items="GROUP_BY_OPTIONS"
          item-title="title"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-3"
          @update:model-value="onGroupByChange"
        />

        <!-- Columns -->
        <div class="text-caption text-medium-emphasis mb-1">
          Columns — drag chips to reorder. Material is always the first column.
        </div>
        <DraggableMetricChips
          :model-value="card.columns"
          :available="columnMetricOptions"
          empty-hint="No columns yet — click Add column to pick metrics."
          @update:model-value="v => emit('patch', { columns: v })"
        />

        <!-- Row limit -->
        <div class="text-caption text-medium-emphasis mt-3 mb-1">Row limit (1–100)</div>
        <v-text-field
          :model-value="card.limit"
          type="number"
          min="1"
          max="100"
          density="compact"
          variant="outlined"
          hide-details
          @update:model-value="onLimitChange"
        />
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-2 flex-wrap ga-1">
        <v-btn
          size="small"
          variant="tonal"
          prepend-icon="mdi-chart-line"
          @click="emit('convert-to-graph')"
        >
          Convert to graph
        </v-btn>
        <v-spacer />
        <v-btn size="small" variant="text" prepend-icon="mdi-pencil" @click="emit('rename')">
          Rename
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-content-duplicate"
          @click="emit('duplicate')"
        >
          Duplicate
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          color="error"
          prepend-icon="mdi-delete"
          @click="emit('delete')"
        >
          Delete
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>

  <!-- Graph cards: ⋯ is a list menu — Configure opens the dedicated dialog
       (graph cards have 10+ fields, too dense for an inline form). -->
  <v-menu v-else location="bottom end">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        icon="mdi-dots-vertical"
        size="small"
        variant="text"
        :aria-label="`Card menu for ${card.name}`"
      />
    </template>
    <v-list density="compact" min-width="200">
      <v-list-item prepend-icon="mdi-tune" @click="emit('configure')">
        <v-list-item-title>Configure…</v-list-item-title>
      </v-list-item>
      <v-list-item prepend-icon="mdi-pencil" @click="emit('rename')">
        <v-list-item-title>Rename</v-list-item-title>
      </v-list-item>
      <v-list-item prepend-icon="mdi-content-duplicate" @click="emit('duplicate')">
        <v-list-item-title>Duplicate</v-list-item-title>
      </v-list-item>
      <v-divider class="my-1" />
      <v-list-item prepend-icon="mdi-delete" base-color="error" @click="emit('delete')">
        <v-list-item-title>Delete</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CorpMetricGroupBy, MetricKey, ViewCard } from '@kawakawa/types'
import { CORP_METRIC_DEFS, isMetricValidFor } from '@kawakawa/types'
import DraggableMetricChips from './DraggableMetricChips.vue'

/**
 * Unified per-card menu. Replaces the standalone Configure button plus the
 * legacy actions-only ⋯ menu. Table cards expose the structural config form
 * inline; graph cards keep their dedicated dialog (the `configure` event
 * routes back to the dashboard / panel).
 */
const props = defineProps<{
  card: ViewCard
}>()

const emit = defineEmits<{
  /** Apply a partial card patch — table cards only. */
  (e: 'patch', patch: Partial<ViewCard>): void
  /** Convert a table card to a graph card. */
  (e: 'convert-to-graph'): void
  /** Open the graph-card configuration dialog. */
  (e: 'configure'): void
  (e: 'rename'): void
  (e: 'duplicate'): void
  (e: 'delete'): void
}>()

const GROUP_BY_OPTIONS: Array<{ title: string; value: CorpMetricGroupBy }> = [
  { title: 'Corporate aggregate (one row per ticker)', value: 'ticker' },
  { title: 'Per user (one row per user × ticker)', value: 'user-ticker' },
]

const columnMetricOptions = computed<Array<{ title: string; value: MetricKey }>>(() =>
  Object.values(CORP_METRIC_DEFS)
    .filter(d => isMetricValidFor(d.key, props.card.groupBy))
    .map(d => ({ title: d.label, value: d.key }))
)

function onGroupByChange(next: CorpMetricGroupBy): void {
  // Trim columns / filters / sort that aren't valid under the new groupBy so
  // the patch arrives self-consistent. The dirty diff and row computation both
  // expect every entry to round-trip the type validator.
  const validColumn = (k: MetricKey): boolean => isMetricValidFor(k, next)
  const validForFilter = (k: MetricKey): boolean => {
    const def = CORP_METRIC_DEFS[k]
    return !!def && def.groupings.includes(next) && def.format !== 'text'
  }
  emit('patch', {
    groupBy: next,
    columns: props.card.columns.filter(validColumn),
    filters: props.card.filters.filter(f => validForFilter(f.metric)),
    sortBy: props.card.sortBy.filter(s => validColumn(s.metric)),
  })
}

function onLimitChange(raw: unknown): void {
  const n = Math.max(1, Math.min(100, Number(raw) || 1))
  emit('patch', { limit: n })
}
</script>
