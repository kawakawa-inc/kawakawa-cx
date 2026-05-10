/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FrontendLogEntry } from './FrontendLogEntry';
/**
 * Request body for batch log submission
 */
export type LogBatchRequest = {
    /**
     * Array of log entries
     */
    logs: Array<FrontendLogEntry>;
};

