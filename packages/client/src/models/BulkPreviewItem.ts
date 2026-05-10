/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkFlowCategory } from './BulkFlowCategory';
/**
 * A single detected material in a bulk preview, before flow creation.
 */
export type BulkPreviewItem = {
    ticker: string;
    category: BulkFlowCategory;
    kind: BulkPreviewItem.kind;
};
export namespace BulkPreviewItem {
    export enum kind {
        DEMAND = 'demand',
        SURPLUS = 'surplus',
    }
}

