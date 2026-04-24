<template>
  <div>
    <div class="d-flex align-center mb-1 mt-3 ga-2">
      <v-icon size="small" :color="warn ? 'warning' : undefined">{{ icon }}</v-icon>
      <span class="text-subtitle-2" :class="{ 'text-warning': warn }">{{ title }}</span>
      <v-tooltip v-if="warnMessage" location="top" max-width="360" open-delay="150">
        <template #activator="{ props: tipProps }">
          <v-icon v-bind="tipProps" size="x-small" color="warning">mdi-alert-circle</v-icon>
        </template>
        {{ warnMessage }}
      </v-tooltip>
      <v-tooltip v-if="$slots.help" location="top" max-width="360" open-delay="150">
        <template #activator="{ props: tipProps }">
          <v-icon v-bind="tipProps" size="x-small" color="grey">mdi-information-outline</v-icon>
        </template>
        <slot name="help" />
      </v-tooltip>
      <v-chip v-if="count !== undefined" size="x-small" variant="tonal">{{ count }}</v-chip>
      <v-spacer />
      <v-btn
        v-if="actionLabel"
        size="x-small"
        variant="tonal"
        prepend-icon="mdi-plus"
        @click="emit('action')"
      >
        {{ actionLabel }}
      </v-btn>
    </div>
    <p
      v-if="emptyLabel && count === 0"
      class="text-caption text-medium-emphasis mb-2"
    >
      {{ emptyLabel }}
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** MDI icon shown to the left of the title. */
  icon: string
  title: string
  /** Optional row count displayed as a chip beside the title. */
  count?: number
  /** Optional small caption shown below when count===0. */
  emptyLabel?: string
  /** When set, renders an "Add …" button on the right that emits `action`. */
  actionLabel?: string
  /** Highlights the header in warning-accent; pairs with the preview issue list. */
  warn?: boolean
  /** Tooltip text shown on the warning icon when `warn` is true. */
  warnMessage?: string
}>()

const emit = defineEmits<(e: 'action') => void>()
</script>
