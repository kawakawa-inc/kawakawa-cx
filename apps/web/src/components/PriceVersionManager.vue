<template>
  <v-card variant="outlined" class="mb-4">
    <v-card-text class="py-2">
      <div class="d-flex align-center flex-wrap ga-2">
        <span class="text-body-2 text-medium-emphasis mr-1">Version:</span>
        <v-chip-group v-model="selectedVersionModel" mandatory>
          <v-chip
            v-for="v in versions"
            :key="v.version"
            :value="v.version"
            :color="v.isCurrent ? 'success' : 'primary'"
            :variant="
              v.version === selectedVersionModel ? 'flat' : v.isCurrent ? 'tonal' : 'outlined'
            "
            size="small"
          >
            v{{ v.version }}
            <span v-if="v.label" class="ml-1 text-caption">({{ v.label }})</span>
            <span class="ml-1 text-caption">
              · {{ v.defaultLocationName ?? v.defaultLocationId }}
            </span>
            <v-icon v-if="v.isCurrent" end size="x-small">mdi-check-circle</v-icon>
          </v-chip>
        </v-chip-group>

        <v-spacer />

        <v-btn
          v-if="canManage"
          size="small"
          variant="tonal"
          prepend-icon="mdi-plus"
          @click="createDialog = true"
        >
          New Version
        </v-btn>
        <v-btn
          v-if="canManage && selectedVersion && !selectedVersion.isCurrent"
          size="small"
          variant="tonal"
          color="success"
          prepend-icon="mdi-arrow-up-circle"
          @click="promoteDialog = true"
        >
          Promote
        </v-btn>
        <v-btn
          v-if="versions.length >= 2"
          size="small"
          variant="tonal"
          prepend-icon="mdi-compare-horizontal"
          @click="openDiffDialog"
        >
          Compare
        </v-btn>
        <v-btn
          v-if="canManage && selectedVersion && !selectedVersion.isCurrent"
          size="small"
          variant="tonal"
          color="error"
          icon="mdi-delete"
          @click="deleteDialog = true"
        />
      </div>

      <!-- Non-current version banner -->
      <v-alert
        v-if="selectedVersion && !selectedVersion.isCurrent"
        type="info"
        variant="tonal"
        density="compact"
        class="mt-2"
      >
        Viewing version {{ selectedVersionModel
        }}{{ selectedVersion.label ? ` - ${selectedVersion.label}` : '' }}. Prices shown are not the
        active version.
      </v-alert>
    </v-card-text>
  </v-card>

  <!-- Create Version Dialog -->
  <v-dialog v-model="createDialog" max-width="500">
    <v-card>
      <v-card-title>Create New Version</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="createForm.label"
          label="Label"
          placeholder="e.g., Phase 2 - Refined Goods"
          hint="Optional label for this version"
          persistent-hint
          class="mb-3"
        />
        <v-textarea v-model="createForm.description" label="Description" rows="2" class="mb-3" />
        <v-autocomplete
          v-model="createForm.defaultLocationId"
          :items="locationOptions"
          item-title="display"
          item-value="key"
          label="Default Location *"
          hint="Required: base location for this version (e.g., where this phase's prices live)"
          persistent-hint
          class="mb-3"
        />
        <v-select
          v-model="createForm.copyFrom"
          :items="copyFromOptions"
          label="Copy prices from"
          hint="Start with prices from an existing version, or start empty"
          persistent-hint
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="createDialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="!createForm.defaultLocationId"
          @click="createVersion"
        >
          Create
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Promote Dialog -->
  <v-dialog v-model="promoteDialog" max-width="400">
    <v-card>
      <v-card-title>Promote Version {{ selectedVersionModel }}</v-card-title>
      <v-card-text>
        This will make version {{ selectedVersionModel
        }}{{ selectedVersion?.label ? ` (${selectedVersion.label})` : '' }} the active version for
        <strong>{{ priceListCode }}</strong
        >. All consumers will immediately see this version's prices.
        <v-alert
          v-if="
            currentVersion &&
            selectedVersion &&
            currentVersion.defaultLocationId !== selectedVersion.defaultLocationId
          "
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          Default location will change from
          <strong>{{
            currentVersion.defaultLocationName ?? currentVersion.defaultLocationId
          }}</strong>
          to
          <strong>{{
            selectedVersion.defaultLocationName ?? selectedVersion.defaultLocationId
          }}</strong
          >.
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="promoteDialog = false">Cancel</v-btn>
        <v-btn color="success" :loading="saving" @click="promote">Promote</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Delete Dialog -->
  <v-dialog v-model="deleteDialog" max-width="400">
    <v-card>
      <v-card-title>Delete Version {{ selectedVersionModel }}</v-card-title>
      <v-card-text>
        This will permanently delete version {{ selectedVersionModel }} and all
        {{ selectedVersion?.priceCount ?? 0 }} prices in it. This cannot be undone.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="deleteDialog = false">Cancel</v-btn>
        <v-btn color="error" :loading="saving" @click="deleteVersion">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Diff Dialog -->
  <v-dialog v-model="diffDialog" max-width="800">
    <v-card>
      <v-card-title class="d-flex align-center">
        Compare Versions
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="diffDialog = false" />
      </v-card-title>
      <v-card-text>
        <div class="d-flex ga-4 mb-4">
          <v-select
            v-model="diffFrom"
            :items="
              versions.map(v => ({
                title: `v${v.version}${v.isCurrent ? ' (current)' : ''}${v.label ? ' - ' + v.label : ''}`,
                value: v.version,
              }))
            "
            label="From"
            density="compact"
            hide-details
            style="max-width: 250px"
          />
          <v-icon>mdi-arrow-right</v-icon>
          <v-select
            v-model="diffTo"
            :items="
              versions.map(v => ({
                title: `v${v.version}${v.isCurrent ? ' (current)' : ''}${v.label ? ' - ' + v.label : ''}`,
                value: v.version,
              }))
            "
            label="To"
            density="compact"
            hide-details
            style="max-width: 250px"
          />
          <v-btn
            variant="tonal"
            :loading="loadingDiff"
            :disabled="diffFrom === diffTo"
            @click="loadDiff"
          >
            Compare
          </v-btn>
        </div>

        <div v-if="diff">
          <v-alert
            v-if="diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0"
            type="success"
            variant="tonal"
            density="compact"
          >
            No differences. {{ diff.unchanged }} prices are identical.
          </v-alert>
          <template v-else>
            <div class="text-body-2 text-medium-emphasis mb-2">
              {{ diff.changed.length }} changed, {{ diff.added.length }} added,
              {{ diff.removed.length }} removed, {{ diff.unchanged }} unchanged
            </div>
            <v-table
              v-if="diff.changed.length > 0 || diff.added.length > 0 || diff.removed.length > 0"
              density="compact"
            >
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Commodity</th>
                  <th>Location</th>
                  <th class="text-right">v{{ diffFrom }} Price</th>
                  <th class="text-right">v{{ diffTo }} Price</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in diff.changed"
                  :key="'c-' + entry.commodityTicker + entry.locationId"
                >
                  <td><v-chip size="x-small" color="warning">Changed</v-chip></td>
                  <td>{{ entry.commodityTicker }}</td>
                  <td>{{ entry.locationId }}</td>
                  <td class="text-right">{{ entry.oldPrice }}</td>
                  <td class="text-right">{{ entry.newPrice }}</td>
                </tr>
                <tr
                  v-for="entry in diff.added"
                  :key="'a-' + entry.commodityTicker + entry.locationId"
                >
                  <td><v-chip size="x-small" color="success">Added</v-chip></td>
                  <td>{{ entry.commodityTicker }}</td>
                  <td>{{ entry.locationId }}</td>
                  <td class="text-right text-medium-emphasis">--</td>
                  <td class="text-right">{{ entry.newPrice }}</td>
                </tr>
                <tr
                  v-for="entry in diff.removed"
                  :key="'r-' + entry.commodityTicker + entry.locationId"
                >
                  <td><v-chip size="x-small" color="error">Removed</v-chip></td>
                  <td>{{ entry.commodityTicker }}</td>
                  <td>{{ entry.locationId }}</td>
                  <td class="text-right">{{ entry.oldPrice }}</td>
                  <td class="text-right text-medium-emphasis">--</td>
                </tr>
              </tbody>
            </v-table>
          </template>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { api } from '../services/api'
import type { VersionSummary, VersionDiff } from '../services/api'
import { locationService } from '../services/locationService'
import { useUserStore } from '../stores/user'

const props = defineProps<{
  priceListCode: string
  canManage: boolean
}>()

const selectedVersionModel = defineModel<number>('selectedVersion', { required: true })

const emit = defineEmits<{
  versionsChanged: []
}>()

// State
const versions = ref<VersionSummary[]>([])
const saving = ref(false)
const createDialog = ref(false)
const promoteDialog = ref(false)
const deleteDialog = ref(false)
const diffDialog = ref(false)
const loadingDiff = ref(false)
const diff = ref<VersionDiff | null>(null)
const diffFrom = ref<number>(1)
const diffTo = ref<number>(1)

const userStore = useUserStore()

const createForm = ref({
  label: '',
  description: '',
  defaultLocationId: '' as string,
  copyFrom: 'current' as number | 'current' | 'latest' | 'empty',
})

const locationOptions = computed(() =>
  locationService.getAllLocationsSync().map(loc => ({
    key: loc.id,
    display: locationService.getLocationDisplay(loc.id, userStore.getLocationDisplayMode()),
  }))
)

const selectedVersion = computed(() =>
  versions.value.find(v => v.version === selectedVersionModel.value)
)

const currentVersion = computed(() => versions.value.find(v => v.isCurrent))

const copyFromOptions = computed(() => {
  const options: { title: string; value: number | 'current' | 'latest' | 'empty' }[] = [
    { title: 'Current version', value: 'current' },
    { title: 'Latest version', value: 'latest' },
    { title: 'Start empty', value: 'empty' },
  ]
  for (const v of versions.value) {
    options.push({
      title: `Version ${v.version}${v.label ? ' - ' + v.label : ''}`,
      value: v.version,
    })
  }
  return options
})

const loadVersions = async () => {
  try {
    versions.value = await api.priceLists.versions.list(props.priceListCode)

    // If selected version doesn't exist in the list, select the current version
    if (!versions.value.find(v => v.version === selectedVersionModel.value)) {
      const current = versions.value.find(v => v.isCurrent)
      if (current) {
        selectedVersionModel.value = current.version
      }
    }
  } catch (error) {
    console.error('Failed to load versions:', error)
  }
}

const createVersion = async () => {
  if (!createForm.value.defaultLocationId) return
  try {
    saving.value = true
    const request: {
      label?: string
      description?: string
      defaultLocationId: string
      copyFrom?: number | 'current' | 'latest'
    } = { defaultLocationId: createForm.value.defaultLocationId }
    if (createForm.value.label) request.label = createForm.value.label
    if (createForm.value.description) request.description = createForm.value.description
    if (createForm.value.copyFrom !== 'empty') request.copyFrom = createForm.value.copyFrom

    const newVersion = await api.priceLists.versions.create(props.priceListCode, request)
    createDialog.value = false
    createForm.value = { label: '', description: '', defaultLocationId: '', copyFrom: 'current' }
    await loadVersions()
    selectedVersionModel.value = newVersion.version
    emit('versionsChanged')
  } catch (error) {
    console.error('Failed to create version:', error)
  } finally {
    saving.value = false
  }
}

const promote = async () => {
  try {
    saving.value = true
    await api.priceLists.versions.promote(props.priceListCode, selectedVersionModel.value)
    promoteDialog.value = false
    await loadVersions()
    emit('versionsChanged')
  } catch (error) {
    console.error('Failed to promote version:', error)
  } finally {
    saving.value = false
  }
}

const deleteVersion = async () => {
  try {
    saving.value = true
    const deletedVersion = selectedVersionModel.value
    await api.priceLists.versions.delete(props.priceListCode, deletedVersion)
    deleteDialog.value = false
    // Select current version after deletion
    const current = versions.value.find(v => v.isCurrent)
    if (current) {
      selectedVersionModel.value = current.version
    }
    await loadVersions()
    emit('versionsChanged')
  } catch (error) {
    console.error('Failed to delete version:', error)
  } finally {
    saving.value = false
  }
}

const openDiffDialog = () => {
  const current = versions.value.find(v => v.isCurrent)
  diffFrom.value = current?.version ?? versions.value[0]?.version ?? 1
  diffTo.value =
    selectedVersionModel.value !== diffFrom.value
      ? selectedVersionModel.value
      : (versions.value[versions.value.length - 1]?.version ?? 1)
  diff.value = null
  diffDialog.value = true
}

const loadDiff = async () => {
  try {
    loadingDiff.value = true
    diff.value = await api.priceLists.versions.diff(
      props.priceListCode,
      diffFrom.value,
      diffTo.value
    )
  } catch (error) {
    console.error('Failed to load diff:', error)
  } finally {
    loadingDiff.value = false
  }
}

// Pre-fill default location when opening Create dialog (mirrors current version)
watch(createDialog, open => {
  if (open) {
    const current = versions.value.find(v => v.isCurrent)
    createForm.value.defaultLocationId = current?.defaultLocationId ?? ''
  }
})

// Load versions when price list code changes
watch(() => props.priceListCode, loadVersions, { immediate: true })

defineExpose({ loadVersions })
</script>
