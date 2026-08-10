<template>
  <!--
    When the last sync failed, the error replaces the statistics entirely.
    Showing both would be actively misleading: the numbers are from whenever
    the last *successful* sync was, so presenting them next to a failure
    invites the user to trust stale data.
  -->
  <v-alert
    v-if="error"
    :type="error.userActionable ? 'warning' : 'error'"
    variant="tonal"
    density="comfortable"
    :icon="error.userActionable ? 'mdi-alert-circle' : 'mdi-cloud-alert'"
  >
    <v-alert-title class="text-body-1">{{ error.title }}</v-alert-title>
    <div class="text-body-2 mt-1">{{ error.detail }}</div>

    <div class="text-caption text-medium-emphasis mt-2">
      {{ describeJobType(error.jobType) }} failed {{ formatRelativeTime(error.failedAt) }}
    </div>

    <div class="d-flex align-center flex-wrap ga-2 mt-3">
      <v-btn
        v-if="error.userActionable && showFixAction"
        size="small"
        color="warning"
        variant="flat"
        to="/account?tab=fio"
        prepend-icon="mdi-cog"
      >
        Fix FIO settings
      </v-btn>
      <!--
        The raw FIO message is diagnostic noise for most members, but it's the
        only thing that helps when the code is 'unknown'. Kept behind a toggle
        rather than dropped.
      -->
      <v-btn
        v-if="error.rawMessage"
        size="small"
        variant="text"
        :append-icon="showDetails ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        @click="showDetails = !showDetails"
      >
        {{ showDetails ? 'Hide' : 'Show' }} details
      </v-btn>
    </div>

    <v-expand-transition>
      <pre v-if="showDetails && error.rawMessage" class="fio-error-raw mt-2">{{
        error.rawMessage
      }}</pre>
    </v-expand-transition>
  </v-alert>

  <template v-else-if="stats">
    <div class="d-flex flex-wrap ga-6 mb-4 justify-center">
      <div v-for="metric in metrics" :key="metric.label" class="text-center">
        <div class="text-h5 font-weight-bold">{{ metric.value }}</div>
        <div class="text-caption text-medium-emphasis">{{ metric.label }}</div>
      </div>
    </div>

    <div class="d-flex flex-wrap ga-4 justify-center">
      <div v-for="upload in uploads" :key="upload.label" class="d-flex align-center">
        <v-icon class="mr-2" size="small" :color="upload.age.color">
          {{ upload.age.icon }}
        </v-icon>
        <div class="text-body-2">{{ upload.label }}: {{ formatDateTime(upload.at) }}</div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
/**
 * FIO statistics, or the current FIO error in their place.
 *
 * Shared by the inventory sync card and the account FIO tab, which previously
 * carried byte-identical copies of this markup.
 */
import { computed, ref } from 'vue'
import type { FioSyncError } from '@kawakawa/types'
import type { FioStatsResponse } from '../services/api'
import { useFormatters } from '../composables'
import { getDataAgeInfo } from '../utils/dateFormat'

const props = withDefaults(
  defineProps<{
    stats: FioStatsResponse | null
    error?: FioSyncError | null
    /** Hide the "Fix FIO settings" link when already on the FIO settings page. */
    showFixAction?: boolean
  }>(),
  { error: null, showFixAction: true }
)

const { formatDateTime, formatRelativeTime, formatNumber } = useFormatters()

const showDetails = ref(false)

const metrics = computed(() => {
  const s = props.stats
  if (!s) return []
  return [
    { label: 'Items', value: formatNumber(s.totalItems) },
    { label: 'Quantity', value: formatNumber(s.totalQuantity) },
    { label: 'Commodities', value: formatNumber(s.uniqueCommodities) },
    { label: 'Locations', value: formatNumber(s.storageLocations) },
  ]
})

const uploads = computed(() => {
  const s = props.stats
  if (!s) return []
  return [
    { label: 'Oldest', at: s.oldestFioUploadTime, age: getDataAgeInfo(s.oldestFioUploadTime) },
    { label: 'Newest', at: s.newestFioUploadTime, age: getDataAgeInfo(s.newestFioUploadTime) },
  ]
})

/** Job type → the wording members see. Mirrors describeJob() in the worker. */
function describeJobType(jobType: string): string {
  switch (jobType) {
    case 'user-inventory':
      return 'Inventory sync'
    case 'user-planets-list':
      return 'Planet sync'
    case 'user-ships':
      return 'Ship sync'
    default:
      return 'Sync'
  }
}
</script>

<style scoped>
.fio-error-raw {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.75rem;
  opacity: 0.8;
  margin: 0;
}
</style>
