<template>
  <v-dialog
    v-model="dialog"
    max-width="600"
    :persistent="dialogBehavior.persistent.value"
    :no-click-animation="dialogBehavior.noClickAnimation"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>{{ isEdit ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
        {{ isEdit ? 'Edit Import Configuration' : 'Create Import Configuration' }}
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent="save">
          <v-text-field
            v-model="form.name"
            label="Configuration Name *"
            :rules="[v => !!v || 'Name is required']"
            hint="A friendly name for this import configuration"
            persistent-hint
            class="mb-4"
          />

          <v-select
            v-model="form.priceListCode"
            :items="priceListOptions"
            label="Target Price List *"
            :disabled="isEdit || !!props.priceListCode"
            :rules="[v => !!v || 'Price list is required']"
            class="mb-4"
          />

          <v-select
            v-model="form.sourceType"
            :items="sourceTypeOptions"
            label="Source Type *"
            :rules="[v => !!v || 'Source type is required']"
            class="mb-4"
          />

          <v-select
            v-model="form.format"
            :items="availableFormatOptions"
            label="Data Format *"
            :rules="[v => !!v || 'Format is required']"
            hint="Flat: ticker + price per row. Pivot: tickers as rows. KAWA: 2-row per commodity"
            persistent-hint
            class="mb-4"
          />

          <template v-if="form.sourceType === 'google_sheets'">
            <v-text-field
              v-model="form.sheetsUrl"
              label="Google Sheets URL"
              hint="The full URL of the Google Sheet"
              persistent-hint
              class="mb-4"
            />

            <v-text-field
              v-model.number="form.sheetGid"
              label="Sheet GID (Tab)"
              type="number"
              hint="Leave empty for the first tab, or specify the gid parameter from the URL"
              persistent-hint
              class="mb-4"
            />
          </template>

          <template v-if="form.sourceType === 'csv' && form.format === 'flat'">
            <div
              class="file-drop-zone pa-4 text-center rounded-lg mb-4"
              :class="{ 'drag-over': isDragging }"
              @click="triggerFileInput"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleFileDrop"
            >
              <v-icon size="36" color="grey-lighten-1" class="mb-2">mdi-file-delimited</v-icon>
              <div v-if="selectedFile">
                <p class="text-body-2 mb-1">{{ selectedFile.name }}</p>
                <p class="text-caption text-medium-emphasis mb-2">
                  {{ formatFileSize(selectedFile.size) }} — {{ detectedHeaders.length }} columns
                  detected
                </p>
                <v-btn size="small" color="error" variant="outlined" @click.stop="clearFile">
                  <v-icon start>mdi-close</v-icon> Remove
                </v-btn>
              </div>
              <div v-else>
                <p class="text-body-2 mb-1">Drop CSV file or click to browse</p>
                <p class="text-caption text-medium-emphasis">
                  Used to detect columns. Will be imported on save.
                </p>
              </div>
              <input
                ref="fileInput"
                type="file"
                accept=".csv,.txt,.tsv"
                style="display: none"
                @change="handleFileSelect"
              />
            </div>
          </template>

          <template v-if="form.format === 'flat'">
            <v-divider class="mb-4" />
            <p class="text-subtitle-2 mb-3">
              Field Mapping
              <v-tooltip activator="parent" location="top" max-width="300">
                Map each field to a column in your data — by header name (e.g., "Ticker") or column
                index (e.g., 0).
              </v-tooltip>
            </p>
            <v-row dense>
              <v-col cols="12" sm="6">
                <component
                  :is="hasDetectedHeaders ? 'v-select' : 'v-text-field'"
                  v-model="mappingTicker"
                  :items="hasDetectedHeaders ? columnOptions : undefined"
                  label="Ticker Column *"
                  :rules="[(v: unknown) => (v !== null && v !== '') || 'Required']"
                  density="compact"
                  hint="Header name or 0-based column index"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" sm="6">
                <component
                  :is="hasDetectedHeaders ? 'v-select' : 'v-text-field'"
                  v-model="mappingPrice"
                  :items="hasDetectedHeaders ? columnOptions : undefined"
                  label="Price Column *"
                  :rules="[(v: unknown) => (v !== null && v !== '') || 'Required']"
                  density="compact"
                  hint="Header name or 0-based column index"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" sm="6">
                <component
                  :is="hasDetectedHeaders ? 'v-select' : 'v-text-field'"
                  v-model="mappingLocation"
                  :items="hasDetectedHeaders ? optionalColumnOptions : undefined"
                  label="Location Column"
                  density="compact"
                  clearable
                  hint="Leave empty to use price list default location"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" sm="6">
                <component
                  :is="hasDetectedHeaders ? 'v-select' : 'v-text-field'"
                  v-model="mappingCurrency"
                  :items="hasDetectedHeaders ? optionalColumnOptions : undefined"
                  label="Currency Column"
                  density="compact"
                  clearable
                  hint="Leave empty to use price list currency"
                  persistent-hint
                />
              </v-col>
            </v-row>

            <div v-if="sampleData.length > 0" class="mt-3 mb-4">
              <p class="text-caption text-medium-emphasis mb-1">Sample Data</p>
              <v-table density="compact" class="sample-table">
                <thead>
                  <tr>
                    <th v-for="(h, i) in detectedHeaders" :key="i" class="text-caption">
                      {{ h || `Col ${i}` }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, ri) in sampleData.slice(0, 3)" :key="ri">
                    <td v-for="(cell, ci) in row" :key="ci" class="text-caption">{{ cell }}</td>
                  </tr>
                </tbody>
              </v-table>
            </div>
            <v-divider class="mb-4" />
          </template>

          <v-expansion-panels v-if="form.format === 'pivot'" class="mb-4">
            <v-expansion-panel title="Pivot Format Help">
              <v-expansion-panel-text>
                <p class="text-body-2 mb-2">
                  Pivot format expects data arranged like a spreadsheet:
                </p>
                <v-table density="compact" class="mb-2">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Montem</th>
                      <th>Vallis</th>
                      <th>Benten</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>DW</td>
                      <td>50</td>
                      <td>52</td>
                      <td>48</td>
                    </tr>
                    <tr>
                      <td>RAT</td>
                      <td>120</td>
                      <td>125</td>
                      <td>118</td>
                    </tr>
                  </tbody>
                </v-table>
                <p class="text-caption text-medium-emphasis">
                  The first column should contain commodity tickers. Column headers should match
                  location names or IDs (e.g., "Montem", "MON", "Vallis", "VH-331a").
                </p>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-form>

        <v-alert
          v-if="errorMessage"
          type="error"
          class="mt-4"
          closable
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="save">
          {{ isEdit ? 'Save Changes' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  api,
  type ImportConfigResponse,
  type ImportSourceType,
  type ImportFormat,
  type PriceListDefinition,
  type CsvFieldMapping,
} from '../services/api'
import { useDialogBehavior } from '../composables'

const props = defineProps<{
  modelValue: boolean
  config?: ImportConfigResponse | null
  priceListCode?: string | null // Pre-fill for new configs
  version?: number | null // Pre-fill version for new configs
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', config: ImportConfigResponse): void
}>()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogBehavior = useDialogBehavior({ modelValue: dialog })

const isEdit = computed(() => !!props.config)

const formRef = ref()
const form = ref({
  name: '',
  priceListCode: '',
  sourceType: 'google_sheets' as ImportSourceType,
  format: 'flat' as ImportFormat,
  sheetsUrl: '' as string | null,
  sheetGid: null as number | null,
})
const saving = ref(false)
const errorMessage = ref('')
const priceLists = ref<PriceListDefinition[]>([])

// Field mapping state for flat format
const mappingTicker = ref<string | number | null>('Ticker')
const mappingPrice = ref<string | number | null>('Price')
const mappingLocation = ref<string | number | null>('Location')
const mappingCurrency = ref<string | number | null>(null)

// CSV file upload state (for csv source)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const isDragging = ref(false)
const detectedHeaders = ref<string[]>([])
const sampleData = ref<string[][]>([])

const sourceTypeOptions = [
  { title: 'Google Sheets', value: 'google_sheets' },
  { title: 'CSV File', value: 'csv' },
]

const formatOptions = [
  { title: 'Flat (ticker, price per row)', value: 'flat' },
  { title: 'Pivot (tickers as rows, locations as columns)', value: 'pivot' },
]

const availableFormatOptions = computed(() => {
  if (form.value.sourceType === 'csv') {
    return formatOptions.filter(o => o.value === 'flat')
  }
  return formatOptions
})

const hasDetectedHeaders = computed(() => detectedHeaders.value.length > 0)

const columnOptions = computed(() => {
  return detectedHeaders.value.map((h, i) => ({
    title: h ? `${h} (col ${i})` : `Column ${i}`,
    value: h || i,
  }))
})

const optionalColumnOptions = computed(() => [
  { title: '(None)', value: null },
  ...columnOptions.value,
])

const priceListOptions = computed(() => {
  return priceLists.value.map(pl => ({
    title: `${pl.code} - ${pl.name}`,
    value: pl.code,
  }))
})

const loadPriceLists = async () => {
  try {
    priceLists.value = await api.priceLists.list()
  } catch (error) {
    console.error('Failed to load price lists:', error)
  }
}

const buildFieldMapping = (): CsvFieldMapping | null => {
  if (form.value.format !== 'flat') return null
  const ticker = mappingTicker.value
  const price = mappingPrice.value
  if (ticker === null || ticker === '' || price === null || price === '') return null
  const mapping: CsvFieldMapping = {
    ticker: ticker as string | number,
    price: price as string | number,
  }
  if (mappingLocation.value !== null && mappingLocation.value !== '') {
    mapping.location = mappingLocation.value as string | number
  }
  if (mappingCurrency.value !== null && mappingCurrency.value !== '') {
    mapping.currency = mappingCurrency.value as string | number
  }
  return mapping
}

const save = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    errorMessage.value = ''

    const fieldMapping = buildFieldMapping()
    const configPayload = fieldMapping ? { fieldMapping } : null

    let result: ImportConfigResponse

    if (isEdit.value && props.config) {
      result = await api.importConfigs.update(props.config.id, {
        name: form.value.name,
        sheetsUrl: form.value.sheetsUrl || null,
        sheetGid: form.value.sheetGid,
        config: configPayload,
      })
    } else {
      result = await api.importConfigs.create({
        name: form.value.name,
        priceListCode: form.value.priceListCode,
        version: props.version ?? undefined,
        sourceType: form.value.sourceType,
        format: form.value.format,
        sheetsUrl: form.value.sheetsUrl || null,
        sheetGid: form.value.sheetGid,
        config: configPayload,
      })

      // For new CSV configs with an uploaded file, run an initial sync
      if (form.value.sourceType === 'csv' && selectedFile.value) {
        await api.importConfigs.syncUpload(
          result.id,
          selectedFile.value,
          props.version ?? undefined
        )
      }
    }

    emit('saved', result)
    close()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save import config'
  } finally {
    saving.value = false
  }
}

const close = () => {
  dialog.value = false
}

// CSV file handling
const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    processFile(input.files[0])
  }
}

const handleFileDrop = (event: DragEvent) => {
  isDragging.value = false
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    processFile(event.dataTransfer.files[0])
  }
}

const processFile = async (file: File) => {
  selectedFile.value = file
  const content = await file.text()
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) {
    detectedHeaders.value = []
    sampleData.value = []
    return
  }
  const delimiter = detectDelimiter(lines[0])
  detectedHeaders.value = parseCsvLine(lines[0], delimiter)
  sampleData.value = lines.slice(1, 4).map(line => parseCsvLine(line, delimiter))
  autoDetectMappings()
}

const clearFile = () => {
  selectedFile.value = null
  detectedHeaders.value = []
  sampleData.value = []
  if (fileInput.value) fileInput.value.value = ''
}

const detectDelimiter = (line: string): string => {
  const delimiters = [',', ';', '\t', '|']
  let maxCount = 0
  let detected = ','
  for (const d of delimiters) {
    const count = (line.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length
    if (count > maxCount) {
      maxCount = count
      detected = d
    }
  }
  return detected
}

const parseCsvLine = (line: string, delimiter: string): string[] => {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current.trim())
  return fields
}

const autoDetectMappings = () => {
  const headerLower = detectedHeaders.value.map(h => h.toLowerCase())
  const findHeader = (candidates: string[]): string | null => {
    for (const c of candidates) {
      const idx = headerLower.indexOf(c)
      if (idx >= 0) return detectedHeaders.value[idx]
    }
    return null
  }
  const ticker = findHeader(['ticker', 'symbol', 'commodity', 'material', 'mat'])
  if (ticker) mappingTicker.value = ticker
  const price = findHeader(['price', 'cost', 'value', 'amount', 'rate'])
  if (price) mappingPrice.value = price
  const location = findHeader(['location', 'loc', 'station', 'planet', 'place'])
  if (location) mappingLocation.value = location
  const currency = findHeader(['currency', 'curr', 'cur', 'ccy'])
  if (currency) mappingCurrency.value = currency
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' bytes'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const resetMappingState = (mapping: CsvFieldMapping | null, resetFile: boolean) => {
  mappingTicker.value = mapping?.ticker ?? 'Ticker'
  mappingPrice.value = mapping?.price ?? 'Price'
  mappingLocation.value = mapping?.location ?? 'Location'
  mappingCurrency.value = mapping?.currency ?? null
  if (resetFile) {
    clearFile()
  }
}

// Reset form when dialog opens/closes
watch(dialog, open => {
  if (open && props.config) {
    // Edit mode - populate form
    form.value = {
      name: props.config.name,
      priceListCode: props.config.priceListCode,
      sourceType: props.config.sourceType,
      format: props.config.format,
      sheetsUrl: props.config.sheetsUrl,
      sheetGid: props.config.sheetGid,
    }
    const existingMapping =
      (props.config.config?.fieldMapping as CsvFieldMapping | undefined) ?? null
    resetMappingState(existingMapping, true)
  } else if (open) {
    // Create mode - reset form with optional pre-fill
    form.value = {
      name: '',
      priceListCode: props.priceListCode || '',
      sourceType: 'google_sheets',
      format: 'flat',
      sheetsUrl: null,
      sheetGid: null,
    }
    resetMappingState(null, true)
  }
  errorMessage.value = ''
})

// Switch to flat if user picks csv with non-flat format
watch(
  () => form.value.sourceType,
  newType => {
    if (newType === 'csv' && form.value.format !== 'flat') {
      form.value.format = 'flat'
    }
  }
)

onMounted(() => {
  loadPriceLists()
})
</script>

<style scoped>
.file-drop-zone {
  border: 2px dashed rgba(var(--v-theme-on-surface), 0.3);
  transition: all 0.2s ease;
  cursor: pointer;
}
.file-drop-zone:hover,
.file-drop-zone.drag-over {
  border-color: rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-primary), 0.05);
}
.sample-table {
  font-size: 0.75rem;
}
.sample-table th,
.sample-table td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}
</style>
