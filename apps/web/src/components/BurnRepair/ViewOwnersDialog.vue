<template>
  <v-dialog v-model="open" max-width="520" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>mdi-account-multiple</v-icon>
        Manage owners
      </v-card-title>

      <v-card-text>
        <div class="text-caption text-medium-emphasis mb-2">
          Owners can edit, share, and delete this view. There must be at least one owner — deleting
          the last would leave the view orphaned.
        </div>

        <!-- Current owners list -->
        <v-list density="compact" class="border rounded mb-3">
          <v-list-item v-for="owner in view.owners" :key="owner.userId" :title="owner.username">
            <template #prepend>
              <v-icon>mdi-account</v-icon>
            </template>
            <template #append>
              <v-btn
                v-if="canEdit"
                size="small"
                variant="text"
                color="error"
                :disabled="view.owners.length <= 1"
                @click="emit('remove', owner.userId)"
              >
                Remove
              </v-btn>
            </template>
          </v-list-item>
          <v-list-item v-if="view.owners.length === 0">
            <v-list-item-title class="text-caption text-medium-emphasis">
              (No owners — orphaned)
            </v-list-item-title>
          </v-list-item>
        </v-list>

        <!-- Add owner — only owners can manage. The picker offers any user the
             corp data has surfaced (per-user burn/repair entries). For tiny
             corps this covers everyone; if a user isn't producing/burning yet
             they wouldn't appear. Future revision could swap in a dedicated
             user-search endpoint. -->
        <template v-if="canEdit">
          <div class="text-caption text-medium-emphasis mb-1">Add owner</div>
          <div class="d-flex ga-2 align-center">
            <v-autocomplete
              v-model="pendingUserId"
              :items="addableOptions"
              item-title="username"
              item-value="userId"
              label="Username"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              class="flex-grow-1"
            />
            <v-btn
              color="primary"
              size="small"
              variant="tonal"
              :disabled="pendingUserId === null"
              @click="confirmAdd"
            >
              Add
            </v-btn>
          </div>
        </template>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BurnRepairCorpPerUserRow, CorpOverviewView } from '@kawakawa/types'

/**
 * Dialog for adding/removing owners on a saved view. Owner mutations hit the
 * server immediately (PR 3 endpoints) — they do NOT ride on the dirty/Save
 * flow. That keeps a security-relevant action from sitting unsent in Local.
 *
 * The user picker is sourced from corp burn/repair `perUser` (the only list
 * of corp members the dashboard already has). For small corps this covers
 * everyone; if it ever feels constraining, swap in a dedicated /users search
 * endpoint behind the same picker shape.
 */
const props = defineProps<{
  modelValue: boolean
  view: CorpOverviewView
  /** Source for the user-picker options. Pulled from `corpData.perUser`. */
  corpUsers: BurnRepairCorpPerUserRow[]
  /**
   * Whether the caller is an owner of the view. Non-owners see the list as
   * read-only — Remove buttons are hidden, Add field is hidden.
   */
  canEdit: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'add', userId: number): void
  (e: 'remove', userId: number): void
  (e: 'snackbar', message: string, color?: string): void
}>()

const open = computed<boolean>({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})

const pendingUserId = ref<number | null>(null)

// Reset the picker whenever the dialog opens or the active view changes —
// avoids carrying a stale selection across opens.
watch(
  () => [props.modelValue, props.view.id] as const,
  ([modelValue]) => {
    if (modelValue) pendingUserId.value = null
  }
)

/**
 * Picker options: corp users that aren't already owners, deduped by userId
 * (the burn/repair feed has one row per user × ticker, which collapses here
 * to one entry per user). Sorted by username for stable scanning — the corp
 * size doesn't justify search infrastructure.
 */
const addableOptions = computed(() => {
  const ownerIds = new Set(props.view.owners.map(o => o.userId))
  const byId = new Map<number, { userId: number; username: string }>()
  for (const u of props.corpUsers) {
    if (ownerIds.has(u.userId)) continue
    if (!byId.has(u.userId)) byId.set(u.userId, { userId: u.userId, username: u.username })
  }
  return Array.from(byId.values()).sort((a, b) => a.username.localeCompare(b.username))
})

function confirmAdd(): void {
  if (pendingUserId.value === null) return
  emit('add', pendingUserId.value)
  pendingUserId.value = null
}
</script>
