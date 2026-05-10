/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * One building instance with age and repair eligibility
 */
export type BurnRepairBuildingInstance = {
    ticker: string;
    /**
     * Days since last repair (or construction if never repaired)
     */
    ageDays: number;
    /**
     * False for "indestructible" buildings (CM, HB1, STO, etc.) that don't decay
     */
    needsRepair: boolean;
};

