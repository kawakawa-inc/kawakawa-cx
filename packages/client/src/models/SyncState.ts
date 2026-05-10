/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DataVersions } from './DataVersions';
/**
 * Sync state returned by the polling endpoint
 */
export type SyncState = {
    /**
     * Unread notification count
     */
    unreadCount: number;
    /**
     * App build/commit hash - changes trigger "new version" banner
     */
    appVersion: string;
    /**
     * Data version timestamps for cache invalidation
     */
    dataVersions: DataVersions;
};

