/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SnapshotBucket } from './SnapshotBucket';
import type { SnapshotSeries } from './SnapshotSeries';
export type SnapshotSeriesResponse = {
    bucket: SnapshotBucket;
    /**
     * ISO date of the inclusive start of the range that was actually served.
     */
    from: string;
    /**
     * ISO date of the inclusive end of the range that was actually served.
     */
    to: string;
    series: Array<SnapshotSeries>;
};

