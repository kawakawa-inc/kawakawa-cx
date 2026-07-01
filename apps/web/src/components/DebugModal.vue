<template>
  <v-dialog v-model="open" max-width="700" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-bug</v-icon>
        Debug Info
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="open = false" />
      </v-card-title>
      <v-divider />
      <v-card-text style="max-height: 70vh" class="pa-0">
        <v-expansion-panels variant="accordion" multiple>
          <v-expansion-panel v-for="(section, i) in sections" :key="section.title" :value="i">
            <v-expansion-panel-title>
              <span class="text-subtitle-2">{{ section.title }}</span>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-table density="compact" class="debug-table">
                <tbody>
                  <tr v-for="(val, key) in section.data" :key="key">
                    <td class="text-caption font-weight-medium text-medium-emphasis pr-4">
                      {{ key }}
                    </td>
                    <td class="text-caption">
                      <template v-if="isTruncated(val)">
                        <a
                          href="#"
                          class="truncated-value"
                          @click.prevent="openDetail(key as string, val)"
                        >
                          {{ truncate(val) }}
                        </a>
                      </template>
                      <template v-else>
                        <code>{{ formatValue(val) }}</code>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn size="small" variant="text" @click="copyToClipboard">
          <v-icon size="small" class="mr-1">mdi-content-copy</v-icon>
          Copy All
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Detail dialog for expanded values -->
  <v-dialog v-model="detailOpen" max-width="600">
    <v-card>
      <v-card-title class="d-flex align-center text-subtitle-1">
        {{ detailKey }}
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" size="small" @click="detailOpen = false" />
      </v-card-title>
      <v-divider />
      <v-card-text>
        <pre class="detail-pre">{{ detailFormatted }}</pre>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn size="small" variant="text" @click="copyDetail">
          <v-icon size="small" class="mr-1">mdi-content-copy</v-icon>
          Copy
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { debugState } from '../composables/useDebug'
import { useSnackbar } from '../composables'

const open = defineModel<boolean>({ default: false })

const { showSnackbar } = useSnackbar()

const sections = computed(() => debugState.getSections())

// Detail dialog state
const detailOpen = ref(false)
const detailKey = ref('')
const detailRaw = ref<unknown>(null)

const TRUNCATE_LEN = 120

const formatValue = (val: unknown): string => {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

const isTruncated = (val: unknown): boolean => {
  if (val === null || val === undefined) return false
  if (typeof val === 'object') return true
  return String(val).length > TRUNCATE_LEN
}

const truncate = (val: unknown): string => {
  if (val === null || val === undefined) return '—'
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
  return str.length > TRUNCATE_LEN ? str.slice(0, TRUNCATE_LEN) + '…' : str
}

const tryParseJson = (val: unknown): unknown => {
  if (typeof val !== 'string') return val
  try {
    return JSON.parse(val)
  } catch {
    return val
  }
}

const detailFormatted = computed(() => {
  const parsed = tryParseJson(detailRaw.value)
  if (typeof parsed === 'object' && parsed !== null) {
    return JSON.stringify(parsed, null, 2)
  }
  return String(detailRaw.value ?? '')
})

const openDetail = (key: string, val: unknown) => {
  detailKey.value = key
  detailRaw.value = val
  detailOpen.value = true
}

const copyDetail = async () => {
  try {
    await navigator.clipboard.writeText(detailFormatted.value)
    showSnackbar('Copied to clipboard', 'success')
  } catch {
    showSnackbar('Failed to copy', 'error')
  }
}

const copyToClipboard = async () => {
  const text = sections.value
    .map(s => {
      const rows = Object.entries(s.data)
        .map(([k, v]) => `  ${k}: ${formatValue(v)}`)
        .join('\n')
      return `## ${s.title}\n${rows}`
    })
    .join('\n\n')

  try {
    await navigator.clipboard.writeText(text)
    showSnackbar('Copied to clipboard', 'success')
  } catch {
    showSnackbar('Failed to copy', 'error')
  }
}
</script>

<style scoped>
.debug-table td {
  white-space: pre-wrap;
  word-break: break-all;
}

.debug-table code {
  font-size: 0.75rem;
}

.truncated-value {
  font-size: 0.75rem;
  font-family: monospace;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  cursor: pointer;
}

.truncated-value:hover {
  text-decoration: underline;
}

.detail-pre {
  font-size: 0.8rem;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 4px;
  padding: 12px;
  max-height: 50vh;
  overflow-y: auto;
}
</style>
