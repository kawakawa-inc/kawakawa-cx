/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EdgeState } from './EdgeState';
import type { NodeState } from './NodeState';
import type { RepairEvent } from './RepairEvent';
/**
 * Full solver output: one graph response per user
 */
export type LogisticsGraph = {
    settings: {
        /**
         * Trip lead time in days. Drives both the Plan-tab look-ahead window
         * AND the contract-by deadline (so an order placed today arrives before
         * the trip ships). Stored as the user setting `logistics.tripLeadDays`.
         * Default 7.
         */
        tripLeadDays: number;
        stockMode: LogisticsGraph.stockMode;
        conditionMode: LogisticsGraph.conditionMode;
        repairDays: number;
        burnDays: number;
    };
    nodes: Array<NodeState>;
    edges: Array<EdgeState>;
    /**
     * Upcoming repair events across all the user's buildings. Each event has
     * a known date (lastRepairAt + repairDays target age) and material list.
     * The Plan tab uses these to surface contract-by / ship-by deadlines for
     * repair shipments alongside flow-cadence shipments.
     */
    repairEvents: Array<RepairEvent>;
    warnings: Array<string>;
};
export namespace LogisticsGraph {
    export enum stockMode {
        INCLUDED = 'included',
        IGNORED = 'ignored',
    }
    export enum conditionMode {
        ACTUAL = 'actual',
        MAX = 'max',
    }
}

