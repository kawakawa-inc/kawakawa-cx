<template>
  <v-menu v-model="menuOpen" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        size="small"
        variant="tonal"
        :color="totalCount > 0 ? 'primary' : undefined"
        class="filter-trigger"
      >
        <v-icon size="small" start>mdi-filter-variant</v-icon>
        <span v-if="totalCount === 0">Filters</span>
        <span v-else>{{ totalCount }} filter{{ totalCount === 1 ? '' : 's' }}</span>
      </v-btn>
    </template>

    <v-card class="card-filters-card">
      <div class="d-flex" style="height: 460px">
        <!-- ============ Left rail — filter categories ============ -->
        <v-list density="compact" nav class="pa-1 flex-shrink-0 left-rail">
          <v-list-item
            :active="activeTab === 'tickers'"
            color="primary"
            prepend-icon="mdi-package-variant"
            title="Tickers"
            rounded="lg"
            @click="activeTab = 'tickers'"
          >
            <template #append>
              <v-chip v-if="tickerCount > 0" size="x-small" color="primary" variant="tonal">
                {{ tickerCount }}
              </v-chip>
            </template>
          </v-list-item>
          <v-list-item
            :active="activeTab === 'categories'"
            color="teal"
            prepend-icon="mdi-folder-outline"
            title="Categories"
            rounded="lg"
            @click="activeTab = 'categories'"
          >
            <template #append>
              <v-chip v-if="categoryCount > 0" size="x-small" color="teal" variant="tonal">
                {{ categoryCount }}
              </v-chip>
            </template>
          </v-list-item>
          <template v-if="filters !== null && groupBy">
            <v-divider class="my-1" />
            <v-list-item
              :active="activeTab === 'metrics'"
              color="primary"
              prepend-icon="mdi-chart-line-variant"
              title="Metrics"
              rounded="lg"
              @click="activeTab = 'metrics'"
            >
              <template #append>
                <v-chip v-if="filters.length > 0" size="x-small" color="primary" variant="tonal">
                  {{ filters.length }}
                </v-chip>
              </template>
            </v-list-item>
          </template>
        </v-list>

        <v-divider vertical />

        <!-- ============ Right pane — picker for the active category ============ -->
        <div class="right-pane">
          <!-- Tickers picker — `TickerCategoryInput` is the project's chip-
               input search with proper ranking (exact ticker match wins, then
               prefix, then everything else). It also handles `category:`
               entries, so a user can add categories from this pane too — the
               Categories tab below still gives a browsable list view. -->
          <template v-if="activeTab === 'tickers'">
            <div class="pa-3">
              <div class="text-caption text-medium-emphasis mb-2">
                Type a ticker (e.g. <code>RAT</code>) or paste a list. Suggestions rank exact ticker
                matches first.
              </div>
              <TokenSearchInput
                :chips="tickerChips"
                :extra-suggestion-types="tickerCategorySuggestions"
                :allowed-suggestion-types="['commodity', 'category']"
                :chip-icon-by-type="tickerChipIcons"
                :help-tokens="tickerHelpTokens"
                :get-commodity-display="tickerDisplayForChip"
                leading-icon="mdi-tag-multiple"
                paste-split-to="commodity"
                enter-creates-type="commodity"
                placeholder="Add tickers or categories…"
                history-key="burn-repair"
                @update:chips="onTickerChipsUpdate"
              />
            </div>
          </template>

          <!-- Categories picker -->
          <template v-else-if="activeTab === 'categories'">
            <v-list density="compact" nav class="pa-1 right-list">
              <v-list-item
                v-for="cat in categoryEntries"
                :key="cat.name"
                :color="isCategoryActive(cat.name) ? 'teal' : undefined"
                rounded="lg"
                @click="toggleCategory(cat.name)"
              >
                <template #prepend>
                  <v-icon
                    :color="isCategoryActive(cat.name) ? 'teal' : 'teal-lighten-2'"
                    size="small"
                    class="mr-1"
                  >
                    {{ isCategoryActive(cat.name) ? 'mdi-check' : 'mdi-folder-outline' }}
                  </v-icon>
                </template>
                <v-list-item-title>{{ cat.name }}</v-list-item-title>
                <v-list-item-subtitle class="text-caption">
                  {{ cat.count }} ticker{{ cat.count === 1 ? '' : 's' }}
                </v-list-item-subtitle>
              </v-list-item>
              <v-list-item v-if="categoryEntries.length === 0">
                <v-list-item-title class="text-caption text-medium-emphasis">
                  Loading commodity catalog…
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </template>

          <!-- Metric filters editor (table cards only) -->
          <template v-else-if="activeTab === 'metrics' && filters !== null && groupBy">
            <div class="pa-3">
              <div class="text-caption text-medium-emphasis mb-2">
                Metric filters — AND-combined. Rows missing the metric fail every comparison.
              </div>
              <template v-if="filters.length === 0">
                <div class="text-caption text-disabled mb-2">No metric filters yet.</div>
              </template>
              <template v-else>
                <v-row
                  v-for="(filter, idx) in filters"
                  :key="`f-${idx}`"
                  dense
                  align="center"
                  class="mb-1"
                >
                  <v-col cols="6">
                    <v-select
                      :model-value="filter.metric"
                      :items="metricOptions"
                      label="Metric"
                      density="compact"
                      variant="outlined"
                      hide-details
                      @update:model-value="v => updateFilter(idx, { metric: v })"
                    />
                  </v-col>
                  <v-col cols="3">
                    <v-select
                      :model-value="filter.op"
                      :items="OP_OPTIONS"
                      label="Op"
                      density="compact"
                      variant="outlined"
                      hide-details
                      @update:model-value="v => updateFilter(idx, { op: v })"
                    />
                  </v-col>
                  <v-col cols="2">
                    <v-text-field
                      :model-value="filter.value"
                      type="number"
                      label="Value"
                      density="compact"
                      variant="outlined"
                      hide-details
                      @update:model-value="v => updateFilter(idx, { value: Number(v) || 0 })"
                    />
                  </v-col>
                  <v-col cols="1" class="text-right">
                    <v-btn
                      icon="mdi-close"
                      size="x-small"
                      variant="text"
                      color="error"
                      @click="removeFilter(idx)"
                    />
                  </v-col>
                </v-row>
              </template>
              <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-plus"
                class="mt-1"
                :disabled="metricOptions.length === 0"
                @click="addFilter"
              >
                Add metric filter
              </v-btn>
            </div>
          </template>
        </div>
      </div>

      <v-divider />
      <v-card-actions class="pa-2">
        <v-spacer />
        <v-btn
          v-if="totalCount > 0"
          size="small"
          variant="text"
          prepend-icon="mdi-close-circle-outline"
          @click="clearAll"
        >
          Clear all
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { CorpMetricGroupBy, MetricKey, ViewCardFilter } from '@kawakawa/types'
import { CORP_METRIC_DEFS, FILTER_OPERATORS, isMetricFilterable } from '@kawakawa/types'
import TokenSearchInput, {
  type SearchChip,
  type ExtraSuggestionType,
} from '../TokenSearchInput.vue'
import { commodityService } from '../../services/commodityService'
import { useSettingsStore } from '../../stores/settings'
import type { Commodity } from '../../types'
import {
  chipsToScopeEntries,
  makeCategoryEntry,
  parseScopeEntry,
  scopeEntriesToChips,
} from '../../utils/tickerScope'

/**
 * Card-level filter popover modeled on the Market `FilterMenu`: left rail
 * picks the filter category (Tickers / Categories / Metrics), right pane
 * shows the picker for that category. Replaces the previous stacked layout
 * and the autocomplete-only chip strip — users now see every option at once
 * and click to toggle membership.
 */
const props = defineProps<{
  /** Ticker / category scope (string[] of `TICKER` or `category:Foo` entries). */
  tickers: string[]
  /** Metric filters — pass `null` to hide the Metrics rail entirely. */
  filters: ViewCardFilter[] | null
  /** Restricts the metric picker; required when `filters` is non-null. */
  groupBy?: CorpMetricGroupBy
}>()

const emit = defineEmits<{
  (e: 'update:tickers', value: string[]): void
  (e: 'update:filters', value: ViewCardFilter[]): void
}>()

const menuOpen = ref(false)
const activeTab = ref<'tickers' | 'categories' | 'metrics'>('tickers')

// -------- Commodity catalog (drives both pickers) --------
const commodities = ref<Commodity[]>([])
onMounted(async () => {
  const cached = commodityService.getAllCommoditiesSync()
  commodities.value = cached.length > 0 ? cached : await commodityService.getAllCommodities()
})

// -------- TokenSearchInput wiring (string[] ↔ SearchChip[]) --------
const settingsStore = useSettingsStore()
const tickerDisplayForChip = (ticker: string): string =>
  commodityService.getCommodityDisplay(ticker, settingsStore.commodityDisplayMode.value)

const tickerCategorySuggestions = computed<ExtraSuggestionType[]>(() => [
  {
    type: 'category',
    typeLabel: 'Category',
    color: 'teal',
    options: categoryEntries.value.map(e => ({ value: e.name, display: e.name })),
  },
])

const tickerChipIcons = {
  category: 'mdi-folder-outline',
  commodity: 'mdi-package-variant',
} as const

const tickerHelpTokens = [
  {
    label: 'Ticker',
    color: 'primary',
    example: 'RAT',
    description: 'A single commodity ticker.',
    icon: 'mdi-package-variant',
  },
  {
    label: 'Category',
    color: 'teal',
    example: 'category:Consumables (basic)',
    description: 'Live reference — expands to every ticker in this category right now.',
    icon: 'mdi-folder-outline',
  },
]

const tickerChips = computed<SearchChip[]>(() =>
  scopeEntriesToChips(props.tickers, tickerDisplayForChip)
)
function onTickerChipsUpdate(chips: SearchChip[]): void {
  emit('update:tickers', chipsToScopeEntries(chips))
}

// -------- Categories picker --------
interface CategoryEntry {
  name: string
  count: number
}

const categoryEntries = computed<CategoryEntry[]>(() => {
  const counts = new Map<string, number>()
  for (const c of commodities.value) {
    if (!c.category) continue
    counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

function isCategoryActive(name: string): boolean {
  const target = name.toLowerCase()
  return props.tickers.some(raw => {
    const p = parseScopeEntry(raw)
    return p.kind === 'category' && p.value.toLowerCase() === target
  })
}

function toggleCategory(name: string): void {
  if (isCategoryActive(name)) {
    const target = name.toLowerCase()
    emit(
      'update:tickers',
      props.tickers.filter(raw => {
        const p = parseScopeEntry(raw)
        return !(p.kind === 'category' && p.value.toLowerCase() === target)
      })
    )
  } else {
    emit('update:tickers', [...props.tickers, makeCategoryEntry(name)])
  }
}

// -------- Counts for trigger / rail badges --------
const parsedTickers = computed(() => props.tickers.map(parseScopeEntry))

const tickerCount = computed(() => parsedTickers.value.filter(p => p.kind === 'ticker').length)
const categoryCount = computed(() => parsedTickers.value.filter(p => p.kind === 'category').length)

const totalCount = computed(() => props.tickers.length + (props.filters?.length ?? 0))

// -------- Metric filters editor (table cards only) --------
const OP_OPTIONS = FILTER_OPERATORS.map(op => ({ title: op, value: op }))

const metricOptions = computed<{ title: string; value: MetricKey }[]>(() =>
  Object.values(CORP_METRIC_DEFS)
    .filter(d => (props.groupBy ? isMetricFilterable(d.key, props.groupBy) : false))
    .map(d => ({ title: d.label, value: d.key }))
)

function defaultMetric(): MetricKey {
  return metricOptions.value[0]?.value ?? 'gap'
}

function addFilter(): void {
  if (!props.filters) return
  emit('update:filters', [...props.filters, { metric: defaultMetric(), op: '>', value: 0 }])
}

function updateFilter(idx: number, patch: Partial<ViewCardFilter>): void {
  if (!props.filters) return
  emit(
    'update:filters',
    props.filters.map((f, i) => (i === idx ? { ...f, ...patch } : f))
  )
}

function removeFilter(idx: number): void {
  if (!props.filters) return
  emit(
    'update:filters',
    props.filters.filter((_, i) => i !== idx)
  )
}

function clearAll(): void {
  emit('update:tickers', [])
  if (props.filters) emit('update:filters', [])
}
</script>

<style scoped>
.filter-trigger {
  text-transform: none;
  letter-spacing: 0;
}

.card-filters-card {
  width: 620px;
}

.left-rail {
  width: 200px;
  overflow-y: auto;
}

.right-pane {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.right-list {
  flex: 1 1 auto;
  overflow-y: auto;
}
</style>
