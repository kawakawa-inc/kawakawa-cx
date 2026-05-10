/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LogLevel } from './LogLevel';
import type { Record_string_unknown_ } from './Record_string_unknown_';
/**
 * A single log entry from the frontend
 */
export type FrontendLogEntry = {
    /**
     * Log level
     */
    level: LogLevel;
    /**
     * Log message
     */
    message: string;
    /**
     * Additional context data (will be sanitized)
     */
    context?: Record_string_unknown_;
    /**
     * Timestamp when the log was created on the frontend
     */
    timestamp?: string;
    /**
     * Page/route where the log was created
     */
    page?: string;
    /**
     * User agent string
     */
    userAgent?: string;
};

