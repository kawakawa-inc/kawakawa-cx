<template>
  <v-dialog v-model="dialog" max-width="500">
    <v-card>
      <v-card-title>
        <span class="text-h6">Sell to {{ buyer?.buyerName }}</span>
      </v-card-title>

      <v-card-text>
        <v-alert v-if="error" type="error" class="mb-4">{{ error }}</v-alert>

        <div v-if="buyer" class="mb-4">
          <div class="text-body-2 text-medium-emphasis mb-2">Order Details</div>
          <v-chip size="small" variant="tonal" class="mr-2">
            {{ formatPrice(buyer) }}
          </v-chip>
          <v-chip v-if="buyer.isStanding" size="small" color="info" variant="tonal" class="mr-2">
            &infin; Standing Order
          </v-chip>
          <v-chip v-else size="small" variant="tonal" class="mr-2">
            Wants {{ buyer.remainingQuantity.toLocaleString() }}
          </v-chip>
        </div>

        <v-text-field
          v-model.number="quantity"
          label="Quantity to sell"
          type="number"
          :min="1"
          :max="effectiveMax"
          :rules="[rules.required, rules.positive, rules.maxQuantity]"
          :hint="quantityHint"
          persistent-hint
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="success"
          variant="flat"
          :loading="submitting"
          :disabled="!isValid"
          @click="submit"
        >
          Sell {{ quantity > 0 ? quantity.toLocaleString() : '' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { api, type MarketBuyRequest } from '../services/api'

const props = defineProps<{
  modelValue: boolean
  buyer: MarketBuyRequest | null
  maxQuantity: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: []
}>()

const dialog = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const quantity = ref(0)
const submitting = ref(false)
const error = ref<string | null>(null)

// For standing orders, no max from the order; just use inventory max
// For regular orders, use the smaller of inventory and remaining quantity
const effectiveMax = computed(() => {
  if (!props.buyer) return props.maxQuantity
  if (props.buyer.isStanding) return props.maxQuantity
  return Math.min(props.maxQuantity, props.buyer.remainingQuantity)
})

const quantityHint = computed(() => {
  const parts: string[] = []
  parts.push(`You have ${props.maxQuantity.toLocaleString()} available`)
  if (props.buyer && !props.buyer.isStanding) {
    parts.push(`buyer wants ${props.buyer.remainingQuantity.toLocaleString()}`)
  }
  return parts.join(', ')
})

const rules = {
  required: (v: number) => (v !== null && v !== undefined) || 'Required',
  positive: (v: number) => v > 0 || 'Must be greater than 0',
  maxQuantity: (v: number) =>
    v <= effectiveMax.value || `Max ${effectiveMax.value.toLocaleString()}`,
}

const isValid = computed(() => {
  return quantity.value > 0 && quantity.value <= effectiveMax.value
})

const formatPrice = (buyer: MarketBuyRequest): string => {
  const price =
    buyer.pricingMode === 'dynamic' ? (buyer.effectivePrice ?? buyer.price) : buyer.price
  return `${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${buyer.currency}`
}

const close = () => {
  dialog.value = false
  error.value = null
}

const submit = async () => {
  if (!props.buyer || !isValid.value) return

  submitting.value = true
  error.value = null

  try {
    await api.reservations.createForBuyOrder({
      buyOrderId: props.buyer.id,
      quantity: quantity.value,
    })
    emit('created')
    close()
  } catch (err) {
    console.error('Failed to create reservation', err)
    error.value = err instanceof Error ? err.message : 'Failed to create reservation'
  } finally {
    submitting.value = false
  }
}

// Reset quantity when dialog opens
watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) {
      // Default to max sellable quantity
      quantity.value = effectiveMax.value
      error.value = null
    }
  }
)
</script>
