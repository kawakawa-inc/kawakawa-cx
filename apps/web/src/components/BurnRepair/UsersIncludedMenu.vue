<template>
  <v-menu :close-on-content-click="false" location="bottom start" max-height="500">
    <template #activator="{ props: btnProps }">
      <v-chip
        v-bind="btnProps"
        size="small"
        variant="tonal"
        prepend-icon="mdi-account-group"
        append-icon="mdi-menu-down"
      >
        {{ includedCount }} users included
      </v-chip>
    </template>

    <v-card min-width="320">
      <v-card-title class="text-subtitle-2 d-flex align-center ga-2">
        Users included
        <v-tooltip location="top" max-width="320" open-delay="150">
          <template #activator="{ props: tipProps }">
            <v-icon v-bind="tipProps" size="x-small" color="grey">mdi-information-outline</v-icon>
          </template>
          Uncheck a member to model corp aggregates without their contribution.
          Applies historically to graphs too.
        </v-tooltip>
        <v-spacer />
        <v-btn
          v-if="excludedCount > 0"
          size="x-small"
          variant="text"
          color="primary"
          @click="reset"
        >
          Reset
        </v-btn>
      </v-card-title>
      <v-list density="compact" max-height="380" class="py-0">
        <template v-if="members.length === 0">
          <v-list-item>
            <v-list-item-title class="text-caption text-medium-emphasis">
              No active members in the current corp data.
            </v-list-item-title>
          </v-list-item>
        </template>
        <template v-else>
          <v-list-item
            v-for="member in members"
            :key="member.userId"
            @click="toggle(member.userId)"
          >
            <template #prepend>
              <v-checkbox-btn
                :model-value="!isExcluded(member.userId)"
                density="compact"
              />
            </template>
            <v-list-item-title>
              {{ member.username }}
            </v-list-item-title>
            <template #append>
              <FioAgeChip :fio-uploaded-at="member.fioDataAge" size="x-small" />
            </template>
          </v-list-item>
        </template>
      </v-list>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BurnRepairCorpPerUserRow, ExcludedMember } from '@kawakawa/types'
import FioAgeChip from '../FioAgeChip.vue'

const props = defineProps<{
  /** Per-user rows from the corp response — source for active member display. */
  perUser: BurnRepairCorpPerUserRow[]
  /**
   * Excluded members from the corp response. We need this so manually-excluded
   * users still appear in the dropdown and can be toggled back on — without it
   * they'd vanish the moment they were excluded (server filters them out of
   * perUser) and there'd be no way to un-exclude individuals.
   */
  excludedMembers: ExcludedMember[]
  /** Currently excluded user IDs (the v-model). */
  modelValue: number[]
  /** Active member count from the server (post-exclusion); shown on the chip. */
  includedCount: number
}>()

const emit = defineEmits<(e: 'update:modelValue', value: number[]) => void>()

interface Member {
  userId: number
  username: string
  fioDataAge: string | null
}

/**
 * Toggleable members — active users (from perUser) plus anyone manually
 * excluded (so they remain checkable). FIO-stale members are intentionally
 * omitted: they're not toggleable from this menu since the FIO gate is
 * automatic. The combined "N excluded" chip surfaces them separately.
 */
const members = computed<Member[]>(() => {
  const seen = new Map<number, Member>()
  for (const r of props.perUser) {
    if (!seen.has(r.userId)) {
      seen.set(r.userId, {
        userId: r.userId,
        username: r.username,
        fioDataAge: r.fioDataAge,
      })
    }
  }
  for (const m of props.excludedMembers) {
    if (m.reason !== 'manual') continue
    if (!seen.has(m.userId)) {
      seen.set(m.userId, {
        userId: m.userId,
        username: m.username,
        fioDataAge: m.fioDataAge,
      })
    }
  }
  return [...seen.values()].sort((a, b) => a.username.localeCompare(b.username))
})

const excludedSet = computed(() => new Set(props.modelValue))
const excludedCount = computed(() => excludedSet.value.size)

function isExcluded(userId: number): boolean {
  return excludedSet.value.has(userId)
}

function toggle(userId: number): void {
  const next = new Set(props.modelValue)
  if (next.has(userId)) {
    next.delete(userId)
  } else {
    next.add(userId)
  }
  emit('update:modelValue', [...next])
}

function reset(): void {
  emit('update:modelValue', [])
}
</script>
