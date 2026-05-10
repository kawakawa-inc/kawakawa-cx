/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MetricKey } from './MetricKey';
/**
 * One sort criterion on a card. `sortBy` applies these in array order.
 */
export type ViewCardSort = {
    metric: MetricKey;
    direction: ViewCardSort.direction;
};
export namespace ViewCardSort {
    export enum direction {
        ASC = 'asc',
        DESC = 'desc',
    }
}

