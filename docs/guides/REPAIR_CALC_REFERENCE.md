# Repair & Burn Calculator — Reference Document

Reference for reimplementing the repair-calc logic in the market app.

## FIO REST API

Base URL: `https://rest.fnar.net`

Authentication: `Authorization` header with API key. Some endpoints are public.

### Endpoints Used

| Endpoint                          | Auth | Purpose                                                    |
| --------------------------------- | ---- | ---------------------------------------------------------- |
| `GET /building/allbuildings`      | No   | All building definitions (ticker, workforce counts, area)  |
| `GET /building/{Ticker}`          | No   | Single building definition with recipes                    |
| `GET /rain/userplanets/{User}`    | Yes  | User's planets (NaturalId, Name)                           |
| `GET /sites/{User}/{Planet}`      | Yes  | Per-building detail including repair/reclaimable materials |
| `GET /workforce/{User}/{Planet}`  | Yes  | Workforce population and consumable burn rates             |
| `GET /production/{User}/{Planet}` | Yes  | Production lines with orders, durations, efficiency        |

### Key Endpoint: `/sites/{User}/{Planet}`

This is the most important endpoint. Each building in the `Buildings` array contains:

```json
{
  "BuildingTicker": "CHP",
  "BuildingId": "15c02d44...",
  "BuildingCreated": 1757382803861,
  "BuildingLastRepair": 1767313011684,
  "Condition": 0.8113,
  "RepairMaterials": [
    { "MaterialTicker": "BBH", "MaterialAmount": 2 },
    { "MaterialTicker": "INS", "MaterialAmount": 87 }
  ],
  "ReclaimableMaterials": [
    { "MaterialTicker": "BBH", "MaterialAmount": 1 },
    { "MaterialTicker": "INS", "MaterialAmount": 93 }
  ]
}
```

`RepairMaterials` gives you the exact repair cost right now, including planet
environmental materials (MCG, SEA, INS, etc.). No need to calculate anything
for current-day repairs.

`ReclaimableMaterials` + `RepairMaterials` = true construction cost per building
(including environmental). This is needed for projecting future repair costs.

### Key Endpoint: `/workforce/{User}/{Planet}`

Each workforce type has a `WorkforceNeeds` array:

```json
{
  "WorkforceTypeName": "SETTLER",
  "Population": 1020,
  "Required": 1020,
  "WorkforceNeeds": [
    {
      "MaterialTicker": "RAT",
      "UnitsPerInterval": 61.2,
      "Essential": true
    }
  ]
}
```

`UnitsPerInterval` is the **daily** consumption rate for the current population
on that planet. Multiply by days to get total need. This is static and does not
change with building condition.

### Key Endpoint: `/production/{User}/{Planet}`

Returns production lines with orders:

```json
{
  "Type": "chemPlant",
  "Condition": 0.8113,
  "Efficiency": 1.0452,
  "Orders": [
    {
      "Recurring": true,
      "DurationMs": 47946998,
      "Inputs": [{ "MaterialTicker": "HAL", "MaterialAmount": 3 }],
      "Outputs": [{ "MaterialTicker": "NA", "MaterialAmount": 2 }]
    }
  ]
}
```

**Critical:** `DurationMs` bakes in ALL modifiers — building condition, CoGC
bonuses, experts, HQ bonuses, etc. It is the actual wall-clock time for the
order at current efficiency.

`Condition` on the production line is the average condition of all buildings
of that type on the planet.

`Efficiency` is the combined non-condition multiplier (CoGC, experts, etc.).

## Building Degradation Mechanics

Source: Community research by MoonSugarTravels.

### Condition Formula

```
condition = 0.67 / (1 + exp((1789/25000) * (D - C))) + 0.33
```

- `D` = days since last repair (or construction if never repaired)
- `C` = 100.87 normally, 107.87 for a newly constructed building before first repair
- Condition floors at 33% — buildings never go below this
- Until ~30 days, buildings are effectively "as new"
- Around day 60, efficiency starts dropping noticeably
- By day 90, condition falls below 80%

### Repair Cost Formula (per material, independently)

```
reclaimable = floor(construction_cost * (180 - min(D, 180)) / 180)
repair_cost = construction_cost - reclaimable
```

The `floor()` creates a "tick" behavior — costs jump in discrete steps on
certain days. Some days are much better to repair on than others.

After 180 days, reclaimable = 0 and repair cost = full construction cost.

### What Counts as "Repairable"

Only buildings with workforce (Pioneers + Settlers + Technicians + Engineers +
Scientists > 0) need repairs. Infrastructure buildings like STO, HBB, HB1, HB2,
CM do NOT need repairs.

### Environmental Materials

Each planet has `BuildRequirements` (from `GET /planet/{id}`) which includes
both the CM (Core Module) construction cost AND per-building environmental
costs (MCG, SEA, INS, TSH, AEF, HSE, etc.).

**Do not use BuildRequirements to calculate repair costs.** The `/sites/`
endpoint's `RepairMaterials` already includes environmental materials with
the correct per-building amounts. The BuildRequirements amounts don't scale
linearly by building area — the game calculates them per-building internally.

### Construction Cost = Repair + Reclaimable

The true construction cost of a building (including environmental materials)
can be derived from the sites endpoint:

```
construction_cost[material] = RepairMaterials[material] + ReclaimableMaterials[material]
```

This is needed for projecting future repair costs using the reclaimable formula.

## Post-Repair Production Scaling

When calculating production inputs for a period where you plan to repair:

```
post_repair_duration = current_duration * current_condition
```

Since `DurationMs` already includes condition degradation, multiplying by
condition removes that factor, giving you the duration at 100% condition
(while preserving all other bonuses).

Runs per period:

```
runs = (24 * days) / (duration_ms / 3_600_000)
```

Input need:

```
material_need = ceil(amount_per_run * runs)
```

When NOT repairing, use `DurationMs` as-is for current efficiency.

## Implementation Notes

### Approach for "Repair Today" (days=0)

Use `RepairMaterials` directly from the `/sites/` endpoint. These are exact
game values — no calculation needed.

### Approach for "Repair in N Days"

1. Get `BuildingLastRepair` (or `BuildingCreated` if null) timestamp
2. Calculate current days since repair: `(now - reference) / 86400000`
3. Add target days: `days_at_repair = days_since + N`
4. For each material: `repair = construction_cost - floor(construction_cost * (180 - min(days_at_repair, 180)) / 180)`

### Workforce Burn

Static calculation — not affected by building condition:

```
total = ceil(UnitsPerInterval * days)
```

### Data Freshness

The FIO API serves data that was last uploaded by the user's game client.
If the user hasn't logged in recently or hasn't opened the relevant screens
in-game, the data may be stale. The `Timestamp` field on API responses
indicates when data was last submitted.
