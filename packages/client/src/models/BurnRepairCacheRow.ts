/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A single cached burn/repair row for one user-planet-ticker combination
 */
export type BurnRepairCacheRow = {
    planetNaturalId: string;
    planetName: string;
    commodityTicker: string;
    burnDaily: number;
    inputsDaily: number;
    repairTotal: number;
    productionDaily: number;
};

