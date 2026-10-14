<template>
  <div class="contract-breakdown">
    <div class="d-flex align-center pa-3 section-header">
      <v-icon size="small" class="mr-2">mdi-file-sign</v-icon>
      <span class="text-subtitle-1 font-weight-medium">Contract Breakdown</span>
      <v-spacer />
      <v-chip size="small" variant="tonal">
        {{ contracts.length }} contract{{ contracts.length === 1 ? '' : 's' }}
      </v-chip>
    </div>

    <div class="text-caption text-medium-emphasis px-3 pb-2">
      Each group below maps to one in-game PRUN contract (1 location, buy or sell only). Click any
      value to copy it, or use XIT Paste to copy a contract for a refined-prun XIT ACT Paste group.
    </div>

    <div class="contracts-list px-3 pb-3">
      <v-card
        v-for="contract in contracts"
        :key="contract.key"
        variant="outlined"
        class="contract-card mb-2"
        :data-contract="contract.key"
      >
        <div class="contract-header pa-2 d-flex align-center">
          <v-chip
            :color="contract.type === 'buy' ? 'warning' : 'success'"
            size="small"
            variant="tonal"
            class="mr-2"
          >
            <v-icon start size="small">{{
              contract.type === 'buy' ? 'mdi-arrow-down' : 'mdi-arrow-up'
            }}</v-icon>
            {{ contract.type === 'buy' ? 'BUY' : 'SELL' }}
          </v-chip>
          <span
            class="text-body-2 font-weight-medium copyable"
            @click="copyText(contract.locationId)"
          >
            {{ contract.locationDisplay }}
            <v-icon class="copy-hint" size="14">mdi-content-copy</v-icon>
          </span>
          <v-chip size="x-small" variant="tonal" class="ml-2">{{ contract.currency }}</v-chip>
          <v-spacer />
          <span class="text-caption text-medium-emphasis">
            {{ contract.items.length }} item{{ contract.items.length === 1 ? '' : 's' }}
          </span>

          <v-btn-toggle
            v-if="xit(contract).canRound"
            :model-value="modeOf(contract)"
            mandatory
            density="compact"
            variant="outlined"
            divided
            class="ml-3 rounding-toggle"
            data-test="xit-rounding"
            @update:model-value="setMode(contract, $event)"
          >
            <v-tooltip v-for="option in roundingOptions" :key="option.mode" location="top">
              <template #activator="{ props: tip }">
                <v-btn
                  v-bind="tip"
                  :value="option.mode"
                  :disabled="!xit(contract).results[option.mode].text && option.mode !== 'none'"
                  size="small"
                  :prepend-icon="option.icon"
                  :aria-label="option.label"
                  :data-test="`xit-round-${option.mode}`"
                >
                  {{ option.label }}
                </v-btn>
              </template>
              {{ roundingTooltip(contract, option.mode) }}
            </v-tooltip>
          </v-btn-toggle>

          <v-tooltip location="top" :disabled="!!current(contract).text" max-width="420">
            <template #activator="{ props: tip }">
              <span v-bind="tip" class="ml-2">
                <v-btn
                  size="small"
                  variant="tonal"
                  prepend-icon="mdi-content-copy"
                  :disabled="!current(contract).text"
                  data-test="xit-paste"
                  @click="copyXit(contract)"
                >
                  XIT Paste
                </v-btn>
              </span>
            </template>
            <div v-if="xit(contract).canRound" class="mb-1">
              Round Up or Down to fit XIT's 3 significant-figure limit.
            </div>
            <div v-for="(error, i) in current(contract).errors" :key="i">
              <template v-if="error.ticker">{{ error.ticker }}: </template>{{ error.reason }}
            </div>
          </v-tooltip>
        </div>

        <div
          v-if="isRounded(contract)"
          class="text-caption text-medium-emphasis px-3 py-1 rounding-note"
          data-test="xit-rounding-note"
        >
          <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>
          Prices rounded {{ modeOf(contract) }} for XIT only — the invoice is unchanged.
          <a
            href="https://github.com/refined-prun/refined-prun/issues/247"
            target="_blank"
            rel="noopener"
            >(refined-prun#247)</a
          >
        </div>

        <v-divider />

        <table class="contract-table">
          <thead>
            <tr>
              <th class="text-right">Qty</th>
              <th class="text-left">Commodity</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in contract.items" :key="item.id" :data-ticker="item.commodityTicker">
              <td class="text-right">
                <span class="copyable" @click="copyText(String(item.quantity))">
                  {{ item.quantity.toLocaleString() }}
                  <v-icon class="copy-hint" size="14">mdi-content-copy</v-icon>
                </span>
              </td>
              <td>
                <span class="copyable" @click="copyText(item.commodityTicker)">
                  <CommodityDisplay :ticker="item.commodityTicker" />
                  <v-icon class="copy-hint" size="14">mdi-content-copy</v-icon>
                </span>
              </td>
              <td class="text-right" data-test="unit-price">
                <span
                  v-if="displayPrice(contract, item) !== item.unitPrice"
                  class="original-price text-medium-emphasis mr-1"
                  data-test="original-price"
                >
                  {{ formatPrice(item.unitPrice) }}
                </span>
                <span class="copyable" @click="copyText(displayPrice(contract, item).toFixed(2))">
                  {{ formatPrice(displayPrice(contract, item)) }} {{ item.currency }}
                  <v-icon class="copy-hint" size="14">mdi-content-copy</v-icon>
                </span>
              </td>
              <td class="text-right font-weight-medium" data-test="line-total">
                <span
                  class="copyable"
                  @click="copyText(displayLineTotal(contract, item).toFixed(2))"
                >
                  {{ formatPrice(displayLineTotal(contract, item)) }} {{ item.currency }}
                  <v-icon class="copy-hint" size="14">mdi-content-copy</v-icon>
                </span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="bg-surface-light">
              <td colspan="3" class="text-right font-weight-medium">
                Total ({{ contract.currency }}):
              </td>
              <td
                class="text-right font-weight-bold"
                :class="contract.type === 'buy' ? 'text-warning' : 'text-success'"
              >
                <v-chip
                  v-if="isRounded(contract)"
                  size="x-small"
                  variant="tonal"
                  :color="modeOf(contract) === 'up' ? 'info' : 'warning'"
                  class="mr-2"
                  data-test="total-delta"
                >
                  {{ formatDelta(current(contract).totalDelta, contract.currency) }}
                </v-chip>
                <span
                  class="copyable"
                  data-test="contract-total"
                  @click="copyText(displayTotal(contract).toFixed(2))"
                >
                  {{ formatPrice(displayTotal(contract)) }} {{ contract.currency }}
                  <v-icon class="copy-hint" size="14">mdi-content-copy</v-icon>
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </v-card>
    </div>

    <v-snackbar v-model="snackbar" :timeout="1500" :color="snackbarColor">
      {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { InvoiceLineItem, InvoiceDirection, Currency } from '@kawakawa/types'
import {
  serializePaste,
  type PasteRounding,
  type PasteSerializeResult,
} from '@kawakawa/parser/xit/paste'
import { locationService } from '../../services/locationService'
import { useUserStore } from '../../stores/user'
import { useClipboard } from '../../composables'
import CommodityDisplay from '../CommodityDisplay.vue'

interface ContractGroup {
  key: string
  type: 'buy' | 'sell'
  locationId: string
  locationDisplay: string
  currency: Currency
  items: InvoiceLineItem[]
  total: number
}

const props = defineProps<{
  lineItems: InvoiceLineItem[]
  direction: InvoiceDirection
}>()

const userStore = useUserStore()
const { copy } = useClipboard()
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref<'success' | 'error'>('success')

const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const formatPrice = (value: number): string => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Group line items into contracts: each (location + buy/sell + currency) = 1 contract
const contracts = computed<ContractGroup[]>(() => {
  const groups = new Map<string, ContractGroup>()

  for (const item of props.lineItems) {
    // Determine buy/sell from the current user's perspective
    let type: 'buy' | 'sell'
    if (props.direction === 'sent') {
      type = item.orderType === 'sell' ? 'buy' : 'sell'
    } else {
      type = item.orderType === 'buy' ? 'buy' : 'sell'
    }

    const key = `${type}:${item.locationId}:${item.currency}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        type,
        locationId: item.locationId,
        locationDisplay: getLocationDisplay(item.locationId),
        currency: item.currency,
        items: [],
        total: 0,
      })
    }
    const group = groups.get(key)!
    group.items.push(item)
    group.total += item.totalValue
  }

  // Sort: buys first, then by location, then by currency
  return Array.from(groups.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'buy' ? -1 : 1
    const loc = a.locationDisplay.localeCompare(b.locationDisplay)
    if (loc !== 0) return loc
    return a.currency.localeCompare(b.currency)
  })
})

interface XitState {
  results: Record<PasteRounding, PasteSerializeResult>
  /** Invoice prices fail the parser, but rounding one way or the other passes. */
  canRound: boolean
  prices: Record<PasteRounding, Map<string, number>>
}

const roundingOptions: { mode: PasteRounding; label: string; icon: string }[] = [
  { mode: 'up', label: 'Up', icon: 'mdi-arrow-up-bold' },
  { mode: 'none', label: 'Reset', icon: 'mdi-restore' },
  { mode: 'down', label: 'Down', icon: 'mdi-arrow-down-bold' },
]

const xitStates = computed(() => {
  const states = new Map<string, XitState>()
  for (const contract of contracts.value) {
    const materials = contract.items.map(item => ({
      ticker: item.commodityTicker,
      quantity: item.quantity,
      price: item.unitPrice,
    }))
    const results = {
      none: serializePaste(materials, 'none'),
      up: serializePaste(materials, 'up'),
      down: serializePaste(materials, 'down'),
    }
    const prices = {} as XitState['prices']
    for (const mode of ['none', 'up', 'down'] as const) {
      prices[mode] = new Map(results[mode].materials.map(m => [m.ticker, m.price]))
    }
    states.set(contract.key, {
      results,
      canRound: !results.none.text && (!!results.up.text || !!results.down.text),
      prices,
    })
  }
  return states
})

const rounding = ref<Record<string, PasteRounding>>({})

// UI-only state. Contract keys repeat across invoices, so start over for each one.
watch(
  () => props.lineItems,
  () => {
    rounding.value = {}
  }
)

const xit = (contract: ContractGroup): XitState => xitStates.value.get(contract.key)!

const modeOf = (contract: ContractGroup): PasteRounding => {
  const mode = rounding.value[contract.key] ?? 'none'
  // Fall back if the line items changed and the chosen mode no longer applies.
  return mode !== 'none' && !xit(contract).results[mode].text ? 'none' : mode
}

const setMode = (contract: ContractGroup, mode: PasteRounding | undefined) => {
  rounding.value = { ...rounding.value, [contract.key]: mode ?? 'none' }
}

const current = (contract: ContractGroup) => xit(contract).results[modeOf(contract)]

const isRounded = (contract: ContractGroup) => modeOf(contract) !== 'none'

const displayPrice = (contract: ContractGroup, item: InvoiceLineItem): number => {
  if (!isRounded(contract)) return item.unitPrice
  return xit(contract).prices[modeOf(contract)].get(item.commodityTicker) ?? item.unitPrice
}

// PRUN floors each line total, so the preview does too.
const displayLineTotal = (contract: ContractGroup, item: InvoiceLineItem): number => {
  if (!isRounded(contract)) return item.totalValue
  return Math.floor(Math.round(item.quantity * displayPrice(contract, item) * 100) / 100)
}

const displayTotal = (contract: ContractGroup): number =>
  isRounded(contract) ? current(contract).gameTotal : contract.total

const formatDelta = (delta: number, currency: string): string => {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  return `${sign}${formatPrice(Math.abs(delta))} ${currency}`
}

const roundingTooltip = (contract: ContractGroup, mode: PasteRounding): string => {
  if (mode === 'none') return 'Invoice prices'
  const result = xit(contract).results[mode]
  if (!result.text) return result.errors.map(e => `${e.ticker}: ${e.reason}`).join('; ')
  return `Round ${mode}: ${formatDelta(result.totalDelta, contract.currency)}`
}

const copyXit = async (contract: ContractGroup) => {
  const result = current(contract)
  if (!result.text) return
  const ok = await copy(result.text)
  const count = result.materials.length
  let message = `Copied ${count} material${count === 1 ? '' : 's'} for XIT Paste`
  if (isRounded(contract)) {
    message += ` (rounded ${modeOf(contract)}, ${formatDelta(result.totalDelta, contract.currency)})`
  }
  snackbarColor.value = ok ? 'success' : 'error'
  snackbarMessage.value = ok ? message : 'Failed to copy to clipboard'
  snackbar.value = true
}

const copyText = async (text: string) => {
  const ok = await copy(text)
  snackbarColor.value = ok ? 'success' : 'error'
  snackbarMessage.value = ok ? `Copied: ${text}` : 'Failed to copy to clipboard'
  snackbar.value = true
}
</script>

<style scoped>
.section-header {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.contract-card {
  border-color: rgba(var(--v-border-color), 0.2);
}

.contract-header {
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.contract-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.contract-table thead th {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
  padding: 4px 12px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
  white-space: nowrap;
}

.contract-table tbody td,
.contract-table tfoot td {
  padding: 6px 12px;
  vertical-align: middle;
}

.contract-table tbody tr:nth-child(even) {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

.contract-table tbody tr:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.12);
}

.original-price {
  text-decoration: line-through;
  font-size: 0.75rem;
}

.rounding-note {
  background: rgba(var(--v-theme-info), 0.08);
}

.copyable {
  cursor: pointer;
  border-radius: 4px;
  padding: 1px 4px;
  margin: -1px -4px;
  transition: background-color 0.15s;
  position: relative;
}

.copyable:hover {
  background-color: rgba(var(--v-theme-primary), 0.15);
}

.copyable:active {
  background-color: rgba(var(--v-theme-primary), 0.25);
}

.copy-hint {
  opacity: 0;
  margin-left: 2px;
  transition: opacity 0.15s;
  color: rgb(var(--v-theme-primary));
}

.copyable:hover .copy-hint {
  opacity: 1;
}
</style>
