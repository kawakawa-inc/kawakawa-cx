/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Per-planet contribution for a single user toward one ticker's totals.
 * Mirrors the per-(user, planet, ticker) row in `burn_repair_cache` so the
 * breakdown modal can drill from user → planet without an extra round-trip.
 */
export type BurnRepairCorpMaterialPlanetContribution = {
  planetNaturalId: string
  planetName: string
  productionDaily: number
  burnDaily: number
  inputsDaily: number
}
