<template>
  <v-dialog :model-value="modelValue" max-width="640" @update:model-value="onDialogUpdate">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>{{ editing ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
        {{ editing ? 'Edit Claim' : 'New Claim' }}
      </v-card-title>

      <v-divider />

      <v-card-text class="pt-4">
        <v-alert v-if="error" type="error" density="compact" variant="tonal" class="mb-3">
          {{ error }}
        </v-alert>

        <div class="text-caption text-medium-emphasis mb-3">
          Manual demand attached to a single node. Adds to that node's
          <code>nativeConsumption</code> and propagates upstream through existing flows.
        </div>

        <v-row dense>
          <!-- Location -->
          <v-col cols="12">
            <KeyValueAutocomplete
              v-model="form.locationId"
              :items="locationItems"
              :favorites="settingsStore.favoritedLocations.value"
              label="Location"
              :disabled="editing || locationLocked"
              density="compact"
              hide-details
              @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
            />
          </v-col>

          <!-- Commodity -->
          <v-col cols="12" class="mt-2">
            <KeyValueAutocomplete
              v-model="form.commodityTicker"
              :items="commodityItems"
              :favorites="settingsStore.favoritedCommodities.value"
              label="Material"
              show-icons
              :disabled="editing"
              density="compact"
              hide-details
              @update:favorites="settingsStore.updateSetting('market.favoritedCommodities', $event)"
            />
          </v-col>

          <!-- Category -->
          <v-col cols="12" class="mt-3">
            <div class="text-caption text-medium-emphasis mb-1">Category</div>
            <v-btn-toggle
              v-model="form.category"
              mandatory
              density="compact"
              variant="outlined"
              color="primary"
            >
              <v-btn
                v-for="cat in categoryOptions"
                :key="cat.value"
                :value="cat.value"
                size="small"
                :prepend-icon="cat.icon"
              >
                {{ cat.label }}
              </v-btn>
            </v-btn-toggle>
            <div class="text-caption text-medium-emphasis mt-1">{{ categoryDescription }}</div>
          </v-col>

          <!-- Quantity + rate -->
          <v-col cols="6" class="mt-3">
            <v-text-field
              v-model.number="form.quantity"
              type="number"
              min="0"
              label="Quantity"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6" class="mt-3">
            <v-select
              v-model="form.rate"
              :items="[
                { title: 'Daily (× burnDays)', value: 'daily' },
                { title: 'Total (one-time)', value: 'total' },
              ]"
              label="Rate"
              density="compact"
              hide-details
            />
          </v-col>

          <!-- Note -->
          <v-col cols="12" class="mt-3">
            <v-text-field
              v-model="form.note"
              label="Note (optional)"
              placeholder="e.g. COGC, Gov Q3, etc."
              density="compact"
              hide-details
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-btn
          v-if="editing"
          color="error"
          variant="text"
          prepend-icon="mdi-delete"
          :disabled="saving || deleting"
          :loading="deleting"
          @click="handleDelete"
        >
          Delete
        </v-btn>
        <v-spacer />
        <v-btn variant="text" :disabled="saving || deleting" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="!canSave || deleting"
          @click="handleSave"
        >
          {{ editing ? 'Save' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import KeyValueAutocomplete from '../KeyValueAutocomplete.vue'
import { api } from '../../services/api'
import { useSettingsStore } from '../../stores/settings'
import type {
  LocationDemandClaim,
  CreateLocationDemandClaimRequest,
  UpdateLocationDemandClaimRequest,
  ClaimCategory,
  DemandRate,
} from '@kawakawa/types'
import type { KeyValueItem } from '../KeyValueAutocomplete.vue'

interface Props {
  modelValue: boolean
  claim: LocationDemandClaim | null
  commodityItems: KeyValueItem[]
  locationItems: KeyValueItem[]
  /** Prefills the location picker on create. When set, the field is locked. */
  initialLocationId?: string
}

const props = withDefaults(defineProps<Props>(), {
  initialLocationId: '',
})
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const settingsStore = useSettingsStore()
const editing = computed(() => props.claim !== null)
const locationLocked = computed(() => !!props.initialLocationId)

interface FormShape {
  locationId: string
  commodityTicker: string
  quantity: number | null
  rate: DemandRate
  category: ClaimCategory
  note: string
}

function emptyForm(): FormShape {
  return {
    locationId: props.initialLocationId,
    commodityTicker: '',
    quantity: null,
    rate: 'daily',
    category: 'government',
    note: '',
  }
}

const form = ref<FormShape>(emptyForm())
const saving = ref(false)
const deleting = ref(false)
const error = ref('')

const categoryOptions: Array<{ value: ClaimCategory; label: string; icon: string }> = [
  { value: 'government', label: 'Government', icon: 'mdi-bank' },
  { value: 'contract', label: 'Contract', icon: 'mdi-file-document' },
  { value: 'reserve', label: 'Reserve', icon: 'mdi-shield-lock' },
  { value: 'other', label: 'Other', icon: 'mdi-dots-horizontal' },
]

const categoryDescription = computed(() => {
  switch (form.value.category) {
    case 'government':
      return 'COGC, population upkeep, and other recurring government drains.'
    case 'contract':
      return 'Specific delivery obligation, usually one-off (pick rate=total).'
    case 'reserve':
      return 'Safety stock floor at this node. Acts like a pinned consumption the solver will keep filled.'
    case 'other':
      return "Catch-all for anything that doesn't fit the above."
    default:
      return ''
  }
})

watch(
  () => [props.modelValue, props.claim] as const,
  ([open, claim]) => {
    if (!open) return
    error.value = ''
    if (claim) {
      form.value = {
        locationId: claim.locationId,
        commodityTicker: claim.commodityTicker,
        quantity: claim.quantity,
        rate: claim.rate,
        category: claim.category,
        note: claim.note ?? '',
      }
    } else {
      form.value = emptyForm()
    }
  },
  { immediate: true }
)

const canSave = computed(() => {
  const f = form.value
  if (!f.locationId || !f.commodityTicker) return false
  if (f.quantity === null || f.quantity <= 0) return false
  return true
})

function onDialogUpdate(v: boolean) {
  if (!v) close()
}

function close() {
  emit('update:modelValue', false)
}

async function handleSave() {
  saving.value = true
  error.value = ''
  try {
    if (editing.value && props.claim) {
      const body: UpdateLocationDemandClaimRequest = {
        quantity: form.value.quantity ?? undefined,
        rate: form.value.rate,
        category: form.value.category,
        note: form.value.note.trim() || null,
      }
      await api.logistics.updateClaim(props.claim.id, body)
    } else {
      const body: CreateLocationDemandClaimRequest = {
        locationId: form.value.locationId,
        commodityTicker: form.value.commodityTicker,
        quantity: form.value.quantity ?? 0,
        rate: form.value.rate,
        category: form.value.category,
      }
      if (form.value.note.trim()) body.note = form.value.note.trim()
      await api.logistics.createClaim(body)
    }
    emit('saved')
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save claim'
  } finally {
    saving.value = false
  }
}

async function handleDelete() {
  if (!props.claim) return
  if (!confirm('Delete this claim?')) return
  deleting.value = true
  error.value = ''
  try {
    await api.logistics.deleteClaim(props.claim.id)
    emit('saved')
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete claim'
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
code {
  font-family: 'Fira Code', 'SF Mono', monospace;
  font-size: 0.85em;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 4px;
  border-radius: 3px;
}
</style>
