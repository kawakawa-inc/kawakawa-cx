<template>
  <v-dialog v-model="dialogOpen" max-width="480" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-truck-fast-outline</v-icon>
        {{ isUpdate ? 'Edit Pickup Location Fee' : 'New Pickup Location Fee' }}
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" v-model="isValid">
          <v-row dense>
            <v-col cols="12">
              <KeyValueAutocomplete
                v-model="locationId"
                :items="locationOptions"
                :favorites="settingsStore.favoritedLocations.value"
                label="Location"
                :rules="[rules.required]"
                hint="Pick a location that already has a fee to edit it, or a new one to add a fee."
                persistent-hint
                @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
              />
            </v-col>
            <v-col cols="7">
              <v-text-field
                v-model.number="extraFee"
                label="Extra Fee"
                type="number"
                min="0"
                step="0.01"
                :rules="[rules.nonNegative]"
                :suffix="currency ?? undefined"
              />
            </v-col>
            <v-col cols="5">
              <v-select
                v-model="currency"
                :items="currencies"
                label="Currency"
                :rules="[rules.required]"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="description" label="Description (optional)" rows="2" auto-grow />
            </v-col>
          </v-row>
          <p class="text-caption text-medium-emphasis mb-0">
            This fee applies to every package that lists this location as its pickup point — it's a
            property of the location, not any one package.
          </p>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-btn
          v-if="isUpdate"
          color="error"
          variant="text"
          :disabled="saving"
          @click="handleDelete"
        >
          Delete
        </v-btn>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!isValid"
          @click="handleSave"
        >
          {{ isUpdate ? 'Update' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Currency } from '@kawakawa/types'
import type { PickupLocationResponse, CreatePickupLocationRequest } from '../services/api'
import { useSettingsStore } from '../stores/settings'
import KeyValueAutocomplete, { type KeyValueItem } from './KeyValueAutocomplete.vue'

const settingsStore = useSettingsStore()

interface Props {
  /** Every location with a fee configured today, so picking one pre-fills for editing. */
  existingFees: PickupLocationResponse[]
  saving?: boolean
  locationOptions: KeyValueItem[]
}

const props = withDefaults(defineProps<Props>(), {
  saving: false,
})

const modelValue = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  (e: 'save', payload: CreatePickupLocationRequest): void
  (e: 'delete', locationId: string): void
}>()

const formRef = ref()
const isValid = ref(false)

const locationId = ref<string | null>(null)
const extraFee = ref<number | null>(0)
const currency = ref<Currency | null>(null)
const description = ref('')

const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

// Whichever location is currently selected drives create-vs-edit: if it
// already has a fee configured, this becomes an edit of that fee.
const existingForSelectedLocation = computed(
  () => props.existingFees.find(f => f.locationId === locationId.value) ?? null
)
const isUpdate = computed(() => existingForSelectedLocation.value !== null)
const saving = computed(() => props.saving)

const rules = {
  required: (v: unknown) => !!v || 'Required',
  nonNegative: (v: number) => (v != null && v >= 0) || 'Must be 0 or greater',
}

const dialogOpen = computed({
  get: () => modelValue.value,
  set: v => {
    modelValue.value = v
  },
})

watch(dialogOpen, open => {
  if (!open) return
  locationId.value = null
  extraFee.value = 0
  currency.value = settingsStore.preferredCurrency.value ?? null
  description.value = ''
})

// Prefill (or reset to defaults, including the user's preferred currency)
// whenever the selected location changes.
watch(locationId, () => {
  const existing = existingForSelectedLocation.value
  extraFee.value = existing?.extraFee ?? 0
  currency.value = existing?.currency ?? settingsStore.preferredCurrency.value ?? null
  description.value = existing?.description ?? ''
})

// Always emits the full shape (including locationId) whether this is a
// create or an edit — createPickupLocation on the backend upserts by
// locationId, so the parent doesn't need to branch on isUpdate either.
const handleSave = () => {
  if (!locationId.value || currency.value === null || extraFee.value == null) return

  const payload: CreatePickupLocationRequest = {
    locationId: locationId.value,
    extraFee: extraFee.value,
    currency: currency.value,
    description: description.value.trim() || null,
  }
  emit('save', payload)
}

const handleDelete = () => {
  if (locationId.value) emit('delete', locationId.value)
}

const close = () => {
  dialogOpen.value = false
}
</script>
