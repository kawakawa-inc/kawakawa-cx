// Shared helpers that inspect FIO-synced planet data to surface the set of
// tickers a planet cares about for each supply-chain category. Used by both
// the legacy SupplyChainController and the new LogisticsFlowsController bulk
// endpoint to avoid duplicating the same scanning logic in two places.

import { db } from '../db/index.js'
import {
  fioPlanetProduction,
  fioPlanetWorkforce,
  fioPlanetBuildings,
} from '@kawakawa/db'
import { eq } from 'drizzle-orm'
import type { BuildingData } from '@kawakawa/types'
import { calculateBuildingRepairNeeds } from './supply-calculator.js'
import { FioClient } from './fio/client.js'
import type { FioBuilding } from './fio/types.js'
import * as userSettingsService from './userSettingsService.js'

/** Tickers used as inputs to recurring production orders at a planet. */
export async function getRecurringInputTickers(userPlanetDbId: number): Promise<Set<string>> {
  const rows = await db
    .select({ orders: fioPlanetProduction.orders })
    .from(fioPlanetProduction)
    .where(eq(fioPlanetProduction.userPlanetId, userPlanetDbId))

  const tickers = new Set<string>()
  for (const row of rows) {
    const orders = row.orders as {
      Recurring: boolean
      Inputs: { MaterialTicker: string }[]
    }[]
    for (const order of orders) {
      if (!order.Recurring) continue
      for (const input of order.Inputs) tickers.add(input.MaterialTicker)
    }
  }
  return tickers
}

/** Tickers produced as outputs of recurring production orders at a planet. */
export async function getRecurringOutputTickers(userPlanetDbId: number): Promise<Set<string>> {
  const rows = await db
    .select({ orders: fioPlanetProduction.orders })
    .from(fioPlanetProduction)
    .where(eq(fioPlanetProduction.userPlanetId, userPlanetDbId))

  const tickers = new Set<string>()
  for (const row of rows) {
    const orders = row.orders as {
      Recurring: boolean
      Outputs: { MaterialTicker: string }[]
    }[]
    for (const order of orders) {
      if (!order.Recurring) continue
      for (const output of order.Outputs) tickers.add(output.MaterialTicker)
    }
  }
  return tickers
}

/** Workforce consumable tickers at a planet (only those with burn rate > 0). */
export async function getConsumableTickers(userPlanetDbId: number): Promise<Set<string>> {
  const rows = await db
    .select({ needs: fioPlanetWorkforce.needs })
    .from(fioPlanetWorkforce)
    .where(eq(fioPlanetWorkforce.userPlanetId, userPlanetDbId))

  const tickers = new Set<string>()
  for (const row of rows) {
    const needs = row.needs as { MaterialTicker: string; UnitsPerInterval: number }[]
    for (const need of needs) {
      if (need.UnitsPerInterval > 0) tickers.add(need.MaterialTicker)
    }
  }
  return tickers
}

/**
 * Repair material tickers for a planet, projecting repair needs forward to
 * catch materials even for healthy buildings. Uses max(45, user's repairDays)
 * so short horizons still discover everything a planet will eventually need.
 * Infrastructure buildings (workforce = 0, e.g., PSL, STO) are excluded.
 */
export async function getRepairMaterialTickers(
  userId: number,
  userPlanetDbId: number
): Promise<Set<string>> {
  const userRepairDays =
    ((await userSettingsService.getSetting(userId, 'supply.repairDays')) as number) ?? 0
  const projectionDays = Math.max(45, userRepairDays)
  const now = new Date()

  const repairableTickers = await getRepairableBuildingTickers()

  const buildingRows = await db
    .select({
      buildingTicker: fioPlanetBuildings.buildingTicker,
      buildingCreated: fioPlanetBuildings.buildingCreated,
      buildingLastRepair: fioPlanetBuildings.buildingLastRepair,
      condition: fioPlanetBuildings.condition,
      repairMaterials: fioPlanetBuildings.repairMaterials,
      reclaimableMaterials: fioPlanetBuildings.reclaimableMaterials,
    })
    .from(fioPlanetBuildings)
    .where(eq(fioPlanetBuildings.userPlanetId, userPlanetDbId))

  const tickers = new Set<string>()
  for (const row of buildingRows) {
    if (!repairableTickers.has(row.buildingTicker)) continue
    const building: BuildingData = {
      buildingTicker: row.buildingTicker,
      buildingCreated: row.buildingCreated,
      buildingLastRepair: row.buildingLastRepair,
      condition: Number(row.condition),
      repairMaterials: (
        row.repairMaterials as { MaterialTicker: string; MaterialAmount: number }[]
      ).map(m => ({ ticker: m.MaterialTicker, amount: m.MaterialAmount })),
      reclaimableMaterials: (
        row.reclaimableMaterials as { MaterialTicker: string; MaterialAmount: number }[]
      ).map(m => ({ ticker: m.MaterialTicker, amount: m.MaterialAmount })),
    }
    const needs = calculateBuildingRepairNeeds(building, projectionDays, now)
    for (const need of needs) tickers.add(need.ticker)
  }
  return tickers
}

/**
 * Building tickers that actually require repair materials (workforce > 0).
 * Infrastructure buildings like PSL and STO have 0 workforce and don't need repairs.
 */
export async function getRepairableBuildingTickers(): Promise<Set<string>> {
  const client = new FioClient()
  const buildings = (await client.getBuildings()) as FioBuilding[]
  const repairable = new Set<string>()
  for (const b of buildings) {
    const totalWorkforce = b.Pioneers + b.Settlers + b.Technicians + b.Engineers + b.Scientists
    if (totalWorkforce > 0) repairable.add(b.Ticker)
  }
  return repairable
}
