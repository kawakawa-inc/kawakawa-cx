<template>
  <v-card class="mb-4">
    <v-card-text>
      <v-row align="center">
        <v-col cols="12" md="6">
          <div class="text-body-2 d-flex align-center flex-wrap ga-2">
            <template v-if="lastSync.lastSyncedAt">
              <strong>Last FIO Sync:</strong>
              <v-tooltip location="top" :text="formatDateTime(lastSync.lastSyncedAt)">
                <template #activator="{ props: tooltipProps }">
                  <v-chip
                    v-bind="tooltipProps"
                    size="x-small"
                    :color="getSyncStatusColor(lastSync.lastSyncedAt)"
                  >
                    {{ formatRelativeTime(lastSync.lastSyncedAt) }}
                  </v-chip>
                </template>
              </v-tooltip>
            </template>
            <template v-else>
              <span class="text-medium-emphasis">
                <template v-if="!fioConfigured">
                  No inventory synced yet.
                  <router-link to="/account?tab=fio">Configure FIO</router-link>
                  to get started.
                </template>
                <template v-else>No inventory synced yet</template>
              </span>
            </template>
            <v-tooltip
              v-if="pollUnhealthy"
              location="top"
              :text="
                retrying
                  ? 'Retrying…'
                  : 'The app hasn\'t been able to reach the server recently. Click to retry.'
              "
            >
              <template #activator="{ props: tooltipProps }">
                <v-chip
                  v-bind="tooltipProps"
                  size="x-small"
                  color="warning"
                  prepend-icon="mdi-power-plug-off"
                  class="cursor-pointer"
                  @click="handleRetry"
                >
                  Connection issue
                  <v-icon size="x-small" class="ml-1" :class="{ 'spin-icon': retrying }">
                    mdi-refresh
                  </v-icon>
                </v-chip>
              </template>
            </v-tooltip>
          </div>
        </v-col>
        <v-col cols="12" md="6" class="text-md-right">
          <FioSyncButton
            :fio-configured="fioConfigured"
            :syncing="syncing"
            :error="fioError"
            @sync="$emit('sync')"
          />
        </v-col>
      </v-row>

      <!--
        Collapsible stats. An error is shown expanded regardless of the saved
        preference — a collapsed section is exactly where a member would never
        find out why their inventory stopped updating.
      -->
      <template v-if="stats || fioError">
        <v-divider class="my-3" />
        <div class="d-flex align-center cursor-pointer" @click="toggleStats">
          <v-icon size="small" class="mr-1">
            {{ expanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
          </v-icon>
          <span class="text-subtitle-2 font-weight-bold">
            {{ fioError ? 'Sync Problem' : 'Statistics' }}
          </span>
          <v-icon v-if="fioError" size="small" color="warning" class="ml-2">
            mdi-alert-circle
          </v-icon>
        </div>
        <v-expand-transition>
          <div v-if="expanded" class="mt-3">
            <FioStatsPanel :stats="stats" :error="fioError" />
          </div>
        </v-expand-transition>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { FioSyncError } from '@kawakawa/types'
import type { FioStatsResponse } from '../services/api'
import { useFormatters } from '../composables'
import { usePageState } from '../composables/usePageState'
import { pollHealth, retrying, POLL_INTERVAL, retryPoll } from '../services/syncService'
import FioStatsPanel from './FioStatsPanel.vue'
import FioSyncButton from './FioSyncButton.vue'

const props = withDefaults(
  defineProps<{
    lastSync: { lastSyncedAt: string | null; fioUploadedAt: string | null }
    fioConfigured: boolean
    syncing: boolean
    stats: FioStatsResponse | null
    fioError?: FioSyncError | null
  }>(),
  { fioError: null }
)

defineEmits<{ sync: [] }>()

const { formatDateTime, formatRelativeTime, getSyncStatusColor } = useFormatters()

// Ticking clock so the health check re-evaluates without new poll events
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  nowTimer = setInterval(() => {
    now.value = Date.now()
  }, 30 * 1000)
})

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer)
})

/**
 * Poll is unhealthy when the last attempt failed, or when no successful
 * poll has landed in over 2x the polling interval (timer stalled / requests
 * hanging). Quiet until then — no news is good news.
 */
const pollUnhealthy = computed(() => {
  const health = pollHealth.value
  if (health.lastFailed) return true
  if (health.lastSuccessAt !== null && now.value - health.lastSuccessAt > 2 * POLL_INTERVAL) {
    return true
  }
  return false
})

const handleRetry = () => {
  retryPoll()
}

const { state: pageState } = usePageState('inventory', {
  statsExpanded: true,
})

const expanded = computed(() => pageState.statsExpanded)

/**
 * Auto-expand when an error appears, so a member with the section collapsed
 * still finds out why their inventory stopped updating. This nudges the saved
 * preference once per new error rather than forcing the section open — the
 * user can still collapse it, and it won't spring back open on every poll.
 */
watch(
  () => props.fioError?.code ?? null,
  (code, previous) => {
    if (code && code !== previous) pageState.statsExpanded = true
  },
  { immediate: true }
)

const toggleStats = () => {
  pageState.statsExpanded = !pageState.statsExpanded
}
</script>

<style scoped>
.spin-icon {
  animation: spin-icon 1s linear infinite;
}

@keyframes spin-icon {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
