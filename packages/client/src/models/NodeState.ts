/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Record_string_NativeConsumptionBreakdown_ } from './Record_string_NativeConsumptionBreakdown_'
import type { Record_string_number_ } from './Record_string_number_'
import type { Record_string_number_or_null_ } from './Record_string_number_or_null_'
import type { Record_string_string_Array_ } from './Record_string_string_Array_'
import type { Record_string_string_or_null_ } from './Record_string_string_or_null_'
/**
 * State of a single node after the solver has run
 */
export type NodeState = {
  locationId: string
  locationName: string
  /**
   * System this location belongs to (e.g. "CH-771")
   */
  systemNaturalId: string
  /**
   * System display name (e.g. "Wild Garden")
   */
  systemName: string
  /**
   * System 3D X coordinate from FIO systemstars (top-down map uses X/Z)
   */
  systemPositionX?: number
  /**
   * System 3D Z coordinate from FIO systemstars
   */
  systemPositionZ?: number
  /**
   * Per-ticker current stock (respects stockMode)
   */
  stock: Record_string_number_
  nativeConsumption: Record_string_number_
  nativeProduction: Record_string_number_
  /**
   * Per-ticker breakdown of nativeConsumption
   */
  consumptionBreakdown: Record_string_NativeConsumptionBreakdown_
  /**
   * Sum of committed inbound edge amounts
   */
  derivedInflow: Record_string_number_
  /**
   * Sum of committed outbound edge amounts
   */
  derivedOutflow: Record_string_number_
  /**
   * balance < 0 means shortfall (shopping list); balance >= 0 means surplus held
   */
  balance: Record_string_number_
  /**
   * Shopping list = max(0, -balance). Shorthand for the UI.
   */
  shoppingList: Record_string_number_
  /**
   * Per-ticker daily consumption rate (workforce burn + production inputs +
   * daily-rate claims). Production is NOT subtracted here — it's reported
   * separately in `dailyProduction` so callers can compute net daily.
   */
  dailyConsumption: Record_string_number_
  /**
   * Per-ticker daily production rate.
   */
  dailyProduction: Record_string_number_
  /**
   * Per-ticker days of stock remaining at current net daily consumption.
   * `Infinity` (encoded as `null` over the wire) if net consumption is 0.
   * Stock-mode='ignored' nodes report `null`.
   */
  daysOfStock: Record_string_number_or_null_
  /**
   * Per-ticker run-out date as an ISO string. Null when daysOfStock is
   * Infinity or stock is being ignored.
   */
  runOutAt: Record_string_string_or_null_
  /**
   * Per-ticker latest date to place an external KAWA contract so a partner's
   * delivery arrives before run-out. `runOutAt - settings.contractLeadDays`.
   * Null when runOutAt is null. Computed for every ticker the node consumes
   * (contracts don't require a pre-existing demand edge).
   */
  latestContractAt: Record_string_string_or_null_
  /**
   * Per-ticker daily outflow rate committed to downstream demand/fixed edges
   * (`derivedOutflow / burnDays`). Drives the effective-drain calculation so
   * a hub with stock-out-the-door surfaces a real run-out instead of "never."
   */
  dailyOutflow: Record_string_number_
  /**
   * Per-ticker daily inflow rate from committed inbound edges
   * (`derivedInflow / burnDays`). Symmetric with `dailyOutflow`; used in the
   * Inspector to show "Inflow/day" alongside "Outflow/day" instead of the
   * old burnDays-totals display.
   */
  dailyInflow: Record_string_number_
  /**
   * Per-ticker IMMEDIATE upstream sources for this ticker's inflow — the
   * locationIds whose committed flows feed this node. The UI surfaces these
   * as click-through chips so the user can navigate one hop at a time:
   *
   * - `[]` — this node is its own source: it produces the ticker, has no
   * committed inflow, or otherwise owns the action here. Contract-by/CX
   * decisions belong to this row.
   * - `[X]` — single upstream feed (most leaves). The leaf is informational;
   * click X to see X's own sources / action.
   * - `[X, Y, ...]` — aggregating hub fed by multiple committed surplus or
   * demand edges (e.g. BEN gets DW from two producer planets). Surfaced as
   * a chip-with-dropdown.
   *
   * Surplus inbound edges take priority when both kinds are present at a node
   * — surplus is the "supply push" channel, so those are the producers we want
   * to surface. Edges with `amount === 0` (solver didn't allocate) are ignored.
   */
  chainSource: Record_string_string_Array_
  warnings: Array<string>
}
