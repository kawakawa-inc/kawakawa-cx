/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BurnRepairBuildingInstance } from './BurnRepairBuildingInstance';
import type { BurnRepairCacheRow } from './BurnRepairCacheRow';
/**
 * Per-planet summary returned by GET /burn-repair/my-bases
 */
export type BurnRepairPlanetSummary = {
    planetNaturalId: string;
    planetName: string;
    userPlanetId: number;
    materials: Array<BurnRepairCacheRow>;
    buildingCount: number;
    /**
     * One entry per building on the planet (client aggregates for chip display)
     */
    buildings: Array<BurnRepairBuildingInstance>;
    workforceSummary: Array<{
        required: number;
        population: number;
        type: string;
    }>;
    computedAt: string;
};

