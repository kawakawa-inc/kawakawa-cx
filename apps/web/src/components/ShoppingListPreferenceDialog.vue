<template>
  <v-dialog v-model="isOpen" max-width="450" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start color="primary">mdi-cart-check</v-icon>
        Shopping List Behavior
      </v-card-title>
      <v-card-text>
        <p class="mb-4">
          When you submit an invoice, would you like to automatically update your shopping list?
        </p>
        <v-list density="compact" class="mb-2">
          <v-list-item>
            <template #prepend>
              <v-icon color="success" size="small">mdi-check</v-icon>
            </template>
            <v-list-item-title class="text-body-2">
              <strong>Fulfilled items</strong> will be removed from the list
            </v-list-item-title>
          </v-list-item>
          <v-list-item>
            <template #prepend>
              <v-icon color="warning" size="small">mdi-minus</v-icon>
            </template>
            <v-list-item-title class="text-body-2">
              <strong>Partial items</strong> will have quantities reduced
            </v-list-item-title>
          </v-list-item>
        </v-list>
        <p class="text-caption text-medium-emphasis">
          You can change this later in Account Settings or use the toggle in the Shopping List
          panel.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" @click="handleChoice(false)"> No, Keep List </v-btn>
        <v-btn color="primary" variant="elevated" @click="handleChoice(true)">
          Yes, Auto-Update
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'choice', value: boolean): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const handleChoice = (autoUpdate: boolean) => {
  emit('choice', autoUpdate)
  isOpen.value = false
}
</script>
