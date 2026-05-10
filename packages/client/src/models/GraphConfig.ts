/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MetricKey } from './MetricKey';
import type { SnapshotRangePreset } from './SnapshotRangePreset';
import type { SnapshotSeriesBy } from './SnapshotSeriesBy';
/**
 * Graph-specific config for a card with `type: 'graph'`.
 *
 * `yMetrics` lets a single card plot several metrics at once (e.g. production,
 * consumption, and net for one ticker). Each (metric, ticker, user?) combo
 * becomes one series on the chart.
 *
 * `tickers` is an optional *card-level* override: when non-empty, the graph
 * restricts itself to these tickers regardless of the view's ticker scope. On
 * empty / undefined, the card falls back to the view's `tickers` list. Table
 * cards continue to follow the view scope only — this knob is graph-specific
 * because trend graphs typically want a tighter ticker focus than the view
 * overall.
 */
export type GraphConfig = {
    yMetrics: Array<MetricKey>;
    /**
     * Optional card-level ticker filter. Same mixed-entry shape as
     * `CorpOverviewView.tickers` — bare tickers (`"RAT"`) and live category
     * references (`"category:Consumables"`) intermix. When non-empty, overrides
     * the view's `tickers`.
     */
    tickers?: Array<string>;
    seriesBy: SnapshotSeriesBy;
    /**
     * Max number of series per metric. Extras collapse into "Other (N)". 1–20.
     */
    seriesLimit: number;
    /**
     * Time range preset. Ignored when `rangeFrom`/`rangeTo` are both set.
     */
    rangePreset: SnapshotRangePreset;
    /**
     * Optional explicit ISO-date lower bound — overrides `rangePreset`.
     */
    rangeFrom?: string;
    /**
     * Optional explicit ISO-date upper bound — overrides `rangePreset`.
     */
    rangeTo?: string;
    /**
     * Optional manual Y-axis floor. Omit for auto-scale.
     */
    yMin?: number;
    /**
     * Optional manual Y-axis ceiling. Omit for auto-scale.
     */
    yMax?: number;
    /**
     * When true, any series beyond `seriesLimit` collapse into a single
     * `"Other (N)"` trace. Default is off — that summed trace rarely tells you
     * anything the top-N doesn't, and it clutters the legend.
     */
    includeOther?: boolean;
};

