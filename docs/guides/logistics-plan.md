# Supply Management → Logistics Flow Graph

Design doc for reframing the Supply Management feature as a directed logistics flow graph. Replaces the current model where `supply_chain_lines` rows carry a `lineSource` enum whose geometry flips based on category.

**Status:** Planning. Not yet implemented. No production data exists yet; dev data is disposable.

## 1. The core reframe

Every line today is really a directed edge in a graph. The current model conflates two things into `lineSource`: (a) why a flow exists, and (b) which end is the planet. Once you accept that hubs derive their demand entirely from downstream edges, the category-as-direction-flip becomes nonsense.

The new model:

- **Edges** describe physical material movement between two real locations: `(from, to, material, kind)`. One row per physical flow. No perspective flipping.
- **Node augmentations** describe obligations and windfalls that aren't physical flows between real locations: government contracts, ad-hoc commitments, gifts, strategic reserves. These live as per-node tuples that add to `nativeConsumption` / `nativeProduction`.
- **Hubs derive everything.** A hub like BEN has no native consumption or production. Its demand is the sum of what departs BEN. Its supply is the sum of what arrives at BEN. The solver does a topological walk to propagate demand upstream and surplus downstream.

**Acid test:** clicking "Shopping List" at BEN returns only materials BEN actually needs to buy externally. Anything produced by an upstream node in the user's own network is automatically excluded — not via a filter, but as the definition of `nodeGap`.

## 2. Data model

### 2.1 Edges (`logistics_flows`)

```
id                   serial pk
userId               int
commodityTicker      text
fromLocationId       text           -- always the upstream end of the physical movement
fromStorageTypes     text[]
toLocationId         text           -- always the downstream end
toStorageTypes       text[]
kind                 enum('demand', 'surplus', 'fixed')
amountOverride       int nullable   -- required when kind='fixed'
rate                 enum('total', 'daily')
priority             int            -- for multi-source / multi-spillover allocation (see §3)
note                 text nullable
createdAt / updatedAt
```

The three `kind` values are the heart of the new solver:

- **`demand`** (default). Amount is derived by downstream pull — "how much of this material does the destination need?" Bounded by what upstream can supply. Used for `Pyrgos → CH-771b` when CH-771b consumes the material.
- **`surplus`**. Amount is derived by upstream push — "whatever the source has left over after demand edges take their share." Used for `Pyrgos → BEN` when BEN is catching spillover CAF. Composes with chains: if BEN later gains a downstream consumer, see §7 open question 1.
- **`fixed`**. Amount is exactly `amountOverride`. Used for government contracts represented as edges, or any manual pinning. The solver treats it like a demand edge of fixed magnitude.

### 2.2 Node augmentations (`location_demand_claims`)

Manual node-level demand entries. These cover anything not auto-derivable from FIO that isn't a physical flow between two real locations: recurring government drains (COGC, population upkeep), one-off contract deliveries, safety-stock reserves, miscellaneous obligations.

```
id                   serial pk
userId               int
locationId           text
commodityTicker      text
quantity             int
rate                 enum('daily', 'total')
category             enum('government', 'contract', 'reserve', 'other')
note                 text nullable
source               enum('manual', 'auto')    -- reserved for future COGC/upkeep auto-calc
createdAt / updatedAt
```

**Claims always add to `nativeConsumption`** at the node (see §3.1). The solver treats them identically to workforce burn once they're converted to a per-ticker-per-node daily figure — the only difference is the data source. No new term in the balance formula; no stock-reservation semantics; no fulfillment state machine.

**Category semantics:**
- `government` — recurring obligations like COGC (4 mats per 10d, scales with workforce) and population upkeep (per 7d). Currently manual-entry because we don't auto-calculate these from FIO yet. When we do, new rows become `source='auto'` and get regenerated on planet sync.
- `contract` — specific deliveries, typically one-off (`rate='total'`). Potential future integration point: the contract category can be wired to the invoices feature so contract claims auto-generate from outstanding invoices.
- `reserve` — safety stock floor. Almost always `rate='total'`. The per-node balance formula naturally treats this as a floor: if `stock + inflow ≥ reserve + other demand`, reserve is held; otherwise the shortfall hits the shopping list.
- `other` — catch-all.

**Examples:**

- `(BEN, RAT, 12, daily, government, "COGC")` — adds 12 RAT/day to BEN's consumption.
- `(BEN, CAF, 500, total, contract, "Gov Q3 delivery")` — adds 500 CAF to BEN's total consumption over the planning window.
- `(BEN, CAF, 500, total, reserve, "Safety floor")` — same shape as a contract, just labeled differently; behaves as a floor because of how the balance formula composes with stock.

**Rate conversion.** The solver converts all claims to daily rate against `burnDays` before summing into `nativeConsumption`. A `total=500` over `burnDays=7` contributes `500/7 ≈ 71.4/day`. A `daily=12` contributes 12/day directly.

### 2.3 What goes away

- `lineSource` enum: deleted. The four "auto" values (consumables/inputs/repair/production_output) become *derived* properties of a node, computed by the solver from FIO data. The two "manual" values (government/other) become `location_demand_claims` rows.
- `mode` column (`demand`/`reserve`): deleted. Reserves move to node-level settings.
- The per-category branching throughout the codebase.

### 2.4 Migration

Dev only — no production data. Offer two paths:

1. **Migration script.** Rewrite existing rows:
   - `consumables | inputs | repair`: `(source, dest, ticker) → (from, to, ticker)`, `kind = demand`.
   - `production_output`: same mapping (`source` already = producing planet in the stored schema), `kind = surplus` or `demand` depending on what the user originally intended. Surface collisions when both a `demand` and surplus edge exist for the same `(from, to, ticker)`.
   - `government | other`: migrate to `location_demand_claims` with the destination as the node and `note` carrying the category string.
2. **Truncate and rebuild.** Simpler; user re-enters from the new UI.

## 3. Solver

### 3.1 Node natives

For each location, compute per-ticker:

- **`nativeConsumption(n, t)`** =
    - FIO workforce consumables
    - \+ FIO recurring production inputs (net of on-site production of the same material)
    - \+ projected repair cost over `repairDays`
    - \+ `Σ location_demand_claims(n, t)` converted to daily rate against `burnDays`
- **`nativeProduction(n, t)`** = FIO recurring production outputs (net of on-site consumption).

These feed the same `getAllProductionRates` / `getAllBurnRates` / `calculateBuildingRepairNeeds` primitives used today. That code survives. Claims are a new, small query against `location_demand_claims`.

The node inspector UI (§5.1) surfaces the breakdown so the user can see *which* bucket contributed what:

- Workforce burn (auto, daily)
- Repair (auto, projected over `repairDays`)
- Production inputs (auto, daily, net of on-site production)
- Outbound edges (sized by solver, tagged with each destination's inferred category via §7.7 derivation)
- Claims (grouped by `category`: Government / Contract / Reserve / Other)

Each section is collapsible with per-ticker totals.

### 3.2 Solver passes

**Key property: demand edges do not propagate through intermediate nodes.** A demand edge `BEN→CH-772a` does not cause the surplus edge `Pyrgos→BEN` to grow. Pyrgos ships whatever its own surplus pass computes from its own native production minus its own direct demand commitments. If BEN can't cover CH-772a's pull from its inflow + stock, the shortfall surfaces at BEN as a shopping list item. This matches the user's workflow: hubs are where external purchases happen, and hubs are where gaps appear.

**Per-node balance formula:**

```
balance(n, t) = nativeProduction(n, t)
              + stock(n, t) if stockMode=included
              + sum(inbound edges, both kinds)
              − nativeConsumption(n, t)
              − sum(outbound edges, both kinds)
```

If `balance < 0`, the node has a gap → shopping list item. If `balance ≥ 0`, the node holds a surplus locally.

**Solver pass order (one solve per user):**

1. **Build graph.** Load all edges and involved locations. Detect cycles — for each cycle pick one back-edge to treat as `fixed` (or emit a warning demanding an override). Remaining passes assume a DAG.
2. **Compute node natives** (§3.1).
3. **Size demand edges** — reverse-topological, sinks first:
   - At each node, `requiredInflow(n, t) = max(0, nativeConsumption(n, t) + sum(outflow demand already sized) − nativeProduction(n, t) − stock_if_included)`.
   - Split `requiredInflow` across the node's inbound `demand` edges by the allocation policy (§3.3). Each allocated chunk becomes that edge's committed amount and contributes to the source node's outbound-demand total.
   - `fixed` edges contribute their literal amount as if they were demand edges.
   - Demand does **not** cross through surplus edges — if a node's only inbound edges are surplus, its requirement stays unfulfilled and surfaces as a gap at the node itself (see §3.5).
4. **Size surplus edges** — topological, sources first:
   - At each node, compute `unallocated = nativeProduction + stock_if_included + inboundSurplus_already_sized − nativeConsumption − outboundDemand_already_sized`.
   - Distribute `unallocated` across outbound `surplus` edges by the same priority allocation policy.
   - The pass can cascade: a surplus edge into BEN adds to BEN's inbound total, which can feed BEN's own outbound surplus edges if any exist. Bounded by DAG depth.
5. **Record solution state:**
   - Per node: `derivedInflow`, `derivedOutflow`, `balance`, `shoppingList = max(0, −balance)` per ticker, plus warnings for unrouted demand, over-commit, cycles.
   - Per edge: `amount`, `isBottleneck`, `isOverride`.

### 3.3 Allocation policies

Two places where "many into one" or "one into many" allocation happens:

- **Multiple upstream `demand` edges into one node.** CH-772a imports CAF from both Pyrgos and BEN. Who fills CH-772a's required inflow first?
- **Multiple downstream `surplus` edges from one node.** Pyrgos has leftover CAF and two spillover destinations (BEN, Montem). Who gets it first?

**Default: jump-distance waterfall.** Fewest jumps wins — pull from the closest upstream source first; spill to the closest downstream destination first. The `LocationsController.getDistance` / `fioClient.getJumpCount` utility already exists and returns a jump count between any two locations, so this comes essentially for free.

Each edge has an explicit `priority` column that **overrides** the default ordering when set. Priority semantics: lower integer wins (priority 0 fills before priority 1, which fills before priority 2, …). Unset priority (`null`) falls through to the jump-distance comparison.

This gives the right default behavior without config (closest = cheapest shipping = obvious first pick), while still letting the user override for contracts, reserved-capacity arrangements, or any case where the closest source isn't actually what they want.

Alternatives considered and rejected:

- **Explicit percentage shares** per edge (e.g., "60% from Pyrgos, 40% from BEN"). More laborious; hard to maintain as production fluctuates; can be added later as an additional named policy without schema change.
- **Auto-proportional to upstream surplus.** Zero-config but the allocation shifts invisibly when production changes — bad for player trust.

Distances are computed once per solve (they don't change between solves) and cached.

### 3.4 Worked example — the CAF scenario

Setup:
- Pyrgos produces 500 CAF/interval, consumes 0
- CH-771b consumes 100 CAF/interval, produces 0
- BEN is a hub, all zeros
- Edges: `Pyrgos → CH-771b (kind=demand)`, `Pyrgos → BEN (kind=surplus)`, plus `BEN → CH-771b` edges for other materials (not CAF)

Solver walk:

1. Natives: Pyrgos +500, CH-771b −100, BEN 0. No other consumers of CAF anywhere.
2. Demand-pull pass (sinks first):
   - CH-771b requires 100 CAF inflow. Its one inbound CAF edge (`Pyrgos→CH-771b, demand`) is allocated 100.
   - BEN requires 0 CAF inflow (no native, no outflow). It has one inbound CAF edge (`Pyrgos→BEN, surplus`), which is skipped by the demand pass.
3. Surplus pass (sources first):
   - Pyrgos `unallocatedProduction(CAF) = 500 + 0 + 0 - 0 - 100 = 400`.
   - Pyrgos has one outbound surplus edge for CAF → allocate 400 to `Pyrgos→BEN`.
4. Solution:
   - `Pyrgos → CH-771b`: 100, demand
   - `Pyrgos → BEN`: 400, surplus
   - Pyrgos `nodeGap(CAF) = 0`, `derivedOutflow = 500`
   - CH-771b `nodeGap(CAF) = 0`, `derivedInflow = 100`
   - BEN `derivedInflow(CAF) = 400`, no demand claim on it, surplus visible as held stock
5. Shopping list at BEN: does *not* include CAF. Everything BEN owes downstream that CAF isn't involved in gets computed normally; CAF is fully network-supplied.

### 3.5 Shopping list

At any node `n`:

```
shopping(n, t) = max(0, requiredInflow(n, t) - networkSuppliedInflow(n, t))
```

where `networkSuppliedInflow` is the portion of inbound `demand` edges the solver has determined the upstream chain can actually fulfill from its own `nativeProduction + stock + transitively-propagated network supply`.

This is *not* an opt-in filter. It's the definition of `nodeGap`. If Pyrgos produces 500 CAF and is only partially saturated by downstream demand, BEN's shopping list for CAF is zero automatically. If Pyrgos is over-committed (demand > production) the shortfall propagates to BEN's shopping list.

### 3.6 Where the math lives

New module: `apps/api/src/services/logistics-solver.ts`. Owns `buildGraph`, `computeNodeNatives`, `solve`, `shoppingListFor`. Consumed by:

- A new `GET /supply-planning/graph` endpoint that returns the full `LogisticsGraph` shape.
- `recalculateDemandOrders` — rewritten to call `solve()` once per user and index into the result per buy order.

**Helpers that transfer from `demand-calculator.ts`:**

- `getFilteredStock`, `getAllProductionRates`, `getAllBurnRates`, `calculateBuildingRepairNeeds`.

**Helpers that get retired:**

- `calculateLineDemand` with its `skipOutputDeduction` flag and `getOutputSupplyAtDest`. The edge-peer-awareness pattern is replaced by the solver.
- `calculateOutputSupply` with its fair-share allocation. The *policy* survives in §3.3.
- `calculateDeficit`. Replaced by `nodeGap` + `shoppingListFor`.

## 4. Dashboard response shape

```
LogisticsGraph {
  nodes: NodeState[]
  edges: EdgeState[]
  settings: { burnDays, repairDays, conditionMode, stockMode }
}

NodeState {
  locationId
  locationName
  nativeConsumption: Record<ticker, number>
  nativeProduction: Record<ticker, number>
  stock: Record<ticker, number>
  derivedInflow: Record<ticker, number>
  derivedOutflow: Record<ticker, number>
  nodeGap: Record<ticker, number>
  shoppingList: Array<{ ticker, quantity }>
  warnings: string[]
}

EdgeState {
  id
  fromLocationId, toLocationId, commodityTicker
  kind: 'demand' | 'surplus' | 'fixed'
  amount: number
  isBottleneck: boolean    // flagged if demand couldn't be satisfied
  isOverride: boolean      // kind='fixed'
  priority: number
}
```

One endpoint, one response. Frontend derives per-node, per-material, and per-edge views from the single graph.

## 5. UI

The user asked for *fresh* vision. Don't patch the existing three tabs; rethink from scratch around the graph.

### 5.1 Views

1. **Graph map (new, primary).** SVG or Cytoscape.js force-directed / layered layout. Nodes sized by throughput, colored by health (red = `nodeGap > 0`, green = surplus, neutral = balanced). Edges by volume, with `kind` encoded as line style (solid=demand, dashed=surplus, bold=fixed). Filter by material to see that ticker's full network. This is where `Pyrgos → BEN → CH-771b` and the CAF spillover become *visible at a glance*. Click a node to open the inspector; click an edge to edit inline.
2. **Node inspector** (replaces Connections tab). Native consumption / production, stock, derived inflow / outflow, per-ticker gap, **Shopping List** button. Underneath, a simple table: inbound edges on the left, outbound edges on the right, each with the solver-computed amount and inline edit.
3. **Material network** (replaces Materials tab). For a chosen ticker: the subgraph of every node and edge touching it, with per-node gaps. Essentially a filtered view of the graph map.
4. **Edge editor** (replaces Supply Lines tab). Table of all edges, inline CRUD, TokenSearchInput filtering, bulk ops. Edge creation picks `kind` (demand default, surplus, fixed) and optionally `priority`.
5. **Node claims editor** (new small view or tab on node inspector). CRUD for `location_demand_claims`. This is where government contracts and gifts go.

### 5.2 UI pieces that transfer

- `KeyValueAutocomplete`, `TokenSearchInput`, `CommodityDisplay`, stock/order card layout, page state persistence, shopping list store, settings card, sync buttons, all the FIO data loading plumbing.

### 5.3 UI pieces that get thrown out

- Per-category sub-sections on the Connections tab.
- `production_output` vs other `lineSource` branching in the lines form.
- Source-vs-destination flipping throughout the 2900-line view.
- Anything rendering `lineSource` as a first-class concept.

## 6. Implementation order

Minimum viable cut: prove the Pyrgos → BEN → CH-771b chain end-to-end with a correct "don't buy CAF at BEN" shopping list.

1. **Solver skeleton.** Standalone `logistics-solver.ts`. Unit-test against existing schema by internally mapping `production_output` to a reversed surplus edge and `inputs/consumables/repair` to demand edges. Math validated in isolation before touching DB.
2. **Graph endpoint.** `GET /supply-planning/graph` returning `LogisticsGraph`. Old `/dashboard` stays alive temporarily.
3. **New node inspector view.** Don't touch `SupplyManagementView.vue` yet — ship a *new* view (`/supply/logistics` or similar) driven by the graph endpoint. Visually verify BEN's derived demand matches expectations for the CAF scenario.
4. **Shopping list button on the new inspector.** Calls existing `shoppingListStore.setMaterials` → router push `/market`. End-to-end validated.
5. **Schema migration.** Rename columns, drop `lineSource`, create `location_demand_claims`. `recalculateDemandOrders` switches to `solve()`.
6. **Replace the three tabs.** Rewrite `SupplyManagementView.vue` around the new views. Biggest UI diff.
7. **Graph map view.** Ships last. High-impact, not required for MVC.

### 6.1 Risk ranking

1. **Highest: allocation policy.** Multi-source / multi-spillover splits determine whether the solver feels "right" on real networks. Priority waterfall default is defensible but the UX of explaining it needs work.
2. **Medium: solver correctness on cycles, unrouted demand, over-committed sources.** Failure mode is silent over/under-counting rather than crashes — needs dedicated tests.
3. **Medium: UI work volume.** 2900 lines to unpick. Risk is scope creep, not technical complexity.
4. **Low: dev-only migration.** Disposable data, reversible.
5. **Low: buy-order recalc refactor.** Interface unchanged; implementation swap.

## 7. Design decisions (locked)

All previously-open questions have been resolved. Recorded here for traceability.

1. **Surplus-edge promotion** → dissolved. Demand edges do not propagate through intermediate nodes (§3.2). Shortfalls surface at the node where they appear via the local per-node balance formula.
2. **Multi-source / multi-destination allocation** → jump-distance waterfall by default, with an explicit `priority` column on edges as the override (§3.3). Uses existing `fioClient.getJumpCount`.
3. **Stock accounting** → stock is a term in the per-node balance formula; `stockMode=included` (default) counts it, `stockMode=ignored` excludes it for raw projection runs.
4. **Government / COGC / upkeep / contracts / reserves** → all unified as `location_demand_claims` rows that add to `nativeConsumption` (§2.2). Distinguished by `category` (`government` / `contract` / `reserve` / `other`) and `rate` (`daily` / `total`). Reserves behave as floors naturally from the balance formula. No separate tables, no earmark semantics, no fulfillment state machine.
5. **Time window / lead time** → single global `burnDays` window for v1. Lead-time awareness deferred; jump-distance utility is available to build on later.
6. **Sell orders from surplus** → deferred to a second pass.
7. **Edge `kind` edits** → live edit with a "sizing rule changed" visual cue until the next solve runs.
8. **Cycle handling** → forbid at creation. Block edge create/edit that would introduce a cycle, with an error message naming the existing edges that would form the loop.
9. **Categorical filtering in the edge editor** → derive from destination natives (an edge feeding a workforce-consumable material is a "consumables" edge). No tag column on edges.
10. **MVC cutover** → ship `/supply/logistics` as a new page alongside existing `/supply`, validate with real data, then retire the old page.
11. **Shopping list rate** → totals (matches existing market view).

---

## Files touched (expected)

### New
- `apps/api/src/services/logistics-solver.ts`
- `apps/api/src/services/logistics-solver.test.ts`
- `apps/web/src/views/LogisticsView.vue` (eventual replacement for SupplyManagementView)
- `apps/web/src/components/logistics/GraphMap.vue`
- `apps/web/src/components/logistics/NodeInspector.vue`
- `apps/web/src/components/logistics/EdgeEditor.vue`
- `apps/web/src/components/logistics/NodeClaimsEditor.vue`

### Heavy rewrites
- `packages/db/src/schema.ts` — new `logistics_flows`, `location_demand_claims`; drop `supply_chain_lines` + enum
- `packages/types/src/supply.ts` — new `LogisticsGraph`, `NodeState`, `EdgeState`, `EdgeKind`, `NodeClaim`
- `apps/api/src/controllers/SupplyPlanningController.ts` — new `/graph` endpoint; old dashboard retired
- `apps/api/src/controllers/SupplyChainController.ts` — edge CRUD replaces line CRUD; bulk-add endpoints become ticker-level edge inserts
- `apps/api/src/services/demand-calculator.ts` — retire line-centric entrypoints; keep node-native primitives
- `apps/web/src/views/SupplyManagementView.vue` — replaced by `LogisticsView.vue`

### Keep as-is
- FIO sync infrastructure (`services/fio/*`, `services/planet-sync.ts`, repair calc)
- Shopping list store (`stores/shoppingList.ts`) + market handoff
- `KeyValueAutocomplete`, `TokenSearchInput`, `CommodityDisplay`
- Page state persistence composable
- Buy-order recalculation interface (implementation swapped)
