/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BurnRepairShoppingListItem } from './BurnRepairShoppingListItem'
/**
 * Response for POST /burn-repair/shopping-list
 */
export type BurnRepairShoppingListResponse = {
  items: Array<BurnRepairShoppingListItem>
  days: number
  originLocationId: string
  basePlanetId: string
}
