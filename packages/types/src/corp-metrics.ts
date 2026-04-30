/**
 * Metric catalog for Corp Overview Views.
 *
 * Each card's `columns`, `filters[].metric`, and `sortBy[].metric` pick keys
 * from this registry. The registry here is the single source of truth — the
 * controller uses it to validate incoming card configs, and the frontend uses
 * it to render the metric picker and format cell values.
 */

export type CorpMetricGroupBy = 'ticker' | 'user-ticker'

export type MetricKey =
  | 'burnDaily'
  | 'inputsDaily'
  | 'repairTotal'
  | 'repairPerDay'
  | 'productionDaily'
  | 'consumptionDaily'
  | 'netDailyNoRepair'
  | 'netDaily'
  | 'gap'
  | 'inputGap'
  | 'stock'
  | 'listedStock'
  | 'daysRemaining'
  | 'daysListed'
  | 'username'

export type CorpMetricFormat = 'int' | 'decimal' | 'days' | 'text'

export interface MetricDef {
  key: MetricKey
  label: string
  format: CorpMetricFormat
  /** Which groupBy modes this metric is valid under. */
  groupings: CorpMetricGroupBy[]
}

/**
 * Registry of every available metric.
 *
 * Formulas live in the frontend compute module (`apps/web/src/utils/corpMetrics.ts`).
 * This file stays on data only so it can be imported by both server and client
 * without pulling in Vue/Pinia-side dependencies.
 */
export const CORP_METRIC_DEFS: Record<MetricKey, MetricDef> = {
  burnDaily: {
    key: 'burnDaily',
    label: 'Burn/Day',
    format: 'decimal',
    groupings: ['ticker', 'user-ticker'],
  },
  inputsDaily: {
    key: 'inputsDaily',
    label: 'Inputs/Day',
    format: 'decimal',
    groupings: ['ticker', 'user-ticker'],
  },
  repairTotal: {
    key: 'repairTotal',
    label: 'Repair (total)',
    format: 'int',
    groupings: ['ticker', 'user-ticker'],
  },
  repairPerDay: {
    key: 'repairPerDay',
    label: 'Repair/Day',
    format: 'decimal',
    groupings: ['ticker', 'user-ticker'],
  },
  productionDaily: {
    key: 'productionDaily',
    label: 'Production/Day',
    format: 'decimal',
    groupings: ['ticker', 'user-ticker'],
  },
  consumptionDaily: {
    key: 'consumptionDaily',
    label: 'Consumption/Day',
    format: 'decimal',
    groupings: ['ticker', 'user-ticker'],
  },
  netDailyNoRepair: {
    key: 'netDailyNoRepair',
    label: 'Net/Day (no repair)',
    format: 'decimal',
    groupings: ['ticker', 'user-ticker'],
  },
  netDaily: {
    key: 'netDaily',
    label: 'Net/Day',
    format: 'decimal',
    groupings: ['ticker', 'user-ticker'],
  },
  gap: {
    key: 'gap',
    label: 'Gap/Day',
    format: 'decimal',
    groupings: ['ticker', 'user-ticker'],
  },
  inputGap: {
    key: 'inputGap',
    label: 'Input Gap/Day',
    format: 'decimal',
    groupings: ['ticker', 'user-ticker'],
  },
  stock: {
    // Stock here is *on-hand* corp inventory (sum of FIO inventory across
    // every active member's storages), not "for-sale remaining quantity."
    // `daysRemaining` divides its deficit against this — answering "days
    // until the corp runs out at current burn," including everything sitting
    // on bases, not just listed-for-sale stock.
    key: 'stock',
    label: 'On-Hand Stock',
    format: 'int',
    groupings: ['ticker'],
  },
  listedStock: {
    // Sum of remaining sell-order quantities (FIO-aware enrichment caps a
    // listing at what the seller can actually fulfill). Pairs with `stock`
    // (on-hand) — a buyer's "what could I purchase from the corp right now"
    // number, not part of the runway math.
    key: 'listedStock',
    label: 'Listed Stock',
    format: 'int',
    groupings: ['ticker'],
  },
  daysRemaining: {
    key: 'daysRemaining',
    label: 'Days Remaining',
    format: 'days',
    groupings: ['ticker'],
  },
  daysListed: {
    // listedStock / consumptionDaily — "how many days of consumption are
    // currently listed for sale on the corp exchange?". Replaced the old
    // `daysOfCover` (on-hand / consumption) since the on-hand version
    // collapsed into `daysRemaining` once we made stock mean on-hand.
    key: 'daysListed',
    label: 'Days Listed',
    format: 'days',
    groupings: ['ticker'],
  },
  username: {
    key: 'username',
    label: 'User',
    format: 'text',
    groupings: ['user-ticker'],
  },
}

export const CORP_METRIC_KEYS = Object.keys(CORP_METRIC_DEFS) as MetricKey[]

/** True iff `key` is a valid MetricKey usable under the given groupBy. */
export function isMetricValidFor(key: string, groupBy: CorpMetricGroupBy): key is MetricKey {
  const def = CORP_METRIC_DEFS[key as MetricKey]
  return def !== undefined && def.groupings.includes(groupBy)
}

/**
 * True iff `key` can be used in a filter (i.e. numeric — filters compare
 * numeric values only; text dimensions like `username` don't fit the
 * comparison operator model).
 */
export function isMetricFilterable(key: string, groupBy: CorpMetricGroupBy): key is MetricKey {
  const def = CORP_METRIC_DEFS[key as MetricKey]
  return def !== undefined && def.groupings.includes(groupBy) && def.format !== 'text'
}

export const FILTER_OPERATORS = ['<', '<=', '=', '!=', '>=', '>'] as const
export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export function isFilterOperator(op: string): op is FilterOperator {
  return (FILTER_OPERATORS as readonly string[]).includes(op)
}
