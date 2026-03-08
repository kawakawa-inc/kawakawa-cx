<template>
  <v-chip :color="statusColor" :size="size" variant="tonal">
    <v-icon v-if="showIcon" start size="small">{{ statusIcon }}</v-icon>
    {{ statusLabel }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { InvoiceStatus } from '@kawakawa/types'

const props = withDefaults(
  defineProps<{
    status: InvoiceStatus
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    showIcon?: boolean
  }>(),
  {
    size: 'small',
    showIcon: true,
  }
)

const statusColor = computed(() => {
  switch (props.status) {
    case 'draft':
      return 'warning'
    case 'pending':
      return 'info'
    case 'confirmed':
      return 'primary'
    case 'fulfilled':
      return 'success'
    case 'partially_fulfilled':
      return 'secondary'
    case 'cancelled':
      return 'error'
    default:
      return 'default'
  }
})

const statusIcon = computed(() => {
  switch (props.status) {
    case 'draft':
      return 'mdi-pencil'
    case 'pending':
      return 'mdi-clock-outline'
    case 'confirmed':
      return 'mdi-check'
    case 'fulfilled':
      return 'mdi-check-circle'
    case 'partially_fulfilled':
      return 'mdi-circle-half-full'
    case 'cancelled':
      return 'mdi-cancel'
    default:
      return 'mdi-help'
  }
})

const statusLabel = computed(() => {
  switch (props.status) {
    case 'draft':
      return 'Draft'
    case 'pending':
      return 'Pending'
    case 'confirmed':
      return 'Confirmed'
    case 'fulfilled':
      return 'Fulfilled'
    case 'partially_fulfilled':
      return 'Partial'
    case 'cancelled':
      return 'Cancelled'
    default:
      return props.status
  }
})
</script>
