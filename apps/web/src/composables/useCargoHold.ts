import { ref, computed, watch, type Ref } from 'vue'
import { commodityService } from '../services/commodityService'
import { useSettingsStore } from '../stores/settings'

export interface CargoHoldRow {
  commodityTicker: string | null
  amount: number | null
  locked?: boolean
}

export interface ShipCargoBay {
  code: string
  name: string
  weightCapacity: number // tonnes
  volumeCapacity: number // m3
}

export const SHIP_CARGO_BAYS: ShipCargoBay[] = [
  { code: 'TCB', name: 'Tiny Cargo Bay', weightCapacity: 100, volumeCapacity: 100 },
  { code: 'VSC', name: 'Very Small Cargo Bay', weightCapacity: 250, volumeCapacity: 250 },
  { code: 'SCB', name: 'Small Cargo Bay', weightCapacity: 500, volumeCapacity: 500 },
  { code: 'MCB', name: 'Medium Cargo Bay', weightCapacity: 1000, volumeCapacity: 1000 },
  { code: 'LCB', name: 'Large Cargo Bay', weightCapacity: 2000, volumeCapacity: 2000 },
  { code: 'HCB', name: 'Huge Cargo Bay', weightCapacity: 5000, volumeCapacity: 5000 },
  { code: 'VCB', name: 'High-Volume Cargo', weightCapacity: 1000, volumeCapacity: 3000 },
  { code: 'WCB', name: 'High-load Cargo Bay', weightCapacity: 3000, volumeCapacity: 1000 },
]

export interface CargoCapacity {
  weightCapacity: number
  volumeCapacity: number
}

export function useCargoHold(rows: Ref<CargoHoldRow[]>) {
  const settingsStore = useSettingsStore()
  const selectedShip = ref<string | null>(null)
  const hoveredShip = ref<string | null>(null)
  const customWeight = ref<number | null>(null)
  const customVolume = ref<number | null>(null)

  // Build icon data for cargo bay tickers
  const getCargoIcon = (code: string) => {
    const category = commodityService.getCommodityCategory(code)
    if (category === null) return null
    return {
      ticker: code,
      name: commodityService.getCommodityDisplay(code, 'name-only'),
      category,
    }
  }

  const shipOptions = computed(() => [
    ...SHIP_CARGO_BAYS.map(s => ({
      title: commodityService.getCommodityDisplay(s.code, settingsStore.commodityDisplayMode.value),
      value: s.code,
      icon: getCargoIcon(s.code),
    })),
    { title: 'Custom', value: 'CUSTOM', icon: null },
  ])

  // Whether the capacity inputs should be editable (custom or nothing selected)
  const isCustomEditable = computed(() => !selectedShip.value || selectedShip.value === 'CUSTOM')

  // Auto-select Custom when user starts typing with nothing selected
  const ensureCustomSelected = () => {
    if (!selectedShip.value) selectedShip.value = 'CUSTOM'
  }

  // Hover preview: show hovered preset values without overwriting real state
  const hoveredPreset = computed(() =>
    hoveredShip.value ? (SHIP_CARGO_BAYS.find(s => s.code === hoveredShip.value) ?? null) : null
  )

  // Display weight/volume: hover preview > preset > custom
  const displayWeight = computed({
    get: () => {
      if (hoveredPreset.value) return hoveredPreset.value.weightCapacity
      if (isCustomEditable.value) return customWeight.value
      const preset = SHIP_CARGO_BAYS.find(s => s.code === selectedShip.value)
      return preset?.weightCapacity ?? null
    },
    set: (val: number | null) => {
      if (isCustomEditable.value) customWeight.value = val
    },
  })

  const displayVolume = computed({
    get: () => {
      if (hoveredPreset.value) return hoveredPreset.value.volumeCapacity
      if (isCustomEditable.value) return customVolume.value
      const preset = SHIP_CARGO_BAYS.find(s => s.code === selectedShip.value)
      return preset?.volumeCapacity ?? null
    },
    set: (val: number | null) => {
      if (isCustomEditable.value) customVolume.value = val
    },
  })

  const isHoverPreview = computed(() => !!hoveredPreset.value)

  const onCustomWeightChange = (val: number | string | null) => {
    ensureCustomSelected()
    customWeight.value = typeof val === 'number' ? val : null
  }

  const onCustomVolumeChange = (val: number | string | null) => {
    ensureCustomSelected()
    customVolume.value = typeof val === 'number' ? val : null
  }

  // Unified cargo capacity: hover preview > preset > custom
  const cargoCapacity = computed((): CargoCapacity | null => {
    if (hoveredPreset.value) return hoveredPreset.value
    if (!selectedShip.value) return null
    if (selectedShip.value === 'CUSTOM') {
      if (
        !customWeight.value ||
        !customVolume.value ||
        customWeight.value <= 0 ||
        customVolume.value <= 0
      )
        return null
      return { weightCapacity: customWeight.value, volumeCapacity: customVolume.value }
    }
    return SHIP_CARGO_BAYS.find(s => s.code === selectedShip.value) ?? null
  })

  // Row weight/volume calculations
  const getRowWeight = (row: CargoHoldRow): number | null => {
    if (!row.commodityTicker || !row.amount || row.amount <= 0) return null
    const weight = commodityService.getCommodityWeight(row.commodityTicker)
    if (weight === null) return null
    return weight * row.amount
  }

  const getRowVolume = (row: CargoHoldRow): number | null => {
    if (!row.commodityTicker || !row.amount || row.amount <= 0) return null
    const volume = commodityService.getCommodityVolume(row.commodityTicker)
    if (volume === null) return null
    return volume * row.amount
  }

  // Cargo totals
  const totalWeight = computed(() => {
    let total = 0
    for (const row of rows.value) {
      const w = getRowWeight(row)
      if (w !== null) total += w
    }
    return total
  })

  const totalVolume = computed(() => {
    let total = 0
    for (const row of rows.value) {
      const v = getRowVolume(row)
      if (v !== null) total += v
    }
    return total
  })

  // Row ratio: max of weight% and volume% for this row (the bottleneck)
  const getRowRatio = (row: CargoHoldRow): number | null => {
    const cap = cargoCapacity.value
    if (!cap) return null
    const w = getRowWeight(row)
    const v = getRowVolume(row)
    if (w === null && v === null) return null
    const wPct = w !== null ? (w / cap.weightCapacity) * 100 : 0
    const vPct = v !== null ? (v / cap.volumeCapacity) * 100 : 0
    return Math.max(wPct, vPct)
  }

  // Ratio input: back-calculate quantity from a target ratio %
  // Optional capacityOverride lets rebalance pass remaining capacity after locked rows
  const calculateAmountFromRatio = (
    ticker: string,
    ratio: number,
    capacityOverride?: CargoCapacity
  ): number | null => {
    const cap = capacityOverride ?? cargoCapacity.value
    if (!cap || ratio <= 0) return null

    const unitWeight = commodityService.getCommodityWeight(ticker)
    const unitVolume = commodityService.getCommodityVolume(ticker)
    if (unitWeight === null && unitVolume === null) return null

    const fraction = ratio / 100
    const maxByWeight =
      unitWeight && unitWeight > 0
        ? Math.floor((fraction * cap.weightCapacity) / unitWeight)
        : Infinity
    const maxByVolume =
      unitVolume && unitVolume > 0
        ? Math.floor((fraction * cap.volumeCapacity) / unitVolume)
        : Infinity
    return Math.min(maxByWeight, maxByVolume)
  }

  // Auto-balance mode: evenly distribute cargo across all rows with commodities
  const autoBalance = ref(false)

  const rebalance = () => {
    const cap = cargoCapacity.value
    if (!cap) return
    const filledRows = rows.value.filter(r => r.commodityTicker)
    if (filledRows.length === 0) return

    const lockedRows = filledRows.filter(r => r.locked)
    const unlocked = filledRows.filter(r => !r.locked)
    if (unlocked.length === 0) return

    // Subtract locked rows' weight/volume from total capacity
    let usedWeight = 0
    let usedVolume = 0
    for (const row of lockedRows) {
      usedWeight += getRowWeight(row) ?? 0
      usedVolume += getRowVolume(row) ?? 0
    }

    const remainingCap: CargoCapacity = {
      weightCapacity: Math.max(0, cap.weightCapacity - usedWeight),
      volumeCapacity: Math.max(0, cap.volumeCapacity - usedVolume),
    }

    // Distribute remaining capacity evenly among unlocked rows
    const ratioPerRow = 100 / unlocked.length
    for (const row of unlocked) {
      const amount = calculateAmountFromRatio(row.commodityTicker!, ratioPerRow, remainingCap)
      if (amount !== null) row.amount = amount
    }
  }

  const toggleAutoBalance = () => {
    autoBalance.value = !autoBalance.value
    if (autoBalance.value) rebalance()
  }

  const isRowLocked = (row: CargoHoldRow): boolean => !!row.locked

  const toggleRowLock = (row: CargoHoldRow) => {
    row.locked = !row.locked
    autoBalance.value = false
  }

  // Re-run balance when the commodity list or lock state changes while auto-balance is on
  const balanceKey = computed(() =>
    rows.value
      .filter(r => r.commodityTicker)
      .map(r => `${r.commodityTicker}:${r.locked ? 'L' : 'U'}`)
      .join(',')
  )

  watch(balanceKey, () => {
    if (autoBalance.value) rebalance()
  })

  // Turn off auto-balance when cargo bay is cleared
  watch(selectedShip, newShip => {
    if (!newShip) autoBalance.value = false
  })

  // Ship fill percentages
  const weightFillPercent = computed(() => {
    if (!cargoCapacity.value) return 0
    return (totalWeight.value / cargoCapacity.value.weightCapacity) * 100
  })

  const volumeFillPercent = computed(() => {
    if (!cargoCapacity.value) return 0
    return (totalVolume.value / cargoCapacity.value.volumeCapacity) * 100
  })

  const getFillColor = (percent: number): string => {
    if (percent <= 100) return 'text-success'
    return 'text-error'
  }

  const weightFillColor = computed(() => getFillColor(weightFillPercent.value))
  const volumeFillColor = computed(() => getFillColor(volumeFillPercent.value))

  // Trips needed (ceiling of the max of weight/volume fill ratios)
  const tripsNeeded = computed(() => {
    if (!cargoCapacity.value) return 1
    const weightTrips = totalWeight.value / cargoCapacity.value.weightCapacity
    const volumeTrips = totalVolume.value / cargoCapacity.value.volumeCapacity
    return Math.max(1, Math.ceil(Math.max(weightTrips, volumeTrips)))
  })

  return {
    selectedShip,
    hoveredShip,
    autoBalance,
    toggleAutoBalance,
    isRowLocked,
    toggleRowLock,
    isCustomEditable,
    isHoverPreview,
    shipOptions,
    displayWeight,
    displayVolume,
    onCustomWeightChange,
    onCustomVolumeChange,
    cargoCapacity,
    getRowWeight,
    getRowVolume,
    getRowRatio,
    calculateAmountFromRatio,
    totalWeight,
    totalVolume,
    weightFillPercent,
    volumeFillPercent,
    weightFillColor,
    volumeFillColor,
    tripsNeeded,
  }
}
