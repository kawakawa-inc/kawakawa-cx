/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Repeat (clone) a trip — clones the trip plus its shipments, with stop times shifted.
 */
export type RepeatTripRequest = {
    /**
     * ISO timestamp for the new trip's first stop. Defaults to now.
     */
    firstStopAt?: string;
};

