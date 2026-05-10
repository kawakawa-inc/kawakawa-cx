/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SavedFilterData = {
  itemType?: SavedFilterData.itemType
  commodity?: Array<string>
  location?: Array<string>
  category?: string
  orderType?: string
  pricing?: string
  userName?: Array<string>
}
export namespace SavedFilterData {
  export enum itemType {
    SELL = 'sell',
    BUY = 'buy',
  }
}
