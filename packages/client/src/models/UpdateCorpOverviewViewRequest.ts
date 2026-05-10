/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FilterPrivacy } from './FilterPrivacy';
import type { MetricKey } from './MetricKey';
import type { ViewCard } from './ViewCard';
export type UpdateCorpOverviewViewRequest = {
    name?: string;
    tickers?: Array<string>;
    cards?: Array<ViewCard>;
    excludedUserIds?: Array<number>;
    materialsTableColumns?: Array<MetricKey>;
    materialsTableTickers?: Array<string>;
    privacy?: FilterPrivacy;
};

