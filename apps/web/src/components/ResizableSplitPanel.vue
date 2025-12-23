<template>
  <div ref="containerRef" class="resizable-split">
    <div class="split-top" :style="topStyle">
      <slot name="top" />
    </div>
    <div
      class="split-divider"
      :class="{ dragging: isDragging }"
      @mousedown.stop.prevent="startResize"
      @touchstart.stop.prevent="startResize"
    >
      <slot name="divider">
        <div class="divider-handle">
          <v-icon size="small" class="handle-icon">mdi-drag-horizontal</v-icon>
        </div>
      </slot>
    </div>
    <div class="split-bottom" :style="bottomStyle">
      <slot name="bottom" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

interface Props {
  /** Minimum height for top panel in pixels */
  topMinHeight?: number
  /** Minimum height for bottom panel in pixels */
  bottomMinHeight?: number
  /** localStorage key for persisting the split ratio */
  storageKey?: string
  /** Initial ratio (0-1) of top panel */
  initialRatio?: number
}

const props = withDefaults(defineProps<Props>(), {
  topMinHeight: 100,
  bottomMinHeight: 100,
  storageKey: '',
  initialRatio: 0.5,
})

const emit = defineEmits<{
  (e: 'resize', ratio: number): void
}>()

const DIVIDER_HEIGHT = 12

const containerRef = ref<HTMLElement | null>(null)
const ratio = ref(props.initialRatio)
const isDragging = ref(false)
const containerHeight = ref(0)

// Update container height
const updateContainerHeight = () => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
  }
}

// Calculate available height for panels (excluding divider)
const availableHeight = computed(() => {
  return Math.max(0, containerHeight.value - DIVIDER_HEIGHT)
})

// Top panel height in pixels
const topStyle = computed(() => {
  const height = Math.max(props.topMinHeight, availableHeight.value * ratio.value)
  return {
    height: `${height}px`,
    minHeight: `${props.topMinHeight}px`,
    overflow: 'auto',
  }
})

// Bottom panel height in pixels
const bottomStyle = computed(() => {
  const height = Math.max(props.bottomMinHeight, availableHeight.value * (1 - ratio.value))
  return {
    height: `${height}px`,
    minHeight: `${props.bottomMinHeight}px`,
    overflow: 'auto',
  }
})

// Load ratio from localStorage on mount
onMounted(() => {
  if (props.storageKey) {
    const stored = localStorage.getItem(props.storageKey)
    if (stored) {
      const parsed = parseFloat(stored)
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        ratio.value = parsed
      }
    }
  }

  // Initial height calculation
  updateContainerHeight()

  // Watch for container resize
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateContainerHeight()
    })
    resizeObserver.observe(containerRef.value)
  }
})

let resizeObserver: ResizeObserver | null = null

// Save ratio to localStorage when changed
const saveRatio = () => {
  if (props.storageKey) {
    localStorage.setItem(props.storageKey, ratio.value.toString())
  }
}

// Watch ratio changes to save
watch(ratio, () => {
  saveRatio()
})

// Start resize operation
const startResize = (event: MouseEvent | TouchEvent) => {
  event.preventDefault()
  isDragging.value = true

  // Add listeners to document for mouse/touch move and up
  document.addEventListener('mousemove', onResize, { passive: false })
  document.addEventListener('mouseup', stopResize)
  document.addEventListener('touchmove', onResize, { passive: false })
  document.addEventListener('touchend', stopResize)

  // Prevent text selection during drag
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'row-resize'
}

// Handle resize movement
const onResize = (event: MouseEvent | TouchEvent) => {
  event.preventDefault()

  if (!isDragging.value || !containerRef.value) return

  const container = containerRef.value
  const rect = container.getBoundingClientRect()
  const totalHeight = rect.height

  // Get Y position from mouse or touch
  let clientY: number
  if ('touches' in event && event.touches.length > 0) {
    clientY = event.touches[0].clientY
  } else if ('clientY' in event) {
    clientY = event.clientY
  } else {
    return
  }

  // Calculate new ratio based on position relative to container
  const relativeY = clientY - rect.top
  let newRatio = relativeY / totalHeight

  // Clamp ratio to respect min heights
  const minTopRatio = props.topMinHeight / totalHeight
  const minBottomRatio = props.bottomMinHeight / totalHeight
  const maxRatio = 1 - minBottomRatio

  newRatio = Math.max(minTopRatio, Math.min(maxRatio, newRatio))

  ratio.value = newRatio
  emit('resize', newRatio)
}

// Stop resize operation
const stopResize = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('touchmove', onResize)
  document.removeEventListener('touchend', stopResize)

  // Restore body styles
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

// Cleanup on unmount
onUnmounted(() => {
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('touchmove', onResize)
  document.removeEventListener('touchend', stopResize)

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  // Restore body styles
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
})

// Expose methods for programmatic control
defineExpose({
  setRatio: (newRatio: number) => {
    ratio.value = Math.max(0, Math.min(1, newRatio))
  },
  getRatio: () => ratio.value,
})
</script>

<style scoped>
.resizable-split {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.split-top,
.split-bottom {
  position: relative;
  flex-shrink: 0;
}

.split-divider {
  flex-shrink: 0;
  height: 12px;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s;
  user-select: none;
  position: relative;
  z-index: 10;
  touch-action: none;
}

.split-divider:hover,
.split-divider.dragging {
  background: rgba(var(--v-theme-primary), 0.3);
}

.divider-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  pointer-events: none;
}

.handle-icon {
  color: rgba(var(--v-theme-on-surface), 0.5);
  pointer-events: none;
}

.split-divider:hover .handle-icon,
.split-divider.dragging .handle-icon {
  color: rgb(var(--v-theme-primary));
}
</style>
