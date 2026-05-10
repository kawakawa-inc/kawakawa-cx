/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SuggestStopTimesResponse = {
    /**
     * One entry per stop in the request. `stops[0].plannedArriveAt === startAt`.
     */
    stops: Array<{
        plannedArriveAt: string;
    }>;
    /**
     * Caveats — unknown jump counts, missing locations, etc.
     */
    warnings: Array<string>;
};

