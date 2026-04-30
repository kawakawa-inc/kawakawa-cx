<template>
  <v-dialog
    :model-value="modelValue"
    max-width="440"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start color="primary">mdi-bookmark-plus</v-icon>
        {{ isEditing ? 'Update Saved Filter' : 'Save Filter' }}
      </v-card-title>

      <v-card-text>
        <v-text-field
          v-model="form.name"
          label="Filter name"
          :rules="[v => !!v?.trim() || 'Name is required']"
          density="compact"
          autofocus
          class="mb-3"
          @keydown.enter="save"
        />

        <v-select
          v-model="form.privacy"
          :items="privacyOptions"
          item-title="title"
          item-value="value"
          label="Privacy"
          density="compact"
        >
          <template #item="{ item, props: itemProps }">
            <v-list-item v-bind="itemProps">
              <template #prepend>
                <v-icon size="small" class="mr-2">{{
                  getPrivacyIcon(item.value as FilterPrivacy)
                }}</v-icon>
              </template>
              <template #subtitle>{{
                getPrivacyDescription(item.value as FilterPrivacy)
              }}</template>
            </v-list-item>
          </template>
        </v-select>

        <p v-if="form.privacy === 'unlisted'" class="text-body-2 text-medium-emphasis mt-2">
          Anyone with the link can view and save a copy of this filter.
        </p>
        <p v-if="form.privacy === 'public'" class="text-body-2 text-medium-emphasis mt-2">
          This filter will appear in the public filters browser for all users.
        </p>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :loading="saving"
          :disabled="!form.name.trim()"
          @click="save"
        >
          {{ isEditing ? 'Update' : 'Save' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { SavedMarketFilter, SavedFilterData, FilterPrivacy } from '@kawakawa/types'
import { api } from '../services/api'

interface Props {
  modelValue: boolean
  filterData: SavedFilterData
  existingFilter?: SavedMarketFilter | null
}

const props = withDefaults(defineProps<Props>(), {
  existingFilter: null,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', filter: SavedMarketFilter): void
}>()

const saving = ref(false)

const form = ref({
  name: '',
  privacy: 'private' as FilterPrivacy,
})

const isEditing = computed(() => !!props.existingFilter)

const privacyOptions = [
  { title: 'Private', value: 'private' as FilterPrivacy },
  { title: 'Unlisted (link only)', value: 'unlisted' as FilterPrivacy },
  { title: 'Public', value: 'public' as FilterPrivacy },
]

const getPrivacyIcon = (privacy: FilterPrivacy) => {
  if (privacy === 'private') return 'mdi-lock'
  if (privacy === 'unlisted') return 'mdi-link-variant'
  return 'mdi-earth'
}

const getPrivacyDescription = (privacy: FilterPrivacy) => {
  if (privacy === 'private') return 'Only you can see this filter'
  if (privacy === 'unlisted') return 'Anyone with the link can view it'
  return 'Visible to all users in the public browser'
}

// Populate form when dialog opens
watch(
  () => props.modelValue,
  open => {
    if (open) {
      if (props.existingFilter) {
        form.value.name = props.existingFilter.name
        form.value.privacy = props.existingFilter.privacy
      } else {
        form.value.name = ''
        form.value.privacy = 'private'
      }
    }
  }
)

const close = () => {
  emit('update:modelValue', false)
}

const save = async () => {
  if (!form.value.name.trim()) return

  saving.value = true
  try {
    let result: SavedMarketFilter

    if (isEditing.value && props.existingFilter) {
      result = await api.savedFilters.update(props.existingFilter.id, {
        name: form.value.name.trim(),
        privacy: form.value.privacy,
        filterData: props.filterData,
      })
    } else {
      result = await api.savedFilters.create({
        name: form.value.name.trim(),
        filterData: props.filterData,
        privacy: form.value.privacy,
      })
    }

    emit('saved', result)
    close()
  } catch (err) {
    // Error handling delegated to parent via snackbar
    console.error('Failed to save filter:', err)
  } finally {
    saving.value = false
  }
}
</script>
