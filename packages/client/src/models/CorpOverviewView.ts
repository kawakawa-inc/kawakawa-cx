/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FilterPrivacy } from './FilterPrivacy';
import type { MetricKey } from './MetricKey';
import type { ViewCard } from './ViewCard';
import type { ViewOwner } from './ViewOwner';
/**
 * A named, shareable configuration of the Corp Overview page.
 *
 * **`tickers` shape**: an array of mixed entries. Each entry is either:
 * - A bare ticker (e.g. `"RAT"`), included as-is in the scope.
 * - A live category reference of the form `"category:Name"` (e.g.
 * `"category:Consumables"`), expanded to its current member tickers at
 * render time. New commodities added to the category later automatically
 * flow into views using the reference.
 *
 * Empty array = no ticker filter (every corp ticker is in scope).
 */
export type CorpOverviewView = {
    id: number;
    /**
     * The view's owners. Many-to-many with users; ordered by `addedAt` so the
     * creator surfaces first in displays. An ownerless view (when every owner
     * has been deleted as a user) keeps existing — admins can reassign in a
     * future revision.
     */
    owners: Array<ViewOwner>;
    name: string;
    tickers: Array<string>;
    cards: Array<ViewCard>;
    /**
     * Saved baseline of user IDs to exclude from corp aggregation when this view
     * is active. The page UI keeps a separate local working copy so anyone can
     * temporarily filter without mutating the row; only the owner can save the
     * working copy back into this field.
     */
    excludedUserIds: Array<number>;
    /**
     * Columns to render in the panel-level Materials table, in display order.
     * Each entry must be a `ticker`-grouping MetricKey. Empty array falls back
     * to `DEFAULT_MATERIALS_TABLE_COLUMNS` on the client. Useful when a view's
     * scope makes some columns irrelevant — e.g. consumables views can drop
     * Repair to keep the table tidy.
     */
    materialsTableColumns: Array<MetricKey>;
    /**
     * Optional ticker scope for the panel-level Materials table — same mixed-
     * entry shape as the view's `tickers` (bare tickers + `category:` refs).
     * Empty array falls back to no extra constraint; the materials table follows
     * the view's overall scope. Stored on the view in Phase 1; wired through to
     * the table in Phase 2.
     */
    materialsTableTickers: Array<string>;
    privacy: FilterPrivacy;
    isPinned: boolean;
    createdAt: string;
    /**
     * Timestamp of the last server-side mutation. Used by the client-side Local
     * working copy to detect when Saved has moved underneath it (e.g. a co-owner
     * pressed Save) and surface a "reload or keep editing" prompt.
     */
    updatedAt: string;
};

