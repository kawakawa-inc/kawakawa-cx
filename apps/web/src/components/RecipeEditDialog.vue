<template>
  <v-dialog v-model="dialogOpen" max-width="640" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-rocket-launch</v-icon>
        {{ isUpdate ? 'Edit Recipe' : 'New Recipe' }}
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" v-model="isValid">
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field v-model="name" label="Name" :rules="[rules.required]" autofocus />
            </v-col>
            <v-col cols="6" sm="3">
              <v-select v-model="type" :items="typeOptions" label="Type" />
            </v-col>
            <v-col cols="6" sm="3">
              <v-switch v-model="isActive" label="Active" color="primary" hide-details inset />
            </v-col>
            <v-col cols="6" sm="4">
              <v-text-field
                v-model.number="salePrice"
                label="Sale Price"
                type="number"
                min="0"
                step="0.01"
                clearable
              />
            </v-col>
            <v-col cols="6" sm="4">
              <v-select v-model="currency" :items="currencies" label="Sale Currency" clearable />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="description" label="Description (optional)" rows="2" auto-grow />
            </v-col>
          </v-row>

          <v-divider class="my-3" />

          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-subtitle-2">Bill of Materials</span>
            <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="addLine">
              Add Material
            </v-btn>
          </div>

          <div v-if="lineError" class="text-error text-caption mb-2">{{ lineError }}</div>

          <div
            v-for="(line, index) in lines"
            :key="index"
            class="d-flex align-center mb-2"
            style="gap: 8px"
          >
            <KeyValueAutocomplete
              v-model="line.commodityTicker"
              :items="commodityOptions"
              label="Material"
              density="compact"
              hide-details
              variant="outlined"
              class="flex-grow-1"
            />
            <v-text-field
              v-model.number="line.quantity"
              label="Qty"
              type="number"
              min="1"
              density="compact"
              hide-details
              variant="outlined"
              style="max-width: 110px"
            />
            <v-btn
              icon
              size="small"
              variant="text"
              color="error"
              :disabled="lines.length <= 1"
              @click="removeLine(index)"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </div>
        </v-form>
      </v-card-text>

      <v-card-actions>
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
import type {
  RecipeResponse,
  RecipeType,
  CreateRecipeRequest,
  UpdateRecipeRequest,
} from '../services/api'
import { commodityService } from '../services/commodityService'
import { useDisplayHelpers } from '../composables'
import KeyValueAutocomplete, { type KeyValueItem } from './KeyValueAutocomplete.vue'

interface Props {
  recipe?: RecipeResponse | null
  saving?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  recipe: null,
  saving: false,
})

const modelValue = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  (e: 'save', payload: CreateRecipeRequest | UpdateRecipeRequest): void
}>()

const { getCommodityDisplay } = useDisplayHelpers()

const formRef = ref()
const isValid = ref(false)
const lineError = ref('')

const name = ref('')
const type = ref<RecipeType>('ship')
const isActive = ref(true)
const salePrice = ref<number | null>(null)
const currency = ref<Currency | null>(null)
const description = ref('')
const lines = ref<{ commodityTicker: string | null; quantity: number }[]>([
  { commodityTicker: null, quantity: 1 },
])

const isUpdate = computed(() => !!props.recipe)
const saving = computed(() => props.saving)

const typeOptions = [
  { title: 'Ship', value: 'ship' },
  { title: 'Building', value: 'building' },
]
const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

const commodityOptions = computed((): KeyValueItem[] => {
  const commodities = commodityService.getAllCommoditiesSync()
  return commodities.map(c => ({
    key: c.ticker,
    display: getCommodityDisplay(c.ticker),
    name: c.name,
    category: c.category,
  }))
})

const rules = {
  required: (v: string) => !!v?.trim() || 'Required',
}

const dialogOpen = computed({
  get: () => modelValue.value,
  set: v => {
    modelValue.value = v
  },
})

watch(dialogOpen, open => {
  if (!open) return
  lineError.value = ''
  const r = props.recipe
  name.value = r?.name ?? ''
  type.value = r?.type ?? 'ship'
  isActive.value = r?.isActive ?? true
  salePrice.value = r?.salePrice ?? null
  currency.value = r?.currency ?? null
  description.value = r?.description ?? ''
  lines.value =
    r && r.inputs.length > 0
      ? r.inputs.map(i => ({ commodityTicker: i.commodityTicker, quantity: i.quantity }))
      : [{ commodityTicker: null, quantity: 1 }]
})

const addLine = () => {
  lines.value.push({ commodityTicker: null, quantity: 1 })
}

const removeLine = (index: number) => {
  if (lines.value.length <= 1) return
  lines.value.splice(index, 1)
}

const handleSave = () => {
  lineError.value = ''
  const validLines = lines.value.filter(l => l.commodityTicker && l.quantity > 0)
  if (validLines.length === 0) {
    lineError.value = 'At least one material line is required'
    return
  }
  const tickers = validLines.map(l => l.commodityTicker)
  if (new Set(tickers).size !== tickers.length) {
    lineError.value = 'Each material can only appear once in the recipe'
    return
  }

  const payload: CreateRecipeRequest = {
    name: name.value.trim(),
    type: type.value,
    salePrice: salePrice.value,
    currency: currency.value,
    description: description.value.trim() || null,
    isActive: isActive.value,
    inputs: validLines.map(l => ({
      commodityTicker: l.commodityTicker as string,
      quantity: l.quantity,
    })),
  }
  emit('save', payload)
}

const close = () => {
  dialogOpen.value = false
}
</script>
