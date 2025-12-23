<template>
  <v-dialog v-model="dialogOpen" max-width="400" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-content-save</v-icon>
        {{ isUpdate ? 'Update Shopping List' : 'Save Shopping List' }}
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" v-model="isValid" @submit.prevent="handleSave">
          <v-text-field
            v-model="name"
            label="List Name"
            :rules="[rules.required, rules.maxLength]"
            counter="100"
            autofocus
            class="mb-2"
          />

          <v-textarea
            v-model="notes"
            label="Notes (optional)"
            rows="2"
            auto-grow
            counter="500"
            :rules="[rules.notesMaxLength]"
          />
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="isSaving" @click="close"> Cancel </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="isSaving"
          :disabled="!isValid"
          @click="handleSave"
        >
          {{ isUpdate ? 'Update' : 'Save' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Props {
  /** Current name (for pre-filling when updating) */
  currentName?: string
  /** Whether this is an update to existing list */
  isUpdate?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  currentName: '',
  isUpdate: false,
})

const modelValue = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  (e: 'save', name: string, notes?: string): void
}>()

const formRef = ref<HTMLFormElement | null>(null)
const name = ref('')
const notes = ref('')
const isValid = ref(false)
const isSaving = ref(false)

// Dialog open state
const dialogOpen = computed({
  get: () => modelValue.value,
  set: v => {
    modelValue.value = v
  },
})

// Reset form when dialog opens
watch(dialogOpen, open => {
  if (open) {
    name.value = props.currentName || ''
    notes.value = ''
    isSaving.value = false
  }
})

// Validation rules
const rules = {
  required: (v: string) => !!v?.trim() || 'Name is required',
  maxLength: (v: string) => (v?.length || 0) <= 100 || 'Name must be 100 characters or less',
  notesMaxLength: (v: string) => (v?.length || 0) <= 500 || 'Notes must be 500 characters or less',
}

// Handle save
const handleSave = async () => {
  if (!isValid.value || !name.value.trim()) return

  isSaving.value = true
  try {
    emit('save', name.value.trim(), notes.value.trim() || undefined)
  } finally {
    isSaving.value = false
  }
}

// Close dialog
const close = () => {
  dialogOpen.value = false
}
</script>
