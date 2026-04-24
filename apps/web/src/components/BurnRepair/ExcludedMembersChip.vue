<template>
  <v-tooltip v-if="members.length > 0" location="bottom" :open-delay="100" max-width="380">
    <template #activator="{ props: tipProps }">
      <v-chip
        v-bind="tipProps"
        size="small"
        color="warning"
        variant="tonal"
        prepend-icon="mdi-account-off"
      >
        {{ members.length }} excluded
      </v-chip>
    </template>

    <div class="text-caption">
      <p class="mb-2">
        These members aren't contributing to the current corp aggregates.
      </p>

      <template v-if="manual.length > 0">
        <div class="text-overline mt-2">Manually excluded ({{ manual.length }})</div>
        <p class="text-caption text-medium-emphasis mb-1">
          Hidden via the planning dropdown — uncheck them there to restore.
        </p>
        <div class="d-flex flex-column ga-1">
          <div
            v-for="m in manual"
            :key="`manual-${m.userId}`"
            class="d-flex align-center justify-space-between"
          >
            <span>{{ m.username }}</span>
            <FioAgeChip :fio-uploaded-at="m.fioDataAge" size="x-small" />
          </div>
        </div>
      </template>

      <template v-if="stale.length > 0">
        <div class="text-overline mt-2">Inactive — FIO &gt; 30 days ({{ stale.length }})</div>
        <p class="text-caption text-medium-emphasis mb-1">
          Auto-excluded because their PrUn client hasn't pushed FIO data recently.
        </p>
        <div class="d-flex flex-column ga-1">
          <div
            v-for="m in stale"
            :key="`stale-${m.userId}`"
            class="d-flex align-center justify-space-between"
          >
            <span>{{ m.username }}</span>
            <FioAgeChip :fio-uploaded-at="m.fioDataAge" size="x-small" />
          </div>
        </div>
      </template>
    </div>
  </v-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ExcludedMember } from '@kawakawa/types'
import FioAgeChip from '../FioAgeChip.vue'

const props = defineProps<{
  members: ExcludedMember[]
}>()

const manual = computed(() => props.members.filter(m => m.reason === 'manual'))
const stale = computed(() => props.members.filter(m => m.reason === 'fio-stale'))
</script>
