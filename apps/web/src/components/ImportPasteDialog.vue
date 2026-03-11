<template>
  <v-dialog v-model="dialogOpen" max-width="450" @keydown="onKeydown">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start color="primary">mdi-clipboard-text</v-icon>
        Import Materials
      </v-card-title>
      <v-card-text>
        <div class="text-body-2 mb-4">
          Paste your materials list below to load into the calculator.
        </div>
        <v-textarea
          ref="textareaRef"
          v-model="pastedText"
          placeholder="Example: RAT 100, DW 50, OVE 25"
          rows="4"
          variant="outlined"
          auto-grow
          hide-details
          @paste="onPaste"
        />
        <div v-if="parseError" class="text-caption text-error mt-2">
          {{ parseError }}
        </div>
        <div v-else class="text-caption text-grey mt-2">
          Supported formats: XIT export, comma-separated (RAT 100, DW 50), or line-separated
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :disabled="!hasPastedContent"
          @click="submitImport"
        >
          Import
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { parseShoppingList } from '@kawakawa/types/shopping-list'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  import: [materials: Record<string, number>, name?: string]
}>()

const pastedText = ref('')
const parseError = ref<string | null>(null)
const textareaRef = ref<{ focus: () => void } | null>(null)

const dialogOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const hasPastedContent = computed(() => pastedText.value.trim().length > 0)

// Focus textarea when dialog opens
watch(dialogOpen, isOpen => {
  if (isOpen) {
    pastedText.value = ''
    parseError.value = null
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
})

const close = () => {
  dialogOpen.value = false
}

const submitImport = () => {
  if (!hasPastedContent.value) return

  const result = parseShoppingList(pastedText.value)
  if (result.success && Object.keys(result.materials).length > 0) {
    parseError.value = null
    close()
    emit('import', result.materials, result.name)
  } else {
    parseError.value = result.success
      ? 'No materials found in input'
      : result.error || 'Could not parse input'
  }
}

const onPaste = () => {
  // Allow the paste to complete, then auto-submit
  nextTick(() => {
    if (hasPastedContent.value) {
      submitImport()
    }
  })
}

const onKeydown = (event: globalThis.KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (hasPastedContent.value) {
      submitImport()
    }
  }
}
</script>
