<template>
  <v-dialog v-model="dialogOpen" max-width="450" @keydown="onKeydown">
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start color="primary">mdi-cart-plus</v-icon>
        New Shopping List
      </v-card-title>
      <v-card-text>
        <div class="text-body-2 mb-4">
          Paste your shopping list below, or press <kbd>Enter</kbd> to start with an empty list.
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
        <div class="text-caption text-grey mt-2">
          Supported formats: XIT export, comma-separated (RAT 100, DW 50), or line-separated
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" @click="close">Cancel</v-btn>
        <v-btn color="primary" variant="outlined" @click="createEmpty"> Empty List </v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :disabled="!hasPastedContent"
          @click="createFromPaste"
        >
          Create List
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'create-empty': []
  'create-from-paste': [text: string]
}>()

const pastedText = ref('')
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
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
})

const close = () => {
  dialogOpen.value = false
}

const createEmpty = () => {
  close()
  emit('create-empty')
}

const createFromPaste = () => {
  if (hasPastedContent.value) {
    close()
    emit('create-from-paste', pastedText.value)
  }
}

const onPaste = () => {
  // Allow the paste to complete, then auto-submit if there's content
  nextTick(() => {
    if (hasPastedContent.value) {
      createFromPaste()
    }
  })
}

const onKeydown = (event: globalThis.KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (hasPastedContent.value) {
      createFromPaste()
    } else {
      createEmpty()
    }
  }
}
</script>

<style scoped>
kbd {
  background: rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: monospace;
  font-size: 0.85em;
}
</style>
