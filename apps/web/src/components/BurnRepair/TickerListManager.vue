<template>
  <v-expansion-panels v-model="expanded" variant="accordion" class="mb-3">
    <v-expansion-panel>
      <v-expansion-panel-title>
        <div class="d-flex align-center ga-2">
          <v-icon size="small">mdi-tune</v-icon>
          <span>Manage {{ label }} tickers</span>
          <v-chip size="x-small" variant="tonal">{{ modelValue.length }}</v-chip>
          <v-chip v-if="readOnly" size="x-small" variant="tonal" color="warning">
            Admin only
          </v-chip>
        </div>
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <template v-if="readOnly">
          <div v-if="modelValue.length === 0" class="text-caption text-medium-emphasis">
            No tickers configured.
          </div>
          <div v-else class="d-flex flex-wrap ga-1">
            <v-chip v-for="ticker in modelValue" :key="ticker" size="small" variant="tonal">
              {{ ticker }}
            </v-chip>
          </div>
        </template>

        <template v-else>
          <v-row dense align="center">
            <v-col cols="12" md="8">
              <KeyValueAutocomplete
                :model-value="modelValue"
                :items="commodityItems"
                :label="`Tickers on ${label}`"
                density="compact"
                hide-details
                multiple
                clearable
                @update:model-value="v => onTickerChange(normalizeMulti(v))"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-menu>
                <template #activator="{ props: menuProps }">
                  <v-btn
                    v-bind="menuProps"
                    variant="outlined"
                    block
                    height="40"
                    prepend-icon="mdi-plus-box-multiple"
                    append-icon="mdi-menu-down"
                  >
                    Add category
                  </v-btn>
                </template>
                <v-list density="compact" max-height="420">
                  <v-list-item
                    v-for="cat in categories"
                    :key="cat"
                    :title="cat"
                    @click="addCategory(cat)"
                  />
                  <v-list-item
                    v-if="categories.length === 0"
                    title="No categories available"
                    disabled
                  />
                </v-list>
              </v-menu>
            </v-col>
          </v-row>
        </template>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../KeyValueAutocomplete.vue'
import { commodityService } from '../../services/commodityService'
import type { Commodity } from '../../types'

const props = defineProps<{
  label: string
  modelValue: string[]
  readOnly: boolean
}>()

const emit = defineEmits<(e: 'update:modelValue', value: string[]) => void>()

const expanded = ref<number | null>(null)
const commodities = ref<Commodity[]>([])

onMounted(async () => {
  commodities.value = commodityService.getAllCommoditiesSync()
  if (commodities.value.length === 0) {
    commodities.value = await commodityService.getAllCommodities()
  }
})

const commodityItems = computed<KeyValueItem[]>(() =>
  commodities.value.map(c => ({
    key: c.ticker,
    display: c.name ? `${c.ticker} — ${c.name}` : c.ticker,
    name: c.name,
    category: c.category,
  }))
)

const categories = computed<string[]>(() => {
  const set = new Set<string>()
  for (const c of commodities.value) if (c.category) set.add(c.category)
  return Array.from(set).sort()
})

function normalizeMulti(v: string | string[] | null): string[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function onTickerChange(next: string[]): void {
  // Dedupe and keep stable order by ticker
  const deduped = Array.from(new Set(next)).sort()
  emit('update:modelValue', deduped)
}

function addCategory(category: string): void {
  const inCategory = commodities.value.filter(c => c.category === category).map(c => c.ticker)
  const merged = Array.from(new Set([...props.modelValue, ...inCategory])).sort()
  emit('update:modelValue', merged)
}
</script>
