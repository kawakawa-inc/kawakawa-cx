/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BurnRepairCorpMaterialPlanetContribution } from './BurnRepairCorpMaterialPlanetContribution'
/**
 * One user's contribution to a ticker's corp totals, with per-planet drill-down.
 */
export type BurnRepairCorpMaterialUserContribution = {
  userId: number
  username: string
  productionDaily: number
  burnDaily: number
  inputsDaily: number
  /**
   * Sorted by `planetName` for stable rendering.
   */
  perPlanet: Array<BurnRepairCorpMaterialPlanetContribution>
}
