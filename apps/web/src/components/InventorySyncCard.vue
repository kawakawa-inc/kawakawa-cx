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
          <v-tooltip v-if="!fioConfigured" location="top">
            <template #activator="{ props }">
              <span v-bind="props">
                <v-btn color="primary" prepend-icon="mdi-sync" disabled> FIO Sync </v-btn>
              </span>
            </template>
            Configure FIO credentials in Account settings first
          </v-tooltip>
          <v-btn v-else color="primary" :disabled="syncing" @click="$emit('sync')">
            <template #prepend>
              <v-icon :class="{ 'spin-icon': syncing }">mdi-sync</v-icon>
            </template>
            FIO Sync
          </v-btn>
        </v-col>
      </v-row>

      <!-- Collapsible Stats Section -->
      <template v-if="stats">
        <v-divider class="my-3" />
        <div class="d-flex align-center cursor-pointer" @click="toggleStats">
          <v-icon size="small" class="mr-1">
            {{ pageState.statsExpanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
          </v-icon>
          <span class="text-subtitle-2 font-weight-bold">Statistics</span>
        </div>
        <v-expand-transition>
          <div v-if="pageState.statsExpanded" class="mt-3">
            <div class="d-flex flex-wrap ga-6 mb-4 justify-center">
              <div class="text-center">
                <div class="text-h5 font-weight-bold">{{ stats.totalItems }}</div>
                <div class="text-caption text-medium-emphasis">Items</div>
              </div>
              <div class="text-center">
                <div class="text-h5 font-weight-bold">
                  {{ stats.totalQuantity.toLocaleString() }}
                </div>
                <div class="text-caption text-medium-emphasis">Quantity</div>
              </div>
              <div class="text-center">
                <div class="text-h5 font-weight-bold">{{ stats.uniqueCommodities }}</div>
                <div class="text-caption text-medium-emphasis">Commodities</div>
              </div>
              <div class="text-center">
                <div class="text-h5 font-weight-bold">{{ stats.storageLocations }}</div>
                <div class="text-caption text-medium-emphasis">Locations</div>
              </div>
            </div>

            <div class="d-flex flex-wrap ga-4 justify-center">
              <div class="d-flex align-center">
                <v-icon
                  class="mr-2"
                  size="small"
                  :color="getDataAgeInfo(stats.oldestFioUploadTime).color"
                >
                  {{ getDataAgeInfo(stats.oldestFioUploadTime).icon }}
                </v-icon>
                <div>
                  <div class="text-body-2">
                    Oldest: {{ formatDateTime(stats.oldestFioUploadTime) }}
                  </div>
                </div>
              </div>
              <div class="d-flex align-center">
                <v-icon
                  class="mr-2"
                  size="small"
                  :color="getDataAgeInfo(stats.newestFioUploadTime).color"
                >
                  {{ getDataAgeInfo(stats.newestFioUploadTime).icon }}
                </v-icon>
                <div>
                  <div class="text-body-2">
                    Newest: {{ formatDateTime(stats.newestFioUploadTime) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </v-expand-transition>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { FioStatsResponse } from '../services/api'
import { useFormatters } from '../composables'
import { usePageState } from '../composables/usePageState'
import { pollHealth, retrying, POLL_INTERVAL, retryPoll } from '../services/syncService'

defineProps<{
  lastSync: { lastSyncedAt: string | null; fioUploadedAt: string | null }
  fioConfigured: boolean
  syncing: boolean
  stats: FioStatsResponse | null
}>()

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

const toggleStats = () => {
  pageState.statsExpanded = !pageState.statsExpanded
}

const getDataAgeInfo = (dateStr: string | null): { color: string; icon: string } => {
  if (!dateStr) return { color: 'grey', icon: 'mdi-clock-outline' }

  const date = new Date(dateStr)
  const now = new Date()
  const hoursAgo = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

  if (hoursAgo < 24) {
    return { color: 'success', icon: 'mdi-clock-check' }
  } else if (hoursAgo < 48) {
    return { color: 'warning', icon: 'mdi-clock-alert-outline' }
  } else {
    return { color: 'error', icon: 'mdi-clock-remove-outline' }
  }
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
