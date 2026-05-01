<template>
  <v-card>
    <v-card-title
      class="d-flex align-center text-subtitle-1 cursor-pointer"
      @click="expanded = !expanded"
    >
      <v-icon start>mdi-rocket-launch</v-icon>
      Ships
      <v-chip
        v-if="ships.length > 0"
        size="x-small"
        class="ml-2"
        variant="tonal"
        :color="anyLowFuel ? 'warning' : undefined"
      >
        {{ ships.length }}
      </v-chip>
      <v-chip
        v-if="oldestFioReport"
        size="x-small"
        class="ml-2"
        variant="tonal"
        :color="freshnessColor"
        :title="`Oldest FIO data timestamp: ${oldestFioReport}`"
      >
        <v-icon start size="x-small">mdi-clock-outline</v-icon>
        {{ relativeTime(oldestFioReport) }}
      </v-chip>
      <v-spacer />
      <v-btn
        size="x-small"
        variant="text"
        icon
        :title="expanded ? 'Collapse' : 'Expand'"
        @click.stop="expanded = !expanded"
      >
        <v-icon size="small">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      </v-btn>
    </v-card-title>

    <v-divider v-if="expanded" />

    <v-card-text v-if="expanded && loading" class="text-center text-medium-emphasis py-4">
      Loading ships…
    </v-card-text>

    <v-card-text v-else-if="expanded && ships.length === 0" class="text-medium-emphasis py-4">
      No ships synced yet. Trigger a FIO sync from your account page to pull your roster.
    </v-card-text>

    <v-list v-else-if="expanded" density="compact" class="py-0">
      <template v-for="(ship, idx) in ships" :key="ship.id">
        <v-list-item class="ship-row">
          <template #prepend>
            <v-icon
              :color="ship.inFlight ? 'info' : conditionColor(ship.condition)"
              :title="ship.inFlight ? 'In flight' : 'Parked'"
            >
              {{ ship.inFlight ? 'mdi-rocket-launch' : 'mdi-rocket' }}
            </v-icon>
          </template>
          <v-list-item-title class="d-flex align-center flex-wrap ga-2">
            <span class="font-weight-medium">{{ ship.name ?? ship.registration }}</span>
            <v-chip v-if="ship.name" size="x-small" variant="outlined">
              {{ ship.registration }}
            </v-chip>
            <v-chip
              v-if="ship.condition !== null"
              size="x-small"
              :color="conditionColor(ship.condition)"
              variant="tonal"
              :title="`Hull condition`"
            >
              {{ Math.round((ship.condition ?? 0) * 100) }}%
            </v-chip>
            <v-chip
              v-if="ship.flight?.arrivalAt"
              size="x-small"
              color="info"
              variant="tonal"
              :title="formatAbsolute(ship.flight.arrivalAt)"
            >
              <v-icon start size="x-small">mdi-airplane</v-icon>
              {{ relativeArrival(ship.flight.arrivalAt) }}
            </v-chip>
            <span
              v-if="ship.fioReportedAt"
              class="text-caption text-medium-emphasis ml-auto"
              :title="`FIO data from ${ship.fioReportedAt}`"
            >
              <v-icon size="x-small" class="mr-1">mdi-clock-outline</v-icon>
              {{ relativeTime(ship.fioReportedAt) }}
            </span>
          </v-list-item-title>
          <!--
            We deliberately use a plain <div> here, not <v-list-item-subtitle>:
            Vuetify's subtitle uses -webkit-box + line-clamp:2, which clips our
            multi-row layout and hides the progress-bar fill divs.
          -->
          <div class="ship-detail d-flex flex-column ga-1 mt-1">
            <span v-if="ship.inFlight && ship.flight" class="text-caption">
              <v-icon size="x-small" class="mr-1">mdi-airplane</v-icon>
              {{ locationDisplay(ship.flight.originNaturalId) }}
              →
              {{ locationDisplay(ship.flight.destinationNaturalId) }}
            </span>
            <span v-else-if="ship.locationNaturalId" class="text-caption">
              <v-icon size="x-small" class="mr-1">mdi-map-marker</v-icon>
              {{ locationDisplay(ship.locationNaturalId) }}
            </span>
            <div class="d-flex align-center ga-2" :title="cargoTooltip(ship)">
              <v-icon size="x-small" class="row-icon" aria-label="Cargo bay (mass / volume)">
                mdi-package-variant
              </v-icon>
              <CapacityBar
                label="Cargo"
                :load="ship.cargo.weightLoad"
                :capacity="ship.cargo.weightCapacity"
                :secondary-load="ship.cargo.volumeLoad"
                :secondary-capacity="ship.cargo.volumeCapacity"
                primary-unit="t"
                secondary-unit="m³"
                color="primary"
              />
            </div>
            <div class="d-flex align-center ga-2" :title="fuelTooltip(ship)">
              <v-icon size="x-small" class="row-icon" aria-label="Fuel (STL / FTL)">
                mdi-fuel
              </v-icon>
              <CapacityBar
                inline
                show-label-inline
                label="SF"
                :load="ship.stlFuel.amount"
                :capacity="ship.stlFuel.maxUnits"
                primary-unit=""
                color="warning"
              />
              <CapacityBar
                inline
                show-label-inline
                label="FF"
                :load="ship.ftlFuel.amount"
                :capacity="ship.ftlFuel.maxUnits"
                primary-unit=""
                color="info"
              />
            </div>
            <span
              v-if="ship.repairMaterials.length > 0"
              class="text-caption text-medium-emphasis"
              :title="ship.repairMaterials.map(m => `${m.amount} ${m.ticker}`).join(', ')"
            >
              <v-icon size="x-small" class="mr-1">mdi-wrench</v-icon>
              Repair: {{ totalRepair(ship) }} units
            </span>
          </div>
        </v-list-item>
        <v-divider v-if="idx < ships.length - 1" />
      </template>
    </v-list>
  </v-card>
</template>

<script setup lang="ts">
import { computed, h, defineComponent, ref, onMounted } from 'vue'
import { api } from '../../services/api'
import { locationService } from '../../services/locationService'
import { useUserStore } from '../../stores/user'
import type { UserShip } from '@kawakawa/types'

const userStore = useUserStore()
const ships = ref<UserShip[]>([])
const loading = ref(false)
const expanded = ref(true)

async function load() {
  loading.value = true
  try {
    ships.value = await api.logistics.listShips()
  } catch (e) {
    console.error('Failed to load ships', e)
    ships.value = []
  } finally {
    loading.value = false
  }
}

defineExpose({ reload: load })

onMounted(load)

function conditionColor(c: number | null): string {
  if (c == null) return 'grey'
  if (c >= 0.85) return 'success'
  if (c >= 0.7) return 'warning'
  return 'error'
}

function totalRepair(ship: UserShip): number {
  return ship.repairMaterials.reduce((s, m) => s + m.amount, 0)
}

/**
 * "5k", "5.8k", "127" — match PRUN's abbreviation style. Used for both tons
 * and m³ in the cargo bar so the two halves visually line up. One decimal
 * under 10k, integer above (e.g. 5.8k vs 12k).
 */
function abbreviate(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`
  return Math.round(n).toString()
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString()
}

function cargoTooltip(ship: UserShip): string {
  return (
    `Cargo bay: ${formatNumber(ship.cargo.weightLoad)}/${formatNumber(ship.cargo.weightCapacity)} t · ` +
    `${formatNumber(ship.cargo.volumeLoad)}/${formatNumber(ship.cargo.volumeCapacity)} m³`
  )
}

function fuelTooltip(ship: UserShip): string {
  return (
    `STL (SF): ${formatNumber(ship.stlFuel.amount)}/${formatNumber(ship.stlFuel.maxUnits)} units · ` +
    `${formatNumber(ship.stlFuel.weightLoad)}/${formatNumber(ship.stlFuel.weightCapacity)} t — ` +
    `FTL (FF): ${formatNumber(ship.ftlFuel.amount)}/${formatNumber(ship.ftlFuel.maxUnits)} units · ` +
    `${formatNumber(ship.ftlFuel.weightLoad)}/${formatNumber(ship.ftlFuel.weightCapacity)} t`
  )
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function formatAbsolute(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

/** "7h" / "2d 3h" / "in 12m" — relative arrival, no trailing date. */
function relativeArrival(iso: string): string {
  const remainingMs = new Date(iso).getTime() - Date.now()
  if (remainingMs <= 0) return 'arrived'
  const minutes = Math.floor(remainingMs / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remM = minutes - hours * 60
    return remM > 0 && hours < 6 ? `${hours}h ${remM}m` : `${hours}h`
  }
  const days = Math.floor(hours / 24)
  const remH = hours - days * 24
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`
}

function locationDisplay(naturalId: string | null): string {
  if (!naturalId) return '?'
  return locationService.getLocationDisplay(naturalId, userStore.getLocationDisplayMode())
}

function relativeTime(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime()
  if (ageMs < 0) return 'just now'
  const minutes = Math.floor(ageMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const oldestFioReport = computed<string | null>(() => {
  let oldest: number | null = null
  let isoForOldest: string | null = null
  for (const ship of ships.value) {
    if (!ship.fioReportedAt) continue
    const ms = new Date(ship.fioReportedAt).getTime()
    if (oldest === null || ms < oldest) {
      oldest = ms
      isoForOldest = ship.fioReportedAt
    }
  }
  return isoForOldest
})

const freshnessColor = computed<string | undefined>(() => {
  if (!oldestFioReport.value) return undefined
  const ageHours = (Date.now() - new Date(oldestFioReport.value).getTime()) / 3_600_000
  if (ageHours < 6) return 'success'
  if (ageHours < 24) return 'warning'
  return 'error'
})

const anyLowFuel = computed(() => {
  for (const ship of ships.value) {
    const stlPct = ship.stlFuel.maxUnits > 0 ? ship.stlFuel.amount / ship.stlFuel.maxUnits : 1
    const ftlPct = ship.ftlFuel.maxUnits > 0 ? ship.ftlFuel.amount / ship.ftlFuel.maxUnits : 1
    if (stlPct < 0.5 || ftlPct < 0.5) return true
  }
  return false
})

// Compact load/capacity bar with overlaid text. Used for cargo and both fuel
// types; keeps the layout dense and matches PRUN's fleet panel style.
//
// The bar is JUST the track + fill + overlaid text — no leading label. Callers
// place a row icon (mdi-package-variant, mdi-fuel, …) outside, mirroring the
// other rows in the ship roster (location, repair, etc).
//
// `inline` toggles flex sizing so multiple bars can share a row (e.g. SF + FF
// under one Fuel icon). `showLabelInline` adds a `label` prefix inside the
// overlaid text — useful for SF/FF since two bars in one row need to be
// distinguishable at a glance.
const CapacityBar = defineComponent({
  name: 'CapacityBar',
  props: {
    label: { type: String, default: '' },
    load: { type: Number, required: true },
    capacity: { type: Number, required: true },
    primaryUnit: { type: String, default: '' },
    secondaryLoad: { type: Number, default: 0 },
    secondaryCapacity: { type: Number, default: 0 },
    secondaryUnit: { type: String, default: '' },
    color: { type: String, default: 'primary' },
    title: { type: String, default: '' },
    inline: { type: Boolean, default: false },
    showLabelInline: { type: Boolean, default: false },
  },
  setup(props) {
    const pct = computed(() => {
      if (props.capacity <= 0) return 0
      return Math.max(0, Math.min(1, props.load / props.capacity))
    })
    const text = computed(() => {
      const primary = `${abbreviate(props.load)}/${abbreviate(props.capacity)}${
        props.primaryUnit ? ' ' + props.primaryUnit : ''
      }`
      const withSecondary =
        props.secondaryCapacity > 0 && props.secondaryUnit
          ? `${primary} · ${abbreviate(props.secondaryLoad)}/${abbreviate(
              props.secondaryCapacity
            )} ${props.secondaryUnit}`
          : primary
      return props.showLabelInline && props.label
        ? `${props.label} ${withSecondary}`
        : withSecondary
    })
    return () => {
      const fallbackTitle = `${props.label}: ${formatNumber(props.load)}/${formatNumber(
        props.capacity
      )}${props.primaryUnit ? ' ' + props.primaryUnit : ''}`
      return h(
        'div',
        {
          class: ['capacity-track', { 'capacity-track-inline': props.inline }],
          title: props.title || fallbackTitle,
        },
        [
          h('div', {
            class: `capacity-fill bg-${props.color}`,
            style: { width: `${pct.value * 100}%` },
          }),
          h('span', { class: 'capacity-text text-caption' }, text.value),
        ]
      )
    }
  },
})
</script>

<style scoped>
.ship-row {
  align-items: flex-start;
}

.row-icon {
  flex: 0 0 auto;
  width: 18px;
  color: rgba(255, 255, 255, 0.55);
}

/*
 * Bar internals are rendered by an inline `defineComponent` (h()), so they
 * don't carry this SFC's data-v-* scope hash. :deep() pierces scope.
 */
:deep(.capacity-track) {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 16px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}

/* Inline tracks share a flex row (e.g. SF + FF under one Fuel icon). */
:deep(.capacity-track-inline) {
  flex: 1 1 0;
}

:deep(.capacity-fill) {
  position: absolute;
  inset: 0 auto 0 0;
  opacity: 0.55;
  transition: width 200ms ease-out;
}

:deep(.capacity-text) {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  line-height: 1;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
</style>
