<template>
  <div ref="wrapperRef" class="tc-wrapper">
    <div class="tc-container" :class="{ focused: isFocused }" @click="focusInput">
      <v-icon size="small" color="grey" class="tc-leading-icon">mdi-tag-multiple</v-icon>

      <v-chip
        v-for="(entry, idx) in parsedChips"
        :key="`${entry.kind}-${entry.value}-${idx}`"
        :color="entry.kind === 'category' ? 'teal' : 'primary'"
        :prepend-icon="entry.kind === 'category' ? 'mdi-folder-outline' : 'mdi-package-variant'"
        size="small"
        closable
        class="tc-chip"
        @click:close="removeAt(idx)"
      >
        {{ entry.display }}
      </v-chip>

      <input
        ref="inputRef"
        v-model="inputText"
        type="text"
        class="tc-input"
        :placeholder="modelValue.length === 0 ? placeholder : ''"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
        @input="onInputChange"
        @paste="onPaste"
      />

      <v-btn
        v-if="modelValue.length > 0"
        icon="mdi-close-circle"
        variant="text"
        size="x-small"
        class="tc-clear"
        @click.stop="clearAll"
      />
    </div>

    <Teleport to="body">
      <div
        v-if="showSuggestions && suggestions.length > 0"
        class="tc-dropdown"
        :style="dropdownStyle"
      >
        <div
          v-for="(s, idx) in suggestions"
          :key="`${s.kind}-${s.value}`"
          class="tc-suggestion"
          :class="{ selected: idx === selectedIndex }"
          @mousedown.prevent="pickSuggestion(s)"
          @mouseenter="selectedIndex = idx"
        >
          <v-chip
            :color="s.kind === 'category' ? 'teal' : 'primary'"
            :prepend-icon="s.kind === 'category' ? 'mdi-folder-outline' : 'mdi-package-variant'"
            size="x-small"
            class="mr-2"
          >
            {{ s.kind === 'category' ? 'Category' : 'Ticker' }}
          </v-chip>
          <span class="tc-suggestion-text">{{ s.display }}</span>
          <span v-if="s.hint" class="tc-suggestion-hint">{{ s.hint }}</span>
        </div>
      </div>
      <div v-else-if="showHelp" class="tc-dropdown tc-help" :style="dropdownStyle">
        <div class="tc-help-title">Start typing to search. You can add:</div>
        <div v-for="tok in helpTokens" :key="tok.kind" class="tc-help-row">
          <v-chip
            :color="tok.kind === 'category' ? 'teal' : 'primary'"
            :prepend-icon="tok.kind === 'category' ? 'mdi-folder-outline' : 'mdi-package-variant'"
            size="x-small"
            class="mr-2 tc-help-chip"
          >
            {{ tok.label }}
          </v-chip>
          <div class="tc-help-body">
            <code class="tc-help-example">{{ tok.example }}</code>
            <span class="tc-help-desc">{{ tok.description }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Commodity } from '../../types'
import { commodityService } from '../../services/commodityService'
import { useSettingsStore } from '../../stores/settings'
import { makeCategoryEntry, parseScopeEntry } from '../../utils/tickerScope'

const settingsStore = useSettingsStore()
function tickerDisplay(ticker: string): string {
  // Honour the user's commodity-display preference (ticker-only / name-only /
  // both) so chips match how commodities render elsewhere in the app.
  return commodityService.getCommodityDisplay(ticker, settingsStore.commodityDisplayMode.value)
}

interface Suggestion {
  kind: 'ticker' | 'category'
  /** Stored value: ticker symbol or category name. */
  value: string
  /** Display text in the dropdown. */
  display: string
  /** Optional secondary text (e.g. ticker count for categories). */
  hint?: string
}

const props = withDefaults(
  defineProps<{
    /** Raw scope entries: bare tickers or `category:Name`. */
    modelValue: string[]
    placeholder?: string
  }>(),
  {
    placeholder: 'Type to add tickers or categories…',
  }
)

const emit = defineEmits<(e: 'update:modelValue', value: string[]) => void>()

// -------- commodity catalog --------
const commodities = ref<Commodity[]>([])

async function loadCommodities(): Promise<void> {
  const cached = commodityService.getAllCommoditiesSync()
  if (cached.length > 0) {
    commodities.value = cached
    return
  }
  commodities.value = await commodityService.getAllCommodities()
}

const categoriesIndex = computed<Map<string, number>>(() => {
  const m = new Map<string, number>()
  for (const c of commodities.value) {
    if (!c.category) continue
    m.set(c.category, (m.get(c.category) ?? 0) + 1)
  }
  return m
})

const knownCategories = computed<string[]>(() => [...categoriesIndex.value.keys()].sort())

// -------- chip rendering --------
interface ParsedChipDisplay {
  raw: string
  kind: 'ticker' | 'category'
  value: string
  display: string
}

const parsedChips = computed<ParsedChipDisplay[]>(() =>
  props.modelValue.map(raw => {
    const p = parseScopeEntry(raw)
    if (p.kind === 'category') {
      return { raw, kind: 'category', value: p.value, display: p.value }
    }
    return {
      raw,
      kind: 'ticker',
      value: p.value,
      display: tickerDisplay(p.value),
    }
  })
)

// -------- input + suggestions --------
const inputText = ref('')
const isFocused = ref(false)
const showSuggestions = ref(false)
const selectedIndex = ref(0)
const wrapperRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})

const SUGGESTION_LIMIT = 8

const helpTokens = [
  {
    kind: 'ticker' as const,
    label: 'Ticker',
    example: 'RAT',
    description: 'A single commodity ticker.',
  },
  {
    kind: 'category' as const,
    label: 'Category',
    example: 'category:Consumables (basic)',
    description: 'Live reference — expands to every ticker in this category right now.',
  },
]

const showHelp = computed(() => isFocused.value && inputText.value.trim().length === 0)

const suggestions = computed<Suggestion[]>(() => {
  const q = inputText.value.trim().toLowerCase()
  if (q.length === 0) return []

  const existing = new Set(props.modelValue)
  const out: Suggestion[] = []

  for (const cat of knownCategories.value) {
    if (!cat.toLowerCase().includes(q)) continue
    const entry = makeCategoryEntry(cat)
    if (existing.has(entry)) continue
    out.push({
      kind: 'category',
      value: cat,
      display: cat,
      hint: `${categoriesIndex.value.get(cat) ?? 0} tickers`,
    })
  }

  for (const c of commodities.value) {
    const tk = c.ticker.toUpperCase()
    if (existing.has(tk)) continue
    const matchesTicker = tk.toLowerCase().includes(q)
    const matchesName = c.name?.toLowerCase().includes(q)
    if (!matchesTicker && !matchesName) continue
    out.push({
      kind: 'ticker',
      value: tk,
      display: tickerDisplay(tk),
    })
  }

  // Rank: exact ticker match first, then prefix matches, then everything else.
  out.sort((a, b) => {
    const aw = weight(a, q)
    const bw = weight(b, q)
    return aw - bw
  })

  return out.slice(0, SUGGESTION_LIMIT)
})

function weight(s: Suggestion, q: string): number {
  if (s.kind === 'ticker') {
    if (s.value.toLowerCase() === q) return 0
    if (s.value.toLowerCase().startsWith(q)) return 1
  }
  if (s.kind === 'category' && s.value.toLowerCase() === q) return 0
  if (s.value.toLowerCase().startsWith(q)) return 2
  return 3
}

watch(suggestions, () => {
  selectedIndex.value = 0
})

watch(inputText, val => {
  showSuggestions.value = val.trim().length > 0
  void nextTick(updateDropdownPosition)
})

watch(isFocused, focused => {
  if (focused) showSuggestions.value = inputText.value.trim().length > 0
})

function focusInput(): void {
  inputRef.value?.focus()
}

function onFocus(): void {
  isFocused.value = true
  void nextTick(updateDropdownPosition)
}

function onBlur(): void {
  // Defer so a click on a suggestion (which fires mousedown before blur)
  // can complete before we tear the dropdown down.
  setTimeout(() => {
    isFocused.value = false
    showSuggestions.value = false
  }, 100)
}

function onInputChange(): void {
  // Triggers the suggestions watcher.
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (suggestions.value.length === 0) return
    selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (suggestions.value.length === 0) return
    selectedIndex.value =
      (selectedIndex.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (suggestions.value.length > 0) {
      pickSuggestion(suggestions.value[selectedIndex.value])
    } else {
      addRawText()
    }
  } else if (e.key === 'Backspace' && inputText.value === '' && props.modelValue.length > 0) {
    removeAt(props.modelValue.length - 1)
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
  }
}

function pickSuggestion(s: Suggestion): void {
  const entry = s.kind === 'category' ? makeCategoryEntry(s.value) : s.value
  const next = [...props.modelValue, entry]
  emit('update:modelValue', next)
  inputText.value = ''
  showSuggestions.value = false
}

function addRawText(): void {
  const txt = inputText.value.trim()
  if (!txt) return
  addTokens(splitPastedTokens(txt))
  inputText.value = ''
  showSuggestions.value = false
}

/**
 * Split a pasted / typed buffer into individual tokens. Accepts whitespace,
 * commas, semicolons, and newlines so lists copied from spreadsheets, Discord
 * messages, or manual typing all work.
 */
function splitPastedTokens(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
}

/**
 * Commit a batch of tokens. Unknown strings pass through as free-form tickers
 * (uppercased); anything matching a known category is converted to a live
 * `category:` reference. Duplicates — already in modelValue or within the
 * batch itself — are skipped.
 */
function addTokens(tokens: string[]): void {
  if (tokens.length === 0) return
  const existing = new Set(props.modelValue.map(e => e.toLowerCase()))
  const categoryByLower = new Map<string, string>()
  for (const cat of knownCategories.value) {
    categoryByLower.set(cat.toLowerCase(), cat)
  }
  const additions: string[] = []
  for (const token of tokens) {
    const lower = token.toLowerCase()
    let entry: string
    if (lower.startsWith('category:')) {
      const name = token.slice('category:'.length)
      const canonical = categoryByLower.get(name.toLowerCase()) ?? name
      entry = makeCategoryEntry(canonical)
    } else if (categoryByLower.has(lower)) {
      entry = makeCategoryEntry(categoryByLower.get(lower)!)
    } else {
      entry = token.toUpperCase()
    }
    const entryLower = entry.toLowerCase()
    if (existing.has(entryLower)) continue
    existing.add(entryLower)
    additions.push(entry)
  }
  if (additions.length === 0) return
  emit('update:modelValue', [...props.modelValue, ...additions])
}

function onPaste(e: ClipboardEvent): void {
  const text = e.clipboardData?.getData('text') ?? ''
  const tokens = splitPastedTokens(text)
  // Only intercept when the paste actually contains multiple tokens. A single
  // ticker should still flow through the normal input so the user can tweak
  // it or confirm with Enter / the suggestion dropdown.
  if (tokens.length <= 1) return
  e.preventDefault()
  addTokens(tokens)
  inputText.value = ''
  showSuggestions.value = false
}

function removeAt(idx: number): void {
  const next = props.modelValue.slice()
  next.splice(idx, 1)
  emit('update:modelValue', next)
}

function clearAll(): void {
  emit('update:modelValue', [])
  inputText.value = ''
  showSuggestions.value = false
}

// -------- dropdown positioning --------
function updateDropdownPosition(): void {
  const wrapper = wrapperRef.value
  if (!wrapper) return
  const rect = wrapper.getBoundingClientRect()
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: '4000',
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await loadCommodities()
  if (wrapperRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updateDropdownPosition)
    resizeObserver.observe(wrapperRef.value)
  }
  window.addEventListener('scroll', updateDropdownPosition, true)
  window.addEventListener('resize', updateDropdownPosition)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('scroll', updateDropdownPosition, true)
  window.removeEventListener('resize', updateDropdownPosition)
})
</script>

<style scoped>
.tc-wrapper {
  width: 100%;
}

.tc-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  cursor: text;
  min-height: 40px;
}

.tc-container.focused {
  border-color: rgba(var(--v-theme-primary), 0.7);
  background: rgba(255, 255, 255, 0.06);
}

.tc-leading-icon {
  flex-shrink: 0;
}

.tc-chip {
  flex-shrink: 0;
}

.tc-input {
  flex: 1 1 80px;
  min-width: 80px;
  background: transparent;
  border: 0;
  outline: 0;
  color: inherit;
  font-size: 0.9rem;
  padding: 4px 0;
}

.tc-clear {
  flex-shrink: 0;
}

.tc-dropdown {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  max-height: 320px;
  overflow-y: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.tc-suggestion {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 0.9rem;
}

.tc-suggestion.selected,
.tc-suggestion:hover {
  background: rgba(var(--v-theme-primary), 0.18);
}

.tc-suggestion-text {
  flex: 1;
}

.tc-suggestion-hint {
  margin-left: 8px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.tc-help {
  padding: 10px 12px;
}

.tc-help-title {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin-bottom: 8px;
}

.tc-help-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
}

.tc-help-chip {
  flex-shrink: 0;
  margin-top: 2px;
}

.tc-help-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8rem;
}

.tc-help-example {
  font-family: var(--v-theme-font-mono, monospace);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 3px;
  align-self: flex-start;
}

.tc-help-desc {
  color: rgba(var(--v-theme-on-surface), 0.7);
}
</style>
