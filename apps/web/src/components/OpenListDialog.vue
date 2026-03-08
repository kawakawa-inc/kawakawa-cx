<template>
  <v-dialog v-model="dialogOpen" max-width="450" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-folder-open</v-icon>
        Open Shopping List
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
        <div v-else-if="savedLists.length === 0" class="text-center py-8">
          <v-icon size="48" color="grey" class="mb-3">mdi-playlist-remove</v-icon>
          <div class="text-body-1 text-grey">No saved lists</div>
          <div class="text-caption text-grey mt-1">Paste a shopping list and save it first</div>
        </div>

        <!-- List of saved lists -->
        <v-list v-else density="compact">
          <v-list-item
            v-for="list in savedLists"
            :key="list.id"
            :value="list.id"
            class="saved-list-item"
            @click="handleSelect(list.id)"
          >
            <template #prepend>
              <v-icon color="primary">mdi-clipboard-list</v-icon>
            </template>

            <v-list-item-title>{{ list.name }}</v-list-item-title>

            <v-list-item-subtitle>
              {{ list.itemCount }} items, {{ list.totalQuantity }} total
            </v-list-item-subtitle>

            <template #append>
              <div class="d-flex align-center gap-2">
                <span class="text-caption text-grey">
                  {{ formatDate(list.updatedAt) }}
                </span>
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  size="x-small"
                  color="error"
                  @click.stop="handleDelete(list.id, list.name)"
                />
              </div>
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

  <!-- Delete Confirmation Dialog -->
  <v-dialog v-model="deleteConfirmOpen" max-width="350">
    <v-card>
      <v-card-title>Delete List?</v-card-title>
      <v-card-text> Are you sure you want to delete "{{ deleteListName }}"? </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="deleteConfirmOpen = false">Cancel</v-btn>
        <v-btn color="error" variant="flat" :loading="isDeleting" @click="confirmDelete">
          Delete
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useShoppingListStore } from '../stores/shoppingList'

const modelValue = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  (e: 'select', listId: number): void
}>()

const shoppingListStore = useShoppingListStore()

const deleteConfirmOpen = ref(false)
const deleteListId = ref<number | null>(null)
const deleteListName = ref('')
const isDeleting = ref(false)

// Computed values from store (access .value since store returns refs)
const savedLists = computed(() => shoppingListStore.savedLists.value)
const isLoading = computed(() => shoppingListStore.isLoading.value)
const error = computed(() => shoppingListStore.error.value)

// Dialog open state
const dialogOpen = computed({
  get: () => modelValue.value,
  set: v => {
    modelValue.value = v
  },
})

// Load saved lists when dialog opens
watch(dialogOpen, async open => {
  if (open) {
    await shoppingListStore.loadSavedLists()
  }
})

// Format date for display
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays}d ago`
  } else {
    return date.toLocaleDateString()
  }
}

// Handle list selection
const handleSelect = (listId: number) => {
  emit('select', listId)
}

// Handle delete request
const handleDelete = (listId: number, name: string) => {
  deleteListId.value = listId
  deleteListName.value = name
  deleteConfirmOpen.value = true
}

// Confirm delete
const confirmDelete = async () => {
  if (!deleteListId.value) return

  isDeleting.value = true
  try {
    await shoppingListStore.deleteList(deleteListId.value)
    deleteConfirmOpen.value = false
  } finally {
    isDeleting.value = false
    deleteListId.value = null
    deleteListName.value = ''
  }
}

// Close dialog
const close = () => {
  dialogOpen.value = false
}
</script>

<style scoped>
.saved-list-item {
  cursor: pointer;
}

.saved-list-item:hover {
  background: rgba(var(--v-theme-primary), 0.05);
}
</style>
