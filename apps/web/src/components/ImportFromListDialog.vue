<template>
  <v-dialog v-model="dialogOpen" max-width="450" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start color="primary">mdi-clipboard-list</v-icon>
        Import from Shopping List
      </v-card-title>

      <v-card-text>
        <!-- Loading state -->
        <div v-if="isLoading" class="d-flex justify-center py-8">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <!-- Error state -->
        <v-alert v-else-if="error" type="error" variant="tonal" class="mb-4">
          {{ error }}
        </v-alert>

        <!-- Empty state -->
        <div v-else-if="!hasWorkingList && savedLists.length === 0" class="text-center py-8">
          <v-icon size="48" color="grey" class="mb-3">mdi-playlist-remove</v-icon>
          <div class="text-body-1 text-grey">No shopping lists available</div>
          <div class="text-caption text-grey mt-1">
            Create a shopping list from the Market page first
          </div>
        </div>

        <!-- Lists -->
        <v-list v-else density="compact">
          <!-- Working list -->
          <v-list-item v-if="hasWorkingList" class="list-picker-item" @click="handleSelectWorking">
            <template #prepend>
              <v-icon color="success">mdi-pencil</v-icon>
            </template>
            <v-list-item-title>
              {{ workingName || 'Current List' }}
              <v-chip size="x-small" color="success" variant="tonal" class="ml-2">Active</v-chip>
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ workingItemCount }} items, {{ workingTotalQty }} total
            </v-list-item-subtitle>
          </v-list-item>

          <v-divider v-if="hasWorkingList && savedLists.length > 0" class="my-1" />

          <!-- Saved lists -->
          <v-list-item
            v-for="list in savedLists"
            :key="list.id"
            :loading="loadingListId === list.id"
            class="list-picker-item"
            @click="handleSelectSaved(list.id)"
          >
            <template #prepend>
              <v-icon color="primary">mdi-clipboard-list</v-icon>
            </template>
            <v-list-item-title>{{ list.name }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ list.itemCount }} items, {{ list.totalQuantity }} total
            </v-list-item-subtitle>
            <template #append>
              <span class="text-caption text-grey">
                {{ formatDate(list.updatedAt) }}
              </span>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useShoppingListStore } from '../stores/shoppingList'
import { api } from '../services/api'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  import: [materials: Record<string, number>, name?: string, savedListId?: number]
}>()

const shoppingListStore = useShoppingListStore()
const loadingListId = ref<number | null>(null)
const error = ref<string | null>(null)

const savedLists = computed(() => shoppingListStore.savedLists.value)
const isLoading = computed(() => shoppingListStore.isLoading.value)
const hasWorkingList = computed(() => shoppingListStore.hasWorkingList.value)
const workingName = computed(() => shoppingListStore.workingName.value)
const workingMaterials = computed(() => shoppingListStore.workingMaterials.value)
const workingItemCount = computed(() => shoppingListStore.itemCount.value)
const workingTotalQty = computed(() => shoppingListStore.totalQuantity.value)

const dialogOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// Load saved lists when dialog opens
watch(dialogOpen, async open => {
  if (open) {
    error.value = null
    loadingListId.value = null
    await shoppingListStore.loadSavedLists()
  }
})

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

const handleSelectWorking = () => {
  if (workingMaterials.value && Object.keys(workingMaterials.value).length > 0) {
    close()
    emit('import', { ...workingMaterials.value }, workingName.value || undefined)
  }
}

const handleSelectSaved = async (listId: number) => {
  loadingListId.value = listId
  error.value = null
  try {
    const list = await api.lists.get(listId)
    if (Object.keys(list.materials).length > 0) {
      close()
      emit('import', list.materials, list.name, list.id)
    } else {
      error.value = 'Selected list has no materials'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load list'
  } finally {
    loadingListId.value = null
  }
}

const close = () => {
  dialogOpen.value = false
}
</script>

<style scoped>
.list-picker-item {
  cursor: pointer;
}

.list-picker-item:hover {
  background: rgba(var(--v-theme-primary), 0.05);
}
</style>
