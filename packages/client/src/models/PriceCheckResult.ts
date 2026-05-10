/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PriceCheckResult = {
    /**
     * Echo of the input `material` value so callers can match results back to inputs
     */
    query: string;
    ticker: string | null;
    /**
     * API name (camelCase), e.g., 'drinkingWater'
     */
    name: string | null;
    /**
     * Localized display name, e.g., 'Drinking Water' (en-US only for now)
     */
    localizedName: string | null;
    /**
     * Final price after adjustments, in the price list's currency
     */
    price: number | null;
    /**
     * True if no price exists at the requested location and we used the version's default location
     */
    isFallback: boolean;
    /**
     * Set when the material couldn't be resolved or no price was found
     */
    error?: PriceCheckResult.error;
};
export namespace PriceCheckResult {
    /**
     * Set when the material couldn't be resolved or no price was found
     */
    export enum error {
        MATERIAL_NOT_FOUND = 'material_not_found',
        PRICE_NOT_FOUND = 'price_not_found',
    }
}

