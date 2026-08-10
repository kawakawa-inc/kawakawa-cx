<template>
  <v-tooltip location="top" :text="tooltip">
    <template #activator="{ props: tooltipProps }">
      <!--
        The wrapper span exists so the tooltip still fires when the button is
        disabled — disabled elements don't emit pointer events.
      -->
      <span v-bind="tooltipProps">
        <v-btn
          :color="color"
          :disabled="isDisabled || syncing"
          :block="block"
          :size="size"
          @click="$emit('sync')"
        >
          <template #prepend>
            <v-icon :class="{ 'spin-icon': syncing }">{{ displayIcon }}</v-icon>
          </template>
          {{ label }}
          <!--
            Warning badge for a failed last sync. Deliberately not shown while
            a sync is in flight: the user is actively retrying and a stale
            error marker on a spinning button reads as "this retry failed".
          -->
          <v-icon v-if="showWarning" size="small" class="ml-2" color="warning">
            mdi-alert-circle
          </v-icon>
        </v-btn>
      </span>
    </template>
  </v-tooltip>
</template>

<script setup lang="ts">
/**
 * The FIO sync button, shared by the inventory card, the inventory empty
 * state and the account FIO tab.
 *
 * It owns three related states that were previously re-implemented (and
 * drifting) at each call site:
 *   - not configured  → disabled, explains where to set credentials
 *   - last sync failed → yellow warning marker + the reason in the tooltip
 *   - syncing          → rotating mdi-sync, no warning marker
 */
import { computed } from 'vue'
import type { FioSyncError } from '@kawakawa/types'

const props = withDefaults(
  defineProps<{
    /** Whether the user has FIO credentials saved. */
    fioConfigured: boolean
    /** Whether a sync is currently running. */
    syncing?: boolean
    /** Extra disable condition unrelated to FIO config (e.g. a clear in progress). */
    disabled?: boolean
    /** Current FIO error, if the last sync failed. */
    error?: FioSyncError | null
    label?: string
    icon?: string
    color?: string
    size?: string
    block?: boolean
  }>(),
  {
    syncing: false,
    disabled: false,
    error: null,
    label: 'FIO Sync',
    icon: 'mdi-sync',
    color: 'primary',
    size: undefined,
    block: false,
  }
)

defineEmits<{ sync: [] }>()

const isDisabled = computed(() => !props.fioConfigured || props.disabled)

/**
 * While syncing we always show mdi-sync, whatever the resting icon is.
 *
 * mdi-sync is a circular arrow loop, so rotating it reads as "working". Most
 * other icons don't: spinning the cloud-download used on the account tab just
 * looks like a rendering bug. Swapping the glyph keeps one spinner idiom
 * everywhere instead of requiring every call site to pick a rotation-safe icon.
 */
const displayIcon = computed(() => (props.syncing ? 'mdi-sync' : props.icon))

const showWarning = computed(() => !!props.error && !props.syncing && props.fioConfigured)

const tooltip = computed(() => {
  if (!props.fioConfigured) return 'Configure FIO credentials in Account settings first'
  if (props.syncing) return 'Sync in progress…'
  if (props.error) return `${props.error.title} — ${props.error.detail}`
  return 'Sync your inventory and planet data from FIO'
})
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
