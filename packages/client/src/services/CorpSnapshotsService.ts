/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MetricKey } from '../models/MetricKey';
import type { SnapshotBucket } from '../models/SnapshotBucket';
import type { SnapshotRangePreset } from '../models/SnapshotRangePreset';
import type { SnapshotSeriesBy } from '../models/SnapshotSeriesBy';
import type { SnapshotSeriesResponse } from '../models/SnapshotSeriesResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CorpSnapshotsService {
    /**
     * @returns SnapshotSeriesResponse Ok
     * @throws ApiError
     */
    public static query({
        yMetric,
        seriesBy,
        preset,
        from,
        to,
        bucket,
        tickers,
        seriesLimit,
        excludedUserIds,
        includeOther,
    }: {
        yMetric: MetricKey,
        seriesBy: SnapshotSeriesBy,
        preset?: SnapshotRangePreset,
        from?: string,
        to?: string,
        bucket?: SnapshotBucket,
        tickers?: string,
        seriesLimit?: number,
        excludedUserIds?: string,
        includeOther?: boolean,
    }): CancelablePromise<SnapshotSeriesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/corp-snapshots',
            query: {
                'yMetric': yMetric,
                'seriesBy': seriesBy,
                'preset': preset,
                'from': from,
                'to': to,
                'bucket': bucket,
                'tickers': tickers,
                'seriesLimit': seriesLimit,
                'excludedUserIds': excludedUserIds,
                'includeOther': includeOther,
            },
        });
    }
}
