/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FilterPrivacy } from './FilterPrivacy';
import type { SavedFilterData } from './SavedFilterData';
export type SavedMarketFilter = {
    id: number;
    userId: number;
    userName: string;
    name: string;
    filterData: SavedFilterData;
    privacy: FilterPrivacy;
    isPinned: boolean;
    createdAt: string;
};

