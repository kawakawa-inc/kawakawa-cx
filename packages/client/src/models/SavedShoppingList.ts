/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShoppingListMaterials } from './ShoppingListMaterials'
/**
 * Saved shopping list (from database)
 */
export type SavedShoppingList = {
  id: number
  userId: number
  name: string
  materials: ShoppingListMaterials
  notes: string | null
  createdAt: string
  updatedAt: string
}
