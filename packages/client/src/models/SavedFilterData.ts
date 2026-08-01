/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SavedFilterData = {
  itemType?: SavedFilterData.itemType
  commodity?: Array<string>
  location?: Array<string>
  category?: Array<string>
  orderType?: string
  pricing?: string
  userName?: Array<string>
  availability?: SavedFilterData.availability
}
export namespace SavedFilterData {
  export enum itemType {
    SELL = 'sell',
    BUY = 'buy',
  }
  export enum availability {
    AVAILABLE = 'available',
    STANDING = 'standing',
    ONE_TIME = 'one-time',
  }
}
