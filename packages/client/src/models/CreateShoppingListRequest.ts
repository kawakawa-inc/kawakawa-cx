/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShoppingListMaterials } from './ShoppingListMaterials'
/**
 * Request to create a shopping list
 */
export type CreateShoppingListRequest = {
  name: string
  materials: ShoppingListMaterials
  notes?: string
}
