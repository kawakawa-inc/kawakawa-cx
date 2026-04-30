<template>
  <v-dialog v-model="open" max-width="780" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon start>mdi-magnify-scan</v-icon>
        <span>Material Breakdown:</span>
        <CommodityDisplay v-if="ticker" :ticker="ticker" />
        <v-spacer />
        <v-btn icon variant="text" size="small" @click="open = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-subtitle class="pb-1 text-caption text-medium-emphasis">
        Where these numbers come from. Production / consumption drill into user × planet. Stock is
        the corp-wide on-hand total — sum of every active member's FIO inventory across all
        storages.
      </v-card-subtitle>

      <v-divider />

      <v-card-text class="pa-0">
        <div v-if="loading" class="d-flex justify-center align-center pa-6">
          <v-progress-circular indeterminate size="24" />
        </div>

        <v-alert v-else-if="error" type="error" variant="tonal" density="compact" class="ma-4">
          {{ error }}
        </v-alert>

        <template v-else-if="breakdown">
          <v-list density="compact" class="py-0">
            <!-- Production -->
            <v-list-group value="production">
              <template #activator="{ props: activatorProps }">
                <v-list-item v-bind="activatorProps">
                  <template #prepend>
                    <v-icon color="success">mdi-arrow-up-bold</v-icon>
                  </template>
                  <v-list-item-title class="font-weight-medium">Production</v-list-item-title>
                  <template #append>
                    <span class="text-success font-weight-medium">
                      {{ formatNumber(breakdown.productionDaily) }} /d
                    </span>
                  </template>
                </v-list-item>
              </template>

              <template v-if="producers.length === 0">
                <v-list-item class="pl-8">
                  <v-list-item-subtitle class="text-medium-emphasis">
                    No producers among included members.
                  </v-list-item-subtitle>
                </v-list-item>
              </template>
              <template v-else>
                <v-list-group
                  v-for="user in producers"
                  :key="`prod-${user.userId}`"
                  :value="`prod-${user.userId}`"
                  sub-group
                >
                  <template #activator="{ props: userProps }">
                    <v-list-item v-bind="userProps" class="pl-8">
                      <v-list-item-title>{{ user.username }}</v-list-item-title>
                      <template #append>
                        <span class="text-success">
                          {{ formatNumber(user.productionDaily) }} /d
                        </span>
                      </template>
                    </v-list-item>
                  </template>

                  <v-list-item
                    v-for="planet in user.perPlanet.filter(p => p.productionDaily > 0)"
                    :key="`prod-${user.userId}-${planet.planetNaturalId}`"
                    class="pl-12"
                  >
                    <v-list-item-title class="text-body-2">
                      <v-icon size="x-small" class="mr-1">mdi-earth</v-icon>
                      {{ planet.planetName }}
                      <span class="text-medium-emphasis">({{ planet.planetNaturalId }})</span>
                    </v-list-item-title>
                    <template #append>
                      <span class="text-body-2 text-success">
                        {{ formatNumber(planet.productionDaily) }} /d
                      </span>
                    </template>
                  </v-list-item>
                </v-list-group>
              </template>
            </v-list-group>

            <v-divider />

            <!-- Consumption -->
            <v-list-group value="consumption">
              <template #activator="{ props: activatorProps }">
                <v-list-item v-bind="activatorProps">
                  <template #prepend>
                    <v-icon color="error">mdi-arrow-down-bold</v-icon>
                  </template>
                  <v-list-item-title class="font-weight-medium">
                    Consumption
                    <span class="text-caption text-medium-emphasis ml-2">
                      (workforce burn + production inputs)
                    </span>
                  </v-list-item-title>
                  <template #append>
                    <span class="text-error font-weight-medium">
                      {{ formatNumber(breakdown.consumptionDaily) }} /d
                    </span>
                  </template>
                </v-list-item>
              </template>

              <template v-if="consumers.length === 0">
                <v-list-item class="pl-8">
                  <v-list-item-subtitle class="text-medium-emphasis">
                    No consumers among included members.
                  </v-list-item-subtitle>
                </v-list-item>
              </template>
              <template v-else>
                <v-list-group
                  v-for="user in consumers"
                  :key="`cons-${user.userId}`"
                  :value="`cons-${user.userId}`"
                  sub-group
                >
                  <template #activator="{ props: userProps }">
                    <v-list-item v-bind="userProps" class="pl-8">
                      <v-list-item-title>
                        {{ user.username }}
                        <span class="text-caption text-medium-emphasis ml-2">
                          burn {{ formatNumber(user.burnDaily) }} · inputs
                          {{ formatNumber(user.inputsDaily) }}
                        </span>
                      </v-list-item-title>
                      <template #append>
                        <span class="text-error">
                          {{ formatNumber(user.burnDaily + user.inputsDaily) }} /d
                        </span>
                      </template>
                    </v-list-item>
                  </template>

                  <v-list-item
                    v-for="planet in user.perPlanet.filter(p => p.burnDaily + p.inputsDaily > 0)"
                    :key="`cons-${user.userId}-${planet.planetNaturalId}`"
                    class="pl-12"
                  >
                    <v-list-item-title class="text-body-2">
                      <v-icon size="x-small" class="mr-1">mdi-earth</v-icon>
                      {{ planet.planetName }}
                      <span class="text-medium-emphasis">({{ planet.planetNaturalId }})</span>
                      <span class="text-caption text-medium-emphasis ml-2">
                        burn {{ formatNumber(planet.burnDaily) }} · inputs
                        {{ formatNumber(planet.inputsDaily) }}
                      </span>
                    </v-list-item-title>
                    <template #append>
                      <span class="text-body-2 text-error">
                        {{ formatNumber(planet.burnDaily + planet.inputsDaily) }} /d
                      </span>
                    </template>
                  </v-list-item>
                </v-list-group>
              </template>
            </v-list-group>

            <v-divider />

            <!-- Stock (no drill-down for now) -->
            <v-list-item>
              <template #prepend>
                <v-icon color="info">mdi-warehouse</v-icon>
              </template>
              <v-list-item-title class="font-weight-medium">
                On-Hand Stock
                <span class="text-caption text-medium-emphasis ml-2">
                  (corp-wide FIO inventory · per-user breakdown TBD)
                </span>
              </v-list-item-title>
              <template #append>
                <span class="font-weight-medium">
                  {{ formatNumber(stockAggregate) }}
                </span>
              </template>
            </v-list-item>
          </v-list>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BurnRepairCorpMaterialBreakdown } from '@kawakawa/types'
import { api } from '../../services/api'
import CommodityDisplay from '../CommodityDisplay.vue'
import { formatNumber } from '../../utils/burnRepairFormat'

const props = defineProps<{
  modelValue: boolean
  /** Ticker to inspect. Empty string is treated as "not yet selected". */
  ticker: string
  /** Local exclusion working copy from the corp panel — keeps numbers in sync. */
  excludedUserIds: number[]
  /**
   * Aggregate stock for the ticker. Sourced from the same `availableSurplus`
   * map the corp panel already has, so we don't refetch it.
   */
  stockAggregate: number
}>()

const emit = defineEmits<(e: 'update:modelValue', v: boolean) => void>()

const open = computed<boolean>({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const loading = ref(false)
const error = ref<string | null>(null)
const breakdown = ref<BurnRepairCorpMaterialBreakdown | null>(null)

/**
 * Refetch every time either the ticker changes OR the modal is reopened. The
 * modal is shared across rows so leaving stale data from a previous click
 * would mislead the user. We also clear the previous result before showing
 * the spinner so the old totals aren't visible mid-flight.
 */
watch(
  () => [props.modelValue, props.ticker, props.excludedUserIds.join(',')] as const,
  async ([isOpen, ticker]) => {
    if (!isOpen || !ticker) return
    loading.value = true
    error.value = null
    breakdown.value = null
    try {
      breakdown.value = await api.burnRepair.corpMaterialBreakdown(ticker, props.excludedUserIds)
    } catch (e) {
      error.value = (e as Error).message || 'Failed to load breakdown'
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

/**
 * Hide non-contributing users from each section so the lists don't pad out
 * with zero-row producers/consumers. Server already drops all-zero rows, but
 * a user can still appear in `perUser` because they consume *and* don't
 * produce — for the production list we still want to filter them out.
 */
const producers = computed(() =>
  (breakdown.value?.perUser ?? []).filter(u => u.productionDaily > 0)
)
const consumers = computed(() =>
  (breakdown.value?.perUser ?? []).filter(u => u.burnDaily + u.inputsDaily > 0)
)
</script>
