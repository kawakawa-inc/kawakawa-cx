<template>
  <v-container fluid>
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h4">Ship Pricing</h1>
      <v-btn v-if="canManageRecipes" color="primary" size="small" @click="openCreateDialog">
        <v-icon start>mdi-plus</v-icon>
        New Recipe
      </v-btn>
    </div>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Controls -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row dense align="center">
          <v-col cols="6" sm="3">
            <v-select
              v-model="selectedPriceList"
              :items="priceListOptions"
              item-title="title"
              item-value="value"
              label="Price List"
              density="compact"
              hide-details
              :loading="loadingPriceLists"
            />
          </v-col>
          <v-col cols="6" sm="3">
            <KeyValueAutocomplete
              v-model="selectedLocation"
              :items="locationOptions"
              label="Location"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="2">
            <v-text-field
              v-model.number="selectedVersion"
              label="Version"
              placeholder="Current"
              type="number"
              density="compact"
              hide-details
              clearable
            />
          </v-col>
          <v-col cols="6" sm="2">
            <v-select
              v-model="typeFilter"
              :items="typeFilterOptions"
              label="Type"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="2" class="text-right">
            <span class="text-body-2 text-medium-emphasis">
              {{ breakdowns.length }} recipe(s)
            </span>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Comparison table -->
    <v-card>
      <v-data-table
        v-model:expanded="expandedRows"
        :headers="headers"
        :items="breakdowns"
        :loading="loading"
        item-value="recipeId"
        show-expand
        class="elevation-0"
      >
        <template #item.data-table-expand="{ internalItem, isExpanded, toggleExpand }">
          <v-btn icon variant="text" size="small" @click.stop="toggleExpand(internalItem)">
            <v-icon>{{
              isExpanded(internalItem) ? 'mdi-chevron-down' : 'mdi-chevron-right'
            }}</v-icon>
          </v-btn>
        </template>

        <template #item.recipeName="{ item }">
          <div class="d-flex align-center" style="gap: 6px">
            <span class="font-weight-medium">{{ item.recipeName }}</span>
            <v-chip size="x-small" variant="tonal">{{ item.type }}</v-chip>
            <v-tooltip v-if="item.missingPriceTickers.length > 0" location="top">
              <template #activator="{ props: tooltipProps }">
                <v-icon v-bind="tooltipProps" size="small" color="warning">
                  mdi-alert-circle
                </v-icon>
              </template>
              Missing price for: {{ item.missingPriceTickers.join(', ') }}
            </v-tooltip>
            <v-tooltip v-if="item.currencyMismatch" location="top">
              <template #activator="{ props: tooltipProps }">
                <v-icon v-bind="tooltipProps" size="small" color="warning">
                  mdi-currency-usd-off
                </v-icon>
              </template>
              Sale price is in {{ item.saleCurrency }}, price list is in {{ item.currency }}
            </v-tooltip>
          </div>
        </template>

        <template #item.materialCost="{ item }">
          {{ formatMoney(item.materialCost) }} {{ item.currency }}
        </template>

        <template #item.salePrice="{ item }">
          <span v-if="item.salePrice !== null">
            {{ formatMoney(item.salePrice) }} {{ item.saleCurrency }}
          </span>
          <span v-else class="text-medium-emphasis">— not listed —</span>
        </template>

        <template #item.margin="{ item }">
          <span
            v-if="item.margin !== null"
            :class="item.margin >= 0 ? 'text-success' : 'text-error'"
          >
            {{ item.margin >= 0 ? '+' : '' }}{{ formatMoney(item.margin) }}
          </span>
          <span v-else class="text-medium-emphasis">—</span>
        </template>

        <template #item.marginPercent="{ item }">
          <span
            v-if="item.marginPercent !== null"
            :class="item.marginPercent >= 0 ? 'text-success' : 'text-error'"
          >
            {{ item.marginPercent >= 0 ? '+' : '' }}{{ item.marginPercent.toFixed(1) }}%
          </span>
          <span v-else class="text-medium-emphasis">—</span>
        </template>

        <template #item.actions="{ item }">
          <v-btn icon size="small" variant="text" @click="openEditDialog(item.recipeId)">
            <v-icon size="small">mdi-pencil</v-icon>
          </v-btn>
          <v-btn
            icon
            size="small"
            variant="text"
            color="error"
            @click="confirmDelete(item.recipeId, item.recipeName)"
          >
            <v-icon size="small">mdi-delete</v-icon>
          </v-btn>
        </template>

        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="pa-0">
              <v-table density="compact" class="bg-grey-darken-4">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th class="text-right">Qty</th>
                    <th class="text-right">Unit Price</th>
                    <th class="text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in item.lines" :key="line.commodityTicker">
                    <td>
                      {{ getCommodityDisplay(line.commodityTicker) }}
                      <v-chip v-if="line.isFallback" size="x-small" class="ml-1" variant="tonal">
                        fallback
                      </v-chip>
                    </td>
                    <td class="text-right">{{ line.quantity }}</td>
                    <td class="text-right">
                      <span v-if="line.unitPrice !== null">{{ formatMoney(line.unitPrice) }}</span>
                      <span v-else class="text-warning">no price</span>
                    </td>
                    <td class="text-right">
                      <span v-if="line.lineTotal !== null">{{ formatMoney(line.lineTotal) }}</span>
                      <span v-else class="text-medium-emphasis">—</span>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card>

    <RecipeEditDialog
      v-model="editDialog"
      :recipe="editingRecipe"
      :saving="saving"
      @save="handleSave"
    />

    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Recipe</v-card-title>
        <v-card-text>
          Are you sure you want to delete <strong>{{ deletingRecipeName }}</strong
          >? This cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" :loading="deleting" @click="handleDelete">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { PERMISSIONS } from '@kawakawa/types'
import {
  api,
  type RecipePriceBreakdown,
  type RecipeResponse,
  type RecipeType,
  type CreateRecipeRequest,
  type UpdateRecipeRequest,
} from '../services/api'
import { locationService } from '../services/locationService'
import { useUserStore } from '../stores/user'
import { useSnackbar, useDisplayHelpers } from '../composables'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import RecipeEditDialog from '../components/RecipeEditDialog.vue'

const userStore = useUserStore()
const { snackbar, showSnackbar } = useSnackbar()
const { getCommodityDisplay } = useDisplayHelpers()

const canManageRecipes = computed(() => userStore.hasPermission(PERMISSIONS.RECIPES_MANAGE))

// Controls
const priceLists = ref<
  { title: string; value: string; currency: string; defaultLocationId: string }[]
>([])
const locations = ref<KeyValueItem[]>([])
const selectedPriceList = ref<string | null>(null)
const selectedLocation = ref<string | null>(null)
const selectedVersion = ref<number | null>(null)
const typeFilter = ref<RecipeType | null>('ship')

const loadingPriceLists = ref(false)
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)

const breakdowns = ref<RecipePriceBreakdown[]>([])
const expandedRows = ref<string[]>([])

const priceListOptions = computed(() =>
  priceLists.value.map(pl => ({ title: `${pl.title} (${pl.currency})`, value: pl.value }))
)
const locationOptions = computed((): KeyValueItem[] => locations.value)

const typeFilterOptions = [
  { title: 'Ship', value: 'ship' },
  { title: 'Building', value: 'building' },
  { title: 'All', value: null },
]

const headers = computed(() => {
  const base = [
    { title: 'Recipe', key: 'recipeName', sortable: true },
    { title: 'Sale Price', key: 'salePrice', sortable: true },
    { title: 'Material Cost', key: 'materialCost', sortable: true },
    { title: 'Margin', key: 'margin', sortable: true },
    { title: 'Margin %', key: 'marginPercent', sortable: true },
  ]
  if (canManageRecipes.value) {
    base.push({ title: '', key: 'actions', sortable: false })
  }
  return base
})

const formatMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Dialogs
const editDialog = ref(false)
const editingRecipe = ref<RecipeResponse | null>(null)
const deleteDialog = ref(false)
const deletingRecipeId = ref<number | null>(null)
const deletingRecipeName = ref('')

const openCreateDialog = () => {
  editingRecipe.value = null
  editDialog.value = true
}

const openEditDialog = async (id: number) => {
  try {
    editingRecipe.value = await api.recipes.get(id)
    editDialog.value = true
  } catch (error) {
    console.error('Failed to load recipe', error)
    showSnackbar('Failed to load recipe', 'error')
  }
}

const handleSave = async (payload: CreateRecipeRequest | UpdateRecipeRequest) => {
  saving.value = true
  try {
    if (editingRecipe.value) {
      await api.recipes.update(editingRecipe.value.id, payload)
      showSnackbar('Recipe updated', 'success')
    } else {
      await api.recipes.create(payload as CreateRecipeRequest)
      showSnackbar('Recipe created', 'success')
    }
    editDialog.value = false
    await loadPrices()
  } catch (error) {
    console.error('Failed to save recipe', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to save recipe', 'error')
  } finally {
    saving.value = false
  }
}

const confirmDelete = (id: number, name: string) => {
  deletingRecipeId.value = id
  deletingRecipeName.value = name
  deleteDialog.value = true
}

const handleDelete = async () => {
  if (deletingRecipeId.value === null) return
  deleting.value = true
  try {
    await api.recipes.delete(deletingRecipeId.value)
    showSnackbar('Recipe deleted', 'success')
    deleteDialog.value = false
    await loadPrices()
  } catch (error) {
    console.error('Failed to delete recipe', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to delete recipe', 'error')
  } finally {
    deleting.value = false
  }
}

// Loading
const loadPriceLists = async () => {
  try {
    loadingPriceLists.value = true
    const data = await api.priceLists.list()
    priceLists.value = data.map(pl => ({
      title: pl.name,
      value: pl.code,
      currency: pl.currency,
      defaultLocationId: pl.defaultLocationId ?? '',
    }))
    if (priceLists.value.length > 0 && !selectedPriceList.value) {
      selectedPriceList.value = priceLists.value[0].value
    }
  } catch (error) {
    console.error('Failed to load price lists', error)
    showSnackbar('Failed to load price lists', 'error')
  } finally {
    loadingPriceLists.value = false
  }
}

const loadLocations = async () => {
  try {
    const data = await locationService.getAllLocations()
    locations.value = data.map(l => ({
      key: l.id,
      display: locationService.getLocationDisplay(l.id, userStore.getLocationDisplayMode()),
    }))
    const pl = priceLists.value.find(p => p.value === selectedPriceList.value)
    if (pl?.defaultLocationId && !selectedLocation.value) {
      selectedLocation.value = pl.defaultLocationId
    }
  } catch (error) {
    console.error('Failed to load locations', error)
    showSnackbar('Failed to load locations', 'error')
  }
}

const loadPrices = async () => {
  if (!selectedPriceList.value || !selectedLocation.value) {
    breakdowns.value = []
    return
  }
  try {
    loading.value = true
    breakdowns.value = await api.recipes.getAllPrices(selectedPriceList.value, {
      locationId: selectedLocation.value,
      version: selectedVersion.value ?? undefined,
      type: typeFilter.value ?? undefined,
    })
  } catch (error) {
    console.error('Failed to load recipe prices', error)
    showSnackbar('Failed to load recipe prices', 'error')
    breakdowns.value = []
  } finally {
    loading.value = false
  }
}

watch(selectedPriceList, async newCode => {
  const pl = priceLists.value.find(p => p.value === newCode)
  if (pl?.defaultLocationId) {
    selectedLocation.value = pl.defaultLocationId
  }
  await loadPrices()
})
watch([selectedLocation, selectedVersion, typeFilter], loadPrices)

onMounted(async () => {
  await loadPriceLists()
  await loadLocations()
  await loadPrices()
})
</script>
